import * as admin from 'firebase-admin';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { defineString } from 'firebase-functions/params';
import { onReservationSync } from './onReservationWrite';
import { runRetentionCleanup } from './retentionCleanup';
import { runFlightDelayCheck } from './flightDelay/checkFlightDelays';
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

const flightDelayEnabled = defineString('FLIGHT_DELAY_ENABLED', { default: 'false' });
const dataGoKrServiceKey = defineString('DATA_GO_KR_SERVICE_KEY', { default: '' });

/** 매일 04:00 KST — 출차 90일 후 예약 삭제, 30일 후 Storage 사진 삭제 */
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

/**
 * 2분마다 — 인천공항 당일 도착편 도착·연착/결항 → 상태 자동전환·파트너 FCM
 * 공공데이터포털 서비스키(DATA_GO_KR_SERVICE_KEY) + FLIGHT_DELAY_ENABLED=true 필요
 */
export const checkIncheonFlightDelays = onSchedule(
  {
    schedule: 'every 2 minutes',
    timeZone: 'Asia/Seoul',
    memory: '512MiB',
    timeoutSeconds: 120,
  },
  async () => {
    if (flightDelayEnabled.value() !== 'true') {
      console.log('[flightDelay] skipped — FLIGHT_DELAY_ENABLED!=true');
      return;
    }
    const result = await runFlightDelayCheck(dataGoKrServiceKey.value());
    console.log('[flightDelay]', JSON.stringify(result));
  }
);
