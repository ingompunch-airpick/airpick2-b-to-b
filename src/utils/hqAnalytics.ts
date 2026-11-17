import type { Company, Reservation } from '../types';
import { isAirpickHeadquarters } from '../constants/platform';
import { normalizeDateString } from './reservationNormalize';
import { isAdmitted, isNotYetAdmitted, isParked } from './reservationStatus';
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

/** 월 입고: 취소만 빼고 입차 예정일 기준. 아직 입고 전인 예약도 포함한다. */
export function filterAdmittedInMonth(
  reservations: Reservation[],
  monthPrefix: string
): Reservation[] {
  return reservations.filter(
    (r) =>
      r.status !== 'cancelled' &&
      normalizeDateString(r.departureDate).startsWith(monthPrefix)
  );
}

/** 월 출고: 출차 완료는 실제 출차일, 예약·입고 중이면 출차 예정일 */
export function filterSettledInMonth(
  reservations: Reservation[],
  monthPrefix: string
): Reservation[] {
  return reservations.filter((r) => {
    if (r.status === 'completed_out') return exitDateYmd(r).startsWith(monthPrefix);
    if (isNotYetAdmitted(r.status) || isParked(r.status)) {
      return normalizeDateString(r.arrivalDate).startsWith(monthPrefix);
    }
    return false;
  });
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
  /** 해당 월 출차 완료 건수 (정산) */
  settled: number;
  settledRevenue: number;
  /** 해당 업체 기준 신규·재방문 (없으면 과거 스냅샷) */
  newCustomers?: number;
  returningCustomers?: number;
  newBookings?: number;
  returningBookings?: number;
};

function emptyHqCompanyRow(id: string, name: string): HqCompanyRow {
  return {
    id,
    name,
    airpick: 0,
    homepage: 0,
    onsite: 0,
    total: 0,
    revenue: 0,
    airpickRevenue: 0,
    homepageRevenue: 0,
    settled: 0,
    settledRevenue: 0,
    newCustomers: 0,
    returningCustomers: 0,
    newBookings: 0,
    returningBookings: 0,
  };
}

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
  companies?: Company[],
  settled: Reservation[] = []
): HqCompanyRow[] {
  const map = new Map<string, HqCompanyRow>();
  for (const c of partnerDirectory(companies)) {
    map.set(c.id, emptyHqCompanyRow(c.id, c.name));
  }

  const ensure = (r: Reservation): HqCompanyRow => {
    const { id, name } = companyIdAndName(r);
    if (!map.has(id)) {
      map.set(id, emptyHqCompanyRow(id, name));
    }
    return map.get(id)!;
  };

  for (const r of admitted) {
    const row = ensure(r);
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

  for (const r of settled) {
    const row = ensure(r);
    row.settled += 1;
    row.settledRevenue += r.totalPrice || 0;
  }

  return [...map.values()].sort(
    (a, b) =>
      b.settled - a.settled ||
      b.airpick - a.airpick ||
      b.total - a.total ||
      a.name.localeCompare(b.name, 'ko')
  );
}

export type HqTodayCompanyRow = {
  id: string;
  name: string;
  received: number;
  admitted: number;
  exited: number;
  parked: number;
  /** 오늘 입고일 기준 매출 */
  sales: number;
  airpick: number;
  homepage: number;
  onsite: number;
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

export function exitDateYmd(r: Reservation): string {
  if (r.actualExitTime) return normalizeDateString(r.actualExitTime.slice(0, 10));
  return normalizeDateString(r.arrivalDate);
}

/** 오늘 업체별 운영 대수·입고일 매출·오늘 접수 채널 */
export function buildHqTodayCompanyRows(
  reservations: Reservation[],
  todayYmd: string,
  companies?: Company[]
): HqTodayCompanyRow[] {
  const empty = (id: string, name: string): HqTodayCompanyRow => ({
    id,
    name,
    received: 0,
    admitted: 0,
    exited: 0,
    parked: 0,
    sales: 0,
    airpick: 0,
    homepage: 0,
    onsite: 0,
  });
  const map = new Map<string, HqTodayCompanyRow>();
  for (const c of partnerDirectory(companies)) {
    map.set(c.id, empty(c.id, c.name));
  }

  const ensure = (r: Reservation): HqTodayCompanyRow => {
    const { id, name } = companyIdAndName(r);
    if (!map.has(id)) {
      map.set(id, empty(id, name));
    }
    return map.get(id)!;
  };

  for (const r of reservations) {
    if (r.status === 'cancelled') continue;
    const row = ensure(r);
    if (toKSTDateOnlyString(r.createdAt) === todayYmd) {
      row.received += 1;
      const src = resolveBookingSourceFromReservation(r);
      if (src === 'airpick-b2c') row.airpick += 1;
      else if (src === 'homepage') row.homepage += 1;
      else row.onsite += 1;
    }
    if (normalizeDateString(r.departureDate) === todayYmd) {
      row.sales += r.totalPrice || 0;
      if (isAdmitted(r.status)) row.admitted += 1;
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

/** 서버 customers·재방문 기록과 같은 전화번호 키 (82 → 0, 앞 0 빠진 10자리 보정) */
export function customerPhoneDigits(phone: unknown): string {
  let digits = String(phone ?? '').replace(/\D/g, '');
  if (digits.startsWith('82') && digits.length >= 11) digits = `0${digits.slice(2)}`;
  if (digits.length === 10 && digits.startsWith('10')) digits = `0${digits}`;
  return digits;
}

function customerKey(r: Reservation): string {
  const phone = customerPhoneDigits(r.phone);
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

/**
 * 신규·재방문 — 취소 제외 예약이 두 건 이상이면 재방문. 이번달 예약도 센다.
 * purgedVisits: 앱에서 지운 출차 완료 수(전화번호별). 앱에 남은 예약 수에 더한다.
 * @deprecated 본사 화면은 computePerCompanyCustomerMix 사용. 전체 합은 참고용.
 */
export function computeCustomerMix(
  allReservations: Reservation[],
  _monthPrefix: string,
  monthAdmitted: Reservation[],
  purgedVisits: Record<string, number> = {}
): HqCustomerMix {
  const reservationCounts = new Map<string, number>();
  for (const r of allReservations) {
    if (r.status === 'cancelled') continue;
    const key = customerKey(r);
    reservationCounts.set(key, (reservationCounts.get(key) || 0) + 1);
  }
  for (const [key, count] of reservationCounts) {
    if (!key.startsWith('p:')) continue;
    const prior = Number(purgedVisits[key.slice(2)] || 0);
    if (prior > 0) reservationCounts.set(key, count + prior);
  }

  const seenCustomers = new Set<string>();
  let newCustomers = 0;
  let returningCustomers = 0;
  let newBookings = 0;
  let returningBookings = 0;

  for (const r of monthAdmitted) {
    const key = customerKey(r);
    const isReturning = (reservationCounts.get(key) || 0) >= 2;
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

/**
 * 업체별 신규·재방문 — 같은 업체에서 취소 제외 예약이 2건 이상이면 재방문.
 * (다른 업체 이용 이력은 세지 않음)
 */
export function computePerCompanyCustomerMix(
  allReservations: Reservation[],
  monthAdmitted: Reservation[]
): Map<string, HqCustomerMix> {
  const reservationCounts = new Map<string, number>();
  for (const r of allReservations) {
    if (r.status === 'cancelled') continue;
    const cid = companyIdAndName(r).id;
    const key = `${cid}|${customerKey(r)}`;
    reservationCounts.set(key, (reservationCounts.get(key) || 0) + 1);
  }

  const result = new Map<string, HqCustomerMix>();
  const seenByCompany = new Map<string, Set<string>>();

  for (const r of monthAdmitted) {
    const cid = companyIdAndName(r).id;
    const ck = customerKey(r);
    const isReturning = (reservationCounts.get(`${cid}|${ck}`) || 0) >= 2;

    let mix = result.get(cid);
    if (!mix) {
      mix = {
        newCustomers: 0,
        returningCustomers: 0,
        newBookings: 0,
        returningBookings: 0,
      };
      result.set(cid, mix);
    }
    if (isReturning) mix.returningBookings += 1;
    else mix.newBookings += 1;

    let seen = seenByCompany.get(cid);
    if (!seen) {
      seen = new Set();
      seenByCompany.set(cid, seen);
    }
    if (seen.has(ck)) continue;
    seen.add(ck);
    if (isReturning) mix.returningCustomers += 1;
    else mix.newCustomers += 1;
  }

  return result;
}

/** 업체 월간 행에 업체별 신규·재방문 붙이기 */
export function attachPerCompanyCustomerMix(
  rows: HqCompanyRow[],
  mixByCompany: Map<string, HqCustomerMix>
): HqCompanyRow[] {
  return rows.map((row) => {
    const mix = mixByCompany.get(row.id);
    return {
      ...row,
      newCustomers: mix?.newCustomers ?? 0,
      returningCustomers: mix?.returningCustomers ?? 0,
      newBookings: mix?.newBookings ?? 0,
      returningBookings: mix?.returningBookings ?? 0,
    };
  });
}

