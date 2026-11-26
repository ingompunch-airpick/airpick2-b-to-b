import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import {
  sheetsArchiveEnabled,
  sheetsServiceAccountJson,
  sheetsSpreadsheetId,
  sheetsSyncMode,
  sheetsWawaSpreadsheetId,
} from './sheets/params';
import { applyAlimtalkRuntimeEnv } from './alimtalk/params';
import { buildNhnConfigFromEnv, processReservationAlimtalk } from './alimtalk/sendReservationAlimtalk';
import { buildSheetsConfigFromEnv } from './sheets/syncReservation';
import { processReservationSheetsArchive } from './sheets/processReservationSheets';
import { enqueueSheetSync } from './sheets/batchSync';
import { enforceHourlyCapacityOnCreate } from './hourlyCapacity';
import { enforceDailyIntakeOnCreate } from './dailyIntakeCapacity';
import { enforceParkingCapacityOnCreate } from './parkingCapacity';
import { enforceBookingPolicyOnCreate } from './bookingPolicy';
import { bumpCustomerVisitOnCheckout } from './customerVisit';
import { settlePointSpendOnCreate, syncPointsOnReservationUpdate } from './points/ledger';
import { checkB2cReservationPrice, recordPriceCheckIssue } from './reservations/priceCheck';
import { isUnownedUserId, mergeMemberReservationId, stampKakaoOwner } from './members/reservationIds';
import { ensureReceiptLinkCode, isReceiptLinkStampOnlyChange } from './reservations/receiptLink';
import { isAwaitingPayment } from './payments/config';
import { ensureAwaitingPayment } from './payments/reservationPayment';
import {
  notifyPartnersNewReservation,
  notifyPartnersValetStatusChange,
} from './partnerPush';
import {
  isPasswordStripOnlyChange,
  stashReservationPassword,
} from './reservations/reservationSecrets';
import { syncCapacityAggregate } from './capacityAggregate';
import { syncParkingOccupancy } from './parkingOccupancy';

function applyRuntimeEnv(): void {
  applyAlimtalkRuntimeEnv();

  process.env.SHEETS_ARCHIVE_ENABLED = sheetsArchiveEnabled.value();
  process.env.GOOGLE_SHEETS_SPREADSHEET_ID = sheetsSpreadsheetId.value();
  process.env.GOOGLE_SHEETS_SPREADSHEET_ID_WAWA = sheetsWawaSpreadsheetId.value();
  try {
    process.env.GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON = sheetsServiceAccountJson.value();
  } catch {
    process.env.GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON = '';
  }
}

/**
 * 예약 Firestore 변경 시:
 * - 마감일·전체마감·당일차단 신규건 자동취소 (홈페이지/B2C 백스톱)
 * - 시간당 한도 초과 신규건 자동취소
 * - 파트너 FCM (신규 예약 / 입고·출고 상태 전환)
 * - 알림톡 발송 (NCP/NHN) — 시트보다 먼저
 * - Google Sheets 장부 동기화 (탭: 에어픽 / 와와 / 가유 / …)
 */
export const onReservationSync = onDocumentWritten(
  {
    document: 'reservations/{reservationId}',
    region: 'asia-northeast3',
    memory: '512MiB',
    timeoutSeconds: 120,
    secrets: [sheetsServiceAccountJson],
  },
  async (event) => {
    const reservationId = event.params.reservationId;
    const beforeData = event.data?.before.data();
    let afterData = event.data?.after.data();

    if (isPasswordStripOnlyChange(beforeData, afterData)) return;
    if (isReceiptLinkStampOnlyChange(beforeData, afterData)) return;

    // 손님 화면이 예약 목록 대신 읽는 시간당 집계 — 삭제·자동취소도 반영되도록 먼저 갱신
    try {
      await syncCapacityAggregate(beforeData, afterData);
      await syncParkingOccupancy(beforeData, afterData);
    } catch (err) {
      console.error('[capacityAggregate] sync failed', {
        reservationId,
        err: err instanceof Error ? err.message : String(err),
      });
    }

    if (!afterData) return;

    applyRuntimeEnv();

    // 비밀번호는 본문에 두지 않는다 — 정책 위반으로 자동취소되는 건도 먼저 옮긴다
    try {
      await stashReservationPassword(reservationId, afterData);
    } catch (err) {
      console.error('[reservationSecrets] stash failed', {
        reservationId,
        err: err instanceof Error ? err.message : String(err),
      });
    }

    // 신규 생성 시 정책·한도 위반이면 즉시 취소하고 알림톡·시트는 이 턴에서 스킵
    if (!beforeData) {
      const policyRejected = await enforceBookingPolicyOnCreate(reservationId, afterData);
      if (policyRejected) return;

      const parkingRejected = await enforceParkingCapacityOnCreate(reservationId, afterData);
      if (parkingRejected) return;

      const rejected = await enforceHourlyCapacityOnCreate(reservationId, afterData);
      if (rejected) return;

      const dailyRejected = await enforceDailyIntakeOnCreate(reservationId, afterData);
      if (dailyRejected) return;
      // 손님 접수증 링크는 비밀 코드로만 열린다 — 코드 없는 예약엔 붙인다
      try {
        afterData = await ensureReceiptLinkCode(reservationId, afterData);
      } catch (err) {
        console.error('[receiptLink] stamp failed', {
          reservationId,
          err: err instanceof Error ? err.message : String(err),
        });
      }
      // 온라인 결제 예약은 결제 대기(15분)로 잡고, 알림은 결제 확인 뒤에 보낸다
      try {
        afterData = await ensureAwaitingPayment(reservationId, afterData);
      } catch (err) {
        console.error('[payment] awaiting stamp failed', {
          reservationId,
          err: err instanceof Error ? err.message : String(err),
        });
      }
      try {
        const stamped = await stampKakaoOwner(reservationId, afterData);
        if (stamped) afterData = stamped;
      } catch (err) {
        console.error('[members] owner stamp failed', {
          reservationId,
          err: err instanceof Error ? err.message : String(err),
        });
      }
      try {
        const priceResult = await checkB2cReservationPrice(reservationId, afterData);
        if (priceResult && !priceResult.ok) {
          await recordPriceCheckIssue(reservationId, afterData, priceResult);
          console.warn('[priceCheck] mismatch', { reservationId, issues: priceResult.issues });
        }
      } catch (err) {
        console.error('[priceCheck] failed', {
          reservationId,
          err: err instanceof Error ? err.message : String(err),
        });
      }
      try {
        afterData = await settlePointSpendOnCreate(reservationId, afterData);
      } catch (err) {
        console.error('[points] spend settle failed', {
          reservationId,
          err: err instanceof Error ? err.message : String(err),
        });
      }
      if (!isAwaitingPayment(afterData)) {
        try {
          await notifyPartnersNewReservation(reservationId, afterData);
        } catch (err) {
          console.error('[partnerPush] failed', {
            reservationId,
            err: err instanceof Error ? err.message : String(err),
          });
        }
      }
      if (!isUnownedUserId(afterData.userId) && afterData.memberProvider === 'kakao') {
        try {
          await mergeMemberReservationId(
            String(afterData.userId),
            reservationId,
            String(afterData.createdAt || '')
          );
        } catch (err) {
          console.error('[members] reservation id merge failed', {
            reservationId,
            err: err instanceof Error ? err.message : String(err),
          });
        }
      }
    } else {
      if (isUnownedUserId(beforeData.userId) && !isUnownedUserId(afterData.userId)) {
        try {
          await mergeMemberReservationId(
            String(afterData.userId),
            reservationId,
            String(afterData.createdAt || '')
          );
        } catch (err) {
          console.error('[members] reservation id merge failed', {
            reservationId,
            err: err instanceof Error ? err.message : String(err),
          });
        }
      }
      try {
        await syncPointsOnReservationUpdate(reservationId, beforeData, afterData);
      } catch (err) {
        console.error('[points] sync failed', {
          reservationId,
          err: err instanceof Error ? err.message : String(err),
        });
      }
      try {
        await bumpCustomerVisitOnCheckout(reservationId, beforeData, afterData);
      } catch (err) {
        console.error('[customerVisit] bump failed', {
          reservationId,
          err: err instanceof Error ? err.message : String(err),
        });
      }
      try {
        await notifyPartnersValetStatusChange(reservationId, beforeData, afterData);
      } catch (err) {
        console.error('[partnerPush] status change failed', {
          reservationId,
          err: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // 결제 확인 순간 = 손님 입장에선 예약 완료 → 업체 알림·예약 알림톡을 이때 보낸다
    const paidStatus = (d: FirebaseFirestore.DocumentData | undefined) =>
      (d?.payment as { status?: string } | undefined)?.status;
    const justPaid =
      !!beforeData &&
      paidStatus(beforeData) !== 'paid' &&
      paidStatus(afterData) === 'paid' &&
      String(afterData.status || '') !== 'cancelled';
    if (justPaid) {
      try {
        await notifyPartnersNewReservation(reservationId, afterData);
      } catch (err) {
        console.error('[partnerPush] paid notify failed', {
          reservationId,
          err: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // 알림톡 우선 — 시트 잠금/지연에 카톡이 묶이지 않게
    if (justPaid) {
      await processReservationAlimtalk(reservationId, undefined, afterData, buildNhnConfigFromEnv());
    } else if (!isAwaitingPayment(afterData)) {
      await processReservationAlimtalk(
        reservationId,
        beforeData,
        afterData,
        buildNhnConfigFromEnv()
      );
    }

    const sheetsConfig = buildSheetsConfigFromEnv();
    if (sheetsSyncMode.value() === 'batch') {
      // 10분 묶음 쓰기: 표시만 하고 drainSheetsQueue가 모아서 쓴다
      if (sheetsConfig) {
        await enqueueSheetSync(reservationId, beforeData, afterData).catch((err) =>
          console.warn('[sheets-batch] enqueue failed', {
            reservationId,
            err: err instanceof Error ? err.message : String(err),
          })
        );
      }
      return;
    }

    await processReservationSheetsArchive(reservationId, beforeData, afterData, sheetsConfig);
  }
);
