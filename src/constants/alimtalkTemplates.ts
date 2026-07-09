import { buildReceiptUrl } from '../utils/receipt';
import type { Reservation } from '../types';

/**
 * NHN Cloud 카카오 알림톡 — 링크형 템플릿 등록용 상수
 * (발송 API 연동 전 콘솔에 아래 문구·변수로 템플릿 등록)
 */

export const ALIMTALK_SENDER_PROFILE = '@airpickup';

export const ALIMTALK_TEMPLATE_CODES = {
  /** 예약 접수 — 카테고리 003001 예약완료/예약내역 */
  reserve: 'airpick_reserve_link',
  /** 입차(보관) 완료 — 카테고리 003002 예약상태 */
  checkin: 'airpick_checkin_link',
  /** 출차 완료 — 카테고리 003002 예약상태 (선택) */
  checkout: 'airpick_checkout_link',
} as const;

/** 콘솔 등록용 — 예약 접수 (링크형) */
export const ALIMTALK_RESERVE_LINK_BODY = `[에어픽] #{고객명}님 #{차량번호} 예약 접수증입니다.

아래 링크에서 접수증을 확인하세요.
#{접수증링크}`;

/** 콘솔 등록용 — 입차 완료 / 차량보관증 */
export const ALIMTALK_CHECKIN_LINK_BODY = `[에어픽] #{고객명}님 #{차량번호} 차량이 입차되었습니다.

아래 링크에서 차량보관증을 확인하세요.
#{보관증링크}`;

/** 콘솔 등록용 — 출차 완료 (선택) */
export const ALIMTALK_CHECKOUT_LINK_BODY = `[에어픽] #{고객명}님 #{차량번호} 차량 출차가 완료되었습니다.

결제금액: #{결제금액}원
문의: #{업체연락처}`;

export interface AlimtalkLinkPayload {
  고객명: string;
  차량번호: string;
  접수증링크?: string;
  보관증링크?: string;
  결제금액?: string;
  업체연락처?: string;
}

/** NHN API templateParameter 객체 생성 (연동 시 사용) */
export function buildAlimtalkReserveParams(
  reservation: Reservation,
  receiptUrl: string
): AlimtalkLinkPayload {
  return {
    고객명: reservation.userName || '고객',
    차량번호: reservation.carNumber || '-',
    접수증링크: receiptUrl,
  };
}

export function buildAlimtalkCheckinParams(
  reservation: Reservation,
  receiptUrl: string
): AlimtalkLinkPayload {
  return {
    고객명: reservation.userName || '고객',
    차량번호: reservation.carNumber || '-',
    보관증링크: receiptUrl,
  };
}

export function buildAlimtalkCheckoutParams(
  reservation: Reservation,
  companyPhone: string
): AlimtalkLinkPayload {
  return {
    고객명: reservation.userName || '고객',
    차량번호: reservation.carNumber || '-',
    결제금액: String(reservation.totalPrice ?? 0),
    업체연락처: companyPhone,
  };
}

export function defaultReceiptUrlForReservation(reservation: Reservation): string {
  return buildReceiptUrl(reservation);
}
