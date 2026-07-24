import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { defineSecret, defineString } from 'firebase-functions/params';
import { buildNhnConfigFromEnv, processReservationAlimtalk } from './alimtalk/sendReservationAlimtalk';
import { buildSheetsConfigFromEnv } from './sheets/syncReservation';
import { processReservationSheetsArchive } from './sheets/processReservationSheets';
import { enforceHourlyCapacityOnCreate } from './hourlyCapacity';
import { bumpCustomerVisitOnCreate } from './customerVisit';
import { notifyPartnersNewReservation } from './partnerPush';

const alimtalkEnabled = defineString('ALIMTALK_ENABLED', { default: 'false' });
const alimtalkProvider = defineString('ALIMTALK_PROVIDER', { default: 'nhn' });
const nhnAppKey = defineString('NHN_ALIMTALK_APP_KEY', { default: '' });
const nhnSecretKey = defineString('NHN_ALIMTALK_SECRET_KEY', { default: '' });
const nhnSenderKey = defineString('NHN_ALIMTALK_SENDER_KEY', { default: '' });
const ncpAccessKey = defineString('NCP_ALIMTALK_ACCESS_KEY', { default: '' });
const ncpSecretKey = defineString('NCP_ALIMTALK_SECRET_KEY', { default: '' });
const ncpServiceId = defineString('NCP_ALIMTALK_SERVICE_ID', { default: '' });
const ncpPlusFriendId = defineString('NCP_ALIMTALK_PLUS_FRIEND_ID', { default: '@airpickup' });
const ncpTemplateReserve = defineString('NCP_ALIMTALK_TEMPLATE_RESERVE', { default: 'reservation' });
const ncpTemplateCheckin = defineString('NCP_ALIMTALK_TEMPLATE_CHECKIN', { default: '' });
const ncpTemplateCheckout = defineString('NCP_ALIMTALK_TEMPLATE_CHECKOUT', { default: '' });

const sheetsArchiveEnabled = defineString('SHEETS_ARCHIVE_ENABLED', { default: 'false' });
const sheetsSpreadsheetId = defineString('GOOGLE_SHEETS_SPREADSHEET_ID', {
  default: '1zxxMHH7cJDz_nyCQbPOt2GCHdBtAVY9mzBDnUVV6lTs',
});
const sheetsServiceAccountJson = defineSecret('GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON');

function applyRuntimeEnv(): void {
  process.env.ALIMTALK_ENABLED = alimtalkEnabled.value();
  process.env.ALIMTALK_PROVIDER = alimtalkProvider.value();
  process.env.NHN_ALIMTALK_APP_KEY = nhnAppKey.value();
  process.env.NHN_ALIMTALK_SECRET_KEY = nhnSecretKey.value();
  process.env.NHN_ALIMTALK_SENDER_KEY = nhnSenderKey.value();
  process.env.NCP_ALIMTALK_ACCESS_KEY = ncpAccessKey.value();
  process.env.NCP_ALIMTALK_SECRET_KEY = ncpSecretKey.value();
  process.env.NCP_ALIMTALK_SERVICE_ID = ncpServiceId.value();
  process.env.NCP_ALIMTALK_PLUS_FRIEND_ID = ncpPlusFriendId.value();
  process.env.NCP_ALIMTALK_TEMPLATE_RESERVE = ncpTemplateReserve.value();
  process.env.NCP_ALIMTALK_TEMPLATE_CHECKIN = ncpTemplateCheckin.value();
  process.env.NCP_ALIMTALK_TEMPLATE_CHECKOUT = ncpTemplateCheckout.value();

  process.env.SHEETS_ARCHIVE_ENABLED = sheetsArchiveEnabled.value();
  process.env.GOOGLE_SHEETS_SPREADSHEET_ID = sheetsSpreadsheetId.value();
  try {
    process.env.GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON = sheetsServiceAccountJson.value();
  } catch {
    process.env.GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON = '';
  }
}

/**
 * 예약 Firestore 변경 시:
 * - 시간당 한도 초과 신규건 자동취소 (백스톱)
 * - Google Sheets 장부 동기화 (탭: 에어픽 / 와와 / 가유 / …)
 * - 알림톡 발송 (NHN 또는 NCP, 활성화 시)
 */
export const onReservationSync = onDocumentWritten(
  {
    document: 'reservations/{reservationId}',
    memory: '512MiB',
    timeoutSeconds: 120,
    secrets: [sheetsServiceAccountJson],
  },
  async (event) => {
    const reservationId = event.params.reservationId;
    const beforeData = event.data?.before.data();
    const afterData = event.data?.after.data();

    if (!afterData) return;

    applyRuntimeEnv();

    // 신규 생성 시 한도 초과면 즉시 취소하고 알림톡·시트는 이 턴에서 스킵
    if (!beforeData) {
      const rejected = await enforceHourlyCapacityOnCreate(reservationId, afterData);
      if (rejected) return;
      try {
        await bumpCustomerVisitOnCreate(reservationId, afterData);
      } catch (err) {
        console.error('[customerVisit] bump failed', {
          reservationId,
          err: err instanceof Error ? err.message : String(err),
        });
      }
      try {
        await notifyPartnersNewReservation(reservationId, afterData);
      } catch (err) {
        console.error('[partnerPush] failed', {
          reservationId,
          err: err instanceof Error ? err.message : String(err),
        });
      }
    }

    await processReservationSheetsArchive(
      reservationId,
      beforeData,
      afterData,
      buildSheetsConfigFromEnv()
    );

    await processReservationAlimtalk(
      reservationId,
      beforeData,
      afterData,
      buildNhnConfigFromEnv()
    );
  }
);
