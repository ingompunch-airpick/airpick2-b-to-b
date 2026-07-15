import type { AlimtalkTemplateParams, ReservationSnapshot } from './types';
import { buildReceiptUrl, resolveReceiptPathCode } from './receiptUrl';

/**
 * NHN 신규 계정 제한(-1028): 변수 치환 시 14자 초과 불가.
 * 접수증 경로는 `#{토큰}`(≤12) + 템플릿 버튼 URL 조합.
 * 본문 `#{접수증링크}` 에는 짧은 안내 문구만 넣는다.
 */
const MAX_VAR_LEN = 14;

export function clampAlimtalkValue(value: string, max = MAX_VAR_LEN): string {
  const trimmed = value.trim();
  if (trimmed.length <= max) return trimmed;
  return trimmed.slice(0, max);
}

function baseParams(reservation: ReservationSnapshot): Pick<
  AlimtalkTemplateParams,
  '고객명' | '차량번호' | '토큰'
> {
  const pathCode = resolveReceiptPathCode(reservation);
  return {
    고객명: clampAlimtalkValue(reservation.userName?.trim() || '고객'),
    차량번호: clampAlimtalkValue((reservation.carNumber || '-').replace(/\s+/g, '')),
    ...(pathCode ? { 토큰: clampAlimtalkValue(pathCode) } : {}),
  };
}

/** 본문 변수용 — 긴 URL 대신 짧은 문구 (실제 URL은 WL 버튼) */
const RECEIPT_LINK_PLACEHOLDER = '버튼확인';
const REVIEW_LINK_PLACEHOLDER = '후기작성';

export function buildReserveParams(
  reservation: ReservationSnapshot,
  _receiptUrl: string = buildReceiptUrl(reservation)
): AlimtalkTemplateParams {
  return {
    ...baseParams(reservation),
    접수증링크: RECEIPT_LINK_PLACEHOLDER,
  };
}

export function buildCheckinParams(
  reservation: ReservationSnapshot,
  _receiptUrl: string = buildReceiptUrl(reservation)
): AlimtalkTemplateParams {
  return {
    ...baseParams(reservation),
    접수증링크: RECEIPT_LINK_PLACEHOLDER,
  };
}

export function buildCheckoutParams(
  reservation: ReservationSnapshot,
  companyPhone: string,
  _receiptUrl: string = buildReceiptUrl(reservation)
): AlimtalkTemplateParams {
  const amount = reservation.paymentAmount ?? reservation.totalPrice ?? 0;
  return {
    ...baseParams(reservation),
    결제금액: clampAlimtalkValue(String(amount)),
    접수증링크: REVIEW_LINK_PLACEHOLDER,
    업체연락처: clampAlimtalkValue(companyPhone.replace(/\s+/g, '')),
  };
}
