import * as admin from 'firebase-admin';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { runRetentionCleanup } from './retentionCleanup';

if (!admin.apps.length) {
  admin.initializeApp();
}

/** 매일 04:00 KST — 출차 7일 후 예약 삭제, 30일 후 Storage 사진 삭제 */
export const purgeExpiredReservationData = onSchedule(
  {
    schedule: '0 4 * * *',
    timeZone: 'Asia/Seoul',
    memory: '512MiB',
    timeoutSeconds: 540,
  },
  async () => {
    const result = await runRetentionCleanup();
    console.log('[purgeExpiredReservationData]', JSON.stringify(result));
  }
);
