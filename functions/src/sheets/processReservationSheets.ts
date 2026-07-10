import * as admin from 'firebase-admin';
import {
  buildSheetsConfigFromEnv,
  shouldSyncReservationToSheets,
  syncReservationToSheets,
} from './syncReservation';

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

  try {
    const meta = await syncReservationToSheets(reservationId, afterData, config);
    if (!meta) return;

    const existing = afterData.sheetsArchive as { syncedAt?: string } | undefined;
    const unchanged =
      existing &&
      typeof existing === 'object' &&
      'tab' in existing &&
      existing.tab === meta.tab &&
      'row' in existing &&
      existing.row === meta.row &&
      existing.syncedAt === meta.syncedAt;

    if (unchanged) return;

    await admin.firestore().doc(`reservations/${reservationId}`).update({
      sheetsArchive: meta,
    });

    console.log('[sheets] synced', {
      reservationId,
      tab: meta.tab,
      row: meta.row,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[sheets] sync failed', { reservationId, message });
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
