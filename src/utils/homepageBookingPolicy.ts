import type { Company } from '../types';
import {
  intakeLeadClosed,
  normalizeBookingLeadHours,
  sameDayClosed,
} from './bookingLead';
import { BOOKING_CLOSED_MESSAGE } from './bookingClosedMessage';
import { isParkingSideClosed, reservationParkingSide } from './parkingSide';
import { normalizeDateString } from './reservationNormalize';

export type HomepageBookingPolicyError =
  | 'closed'
  | 'same_day'
  | 'lead'
  | 'blocked'
  | null;

/** 홈페이지 예약 — 업체 마감·당일·입고 N시간 전·입고일 blockedDates */
export function checkHomepageBookingPolicy(
  company: Pick<
    Company,
    | 'isOpen'
    | 'blockedDates'
    | 'blockedDatesIndoor'
    | 'blockedDatesOutdoor'
    | 'sameDayBookingBlocked'
    | 'bookingLeadHours'
  >,
  departureDate: string,
  _arrivalDate: string,
  departureTime = '',
  isIndoor = true
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

  if (isParkingSideClosed(company, reservationParkingSide(isIndoor), dep)) return 'blocked';
  return null;
}

export function homepagePolicyMessage(
  error: HomepageBookingPolicyError,
  _leadHours = 0
): string {
  if (!error) return '';
  return BOOKING_CLOSED_MESSAGE;
}
