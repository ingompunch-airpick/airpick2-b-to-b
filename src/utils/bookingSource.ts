/** Firestore reservations.createdBy — 홈·B2C·B2B 유입 구분 (airpick-b2c 와 동일) */
import type { Reservation } from '../types';
export const RESERVATION_CREATED_BY = {
  AIRPICK_B2C: 'airpick-b2c',
  HOMEPAGE: 'homepage',
  B2B: 'b2b',
} as const;

export type BookingSource = 'homepage' | 'airpick-b2c' | 'b2b' | 'unknown';

export type BookingSourceLabel = '홈페이지' | '에어픽' | '현장·B2B' | '미확인';

const B2B_MARKERS = new Set([
  'b2b',
  '업체 마스터',
  '본사 마스터(최고관리자)',
  '본사 마스터',
]);

function hasHomepageLegacyMarkers(raw?: Record<string, unknown> | null): boolean {
  if (!raw) return false;
  const legacyKeys = ['entryAirline', 'entryFlight', 'exitAirline', 'exitFlight'] as const;
  return legacyKeys.some((key) => {
    const v = raw[key];
    return typeof v === 'string' && v.trim() !== '';
  });
}

/** createdBy 우선, 없으면 와와 홈페이지 레거시 필드(entryAirline 등)로 homepage 추론 */
export function resolveBookingSource(
  createdBy?: string | null,
  raw?: Record<string, unknown> | null
): BookingSource {
  const rawCreated = (createdBy || '').trim().toLowerCase();
  if (rawCreated) {
    if (rawCreated === RESERVATION_CREATED_BY.HOMEPAGE) return 'homepage';
    if (rawCreated === RESERVATION_CREATED_BY.AIRPICK_B2C || rawCreated === 'airpick_b2c') {
      return 'airpick-b2c';
    }
    if (rawCreated === RESERVATION_CREATED_BY.B2B || B2B_MARKERS.has(createdBy!.trim())) {
      return 'b2b';
    }
    if (
      rawCreated.includes('마스터') ||
      rawCreated.includes('부관리자') ||
      rawCreated.includes('기사')
    ) {
      return 'b2b';
    }
  }
  if (hasHomepageLegacyMarkers(raw)) return 'homepage';
  return 'unknown';
}

export function resolveBookingSourceFromReservation(res: {
  createdBy?: string | null;
  entryAirline?: string;
  entryFlight?: string;
  exitAirline?: string;
  exitFlight?: string;
}): BookingSource {
  return resolveBookingSource(res.createdBy, res as Record<string, unknown>);
}

export function bookingSourceLabel(source: BookingSource): BookingSourceLabel {
  switch (source) {
    case 'homepage':
      return '홈페이지';
    case 'airpick-b2c':
      return '에어픽';
    case 'b2b':
      return '현장·B2B';
    default:
      return '미확인';
  }
}

export function isAirpickB2CBooking(createdBy?: string | null): boolean {
  return resolveBookingSource(createdBy) === 'airpick-b2c';
}

/** 에어픽·홈페이지 고객 예약 — reservationPassword 등 보호 필드 수정 금지 */
export function isExternalCustomerBooking(res: {
  createdBy?: string | null;
  entryAirline?: string;
  entryFlight?: string;
  exitAirline?: string;
  exitFlight?: string;
}): boolean {
  const source = resolveBookingSourceFromReservation(res);
  return source === 'airpick-b2c' || source === 'homepage';
}

export function bookingSourceBadgeClass(source: BookingSource): string {
  switch (source) {
    case 'homepage':
      return 'bg-sky-500/15 text-sky-400 border-sky-500/25';
    case 'airpick-b2c':
      return 'bg-fuchsia-500/25 text-fuchsia-100 border-fuchsia-400/60 shadow-[0_0_12px_rgba(217,70,239,0.35)] font-black tracking-tight';
    case 'b2b':
      return 'bg-amber-500/15 text-amber-400 border-amber-500/25';
    default:
      return 'bg-zinc-500/15 text-zinc-400 border-zinc-500/25';
  }
}

/** 예약 카드 전체 강조 — 에어픽 유입만 눈에 띄게 */
export function bookingSourceCardClass(source: BookingSource): string {
  if (source === 'airpick-b2c') {
    return 'border-fuchsia-500/40 bg-gradient-to-br from-fuchsia-950/50 via-[#1C1C1E] to-[#1C1C1E] ring-1 ring-fuchsia-500/30 shadow-[0_0_20px_rgba(192,38,211,0.12)]';
  }
  if (source === 'homepage') {
    return 'border-sky-500/20 bg-[#1C1C1E]';
  }
  return 'border-neutral-900/5 bg-[#1C1C1E]';
}

export type BookingSourceMetrics = Record<
  BookingSource,
  { count: number; revenue: number }
>;

/** 대시보드용 2분류 — 에어픽 vs 홈페이지·현장·기타 */
export type GroupedBookingSource = 'airpick-b2c' | 'other';

export type GroupedSourceMetrics = Record<
  GroupedBookingSource,
  { count: number; revenue: number }
>;

export const GROUPED_SOURCE_ROWS: { key: GroupedBookingSource; label: string }[] = [
  { key: 'airpick-b2c', label: '에어픽' },
  { key: 'other', label: '홈·현장' },
];

const EMPTY_METRICS = (): BookingSourceMetrics => ({
  homepage: { count: 0, revenue: 0 },
  'airpick-b2c': { count: 0, revenue: 0 },
  b2b: { count: 0, revenue: 0 },
  unknown: { count: 0, revenue: 0 },
});

const EMPTY_GROUPED = (): GroupedSourceMetrics => ({
  'airpick-b2c': { count: 0, revenue: 0 },
  other: { count: 0, revenue: 0 },
});

export function toGroupedBookingSource(src: BookingSource): GroupedBookingSource {
  return src === 'airpick-b2c' ? 'airpick-b2c' : 'other';
}

export function groupedBookingSourceLabel(src: GroupedBookingSource): string {
  return src === 'airpick-b2c' ? '에어픽' : '홈·현장';
}

export function groupedBookingSourceBadgeClass(src: GroupedBookingSource): string {
  return src === 'airpick-b2c'
    ? bookingSourceBadgeClass('airpick-b2c')
    : 'bg-sky-500/15 text-sky-400 border-sky-500/25';
}

/** 유입별 건수·매출 집계 (cancelled 제외는 호출 측에서 필터) */
export function aggregateBookingSourceMetrics(
  reservations: Reservation[],
  predicate?: (r: Reservation) => boolean
): BookingSourceMetrics {
  const out = EMPTY_METRICS();
  for (const r of reservations) {
    if (predicate && !predicate(r)) continue;
    const src = resolveBookingSourceFromReservation(r);
    out[src].count += 1;
    out[src].revenue += r.totalPrice || 0;
  }
  return out;
}

/** 에어픽 / 홈·현장 2분류 집계 */
export function aggregateGroupedBookingSourceMetrics(
  reservations: Reservation[],
  predicate?: (r: Reservation) => boolean
): GroupedSourceMetrics {
  const out = EMPTY_GROUPED();
  for (const r of reservations) {
    if (predicate && !predicate(r)) continue;
    const key = toGroupedBookingSource(resolveBookingSourceFromReservation(r));
    out[key].count += 1;
    out[key].revenue += r.totalPrice || 0;
  }
  return out;
}
