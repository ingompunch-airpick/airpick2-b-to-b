/** NHN Cloud @airpickup 템플릿 코드 — 콘솔 등록값과 일치 */
export const ALIMTALK_TEMPLATE_CODES = {
  reserve: 'airpick_reserve',
  checkin: 'airpick_checkin',
  checkout: 'airpick_checkout',
} as const;

export type AlimtalkEventType = keyof typeof ALIMTALK_TEMPLATE_CODES;

/** B2B Hosting 접수증·보관증 (알림톡 접수증 보기) */
export const RECEIPT_PUBLIC_ORIGIN = 'https://airpick-reservation.web.app';

/** 출고 후기 딥링크용 B2C (에어픽.kr) */
export const REVIEW_PUBLIC_ORIGIN = 'https://www.xn--oh5b1bw17d.kr';

export const DEFAULT_COMPANY_PHONE = '1545-5746';

export const NHN_ALIMTALK_API_BASE =
  'https://kakaotalk-bizmessage.api.nhncloudservice.com/alimtalk/v2.3';
