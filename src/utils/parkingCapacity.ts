import { shiftYmd } from './kstDate';
import { normalizeDateString } from './reservationNormalize';
import { normalizeReservationStatus } from './reservationStatus';

export type ParkingCapCompany = {
  parkingCapEnabled?: boolean;
  maxParkedCars?: number;
};

export type ParkingCapReservation = {
  departureDate?: string;
  arrivalDate?: string;
  status?: string;
};

export function normalizeMaxParkedCars(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(999, Math.floor(n)));
}

export function isParkingCapActive(company: ParkingCapCompany | null | undefined): boolean {
  if (!company || company.parkingCapEnabled !== true) return false;
  return normalizeMaxParkedCars(company.maxParkedCars) > 0;
}

/** 동시 주차 점유에 포함 (취소·출고완료 제외) */
export function reservationCountsTowardParkingCap(status?: string): boolean {
  const s = normalizeReservationStatus(status);
  return s !== 'cancelled' && s !== 'completed_out';
}

export function resolveStayRange(res: ParkingCapReservation): { start: string; end: string } | null {
  const start = normalizeDateString(res.departureDate);
  if (!start) return null;
  const end = normalizeDateString(res.arrivalDate) || start;
  return start <= end ? { start, end } : { start, end: start };
}

export function reservationOccupiesDay(res: ParkingCapReservation, day: string): boolean {
  if (!reservationCountsTowardParkingCap(res.status)) return false;
  const range = resolveStayRange(res);
  const d = normalizeDateString(day);
  if (!range || !d) return false;
  return range.start <= d && d <= range.end;
}

/** 시작~종료 포함 일자 목록 (최대 400일) */
export function eachYmdInclusive(start: string, end: string): string[] {
  const s = normalizeDateString(start);
  const e = normalizeDateString(end) || s;
  if (!s) return [];
  const last = e >= s ? e : s;
  const out: string[] = [];
  let cur = s;
  for (let i = 0; i < 400 && cur <= last; i++) {
    out.push(cur);
    if (cur === last) break;
    cur = shiftYmd(cur, 1);
  }
  return out;
}

export function countOccupancyOnDay(
  reservations: ParkingCapReservation[],
  day: string
): number {
  return reservations.filter((r) => reservationOccupiesDay(r, day)).length;
}

export type ParkingCapacityResult =
  | {
      ok: true;
      max: number;
      /** 기간 중 가장 붐비는 날의 사용 대수 */
      peakUsed: number;
      remaining: number;
    }
  | {
      ok: false;
      max: number;
      peakUsed: number;
      remaining: 0;
      fullDate: string;
      message: string;
    };

export function parkingCapacityFullMessage(max: number, fullDate: string): string {
  return `${fullDate} 기준 주차 가능 대수가 가득 찼습니다. (최대 ${max}대 · 만차)`;
}

/**
 * 신규 예약(입고~출고)이 동시 주차 한도를 넘는지 검사.
 * @param existingReservations 이번 예약 제외(클라) 또는 포함(서버 생성 직후)
 * @param includeSelfInCount 서버처럼 이번 건이 existing에 이미 포함이면 true — used > max 이면 거절
 */
export function evaluateParkingCapacity(args: {
  company: ParkingCapCompany;
  departureDate: string;
  arrivalDate: string;
  existingReservations: ParkingCapReservation[];
  /** false(기본)=클라: used >= max 이면 만차 / true=서버: used > max 이면 만차 */
  countingIncludesCandidate?: boolean;
}): ParkingCapacityResult {
  if (!isParkingCapActive(args.company)) {
    return { ok: true, max: 0, peakUsed: 0, remaining: 0 };
  }

  const max = normalizeMaxParkedCars(args.company.maxParkedCars);
  const days = eachYmdInclusive(args.departureDate, args.arrivalDate);
  if (!days.length) {
    return {
      ok: false,
      max,
      peakUsed: 0,
      remaining: 0,
      fullDate: '',
      message: '입고·출고 날짜를 확인해 주세요.',
    };
  }

  let peakUsed = 0;
  let fullDate = '';
  for (const day of days) {
    const used = countOccupancyOnDay(args.existingReservations, day);
    if (used > peakUsed) peakUsed = used;
    const over = args.countingIncludesCandidate ? used > max : used >= max;
    if (over && !fullDate) fullDate = day;
  }

  if (fullDate) {
    return {
      ok: false,
      max,
      peakUsed,
      remaining: 0,
      fullDate,
      message: parkingCapacityFullMessage(max, fullDate),
    };
  }

  return {
    ok: true,
    max,
    peakUsed,
    remaining: Math.max(0, max - peakUsed),
  };
}
