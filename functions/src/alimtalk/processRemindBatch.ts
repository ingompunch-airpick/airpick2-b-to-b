import * as admin from 'firebase-admin';
import { buildAlimtalkConfigFromEnv } from './provider';
import { processRemindAlimtalkForReservation } from './sendReservationAlimtalk';

/** KST 기준 오늘+offset 일의 YYYY-MM-DD */
export function kstYmdOffset(daysFromToday: number, now = new Date()): string {
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  kst.setUTCDate(kst.getUTCDate() + daysFromToday);
  const y = kst.getUTCFullYear();
  const m = String(kst.getUTCMonth() + 1).padStart(2, '0');
  const d = String(kst.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * 입고일 = 내일인 예약에 remind 알림톡 발송.
 * 매일 19:00 KST 스케줄에서 호출.
 */
export async function processRemindBatch(now = new Date()): Promise<{
  tomorrow: string;
  scanned: number;
  sent: number;
  failed: number;
  skipped: number;
}> {
  const tomorrow = kstYmdOffset(1, now);
  const config = buildAlimtalkConfigFromEnv();
  if (!config) {
    console.log('[alimtalk.remind] skipped — credentials or ALIMTALK_ENABLED not configured');
    return { tomorrow, scanned: 0, sent: 0, failed: 0, skipped: 0 };
  }

  const snap = await admin
    .firestore()
    .collection('reservations')
    .where('departureDate', '==', tomorrow)
    .get();

  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (const doc of snap.docs) {
    try {
      const result = await processRemindAlimtalkForReservation(doc.id, doc.data(), config);
      if (result === 'sent') sent += 1;
      else if (result === 'failed') failed += 1;
      else skipped += 1;
    } catch (err) {
      failed += 1;
      console.error('[alimtalk.remind] exception', {
        reservationId: doc.id,
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { tomorrow, scanned: snap.size, sent, failed, skipped };
}
