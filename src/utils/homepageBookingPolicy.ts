import type { Company } from '../types';
import {
  intakeLeadClosed,
  normalizeBookingLeadHours,
  sameDayClosed,
} from './bookingLead';
import { normalizeDateString } from './reservationNormalize';

export type HomepageBookingPolicyError =
  | 'closed'
  | 'same_day'
  | 'lead'
  | 'blocked'
  | null;

/** 홈페이지 예약 — 업체 마감·당일·입고 N시간 전·입고일 blockedDates */
export function checkHomepageBookingPolicy(
  company: Pick<Company, 'isOpen' | 'blockedDates' | 'sameDayBookingBlocked' | 'bookingLeadHours'>,
  departureDate: string,
  _arrivalDate: string,
  departureTime = ''
): HomepageBookingPolicyError {
  if (company.isOpen === false) return 'closed';

  const dep = normalizeDateString(departureDate);
  if (!dep) return null;

  if (company.sameDayBookingBlocked && sameDayClosed(dep)) return 'same_day';

  const lead = normalizeBookingLeadHours(company.bookingLeadHours);
  if (
    !company.sameDayBookingBlocked &&
    intakeLeadClosed({ leadHours: lead, departureDate: dep, departureTime })
  ) {
    return 'lead';
  }

  const blocked = new Set(
    (company.blockedDates || []).map((d) => normalizeDateString(d)).filter(Boolean)
  );
  if (blocked.size === 0) return null;
  if (blocked.has(dep)) return 'blocked';
  return null;
}

export function homepagePolicyMessage(
  error: HomepageBookingPolicyError,
  leadHours = 0
): string {
  switch (error) {
    case 'closed':
      return '현재 예약 접수가 마감된 상태입니다. 업체로 문의해 주세요.';
    case 'same_day':
      return '당일 입고 예약은 받지 않습니다. 입고일을 다른 날로 선택해 주세요.';
    case 'lead':
      return `입고 ${normalizeBookingLeadHours(leadHours) || 1}시간 전까지만 받습니다.`;
    case 'blocked':
      return '선택하신 입고일은 예약이 마감된 날짜입니다.';
    default:
      return '';
  }
}
