import * as admin from 'firebase-admin';
import { recordServerError } from '../ops/errorReports';
import {
  addRemoval,
  addUpsert,
  emptySpreadsheetOps,
  executeSpreadsheetOps,
  type SpreadsheetOps,
  type SpreadsheetResult,
} from './batchPlan';
import { buildReservationSheetRow } from './reservationRow';
import {
  createSheetsClient,
  fetchCustomerVisitCount,
  resolveReservationSheetTargets,
  shouldSyncReservationToSheets,
  type SheetTarget,
  type SheetsArchiveConfig,
} from './syncReservation';

/**
 * 시트 묶음 쓰기(SHEETS_SYNC_MODE=batch).
 * - 예약이 바뀌면 sheetSync/{예약ID}에 「써야 함」만 표시한다(시트 API 0회)
 * - drainSheetsQueue(10분)가 표시된 예약을 모아, 시트 파일·탭별로 한 번에 쓴다
 * - 같은 예약이 여러 번 바뀌어도 실행 시점의 마지막 상태를 한 번 쓴다
 * 문서: { pending, queuedAt, attempts, lastTarget, syncedAt, lastError, lastErrorAt }
 * 클라이언트 규칙이 없어 앱에서는 읽거나 쓸 수 없다.
 */
export const SHEET_SYNC_COLLECTION = 'sheetSync';

/** 한 번 실행에 꺼내는 최대 건수. 남으면 다음 차례에 이어서 */
const DRAIN_LIMIT = 400;
/** 이만큼 연속 실패하면 본사 오류 보고 */
const MAX_ATTEMPTS = 3;
/** 보고한 뒤에는 1시간마다만 다시 시도 */
const RETRY_AFTER_REPORT_MS = 60 * 60 * 1000;

function queueRef(reservationId: string) {
  return admin.firestore().collection(SHEET_SYNC_COLLECTION).doc(reservationId);
}

/** 예약 트리거에서 부른다. 시트에 보이는 값이 바뀐 경우만 표시한다. */
export async function enqueueSheetSync(
  reservationId: string,
  beforeData: Record<string, unknown> | undefined,
  afterData: Record<string, unknown> | undefined
): Promise<boolean> {
  if (!afterData) return false;
  if (!shouldSyncReservationToSheets(beforeData, afterData)) return false;
  await queueRef(reservationId).set(
    {
      pending: true,
      queuedAt: admin.firestore.FieldValue.serverTimestamp(),
      attempts: 0,
    },
    { merge: true }
  );
  return true;
}

function isTarget(value: unknown): value is SheetTarget {
  const v = value as Partial<SheetTarget> | null | undefined;
  return Boolean(
    v &&
      typeof v.spreadsheetId === 'string' &&
      v.spreadsheetId.trim() &&
      typeof v.tab === 'string' &&
      v.tab.trim()
  );
}

function sameTarget(a: SheetTarget, b: SheetTarget): boolean {
  return a.spreadsheetId === b.spreadsheetId && a.tab === b.tab;
}

function errorMessage(err: unknown): string {
  return (err instanceof Error ? err.message : String(err)).slice(0, 300);
}

export interface DrainResult {
  skipped?: string;
  queued: number;
  due: number;
  synced: number;
  failed: number;
  missing: number;
  raced: number;
  spreadsheets: SpreadsheetResult[];
  errors: { spreadsheetId: string; message: string }[];
}

type Item = {
  id: string;
  snap: FirebaseFirestore.QueryDocumentSnapshot;
  attempts: number;
  companyId: string;
  primary?: SheetTarget;
  spreadsheets: Set<string>;
};

export async function drainSheetSyncQueue(
  config: SheetsArchiveConfig | null,
  options?: { limit?: number }
): Promise<DrainResult> {
  const result: DrainResult = {
    queued: 0,
    due: 0,
    synced: 0,
    failed: 0,
    missing: 0,
    raced: 0,
    spreadsheets: [],
    errors: [],
  };
  if (!config) return { ...result, skipped: 'disabled' };

  const db = admin.firestore();
  const queueSnap = await db
    .collection(SHEET_SYNC_COLLECTION)
    .where('pending', '==', true)
    .limit(options?.limit ?? DRAIN_LIMIT)
    .get();
  result.queued = queueSnap.size;
  if (queueSnap.empty) return result;

  const now = Date.now();
  const due: Item[] = [];
  for (const snap of queueSnap.docs) {
    const d = snap.data();
    const attempts = Number(d.attempts || 0);
    const lastErrorAt = Date.parse(String(d.lastErrorAt || ''));
    if (attempts >= MAX_ATTEMPTS && Number.isFinite(lastErrorAt) && now - lastErrorAt < RETRY_AFTER_REPORT_MS) {
      continue;
    }
    due.push({ id: snap.id, snap, attempts, companyId: '', spreadsheets: new Set() });
  }
  result.due = due.length;
  if (!due.length) return result;

  const reservationSnaps = await db.getAll(...due.map((item) => db.doc(`reservations/${item.id}`)));
  const opsBySpreadsheet = new Map<string, SpreadsheetOps>();
  const opsFor = (spreadsheetId: string) => {
    let ops = opsBySpreadsheet.get(spreadsheetId);
    if (!ops) {
      ops = emptySpreadsheetOps(spreadsheetId);
      opsBySpreadsheet.set(spreadsheetId, ops);
    }
    return ops;
  };

  const missing: Item[] = [];
  const prepFailed = new Map<Item, string>();
  for (let i = 0; i < due.length; i++) {
    const item = due[i];
    const resSnap = reservationSnaps[i];
    if (!resSnap.exists) {
      missing.push(item);
      continue;
    }
    const data = resSnap.data() as Record<string, unknown>;
    item.companyId = String(data.companyId || '').trim().toLowerCase();
    try {
      const { primary, owned } = await resolveReservationSheetTargets(data);
      const visitCount = await fetchCustomerVisitCount(data.phone, data.companyId);
      const row = buildReservationSheetRow(item.id, data, { visitCount });
      item.primary = primary;

      addUpsert(opsFor(primary.spreadsheetId), primary.tab, item.id, row);
      item.spreadsheets.add(primary.spreadsheetId);
      if (owned && !sameTarget(owned, primary)) {
        addUpsert(opsFor(owned.spreadsheetId), owned.tab, item.id, row);
        item.spreadsheets.add(owned.spreadsheetId);
      }

      // 탭·파일이 바뀐 예약: 예전 자리의 줄을 지운다 (새 자리에 같이 쓰는 탭이면 계획에서 빠짐)
      const lastTarget = item.snap.data().lastTarget;
      const archived = data.sheetsArchive as Record<string, unknown> | undefined;
      const previous = isTarget(lastTarget)
        ? lastTarget
        : isTarget(archived) && !archived.error
          ? { spreadsheetId: String(archived.spreadsheetId), tab: String(archived.tab) }
          : null;
      if (previous && !sameTarget(previous, primary)) {
        addRemoval(opsFor(previous.spreadsheetId), previous.tab, item.id);
        item.spreadsheets.add(previous.spreadsheetId);
      }
    } catch (err) {
      prepFailed.set(item, errorMessage(err));
    }
  }

  const sheets = createSheetsClient(config.serviceAccountJson || undefined);
  const failedSheets = new Map<string, string>();
  for (const ops of opsBySpreadsheet.values()) {
    try {
      result.spreadsheets.push(await executeSpreadsheetOps(sheets, ops));
    } catch (err) {
      const message = errorMessage(err);
      failedSheets.set(ops.spreadsheetId, message);
      result.errors.push({ spreadsheetId: ops.spreadsheetId, message });
      console.error('[sheets-batch] spreadsheet failed', { spreadsheetId: ops.spreadsheetId, message });
    }
  }

  const syncedAt = new Date().toISOString();
  const toReport = new Map<string, Set<string>>();
  const writes: Promise<void>[] = [];
  // 꺼낸 뒤 예약이 또 바뀌었으면(문서 시각이 다름) 건드리지 않는다 → 다음 차례에 최신 상태로 다시
  const guarded = (item: Item, data: Record<string, unknown>): Promise<void> =>
    item.snap.ref
      .update(data, { lastUpdateTime: item.snap.updateTime })
      .then(() => undefined)
      .catch((err: { code?: number }) => {
        if (err?.code === 9 || err?.code === 5) {
          result.raced++;
          return;
        }
        console.warn('[sheets-batch] queue update failed', { id: item.id, err: errorMessage(err) });
      });

  for (const item of missing) {
    result.missing++;
    writes.push(guarded(item, { pending: false, syncedAt, lastError: admin.firestore.FieldValue.delete() }));
  }

  for (const item of due) {
    if (missing.includes(item)) continue;
    const problem =
      prepFailed.get(item) ||
      [...item.spreadsheets].map((id) => failedSheets.get(id)).find(Boolean);
    if (!problem) {
      result.synced++;
      writes.push(
        guarded(item, {
          pending: false,
          attempts: 0,
          syncedAt,
          ...(item.primary ? { lastTarget: item.primary } : {}),
          lastError: admin.firestore.FieldValue.delete(),
          lastErrorAt: admin.firestore.FieldValue.delete(),
        })
      );
      continue;
    }
    result.failed++;
    const attempts = item.attempts + 1;
    writes.push(guarded(item, { attempts, lastError: problem, lastErrorAt: syncedAt }));
    if (attempts === MAX_ATTEMPTS) {
      const ids = toReport.get(problem) || new Set<string>();
      if (item.companyId) ids.add(item.companyId);
      toReport.set(problem, ids);
    }
  }
  await Promise.all(writes);

  for (const [message, companyIds] of toReport) {
    await recordServerError(`sheets-batch`, `시트 묶음 쓰기 ${MAX_ATTEMPTS}회 실패: ${message}`, [
      ...companyIds,
    ]).catch((err) => console.warn('[sheets-batch] report failed', errorMessage(err)));
  }

  return result;
}
