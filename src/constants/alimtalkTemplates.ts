import { buildReceiptUrl, buildReviewUrl } from '../utils/receipt';
import type { Reservation } from '../types';

/**
 * NHN Cloud 카카오 알림톡 — @airpickup 링크형 템플릿
 * 콘솔 등록·발송 API 연동 시 아래 코드·변수명과 정확히 일치해야 함
 */

export const ALIMTALK_SENDER_PROFILE = '@airpickup';
export const ALIMTALK_REPRESENTATIVE_LINK = 'https://xn--oh5b1bw17d.kr/';

export const ALIMTALK_TEMPLATE_CODES = {
  /** 예약 접수 — 카테고리 003001 예약완료/예약내역 */
  reserve: 'airpick_reserve',
  /** 입차(보관) 완료 — 카테고리 003002 예약상태 */
  checkin: 'airpick_checkin',
  /** 출차 완료 — 카테고리 003002 예약상태 */
  checkout: 'airpick_checkout',
} as const;

/** NHN 콘솔 등록용 — 공통: 강조표기형 + 복합형(채널 추가), 대표 링크 ALIMTALK_REPRESENTATIVE_LINK */

export const ALIMTALK_RESERVE_TEMPLATE = {
  code: ALIMTALK_TEMPLATE_CODES.reserve,
  name: '에어픽_예약접수',
  category: '003001',
  emphasisTitle: '[에어픽] 예약 접수',
  emphasisSubtitle: '예약접수',
  body: `[에어픽] #{고객명}님 #{차량번호} 예약 접수증입니다.

아래 링크를 클릭하시면 접수증을 확인하실 수 있습니다.
#{접수증링크}`,
  extra: '공항 도착 30분 전 전화 주세요.',
  variables: ['고객명', '차량번호', '접수증링크'] as const,
};

export const ALIMTALK_CHECKIN_TEMPLATE = {
  code: ALIMTALK_TEMPLATE_CODES.checkin,
  name: '에어픽_입차완료',
  category: '003002',
  emphasisTitle: '[에어픽] 입차 완료',
  emphasisSubtitle: '입차완료',
  body: `[에어픽] #{고객명}님 #{차량번호} 차량이 입차되었습니다.

아래 링크를 클릭하시면 차량보관증을 확인하실 수 있습니다.
#{접수증링크}`,
  extra: '출국 전 문의사항은 업체로 연락 주세요.',
  variables: ['고객명', '차량번호', '접수증링크'] as const,
};

export const ALIMTALK_CHECKOUT_TEMPLATE = {
  code: ALIMTALK_TEMPLATE_CODES.checkout,
  name: '에어픽_출차완료',
  category: '003002',
  emphasisTitle: '[에어픽] 출차 완료',
  emphasisSubtitle: '출차완료',
  body: `[에어픽] #{고객명}님 #{차량번호} 출고가 완료되었습니다.

결제금액: #{결제금액}원
후기 남기기 → #{접수증링크}

문의: #{업체연락처}`,
  extra: '감사합니다. 이용 후기는 다른 고객에게 큰 도움이 됩니다.',
  buttonName: '후기 남기기',
  variables: ['고객명', '차량번호', '결제금액', '접수증링크', '업체연락처'] as const,
};

export interface AlimtalkTemplateParams {
  고객명: string;
  차량번호: string;
  접수증링크?: string;
  결제금액?: string;
  업체연락처?: string;
}

function baseParams(reservation: Reservation): Pick<AlimtalkTemplateParams, '고객명' | '차량번호'> {
  return {
    고객명: reservation.userName || '고객',
    차량번호: reservation.carNumber || '-',
  };
}

/** NHN API templateParameter — 예약 접수 */
export function buildAlimtalkReserveParams(
  reservation: Reservation,
  receiptUrl: string = buildReceiptUrl(reservation)
): AlimtalkTemplateParams {
  return {
    ...baseParams(reservation),
    접수증링크: receiptUrl,
  };
}

/** NHN API templateParameter — 입차 완료 */
export function buildAlimtalkCheckinParams(
  reservation: Reservation,
  receiptUrl: string = buildReceiptUrl(reservation)
): AlimtalkTemplateParams {
  return {
    ...baseParams(reservation),
    접수증링크: receiptUrl,
  };
}

/** NHN API templateParameter — 출차 완료 (후기 딥링크) */
export function buildAlimtalkCheckoutParams(
  reservation: Reservation,
  companyPhone: string,
  reviewUrl: string = buildReviewUrl(reservation)
): AlimtalkTemplateParams {
  return {
    ...baseParams(reservation),
    결제금액: String(reservation.totalPrice ?? 0),
    접수증링크: reviewUrl,
    업체연락처: companyPhone,
  };
}

export function defaultReceiptUrlForReservation(reservation: Reservation): string {
  return buildReceiptUrl(reservation);
}
