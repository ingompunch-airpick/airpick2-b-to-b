/**
 * 업체 홈페이지 예약완료 — createdBy=homepage, 취소 제외.
 * 파트너 홈 방문(HqHomepageVisits)·명함 클릭 퍼널과 분리. 예약 문서만 집계.
 */
import type { Company, Reservation } from '../types';
import { isAirpickHeadquarters } from '../constants/platform';
import { resolveBookingSourceFromReservation } from './bookingSource';
import { formatPartnerDisplayName } from './companyDisplay';
import { getKSTDateOnlyString, toKSTDateOnlyString } from './kstDate';
import { isCancelled } from './reservationStatus';
import { shortPathRange, type ShortPathPeriod } from './airpickShortPathStats';
import { isWawaCompany } from './pricing';

export type HomepageBookingPeriod = ShortPathPeriod;

export type HomepageBookingRow = {
  companyId: string;
  label: string;
  count: number;
  pct: number;
};

export type HomepageBookingStats = {
  total: number;
  rows: HomepageBookingRow[];
  fromYmd: string;
  toYmd: string;
};

function companyKey(r: Reservation): string {
  const id = String(r.companyId || '')
    .trim()
    .toLowerCase();
  if (isWawaCompany(r.companyId, r.companyName)) return 'wawa';
  return id || 'unknown';
}

function companyLabel(companyId: string, companies: Company[]): string {
  if (companyId === 'unknown') return '미확인';
  const found = companies.find(
    (c) => String(c.id || '').trim().toLowerCase() === companyId
  );
  const named = formatPartnerDisplayName(found?.name, companyId);
  if (named && named !== companyId) return named;
  return found?.name?.trim() || companyId;
}

/** 홈페이지 예약완료(취소 제외) · createdAt(KST) · 업체별 */
export function aggregateHomepageBookings(
  reservations: Reservation[],
  opts: {
    period: HomepageBookingPeriod;
    monthPrefix: string;
    todayYmd?: string;
    companies?: Company[];
  }
): HomepageBookingStats {
  const todayYmd = opts.todayYmd || getKSTDateOnlyString();
  const companies = opts.companies || [];
  const { fromYmd, toYmd } = shortPathRange(opts.period, opts.monthPrefix, todayYmd);
  const counts = new Map<string, number>();
  let total = 0;

  for (const r of reservations) {
    if (isCancelled(r.status)) continue;
    if (resolveBookingSourceFromReservation(r) !== 'homepage') continue;
    const ymd = toKSTDateOnlyString(r.createdAt);
    if (!ymd || ymd < fromYmd || ymd > toYmd) continue;
    const key = companyKey(r);
    if (isAirpickHeadquarters(key)) continue;
    counts.set(key, (counts.get(key) || 0) + 1);
    total += 1;
  }

  // 입점 업체 0건도 보이게 하려면 directory를 채울 수 있으나,
  // 예약완료만 보려면 건수 있는 업체만 나열.
  const rows: HomepageBookingRow[] = [...counts.entries()]
    .map(([companyId, count]) => ({
      companyId,
      label: companyLabel(companyId, companies),
      count,
      pct: total > 0 ? Math.round((count / total) * 100) : 0,
    }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'ko'));

  return { total, rows, fromYmd, toYmd };
}
