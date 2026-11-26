import type { sheets_v4 } from 'googleapis';
import { SHEET_HEADERS, SHEET_LAST_COLUMN } from './constants';

/**
 * 10분 묶음 쓰기 — 시트 파일 1개에 대한 작업 계획과 실행.
 * Firestore는 모른다. 시트 API 호출 수는 파일당
 *   탭 목록 1 + (새 탭 1) + 읽기 1 + 고치기 1 + 탭별 추가 1 + (지우기 1)
 * 로, 예약이 몇 건이든 같다.
 */

export interface SpreadsheetOps {
  spreadsheetId: string;
  /** 탭 → 예약ID → 행 값 (마지막 상태) */
  upserts: Map<string, Map<string, string[]>>;
  /** 탭 → 지울 예약ID (탭·파일을 옮긴 예약의 예전 행) */
  removals: Map<string, Set<string>>;
}

export interface TabPlan {
  tab: string;
  headerFix: boolean;
  updates: { row: number; values: string[] }[];
  appends: string[][];
  /** 1부터 세는 행 번호, 큰 번호부터 */
  deleteRows: number[];
}

export interface SpreadsheetResult {
  spreadsheetId: string;
  apiCalls: number;
  tabsCreated: number;
  rowsUpdated: number;
  rowsAppended: number;
  rowsDeleted: number;
}

export function emptySpreadsheetOps(spreadsheetId: string): SpreadsheetOps {
  return { spreadsheetId, upserts: new Map(), removals: new Map() };
}

export function addUpsert(ops: SpreadsheetOps, tab: string, reservationId: string, values: string[]): void {
  let byId = ops.upserts.get(tab);
  if (!byId) {
    byId = new Map();
    ops.upserts.set(tab, byId);
  }
  byId.set(reservationId, values);
}

export function addRemoval(ops: SpreadsheetOps, tab: string, reservationId: string): void {
  let ids = ops.removals.get(tab);
  if (!ids) {
    ids = new Set();
    ops.removals.set(tab, ids);
  }
  ids.add(reservationId);
}

function cell(value: unknown): string {
  return String(value ?? '').trim();
}

/** A열 값(헤더 포함)으로 예약ID → 행 번호들 */
export function indexReservationRows(columnA: unknown[][] | null | undefined): Map<string, number[]> {
  const index = new Map<string, number[]>();
  (columnA || []).forEach((row, idx) => {
    if (idx === 0) return; // 헤더
    const id = cell(row?.[0]);
    if (!id) return;
    const rows = index.get(id);
    if (rows) rows.push(idx + 1);
    else index.set(id, [idx + 1]);
  });
  return index;
}

export function headersMatch(headerRow: unknown[] | null | undefined): boolean {
  const existing = headerRow || [];
  const expected = Array.from(SHEET_HEADERS);
  return (
    existing.length === expected.length &&
    expected.every((header, index) => cell(existing[index]) === header)
  );
}

/**
 * 탭 하나의 계획.
 * - 있는 예약: 첫 행을 고치고 나머지 중복 행은 지운다
 * - 없는 예약: 끝에 추가
 * - 지울 예약: 같은 탭에 다시 쓰는 예약이면 지우지 않는다
 */
export function planTab(input: {
  tab: string;
  isNew: boolean;
  columnA?: unknown[][] | null;
  headerRow?: unknown[] | null;
  upserts?: Map<string, string[]>;
  removals?: Set<string>;
}): TabPlan {
  const upserts = input.upserts || new Map<string, string[]>();
  const removals = input.removals || new Set<string>();
  const index = input.isNew ? new Map<string, number[]>() : indexReservationRows(input.columnA);

  const updates: TabPlan['updates'] = [];
  const appends: string[][] = [];
  const deleteRows: number[] = [];

  for (const [id, values] of upserts) {
    const rows = index.get(id);
    if (rows && rows.length) {
      updates.push({ row: rows[0], values });
      deleteRows.push(...rows.slice(1));
    } else {
      appends.push(values);
    }
  }
  for (const id of removals) {
    if (upserts.has(id)) continue;
    deleteRows.push(...(index.get(id) || []));
  }

  return {
    tab: input.tab,
    headerFix: upserts.size > 0 && (input.isNew || !headersMatch(input.headerRow)),
    updates,
    appends,
    deleteRows: [...new Set(deleteRows)].sort((a, b) => b - a),
  };
}

export function quoteTab(tabName: string): string {
  return `'${tabName.replace(/'/g, "''")}'`;
}

/** 시트 파일 1개에 계획을 실행한다. 실패하면 그대로 던진다(대기열이 다음 차례에 다시). */
export async function executeSpreadsheetOps(
  sheets: sheets_v4.Sheets,
  ops: SpreadsheetOps
): Promise<SpreadsheetResult> {
  const { spreadsheetId } = ops;
  const result: SpreadsheetResult = {
    spreadsheetId,
    apiCalls: 0,
    tabsCreated: 0,
    rowsUpdated: 0,
    rowsAppended: 0,
    rowsDeleted: 0,
  };

  // 1) 탭 목록
  const meta = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: 'sheets.properties(sheetId,title)',
  });
  result.apiCalls++;
  const sheetIds = new Map<string, number>();
  for (const sheet of meta.data.sheets || []) {
    const title = sheet.properties?.title;
    const sheetId = sheet.properties?.sheetId;
    if (title != null && sheetId != null) sheetIds.set(title, sheetId);
  }

  // 2) 없는 탭 만들기 (쓸 예약이 있는 탭만, 한 번에)
  const newTabs = [...ops.upserts.keys()].filter((tab) => !sheetIds.has(tab));
  if (newTabs.length) {
    const res = await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: { requests: newTabs.map((title) => ({ addSheet: { properties: { title } } })) },
    });
    result.apiCalls++;
    result.tabsCreated = newTabs.length;
    (res.data.replies || []).forEach((reply, i) => {
      const id = reply.addSheet?.properties?.sheetId;
      if (id != null) sheetIds.set(newTabs[i], id);
    });
  }
  const created = new Set(newTabs);

  // 3) 기존 탭 읽기: A열(예약ID) + 쓸 탭은 헤더 줄 — 한 번에
  const readTabs = [
    ...new Set([...ops.upserts.keys(), ...ops.removals.keys()]),
  ].filter((tab) => sheetIds.has(tab) && !created.has(tab));
  const ranges: { tab: string; kind: 'col' | 'header' }[] = [];
  for (const tab of readTabs) {
    ranges.push({ tab, kind: 'col' });
    if (ops.upserts.has(tab)) ranges.push({ tab, kind: 'header' });
  }
  const columnByTab = new Map<string, unknown[][]>();
  const headerByTab = new Map<string, unknown[]>();
  if (ranges.length) {
    const res = await sheets.spreadsheets.values.batchGet({
      spreadsheetId,
      ranges: ranges.map((r) => (r.kind === 'col' ? `${quoteTab(r.tab)}!A:A` : `${quoteTab(r.tab)}!1:1`)),
    });
    result.apiCalls++;
    const valueRanges = res.data.valueRanges || [];
    ranges.forEach((r, i) => {
      const values = (valueRanges[i]?.values || []) as unknown[][];
      if (r.kind === 'col') columnByTab.set(r.tab, values);
      else headerByTab.set(r.tab, values[0] || []);
    });
  }

  // 4) 계획
  const plans: TabPlan[] = [];
  for (const tab of new Set([...ops.upserts.keys(), ...ops.removals.keys()])) {
    if (!sheetIds.has(tab)) continue; // 지울 것만 있는데 탭이 없음
    plans.push(
      planTab({
        tab,
        isNew: created.has(tab),
        columnA: columnByTab.get(tab),
        headerRow: headerByTab.get(tab),
        upserts: ops.upserts.get(tab),
        removals: ops.removals.get(tab),
      })
    );
  }

  // 5) 헤더·기존 행 고치기 — 한 번에
  const data: sheets_v4.Schema$ValueRange[] = [];
  for (const plan of plans) {
    const q = quoteTab(plan.tab);
    if (plan.headerFix) {
      data.push({ range: `${q}!A1:${SHEET_LAST_COLUMN}1`, values: [Array.from(SHEET_HEADERS)] });
    }
    for (const u of plan.updates) {
      data.push({ range: `${q}!A${u.row}:${SHEET_LAST_COLUMN}${u.row}`, values: [u.values] });
    }
    result.rowsUpdated += plan.updates.length;
  }
  if (data.length) {
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId,
      requestBody: { valueInputOption: 'USER_ENTERED', data },
    });
    result.apiCalls++;
  }

  // 6) 새 행 추가 — 탭마다 한 번
  for (const plan of plans) {
    if (!plan.appends.length) continue;
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${quoteTab(plan.tab)}!A:${SHEET_LAST_COLUMN}`,
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: plan.appends },
    });
    result.apiCalls++;
    result.rowsAppended += plan.appends.length;
  }

  // 7) 중복·예전 행 지우기 — 마지막에 한 번 (아래 행부터라 번호가 안 밀림)
  const deletes: sheets_v4.Schema$Request[] = [];
  for (const plan of plans) {
    const sheetId = sheetIds.get(plan.tab);
    if (sheetId == null) continue;
    for (const row of plan.deleteRows) {
      deletes.push({
        deleteDimension: {
          range: { sheetId, dimension: 'ROWS', startIndex: row - 1, endIndex: row },
        },
      });
    }
    result.rowsDeleted += plan.deleteRows.length;
  }
  if (deletes.length) {
    await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests: deletes } });
    result.apiCalls++;
  }

  return result;
}
