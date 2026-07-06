import type { Reservation } from '../types';
import { normalizeDateString } from './reservationNormalize';
import { isAdmitted } from './reservationStatus';
import {
  resolveBookingSourceFromReservation,
  toGroupedBookingSource,
} from './bookingSource';

export function shiftMonthPrefix(prefix: string, delta: number): string {
  const [y, m] = prefix.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function monthLabelFromPrefix(prefix: string): string {
  const [y, m] = prefix.split('-');
  return `${y}년 ${parseInt(m, 10)}월`;
}

export function filterAdmittedInMonth(
  reservations: Reservation[],
  monthPrefix: string
): Reservation[] {
  return reservations.filter(
    (r) =>
      r.status !== 'cancelled' &&
      normalizeDateString(r.departureDate).startsWith(monthPrefix) &&
      isAdmitted(r.status)
  );
}

export type HqCompanyRow = {
  id: string;
  name: string;
  airpick: number;
  other: number;
  total: number;
  revenue: number;
};

export function buildHqCompanyRows(admitted: Reservation[]): HqCompanyRow[] {
  const map = new Map<string, HqCompanyRow>();
  for (const r of admitted) {
    const id = (r.companyId || r.companyName || 'unknown').toLowerCase().trim();
    const name = r.companyName || r.companyId || '미지정';
    if (!map.has(id)) {
      map.set(id, { id, name, airpick: 0, other: 0, total: 0, revenue: 0 });
    }
    const row = map.get(id)!;
    const grouped = toGroupedBookingSource(resolveBookingSourceFromReservation(r));
    if (grouped === 'airpick-b2c') row.airpick += 1;
    else row.other += 1;
    row.total += 1;
    row.revenue += r.totalPrice || 0;
  }
  return [...map.values()].sort((a, b) => b.total - a.total);
}

export type HqRankChangeRow = HqCompanyRow & {
  rank: number;
  prevRank: number | null;
  rankDelta: number | null;
  totalDelta: number;
};

/** 전월 대비 업장 순위 변동 (rankDelta 양수 = 순위 상승) */
export function buildCompanyRankChanges(
  currentRows: HqCompanyRow[],
  prevRows: HqCompanyRow[]
): HqRankChangeRow[] {
  const prevRankMap = new Map<string, number>();
  prevRows.forEach((row, idx) => prevRankMap.set(row.id, idx + 1));

  const prevTotalMap = new Map(prevRows.map((r) => [r.id, r.total]));

  return currentRows.map((row, idx) => {
    const rank = idx + 1;
    const prevRank = prevRankMap.get(row.id) ?? null;
    const prevTotal = prevTotalMap.get(row.id) ?? 0;
    const rankDelta = prevRank != null ? prevRank - rank : null;
    return {
      ...row,
      rank,
      prevRank,
      rankDelta,
      totalDelta: row.total - prevTotal,
    };
  });
}

function customerKey(r: Reservation): string {
  const phone = (r.phone || '').replace(/\D/g, '');
  if (phone.length >= 10) return `p:${phone}`;
  const name = (r.userName || '').trim().toLowerCase();
  return name ? `n:${name}` : `id:${r.id}`;
}

export type HqCustomerMix = {
  newCustomers: number;
  returningCustomers: number;
  newBookings: number;
  returningBookings: number;
};

/** 신규·재방문 — 고객(전화/이름) 기준, 해당 월 이전 입고 이력 있으면 재방문 */
export function computeCustomerMix(
  allReservations: Reservation[],
  monthPrefix: string,
  monthAdmitted: Reservation[]
): HqCustomerMix {
  const monthStart = `${monthPrefix}-01`;

  const customersBeforeMonth = new Set<string>();
  for (const r of allReservations) {
    if (r.status === 'cancelled' || !isAdmitted(r.status)) continue;
    const dep = normalizeDateString(r.departureDate);
    if (dep < monthStart) {
      customersBeforeMonth.add(customerKey(r));
    }
  }

  const seenCustomers = new Set<string>();
  let newCustomers = 0;
  let returningCustomers = 0;
  let newBookings = 0;
  let returningBookings = 0;

  for (const r of monthAdmitted) {
    const key = customerKey(r);
    const isReturning = customersBeforeMonth.has(key);
    if (isReturning) returningBookings += 1;
    else newBookings += 1;

    if (seenCustomers.has(key)) continue;
    seenCustomers.add(key);
    if (isReturning) returningCustomers += 1;
    else newCustomers += 1;
  }

  return {
    newCustomers,
    returningCustomers,
    newBookings,
    returningBookings,
  };
}

export type AirpickShareMonth = {
  prefix: string;
  label: string;
  total: number;
  airpick: number;
  pct: number;
};

/** 최근 N개월 에어픽 입고 비중 추이 (선택 월 포함, 과거 방향) */
export function buildAirpickShareTrend(
  allReservations: Reservation[],
  endMonthPrefix: string,
  monthCount = 6
): AirpickShareMonth[] {
  const prefixes: string[] = [];
  let p = endMonthPrefix;
  for (let i = 0; i < monthCount; i++) {
    prefixes.unshift(p);
    p = shiftMonthPrefix(p, -1);
  }

  return prefixes.map((prefix) => {
    const admitted = filterAdmittedInMonth(allReservations, prefix);
    const airpick = admitted.filter(
      (r) =>
        toGroupedBookingSource(resolveBookingSourceFromReservation(r)) ===
        'airpick-b2c'
    ).length;
    const total = admitted.length;
    const pct = total > 0 ? Math.round((airpick / total) * 100) : 0;
    return {
      prefix,
      label: monthLabelFromPrefix(prefix),
      total,
      airpick,
      pct,
    };
  });
}
