import { google, sheets_v4 } from 'googleapis';
import { DEFAULT_SPREADSHEET_ID, SHEET_HEADERS } from './constants';
import { buildReservationSheetRow } from './reservationRow';
import { resolveSheetTabName } from './tabName';

export interface SheetsArchiveConfig {
  spreadsheetId: string;
  /** 없으면 Cloud Functions 기본 서비스 계정(ADC) 사용 */
  serviceAccountJson?: string;
}

export interface SheetsArchiveMeta {
  spreadsheetId: string;
  tab: string;
  row: number;
  syncedAt: string;
}

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

function parseServiceAccount(json: string): Record<string, unknown> {
  const trimmed = json.trim();
  if (!trimmed) throw new Error('empty service account json');
  return JSON.parse(trimmed) as Record<string, unknown>;
}

function createSheetsClient(serviceAccountJson?: string): sheets_v4.Sheets {
  const auth = serviceAccountJson
    ? new google.auth.GoogleAuth({
        credentials: parseServiceAccount(serviceAccountJson),
        scopes: SCOPES,
      })
    : new google.auth.GoogleAuth({ scopes: SCOPES });
  return google.sheets({ version: 'v4', auth });
}

function parseRowFromUpdatedRange(updatedRange?: string | null): number | null {
  if (!updatedRange) return null;
  const match = updatedRange.match(/![A-Z]+(\d+)(?::|$)/i);
  if (!match?.[1]) return null;
  const row = Number(match[1]);
  return Number.isFinite(row) && row > 0 ? row : null;
}

async function listTabTitles(
  sheets: sheets_v4.Sheets,
  spreadsheetId: string
): Promise<Map<string, number>> {
  const res = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: 'sheets.properties(sheetId,title)',
  });
  const map = new Map<string, number>();
  for (const sheet of res.data.sheets || []) {
    const title = sheet.properties?.title;
    const sheetId = sheet.properties?.sheetId;
    if (title != null && sheetId != null) map.set(title, sheetId);
  }
  return map;
}

async function ensureTabWithHeaders(
  sheets: sheets_v4.Sheets,
  spreadsheetId: string,
  tabName: string
): Promise<number> {
  let tabs = await listTabTitles(sheets, spreadsheetId);
  if (!tabs.has(tabName)) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [
          {
            addSheet: {
              properties: { title: tabName },
            },
          },
        ],
      },
    });
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `'${tabName.replace(/'/g, "''")}'!A1`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [Array.from(SHEET_HEADERS)],
      },
    });
    tabs = await listTabTitles(sheets, spreadsheetId);
  }

  const headerRes = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `'${tabName.replace(/'/g, "''")}'!A1:A1`,
  });
  const firstCell = headerRes.data.values?.[0]?.[0];
  if (!firstCell) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `'${tabName.replace(/'/g, "''")}'!A1`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [Array.from(SHEET_HEADERS)],
      },
    });
  }

  const sheetId = tabs.get(tabName);
  if (sheetId == null) throw new Error(`sheet tab not found: ${tabName}`);
  return sheetId;
}

function quoteTab(tabName: string): string {
  return `'${tabName.replace(/'/g, "''")}'`;
}

/** A열(예약ID)에서 해당 예약 행 번호들 (1-based, 헤더 제외) */
async function findRowsByReservationId(
  sheets: sheets_v4.Sheets,
  spreadsheetId: string,
  tabName: string,
  reservationId: string
): Promise<number[]> {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${quoteTab(tabName)}!A:A`,
  });
  const values = res.data.values || [];
  const rows: number[] = [];
  values.forEach((row, idx) => {
    if (idx === 0) return; // header
    if (String(row[0] || '').trim() === reservationId) {
      rows.push(idx + 1);
    }
  });
  return rows;
}

async function deleteSheetRows(
  sheets: sheets_v4.Sheets,
  spreadsheetId: string,
  sheetId: number,
  rowNumbers: number[]
): Promise<void> {
  if (rowNumbers.length === 0) return;
  // 아래에서부터 삭제해야 인덱스가 안 밀림
  const sorted = [...rowNumbers].sort((a, b) => b - a);
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: sorted.map((rowNumber) => ({
        deleteDimension: {
          range: {
            sheetId,
            dimension: 'ROWS',
            startIndex: rowNumber - 1,
            endIndex: rowNumber,
          },
        },
      })),
    },
  });
}

async function appendReservationRow(
  sheets: sheets_v4.Sheets,
  spreadsheetId: string,
  tabName: string,
  rowValues: string[]
): Promise<number> {
  const res = await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${quoteTab(tabName)}!A:U`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: {
      values: [rowValues],
    },
  });

  const row = parseRowFromUpdatedRange(res.data.updates?.updatedRange);
  if (!row) {
    throw new Error(`could not parse appended row from ${res.data.updates?.updatedRange}`);
  }
  return row;
}

async function updateReservationRow(
  sheets: sheets_v4.Sheets,
  spreadsheetId: string,
  tabName: string,
  rowNumber: number,
  rowValues: string[]
): Promise<void> {
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${quoteTab(tabName)}!A${rowNumber}:U${rowNumber}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [rowValues],
    },
  });
}

const SYNC_SKIP_FIELDS = new Set([
  'sheetsArchive',
  'sheetsSyncInProgress',
  'alimtalkSent',
  'updatedAt',
  'updatedBy',
]);

export function shouldSyncReservationToSheets(
  before: Record<string, unknown> | undefined,
  after: Record<string, unknown> | undefined
): boolean {
  if (!after) return false;
  if (!before) return true;

  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const key of keys) {
    if (SYNC_SKIP_FIELDS.has(key)) continue;
    if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) return true;
  }
  return false;
}

export function buildSheetsConfigFromEnv(): SheetsArchiveConfig | null {
  if (process.env.SHEETS_ARCHIVE_ENABLED !== 'true') return null;

  const serviceAccountJson = process.env.GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON?.trim();

  return {
    spreadsheetId: process.env.GOOGLE_SHEETS_SPREADSHEET_ID?.trim() || DEFAULT_SPREADSHEET_ID,
    ...(serviceAccountJson ? { serviceAccountJson } : {}),
  };
}

/**
 * 예약 1건 = 시트 1행.
 * - 예약ID로 기존 행 검색 후 있으면 업데이트
 * - 중복 행이 있으면 첫 행만 남기고 삭제
 * - 없으면 append
 */
export async function syncReservationToSheets(
  reservationId: string,
  data: Record<string, unknown>,
  config: SheetsArchiveConfig
): Promise<SheetsArchiveMeta | null> {
  const sheets = createSheetsClient(config.serviceAccountJson || undefined);
  const tabName = resolveSheetTabName(data);
  const rowValues = buildReservationSheetRow(reservationId, data);
  const sheetId = await ensureTabWithHeaders(sheets, config.spreadsheetId, tabName);

  const existing = data.sheetsArchive as SheetsArchiveMeta | undefined;
  const sameSpreadsheet =
    existing?.spreadsheetId === config.spreadsheetId &&
    existing?.tab === tabName &&
    typeof existing?.row === 'number' &&
    existing.row > 0;

  // 1) 시트에서 예약ID로 실제 행 찾기 (레이스로 중복 append된 경우 대비)
  let matchedRows = await findRowsByReservationId(
    sheets,
    config.spreadsheetId,
    tabName,
    reservationId
  );

  let rowNumber: number;

  if (matchedRows.length > 0) {
    rowNumber = matchedRows[0];
    await updateReservationRow(sheets, config.spreadsheetId, tabName, rowNumber, rowValues);

    // 중복 행 제거 (2번째 이후)
    if (matchedRows.length > 1) {
      await deleteSheetRows(sheets, config.spreadsheetId, sheetId, matchedRows.slice(1));
      // 삭제 후 행 번호가 바뀔 수 있어 다시 조회
      matchedRows = await findRowsByReservationId(
        sheets,
        config.spreadsheetId,
        tabName,
        reservationId
      );
      rowNumber = matchedRows[0] || rowNumber;
      await updateReservationRow(sheets, config.spreadsheetId, tabName, rowNumber, rowValues);
    }
  } else if (sameSpreadsheet) {
    // 메타는 있는데 A열에 없음 → 해당 행에 다시 쓰거나 append
    rowNumber = existing!.row;
    try {
      await updateReservationRow(sheets, config.spreadsheetId, tabName, rowNumber, rowValues);
    } catch {
      rowNumber = await appendReservationRow(sheets, config.spreadsheetId, tabName, rowValues);
    }
  } else {
    rowNumber = await appendReservationRow(sheets, config.spreadsheetId, tabName, rowValues);

    // append 직후 레이스로 또 들어갔는지 한 번 더 정리
    matchedRows = await findRowsByReservationId(
      sheets,
      config.spreadsheetId,
      tabName,
      reservationId
    );
    if (matchedRows.length > 1) {
      rowNumber = matchedRows[0];
      await updateReservationRow(sheets, config.spreadsheetId, tabName, rowNumber, rowValues);
      await deleteSheetRows(sheets, config.spreadsheetId, sheetId, matchedRows.slice(1));
      matchedRows = await findRowsByReservationId(
        sheets,
        config.spreadsheetId,
        tabName,
        reservationId
      );
      rowNumber = matchedRows[0] || rowNumber;
    }
  }

  return {
    spreadsheetId: config.spreadsheetId,
    tab: tabName,
    row: rowNumber,
    syncedAt: new Date().toISOString(),
  };
}
