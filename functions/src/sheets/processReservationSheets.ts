import * as admin from 'firebase-admin';
import {
  buildSheetsConfigFromEnv,
  shouldSyncReservationToSheets,
  syncReservationToSheets,
  type SheetsArchiveMeta,
} from './syncReservation';

const LOCK_TTL_MS = 45_000;
/** 락 보유 중 들어온 변경을 같은 실행에서 최대 몇 번까지 이어서 반영할지 */
const MAX_DRAIN_ROUNDS = 5;
/** 락 직후 짧은 재시도 */
const CLAIM_RETRY_DELAYS_MS = [1_500, 3_000] as const;
/** 락이 안 풀릴 때 pending 표시 후 폴링 대기 (Function timeout 여유 포함) */
const LOCK_WAIT_MS = 35_000;
const LOCK_POLL_MS = 2_000;

function reservationRef(reservationId: string) {
  return admin.firestore().doc(`reservations/${reservationId}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 동시 실행 시 중복 append 방지 */
async function tryClaimSheetsSync(reservationId: string): Promise<boolean> {
  const ref = reservationRef(reservationId);
  try {
    return await admin.firestore().runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return false;
      const data = snap.data() || {};
      const startedAt = Date.parse(String(data.sheetsSyncInProgress || ''));
      if (Number.isFinite(startedAt) && Date.now() - startedAt < LOCK_TTL_MS) {
        return false;
      }
      tx.update(ref, { sheetsSyncInProgress: new Date().toISOString() });
      return true;
    });
  } catch (error) {
    console.warn('[sheets] lock claim failed', { reservationId, error });
    return false;
  }
}

async function markSheetsSyncPending(
  reservationId: string,
  options?: { kick?: boolean }
): Promise<void> {
  const payload: Record<string, unknown> = {
    sheetsSyncPending: true,
    sheetsSyncPendingAt: new Date().toISOString(),
  };
  // kickAt 은 SYNC_SKIP 대상이 아님 → onWrite가 다시 돌며 락 해제 후 동기화
  if (options?.kick) {
    payload.sheetsSyncKickAt = new Date().toISOString();
  }
  await reservationRef(reservationId)
    .update(payload)
    .catch((error) =>
      console.warn('[sheets] failed to mark pending', { reservationId, error })
    );
}

async function clearSheetsSyncPending(reservationId: string): Promise<void> {
  await reservationRef(reservationId)
    .update({
      sheetsSyncPending: admin.firestore.FieldValue.delete(),
      sheetsSyncPendingAt: admin.firestore.FieldValue.delete(),
    })
    .catch(() => undefined);
}

async function clearSheetsSyncLock(reservationId: string): Promise<void> {
  await reservationRef(reservationId)
    .update({
      sheetsSyncInProgress: admin.firestore.FieldValue.delete(),
    })
    .catch(() => undefined);
}

async function hasSheetsSyncPending(reservationId: string): Promise<boolean> {
  const snap = await reservationRef(reservationId).get();
  return Boolean(snap.data()?.sheetsSyncPending);
}

/** 짧은 재시도 → pending 표시 → 락 TTL까지 폴링 */
async function claimSheetsSyncOrWait(reservationId: string): Promise<boolean> {
  if (await tryClaimSheetsSync(reservationId)) return true;

  for (const delayMs of CLAIM_RETRY_DELAYS_MS) {
    await sleep(delayMs);
    if (await tryClaimSheetsSync(reservationId)) return true;
  }

  // 홀더가 drain 하도록 표시한 뒤, 같은 실행에서도 락이 풀리면 이어받음
  await markSheetsSyncPending(reservationId);

  const deadline = Date.now() + LOCK_WAIT_MS;
  while (Date.now() < deadline) {
    await sleep(LOCK_POLL_MS);
    if (await tryClaimSheetsSync(reservationId)) {
      console.log('[sheets] claimed after waiting for lock', { reservationId });
      return true;
    }
  }

  const snap = await reservationRef(reservationId).get();
  const data = snap.data() || {};
  const startedAt = Date.parse(String(data.sheetsSyncInProgress || ''));
  const lockHeld = Number.isFinite(startedAt) && Date.now() - startedAt < LOCK_TTL_MS;
  if (lockHeld) {
    // 홀더가 아직 동작 중 → drain 에 맡기고 kick 하지 않음 (폭주 방지)
    await markSheetsSyncPending(reservationId);
    console.log('[sheets] lock busy — pending for active holder drain', { reservationId });
    return false;
  }

  const lastKick = Date.parse(String(data.sheetsSyncKickAt || ''));
  if (Number.isFinite(lastKick) && Date.now() - lastKick < 15_000) {
    await markSheetsSyncPending(reservationId);
    console.log('[sheets] lock busy — recent kick already scheduled', { reservationId });
    return false;
  }

  await markSheetsSyncPending(reservationId, { kick: true });
  console.log('[sheets] lock busy — kicked follow-up sync', { reservationId });
  return false;
}

async function finishSyncSuccess(
  reservationId: string,
  meta: SheetsArchiveMeta,
  rounds: number
): Promise<void> {
  await reservationRef(reservationId).update({
    sheetsArchive: meta,
    sheetsSyncInProgress: admin.firestore.FieldValue.delete(),
    sheetsSyncPending: admin.firestore.FieldValue.delete(),
    sheetsSyncPendingAt: admin.firestore.FieldValue.delete(),
  });
  console.log('[sheets] synced', {
    reservationId,
    tab: meta.tab,
    row: meta.row,
    rounds,
  });
}

export async function processReservationSheetsArchive(
  reservationId: string,
  beforeData: FirebaseFirestore.DocumentData | undefined,
  afterData: FirebaseFirestore.DocumentData | undefined,
  config: ReturnType<typeof buildSheetsConfigFromEnv>
): Promise<void> {
  if (!afterData) return;
  if (!shouldSyncReservationToSheets(beforeData, afterData)) return;

  if (!config) {
    console.log('[sheets] skipped — SHEETS_ARCHIVE_ENABLED or credentials not configured', {
      reservationId,
    });
    return;
  }

  const claimed = await claimSheetsSyncOrWait(reservationId);
  if (!claimed) return;

  try {
    let lastMeta: SheetsArchiveMeta | null = null;

    for (let round = 1; round <= MAX_DRAIN_ROUNDS; round++) {
      // 라운드 시작 시 pending 해제 → 동기화 중 변경은 다시 pending으로 표시됨
      await clearSheetsSyncPending(reservationId);

      const fresh = await reservationRef(reservationId).get();
      if (!fresh.exists) {
        await clearSheetsSyncLock(reservationId);
        return;
      }

      lastMeta = await syncReservationToSheets(
        reservationId,
        fresh.data() as Record<string, unknown>,
        config
      );
      if (!lastMeta) {
        await clearSheetsSyncLock(reservationId);
        return;
      }

      if (!(await hasSheetsSyncPending(reservationId))) {
        await finishSyncSuccess(reservationId, lastMeta, round);
        return;
      }

      console.log('[sheets] pending changes during sync — draining', {
        reservationId,
        round,
      });
    }

    // 라운드 소진: 마지막 메타 저장 후 락만 해제하고, pending 유지한 채 한 번 더 대기·재시도
    await reservationRef(reservationId).update({
      sheetsArchive: lastMeta,
      sheetsSyncInProgress: admin.firestore.FieldValue.delete(),
    });
    console.warn('[sheets] drain rounds exhausted — retrying after brief wait', {
      reservationId,
    });

    await sleep(LOCK_POLL_MS);
    if (await tryClaimSheetsSync(reservationId)) {
      await clearSheetsSyncPending(reservationId);
      const fresh = await reservationRef(reservationId).get();
      if (!fresh.exists) {
        await clearSheetsSyncLock(reservationId);
        return;
      }
      const meta = await syncReservationToSheets(
        reservationId,
        fresh.data() as Record<string, unknown>,
        config
      );
      if (meta) {
        await finishSyncSuccess(reservationId, meta, MAX_DRAIN_ROUNDS + 1);
        return;
      }
      await clearSheetsSyncLock(reservationId);
      return;
    }

    await markSheetsSyncPending(reservationId, { kick: true });
    console.warn('[sheets] follow-up claim failed — kicked resync', { reservationId });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[sheets] sync failed', { reservationId, message });
    await clearSheetsSyncLock(reservationId);
    await reservationRef(reservationId)
      .update({
        sheetsArchive: {
          error: message,
          lastAttemptAt: new Date().toISOString(),
        },
        sheetsSyncPending: true,
        sheetsSyncPendingAt: new Date().toISOString(),
        sheetsSyncKickAt: new Date().toISOString(),
      })
      .catch((err) => console.warn('[sheets] failed to write error meta', err));
  }
}
