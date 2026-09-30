import { shiftYmd } from './kstDate';

/** 파트너 홈 방문 통계를 보여 주는 업체. 사장 화면에는 쓰지 않는다. */
export const HOMEPAGE_STATS_COMPANY_IDS = ['gayu', 'hi', 'season', 'wawa'] as const;

/** 이 날짜부터 pageViews는 방문 1회, sources는 처음 들어온 주소. */
export const HOMEPAGE_SOURCE_FROM = '2026-09-27';

export type HomepageVisitPeriod = 'week' | 'month' | 'prevMonth';

export type HomepageDayStat = {
  companyId: string;
  date: string;
  pageViews: number;
  sources: Record<string, number>;
};

export type HomepageVisitTotals = {
  pageViews: number;
  googleads: number;
  place: number;
  naverplace: number;
  other: number;
};

export function emptyHomepageVisitTotals(): HomepageVisitTotals {
  return { pageViews: 0, googleads: 0, place: 0, naverplace: 0, other: 0 };
}

export function countFromUnknown(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.max(0, Math.floor(value));
  return 0;
}

export function sourcesFromUnknown(value: unknown): Record<string, number> {
  if (!value || typeof value !== 'object') return {};
  const out: Record<string, number> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    const count = countFromUnknown(raw);
    if (count > 0) out[key] = count;
  }
  return out;
}

/** 그 외 = pageViews − sources 값의 합. 음수는 0. */
export function totalsFromDay(pageViews: number, sources: Record<string, number>): HomepageVisitTotals {
  const views = countFromUnknown(pageViews);
  const googleads = countFromUnknown(sources.googleads);
  const place = countFromUnknown(sources.place);
  const naverplace = countFromUnknown(sources.naverplace);
  let sourceSum = 0;
  for (const count of Object.values(sources)) sourceSum += countFromUnknown(count);
  return {
    pageViews: views,
    googleads,
    place,
    naverplace,
    other: Math.max(0, views - sourceSum),
  };
}

export function addHomepageVisitTotals(
  base: HomepageVisitTotals,
  add: HomepageVisitTotals
): HomepageVisitTotals {
  return {
    pageViews: base.pageViews + add.pageViews,
    googleads: base.googleads + add.googleads,
    place: base.place + add.place,
    naverplace: base.naverplace + add.naverplace,
    other: base.other + add.other,
  };
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

export function homepageVisitRange(
  today: string,
  period: HomepageVisitPeriod
): { start: string; end: string } {
  const [year, month] = today.split('-').map((part) => parseInt(part, 10));
  if (period === 'week') {
    return { start: shiftYmd(today, -6), end: today };
  }
  if (period === 'month') {
    return { start: `${year}-${pad2(month)}-01`, end: today };
  }
  const prev = new Date(Date.UTC(year, month - 2, 1));
  const prevYear = prev.getUTCFullYear();
  const prevMonth = prev.getUTCMonth() + 1;
  const lastDay = new Date(Date.UTC(year, month - 1, 0)).getUTCDate();
  return {
    start: `${prevYear}-${pad2(prevMonth)}-01`,
    end: `${prevYear}-${pad2(prevMonth)}-${pad2(lastDay)}`,
  };
}

export function homepageVisitFetchWindow(today: string): { start: string; end: string } {
  const prev = homepageVisitRange(today, 'prevMonth');
  return { start: prev.start, end: today };
}

export function rangeIncludesPreSourceDays(start: string): boolean {
  return start < HOMEPAGE_SOURCE_FROM;
}

export function sumHomepageVisits(
  days: HomepageDayStat[],
  companyId: string,
  start: string,
  end: string
): HomepageVisitTotals {
  return days.reduce((total, day) => {
    if (day.companyId !== companyId) return total;
    if (day.date < start || day.date > end) return total;
    return addHomepageVisitTotals(total, totalsFromDay(day.pageViews, day.sources));
  }, emptyHomepageVisitTotals());
}

export const HOMEPAGE_SOURCE_LABELS: { key: keyof Omit<HomepageVisitTotals, 'pageViews'>; label: string }[] = [
  { key: 'googleads', label: '구글 광고' },
  { key: 'place', label: '플레이스' },
  { key: 'naverplace', label: '네이버 플레이스' },
  { key: 'other', label: '그 외' },
];
