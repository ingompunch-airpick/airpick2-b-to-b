import type { Company } from '../types';
import { getKSTDateOnlyString } from './kstDate';
import { normalizeDateString } from './reservationNormalize';

export type HomepageBookingPolicyError =
  | 'closed'
  | 'same_day'
  | 'blocked'
  | null;

/** 홈페이지 예약 — 업체 마감·당일차단·입고일 blockedDates 검사 (출고일은 미적용) */
export function checkHomepageBookingPolicy(
  company: Pick<Company, 'isOpen' | 'blockedDates' | 'sameDayBookingBlocked'>,
  departureDate: string,
  _arrivalDate: string
): HomepageBookingPolicyError {
  if (company.isOpen === false) return 'closed';

  const dep = normalizeDateString(departureDate);
  if (!dep) return null;

  const today = getKSTDateOnlyString();
  if (company.sameDayBookingBlocked && dep === today) return 'same_day';

  const blocked = new Set(
    (company.blockedDates || []).map((d) => normalizeDateString(d)).filter(Boolean)
  );
  if (blocked.size === 0) return null;
  if (blocked.has(dep)) return 'blocked';
  return null;
}

export function homepagePolicyMessage(error: HomepageBookingPolicyError): string {
  switch (error) {
    case 'closed':
      return '현재 예약 접수가 마감된 상태입니다. 업체로 문의해 주세요.';
    case 'same_day':
      return '당일 입고 예약은 받지 않습니다. 입고일을 다른 날로 선택해 주세요.';
    case 'blocked':
      return '선택하신 입고일은 예약이 마감된 날짜입니다.';
    default:
      return '';
  }
}
