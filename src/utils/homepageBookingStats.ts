/**
 * 업체 홈페이지 예약완료 — createdBy=homepage, 취소 제외.
 * 업체마다 링크가 여러 개이므로: 업체 → 유입(acquisitionSource[/campaign]).
 * 전 업체 명함·전단지를 한 줄로 합치지 않는다.
 */
import type { Company, Reservation } from '../types';
import { isAirpickHeadquarters } from '../constants/platform';
import {
  acquisitionSourceLabel,
  defaultAcquisitionCampaign,
} from './acquisition';
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

export type HomepageBookingLinkRow = {
  /** source 또는 source::campaign */
  key: string;
  label: string;
  count: number;
  pct: number;
};

export type HomepageBookingCompanyRow = {
  companyId: string;
  label: string;
  count: number;
  pct: number;
  links: HomepageBookingLinkRow[];
};

export type HomepageBookingStats = {
  total: number;
  rows: HomepageBookingCompanyRow[];
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

/** 같은 source라도 캠페인이 기본값과 다르면 링크를 나눈다 */
function linkKeyAndLabel(r: Reservation, companyId: string): { key: string; label: string } {
  const rawSource = String(r.acquisitionSource || '').trim();
  if (!rawSource) {
    return { key: SHORT_PATH_NONE, label: '경로 없음' };
  }
  const source = rawSource;
  const baseLabel = acquisitionSourceLabel(source);
  const campaign = String(r.acquisitionCampaign || '').trim();
  const defaultCmp = defaultAcquisitionCampaign(companyId, source);
  if (campaign && campaign !== defaultCmp) {
    return {
      key: `${source}::${campaign}`,
      label: `${baseLabel} · ${campaign}`,
    };
  }
  return { key: source, label: baseLabel };
}

/** 홈 예약완료 · createdAt(KST) · 업체 → 링크 */
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

  /** companyId → linkKey → { label, count } */
  const nested = new Map<string, Map<string, { label: string; count: number }>>();
  let total = 0;

  for (const r of reservations) {
    if (isCancelled(r.status)) continue;
    if (resolveBookingSourceFromReservation(r) !== 'homepage') continue;
    const ymd = toKSTDateOnlyString(r.createdAt);
    if (!ymd || ymd < fromYmd || ymd > toYmd) continue;
    const cid = companyKey(r);
    if (isAirpickHeadquarters(cid)) continue;
    const { key, label } = linkKeyAndLabel(r, cid);
    if (!nested.has(cid)) nested.set(cid, new Map());
    const links = nested.get(cid)!;
    const prev = links.get(key);
    if (prev) prev.count += 1;
    else links.set(key, { label, count: 1 });
    total += 1;
  }

  const rows: HomepageBookingCompanyRow[] = [...nested.entries()]
    .map(([companyId, linksMap]) => {
      const linkRowsRaw = [...linksMap.entries()].map(([key, v]) => ({
        key,
        label: v.label,
        count: v.count,
      }));
      const count = linkRowsRaw.reduce((s, l) => s + l.count, 0);
      const links: HomepageBookingLinkRow[] = linkRowsRaw
        .map((l) => ({
          ...l,
          pct: count > 0 ? Math.round((l.count / count) * 100) : 0,
        }))
        .sort((a, b) => {
          if (a.key === SHORT_PATH_NONE) return 1;
          if (b.key === SHORT_PATH_NONE) return -1;
          return b.count - a.count || a.label.localeCompare(b.label, 'ko');
        });
      return {
        companyId,
        label: companyLabel(companyId, companies),
        count,
        pct: total > 0 ? Math.round((count / total) * 100) : 0,
        links,
      };
    })
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'ko'));

  return { total, rows, fromYmd, toYmd };
}
