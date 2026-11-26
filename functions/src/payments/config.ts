import { defineSecret, defineString } from 'firebase-functions/params';

/**
 * 실결제 설정.
 * PAYMENT_MODE: off(결제 없음, 지금처럼 현장 결제) / test(손님이 결제를 고르고 테스트 업체일 때만) / live(에어픽 사이트 예약 전부 결제)
 */
export const paymentModeParam = defineString('PAYMENT_MODE', { default: 'off' });
/** 포트원 상점 ID (공개값) — 결제 조회 결과가 우리 상점 것인지 확인 */
export const portoneStoreIdParam = defineString('PORTONE_STORE_ID', { default: '' });
/** 포트원 V2 API 시크릿 — 대표가 secrets:set 으로 직접 넣는다 */
export const portoneApiSecret = defineSecret('PORTONE_API_SECRET');
/** 포트원 웹훅 시크릿 */
export const portoneWebhookSecret = defineSecret('PORTONE_WEBHOOK_SECRET');

/** 결제 대기 — 지나면 자동 취소 (대표 결정 2026-11-27) */
export const PAYMENT_HOLD_MINUTES = 15;
/** 환불: 맡기는 시간 기준 (B2C APP_CONFIG.refund 와 같게) */
export const FULL_REFUND_HOURS = 24;
export const LATE_REFUND_RATIO = 0.5;
/** test 모드에서 결제를 받는 업체 */
export const PAYMENT_TEST_COMPANY_IDS = ['demo'];

export const B2C_SOURCE = 'airpick-b2c';

export type PaymentMode = 'off' | 'test' | 'live';

export function currentPaymentMode(): PaymentMode {
  const v = String(paymentModeParam.value() || '').trim().toLowerCase();
  return v === 'live' || v === 'test' ? v : 'off';
}

/**
 * 이 예약이 온라인 결제 대상인지. 생성 트리거·결제 준비가 같은 답을 내야 한다.
 */
export function isPaymentRequired(data: FirebaseFirestore.DocumentData | undefined): boolean {
  if (!data) return false;
  if (String(data.createdBy || '') !== B2C_SOURCE) return false;
  const mode = currentPaymentMode();
  if (mode === 'live') return true;
  if (mode === 'test') {
    return (
      data.paymentRequested === true &&
      PAYMENT_TEST_COMPANY_IDS.includes(String(data.companyId || '').trim())
    );
  }
  return false;
}

/** 결제 대기 중(아직 돈이 안 들어옴) — 알림톡·업체 알림 보류 */
export function isAwaitingPayment(data: FirebaseFirestore.DocumentData | undefined): boolean {
  if (!data) return false;
  const status = (data.payment as { status?: string } | undefined)?.status;
  if (status === 'awaiting') return true;
  // 생성 직후 트리거가 payment 를 붙이기 전
  return !data.payment && isPaymentRequired(data);
}
