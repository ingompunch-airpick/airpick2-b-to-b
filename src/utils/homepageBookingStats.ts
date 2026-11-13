/**
 * 업체 홈페이지 예약완료 — createdBy=homepage, 취소 제외.
 * 유입(acquisitionSource: 명함 등) + 업체별. 방문·클릭 퍼널과 분리.
 */
import type { Company, Reservation } from '../types';
import { isAirpickHeadquarters } from '../constants/platform';
import { acquisitionSourceLabel } from './acquisition';
import { resolveBookingSourceFromReservation } from './bookingSource';
import { formatPartnerDisplayName } from './companyDisplay';
import { getKSTDateOnlyString, toKSTDateOnlyString } from './kstDate';
import { isCancelled } from './reservationStatus';
import {
  SHORT_PATH_NONE,
  shortPathRange,
  type ShortPathPeriod,
} from './airpickShortPathStats';
import { isWawaCompany } from './pricing';

export type HomepageBookingPeriod = ShortPathPeriod;

export type HomepageBookingCompanyRow = {
  companyId: string;
  label: string;
  count: number;
};

export type HomepageBookingSourceRow = {
  source: string;
  label: string;
  count: number;
  pct: number;
  companies: HomepageBookingCompanyRow[];
};

export type HomepageBookingStats = {
  total: number;
  withSource: number;
  withoutSource: number;
  rows: HomepageBookingSourceRow[];
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

function sourceKey(r: Reservation): string {
  const raw = String(r.acquisitionSource || '').trim();
  return raw || SHORT_PATH_NONE;
}

function sourceLabel(source: string): string {
  if (!source || source === SHORT_PATH_NONE) return '경로 없음';
  return acquisitionSourceLabel(source);
}

/** 홈 예약완료 · createdAt(KST) · 유입별(+업체 내역) */
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

  /** source → companyId → count */
  const nested = new Map<string, Map<string, number>>();
  let total = 0;
  let withSource = 0;
  let withoutSource = 0;

  for (const r of reservations) {
    if (isCancelled(r.status)) continue;
    if (resolveBookingSourceFromReservation(r) !== 'homepage') continue;
    const ymd = toKSTDateOnlyString(r.createdAt);
    if (!ymd || ymd < fromYmd || ymd > toYmd) continue;
    const cid = companyKey(r);
    if (isAirpickHeadquarters(cid)) continue;
    const src = sourceKey(r);
    if (!nested.has(src)) nested.set(src, new Map());
    const byCo = nested.get(src)!;
    byCo.set(cid, (byCo.get(cid) || 0) + 1);
    total += 1;
    if (src === SHORT_PATH_NONE) withoutSource += 1;
    else withSource += 1;
  }

  const rows: HomepageBookingSourceRow[] = [...nested.entries()]
    .map(([source, byCo]) => {
      const companyRows: HomepageBookingCompanyRow[] = [...byCo.entries()]
        .map(([companyId, count]) => ({
          companyId,
          label: companyLabel(companyId, companies),
          count,
        }))
        .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'ko'));
      const count = companyRows.reduce((s, c) => s + c.count, 0);
      return {
        source,
        label: sourceLabel(source),
        count,
        pct: total > 0 ? Math.round((count / total) * 100) : 0,
        companies: companyRows,
      };
    })
    .sort((a, b) => {
      if (a.source === SHORT_PATH_NONE) return 1;
      if (b.source === SHORT_PATH_NONE) return -1;
      return b.count - a.count || a.label.localeCompare(b.label, 'ko');
    });

  return { total, withSource, withoutSource, rows, fromYmd, toYmd };
}
