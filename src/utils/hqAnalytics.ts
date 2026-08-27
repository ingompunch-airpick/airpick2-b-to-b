import type { Company, Reservation } from '../types';
import { isAirpickHeadquarters } from '../constants/platform';
import { normalizeDateString } from './reservationNormalize';
import { isAdmitted, isParked } from './reservationStatus';
import { toKSTDateOnlyString } from './kstDate';
import {
  resolveBookingSourceFromReservation,
} from './bookingSource';
import { isWawaCompany } from './pricing';
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
  homepage: number;
  onsite: number;
  total: number;
  revenue: number;
  airpickRevenue: number;
  homepageRevenue: number;
};

function partnerDirectory(companies: Company[] | undefined): { id: string; name: string }[] {
  if (!companies?.length) return [];
  return companies
    .filter((c) => c.id && !isAirpickHeadquarters(c.id))
    .map((c) => ({
      id: String(c.id).toLowerCase().trim(),
      name: String(c.name || c.id).trim() || c.id,
    }));
}

export function buildHqCompanyRows(
  admitted: Reservation[],
  companies?: Company[]
): HqCompanyRow[] {
  const map = new Map<string, HqCompanyRow>();
  for (const c of partnerDirectory(companies)) {
    map.set(c.id, {
      id: c.id,
      name: c.name,
      airpick: 0,
      homepage: 0,
      onsite: 0,
      total: 0,
      revenue: 0,
      airpickRevenue: 0,
      homepageRevenue: 0,
    });
  }
  for (const r of admitted) {
    const { id, name } = companyIdAndName(r);
    if (!map.has(id)) {
      map.set(id, {
        id,
        name,
        airpick: 0,
        homepage: 0,
        onsite: 0,
        total: 0,
        revenue: 0,
        airpickRevenue: 0,
        homepageRevenue: 0,
      });
    }
    const row = map.get(id)!;
    const src = resolveBookingSourceFromReservation(r);
    const price = r.totalPrice || 0;
    if (src === 'airpick-b2c') {
      row.airpick += 1;
      row.airpickRevenue += price;
    } else if (src === 'homepage') {
      row.homepage += 1;
      row.homepageRevenue += price;
    } else {
      row.onsite += 1;
    }
    row.total += 1;
    row.revenue += price;
  }
  return [...map.values()].sort(
    (a, b) => b.airpick - a.airpick || b.total - a.total || a.name.localeCompare(b.name, 'ko')
  );
}

export type HqTodayCompanyRow = {
  id: string;
  name: string;
  received: number;
  admitted: number;
  exited: number;
  parked: number;
};

function companyIdAndName(r: Reservation): { id: string; name: string } {
  const rawId = String(r.companyId || '').trim();
  const rawName = String(r.companyName || '').trim();
  // 와와 별칭(wawa_valet·표시명만 와와 등)이 총합에는 잡히고 업체 카드에서는 빠지지 않게 통일
  if (isWawaCompany(rawId, rawName)) {
    return { id: 'wawa', name: '와와발렛' };
  }
  const id = (rawId || rawName || 'unknown').toLowerCase().trim();
  const name = rawName || rawId || '미지정';
  return { id, name };
}

function exitDateYmd(r: Reservation): string {
  if (r.actualExitTime) return normalizeDateString(r.actualExitTime.slice(0, 10));
  return normalizeDateString(r.arrivalDate);
}

/** 오늘 업체별 운영 대수 — 입점업체 전부, 매출 없음 */
export function buildHqTodayCompanyRows(
  reservations: Reservation[],
  todayYmd: string,
  companies?: Company[]
): HqTodayCompanyRow[] {
  const map = new Map<string, HqTodayCompanyRow>();
  for (const c of partnerDirectory(companies)) {
    map.set(c.id, { id: c.id, name: c.name, received: 0, admitted: 0, exited: 0, parked: 0 });
  }

  const ensure = (r: Reservation): HqTodayCompanyRow => {
    const { id, name } = companyIdAndName(r);
    if (!map.has(id)) {
      map.set(id, { id, name, received: 0, admitted: 0, exited: 0, parked: 0 });
    }
    return map.get(id)!;
  };

  for (const r of reservations) {
    if (r.status === 'cancelled') continue;
    const row = ensure(r);
    if (toKSTDateOnlyString(r.createdAt) === todayYmd) row.received += 1;
    if (normalizeDateString(r.departureDate) === todayYmd && isAdmitted(r.status)) {
      row.admitted += 1;
    }
    if (exitDateYmd(r) === todayYmd && r.status === 'completed_out') {
      row.exited += 1;
    }
    if (isParked(r.status)) row.parked += 1;
  }

  return [...map.values()].sort((a, b) => {
    const aAct = a.parked + a.admitted + a.received;
    const bAct = b.parked + b.admitted + b.received;
    if (bAct !== aAct) return bAct - aAct;
    return a.name.localeCompare(b.name, 'ko');
  });
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

