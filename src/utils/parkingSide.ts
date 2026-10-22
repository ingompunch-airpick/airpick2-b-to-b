import type { Company } from '../types';
import { companyParkingTypeAvailability } from './companyProfile';
import { normalizeDateString } from './reservationNormalize';

export type ParkingSide = 'indoor' | 'outdoor';

export function reservationParkingSide(isIndoor: unknown): ParkingSide {
  return isIndoor === false ? 'outdoor' : 'indoor';
}

export function companyOffersBothParkingSides(
  company?: Partial<Company> | null
): boolean {
  const sides = companyParkingTypeAvailability(company);
  return sides.indoor && sides.outdoor;
}

function dateList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => normalizeDateString(String(item ?? ''))).filter(Boolean);
}

function hasSplitCloseDates(company?: Partial<Company> | null): boolean {
  return Array.isArray(company?.blockedDatesIndoor) || Array.isArray(company?.blockedDatesOutdoor);
}

/** 그 종류가 하루 종일 막힌 날. 나누기 전에는 blockedDates가 양쪽이다. */
export function parkingSideClosedDates(
  company: Partial<Company> | null | undefined,
  side: ParkingSide
): string[] {
  if (!hasSplitCloseDates(company)) return dateList(company?.blockedDates);
  return dateList(side === 'indoor' ? company?.blockedDatesIndoor : company?.blockedDatesOutdoor);
}

export function isParkingSideClosed(
  company: Partial<Company> | null | undefined,
  side: ParkingSide,
  date: string
): boolean {
  const day = normalizeDateString(date);
  if (!day) return false;
  return parkingSideClosedDates(company, side).includes(day);
}

export function parkingSideClosedLabel(side: ParkingSide): string {
  return side === 'indoor' ? '실내는 이 입고일에 마감입니다.' : '야외는 이 입고일에 마감입니다.';
}
