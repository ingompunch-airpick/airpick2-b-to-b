import * as admin from 'firebase-admin';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { onReservationSync } from './onReservationWrite';
import { runRetentionCleanup } from './retentionCleanup';
import { adminUpsertCompany } from './admin/upsertCompany';
import { adminSetCompanyStatus } from './admin/setCompanyStatus';
import { adminDeleteCompany } from './admin/deleteCompany';
import { verifyPartnerLogin } from './admin/verifyPartnerLogin';
import { upsertCompanyEmployees } from './admin/upsertCompanyEmployees';

export {
  onReservationSync,
  adminUpsertCompany,
  adminSetCompanyStatus,
  adminDeleteCompany,
  verifyPartnerLogin,
  upsertCompanyEmployees,
};

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
