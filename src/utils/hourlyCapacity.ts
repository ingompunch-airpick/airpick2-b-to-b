import { normalizeDateString } from './reservationNormalize';
import { normalizeReservationStatus } from './reservationStatus';

export type HourlyCapCompany = {
  hourlyCapEnabled?: boolean;
  maxCarsPerHour?: number;
};

export function normalizeMaxCarsPerHour(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(99, Math.floor(n)));
}

export function isHourlyCapActive(company: HourlyCapCompany | null | undefined): boolean {
  if (!company || company.hourlyCapEnabled !== true) return false;
  return normalizeMaxCarsPerHour(company.maxCarsPerHour) > 0;
}

/** "10:00" / "10:00:00" / "10" → 0–23 */
export function parseDepartureHour(time: string | undefined | null): number | null {
  const m = String(time || '')
    .trim()
    .match(/^(\d{1,2})/);
  if (!m) return null;
  const h = Number(m[1]);
  if (!Number.isFinite(h) || h < 0 || h > 23) return null;
  return h;
}

export function formatHourLabel(hour: number): string {
  return `${String(hour).padStart(2, '0')}:00–${String(hour).padStart(2, '0')}:59`;
}

export function reservationCountsTowardHourlyCap(status?: string): boolean {
  return normalizeReservationStatus(status) !== 'cancelled';
}

export function reservationInHourBucket(
  res: {
    departureDate?: string;
    departureTime?: string;
    status?: string;
  },
  departureDate: string,
  hour: number
): boolean {
  if (!reservationCountsTowardHourlyCap(res.status)) return false;
  const dep = normalizeDateString(res.departureDate);
  const target = normalizeDateString(departureDate);
  if (!dep || !target || dep !== target) return false;
  return parseDepartureHour(res.departureTime) === hour;
}

export type HourlyCapacityResult =
  | {
      ok: true;
      remaining: number;
      max: number;
      hour: number;
      used: number;
    }
  | {
      ok: false;
      remaining: 0;
      max: number;
      hour: number | null;
      used: number;
      message: string;
    };

export function evaluateHourlyCapacity(args: {
  company: HourlyCapCompany;
  departureDate: string;
  departureTime: string;
  /** 이미 잡힌 건수(이번 예약 제외) */
  existingCount: number;
}): HourlyCapacityResult {
  if (!isHourlyCapActive(args.company)) {
    const hour = parseDepartureHour(args.departureTime) ?? 0;
    return { ok: true, remaining: 0, max: 0, hour, used: 0 };
  }

  const max = normalizeMaxCarsPerHour(args.company.maxCarsPerHour);
  const hour = parseDepartureHour(args.departureTime);
  if (hour === null) {
    return {
      ok: false,
      remaining: 0,
      max,
      hour: null,
      used: args.existingCount,
      message: '입고 시각을 확인해 주세요.',
    };
  }

  const used = Math.max(0, args.existingCount);
  const remaining = Math.max(0, max - used);
  if (remaining <= 0) {
    return {
      ok: false,
      remaining: 0,
      max,
      hour,
      used,
      message: `${formatHourLabel(hour)} 시간대 예약이 마감되었습니다. (시간당 ${max}대)`,
    };
  }

  return { ok: true, remaining, max, hour, used };
}

export function hourlyCapacityBlockedMessage(max: number, hour: number): string {
  return `${formatHourLabel(hour)} 시간대 예약이 마감되었습니다. (시간당 ${max}대)`;
}
