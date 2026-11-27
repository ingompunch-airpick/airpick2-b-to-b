import * as admin from 'firebase-admin';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { defineSecret, defineString } from 'firebase-functions/params';
import { sheetsServiceAccountJson } from './sheets/params';
import { applySheetsRuntimeEnv } from './sheets/runtimeEnv';
import { buildSheetsConfigFromEnv } from './sheets/syncReservation';
import { drainSheetSyncQueue } from './sheets/batchSync';
import { onReservationSync } from './onReservationWrite';
import { onCompanySheet } from './onCompanySheet';
import { onCompanySync } from './onCompanyWrite';
import { runRetentionCleanup } from './retentionCleanup';
import { sweepReservationPasswords } from './reservations/reservationSecrets';
import { backfillUpcomingCapacity } from './capacityAggregate';
import { refreshAllParkingOccupancy } from './parkingOccupancy';
import { backfillActiveReceiptLinkCodes } from './reservations/receiptLink';
import { backfillCustomerCompanyVisits } from './customerVisit';
import { runInsuranceExpiryCheck } from './ops/insuranceExpiry';
export {
  reservationPayment,
  portoneWebhook,
  expireAwaitingPaymentsJob,
  refundOnPartnerCancel,
} from './payments/functions';
import { runFlightDelayCheck } from './flightDelay/checkFlightDelays';
import { adminUpsertCompany } from './admin/upsertCompany';
import { adminSetCompanyStatus } from './admin/setCompanyStatus';
import { adminDeleteCompany } from './admin/deleteCompany';
import { adminRenameCompany } from './admin/renameCompany';
import { verifyPartnerLogin } from './admin/verifyPartnerLogin';
import { upsertCompanyEmployees } from './admin/upsertCompanyEmployees';
import { getHqMonthLedger } from './admin/getHqMonthLedger';
import { freezePastHqMonths } from './hqMonthSnapshot';
import { applyAlimtalkRuntimeEnv } from './alimtalk/params';
import { processRemindBatch } from './alimtalk/processRemindBatch';

/** 손님(B2C) HTTPS API — 리전 asia-northeast3 (이름·리전 유지) */
import { getReceipt } from './api/getReceipt';
import { submitPartnerApplication } from './api/submitPartnerApplication';
import { getAffiliateStats } from './api/getAffiliateStats';
import { affiliateLogin } from './api/affiliateLogin';
import { lookupReservation } from './api/lookupReservation';
import { cancelReservation } from './api/cancelReservation';
import { submitReview } from './api/submitReview';
import { listAdminReviews, moderateReview } from './api/moderateReview';
import { getIcnShuttle } from './api/icnShuttle';
import { getIcnFlight, getIcnFlightSearch } from './api/icnFlight';
import { getIcnArrival } from './api/icnArrival';
import { getIcnAirportLive } from './api/icnAirportLive';
import { getDriveEta } from './api/driveEta';
import { claimGuestReservations } from './members/claimGuestReservations';
import { dispatchErrorReports, reportClientError } from './ops/errorReports';

export {
  reportClientError,
  onReservationSync,
  onCompanySheet,
  onCompanySync,
  adminUpsertCompany,
  adminSetCompanyStatus,
  adminDeleteCompany,
  adminRenameCompany,
  verifyPartnerLogin,
  upsertCompanyEmployees,
  getHqMonthLedger,
  getReceipt,
  getAffiliateStats,
  affiliateLogin,
  lookupReservation,
  cancelReservation,
  submitReview,
  listAdminReviews,
  moderateReview,
  getIcnShuttle,
  getIcnFlight,
  getIcnFlightSearch,
  getIcnArrival,
  getIcnAirportLive,
  getDriveEta,
  claimGuestReservations,
  submitPartnerApplication,
};

if (!admin.apps.length) {
  admin.initializeApp();
}

const flightDelayEnabled = defineString('FLIGHT_DELAY_ENABLED', { default: 'false' });
/** ICN 손님 API와 동일 — Secret Manager. .env에 평문으로 넣지 말 것(겹침 오류). */
const dataGoKrServiceKey = defineSecret('DATA_GO_KR_SERVICE_KEY');

/** 매일 19:00 KST — 내일 입고 airpick-b2c 예약에 remind 알림톡 */
export const dispatchAlimtalkReminders = onSchedule(
  {
    schedule: '0 19 * * *',
    timeZone: 'Asia/Seoul',
    region: 'asia-northeast3',
    memory: '512MiB',
    timeoutSeconds: 540,
  },
  async () => {
    applyAlimtalkRuntimeEnv();
    const result = await processRemindBatch();
    console.log('[dispatchAlimtalkReminders]', JSON.stringify(result));
  }
);

/** 매일 00:20 KST — 지난달 합계를 hqMonthSnapshots 에 남긴다. 이번달은 적지 않는다. */
export const freezeHqMonthSnapshots = onSchedule(
  {
    schedule: '20 0 * * *',
    timeZone: 'Asia/Seoul',
    region: 'us-central1',
    memory: '512MiB',
    timeoutSeconds: 540,
    secrets: [sheetsServiceAccountJson],
  },
  async () => {
    const result = await freezePastHqMonths();
    console.log('[freezeHqMonthSnapshots]', JSON.stringify(result));
  }
);

/** 매일 04:00 KST — 출차 14일 사진 삭제. 예약 문서는 삭제하지 않음(PURGE_RESERVATION_DOCUMENTS=false). */
export const purgeExpiredReservationData = onSchedule(
  {
    schedule: '0 4 * * *',
    timeZone: 'Asia/Seoul',
    region: 'us-central1',
    memory: '512MiB',
    timeoutSeconds: 540,
  },
  async () => {
    const result = await runRetentionCleanup();
    console.log('[purgeExpiredReservationData]', JSON.stringify(result));

    const movedPasswords = await sweepReservationPasswords();
    console.log('[purgeExpiredReservationData] passwords moved to secrets', movedPasswords);

    const capacityDocs = await backfillUpcomingCapacity();
    console.log('[purgeExpiredReservationData] capacity docs refreshed', capacityDocs);

    const parkingDocs = await refreshAllParkingOccupancy();
    console.log('[purgeExpiredReservationData] parking occupancy refreshed', parkingDocs);

    const linkCodes = await backfillActiveReceiptLinkCodes();
    console.log('[purgeExpiredReservationData] receipt link codes stamped', linkCodes);

    const visitDocs = await backfillCustomerCompanyVisits();
    console.log('[purgeExpiredReservationData] customer company visits moved', visitDocs);
  }
);

/**
 * 10분마다 — 시트 묶음 쓰기 대기열(sheetSync)을 모아 구글 시트에 한 번에 쓴다.
 * SHEETS_SYNC_MODE=batch 일 때 쌓인다. instant로 되돌려도 남은 대기열은 계속 비운다.
 * 동시에 1개만 돈다. 대기열이 비면 조회 1번으로 끝난다.
 */
export const drainSheetsQueue = onSchedule(
  {
    schedule: 'every 10 minutes',
    timeZone: 'Asia/Seoul',
    region: 'asia-northeast3',
    memory: '512MiB',
    timeoutSeconds: 300,
    maxInstances: 1,
    retryCount: 0,
    secrets: [sheetsServiceAccountJson],
  },
  async () => {
    applySheetsRuntimeEnv();
    const result = await drainSheetSyncQueue(buildSheetsConfigFromEnv());
    if (result.queued || result.skipped) {
      console.log('[drainSheetsQueue]', JSON.stringify(result));
    }
  }
);

/** 매일 08:47 KST — 입점업체 보험 만기 30·7·1일 전·당일·지남을 본사 메일 대기열에 남긴다. */
export const checkInsuranceExpiryDaily = onSchedule(
  {
    schedule: '47 8 * * *',
    timeZone: 'Asia/Seoul',
    region: 'asia-northeast3',
    memory: '256MiB',
    timeoutSeconds: 60,
    maxInstances: 1,
    retryCount: 0,
  },
  async () => {
    const result = await runInsuranceExpiryCheck();
    if (result.notices) console.log('[checkInsuranceExpiry]', JSON.stringify(result));
  }
);

/** 평일 09:00 KST — 보낼 오류 보고가 있을 때만 본사에 메일을 보낸다. */
export const dispatchErrorReportsDaily = onSchedule(
  {
    schedule: '0 9 * * 1-5',
    timeZone: 'Asia/Seoul',
    region: 'us-central1',
    memory: '256MiB',
    timeoutSeconds: 60,
  },
  async () => {
    const result = await dispatchErrorReports();
    console.log('[dispatchErrorReports]', JSON.stringify(result));
  }
);

/**
 * 2분마다 — 인천공항 당일 도착편 도착·연착/결항 → 상태 자동전환·파트너 FCM
 * 오늘 입국편이 있는 예약이 없으면 공항 API를 부르지 않는다.
 * 공항 호출이 3번 연속 실패하면 15분 쉰다.
 */
export const checkIncheonFlightDelays = onSchedule(
  {
    schedule: 'every 2 minutes',
    timeZone: 'Asia/Seoul',
    region: 'asia-northeast3',
    memory: '256MiB',
    cpu: 0.08,
    timeoutSeconds: 30,
    secrets: [dataGoKrServiceKey],
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
