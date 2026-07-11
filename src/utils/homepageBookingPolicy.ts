import type { Company } from '../types';
import { getKSTDateOnlyString } from './kstDate';
import { normalizeDateString } from './reservationNormalize';

export type HomepageBookingPolicyError =
  | 'closed'
  | 'same_day'
  | 'blocked'
  | null;

/** 홈페이지 예약 — 업체 마감·당일차단·blockedDates 검사 */
export function checkHomepageBookingPolicy(
  company: Pick<Company, 'isOpen' | 'blockedDates' | 'sameDayBookingBlocked'>,
  departureDate: string,
  arrivalDate: string
): HomepageBookingPolicyError {
  if (company.isOpen === false) return 'closed';

  const dep = normalizeDateString(departureDate);
  const arr = normalizeDateString(arrivalDate);
  if (!dep || !arr) return null;

  const today = getKSTDateOnlyString();
  if (company.sameDayBookingBlocked && dep === today) return 'same_day';

  const blocked = new Set(
    (company.blockedDates || []).map((d) => normalizeDateString(d)).filter(Boolean)
  );
  if (blocked.size === 0) return null;

  const start = new Date(`${dep}T00:00:00`);
  const end = new Date(`${arr}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;

  const cur = new Date(start);
  while (cur <= end) {
    const y = cur.getFullYear();
    const m = String(cur.getMonth() + 1).padStart(2, '0');
    const d = String(cur.getDate()).padStart(2, '0');
    if (blocked.has(`${y}-${m}-${d}`)) return 'blocked';
    cur.setDate(cur.getDate() + 1);
  }
  return null;
}

export function homepagePolicyMessage(error: HomepageBookingPolicyError): string {
  switch (error) {
    case 'closed':
      return '현재 예약 접수가 마감된 상태입니다. 업체로 문의해 주세요.';
    case 'same_day':
      return '당일 입고 예약은 받지 않습니다. 입고일을 다른 날로 선택해 주세요.';
    case 'blocked':
      return '선택하신 기간에 예약 마감일이 포함되어 있습니다.';
    default:
      return '';
  }
}
