import * as admin from 'firebase-admin';
import {
  buildSheetsConfigFromEnv,
  shouldSyncReservationToSheets,
  syncReservationToSheets,
} from './syncReservation';

const LOCK_TTL_MS = 45_000;

/** 동시 실행 시 중복 append 방지 */
async function tryClaimSheetsSync(reservationId: string): Promise<boolean> {
  const ref = admin.firestore().doc(`reservations/${reservationId}`);
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

async function clearSheetsSyncLock(reservationId: string): Promise<void> {
  await admin
    .firestore()
    .doc(`reservations/${reservationId}`)
    .update({
      sheetsSyncInProgress: admin.firestore.FieldValue.delete(),
    })
    .catch(() => undefined);
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

  const claimed = await tryClaimSheetsSync(reservationId);
  if (!claimed) {
    console.log('[sheets] skipped — sync already in progress', { reservationId });
    return;
  }

  try {
    // 락 직후 최신 문서 재조회 (다른 인스턴스가 sheetsArchive를 썼을 수 있음)
    const fresh = await admin.firestore().doc(`reservations/${reservationId}`).get();
    const freshData = (fresh.data() || afterData) as Record<string, unknown>;

    const meta = await syncReservationToSheets(reservationId, freshData, config);
    if (!meta) {
      await clearSheetsSyncLock(reservationId);
      return;
    }

    await admin.firestore().doc(`reservations/${reservationId}`).update({
      sheetsArchive: meta,
      sheetsSyncInProgress: admin.firestore.FieldValue.delete(),
    });

    console.log('[sheets] synced', {
      reservationId,
      tab: meta.tab,
      row: meta.row,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[sheets] sync failed', { reservationId, message });
    await clearSheetsSyncLock(reservationId);
    await admin
      .firestore()
      .doc(`reservations/${reservationId}`)
      .update({
        sheetsArchive: {
          error: message,
          lastAttemptAt: new Date().toISOString(),
        },
      })
      .catch((err) => console.warn('[sheets] failed to write error meta', err));
  }
}
