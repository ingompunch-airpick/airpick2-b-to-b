/**
 * 에어픽 B2C 짧은 경로(에어픽.kr/long1 등) — 예약 + 방문 집계.
 * 홈 명함 QR(acquisitionClicks)과 분리. createdBy=airpick-b2c 만.
 */
import type { Reservation } from '../types';
import { isAirpickB2CBooking } from './bookingSource';
import { getKSTDateOnlyString, shiftYmd, toKSTDateOnlyString } from './kstDate';
import { isCancelled } from './reservationStatus';

export type ShortPathPeriod = 'last7' | 'month';

export const SHORT_PATH_NONE = '(경로 없음)';

export type ShortPathRow = {
  source: string;
  label: string;
  /** 예약 건수 */
  count: number;
  /** 방문 수 (경로 유입) */
  visits: number;
  pct: number;
};

export type ShortPathStats = {
  total: number;
  withPath: number;
  withoutPath: number;
  visitTotal: number;
  rows: ShortPathRow[];
  fromYmd: string;
  toYmd: string;
};

export function shortPathLabel(source: string): string {
  if (!source || source === SHORT_PATH_NONE) return '경로 없음';
  return source;
}

export function shortPathRange(
  period: ShortPathPeriod,
  monthPrefix: string,
  todayYmd = getKSTDateOnlyString()
): { fromYmd: string; toYmd: string } {
  if (period === 'last7') {
    return { fromYmd: shiftYmd(todayYmd, -6), toYmd: todayYmd };
  }
  const isCurrent = monthPrefix === todayYmd.slice(0, 7);
  if (isCurrent) {
    return { fromYmd: `${monthPrefix}-01`, toYmd: todayYmd };
  }
  const [y, m] = monthPrefix.split('-').map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  return {
    fromYmd: `${monthPrefix}-01`,
    toYmd: `${monthPrefix}-${String(lastDay).padStart(2, '0')}`,
  };
}

/** 취소 제외 · B2C만 · createdAt(KST) 기간 · acquisitionSource + 방문 */
export function aggregateAirpickShortPaths(
  reservations: Reservation[],
  opts: {
    period: ShortPathPeriod;
    monthPrefix: string;
    todayYmd?: string;
    visitBySource?: Record<string, number>;
    visitTotal?: number;
  }
): ShortPathStats {
  const todayYmd = opts.todayYmd || getKSTDateOnlyString();
  const { fromYmd, toYmd } = shortPathRange(opts.period, opts.monthPrefix, todayYmd);
  const visitBySource = opts.visitBySource || {};
  const counts = new Map<string, number>();
  let total = 0;
  let withPath = 0;
  let withoutPath = 0;

  for (const r of reservations) {
    if (isCancelled(r.status)) continue;
    if (!isAirpickB2CBooking(r.createdBy)) continue;
    const ymd = toKSTDateOnlyString(r.createdAt);
    if (!ymd || ymd < fromYmd || ymd > toYmd) continue;
    const raw = String(r.acquisitionSource || '').trim();
    const key = raw || SHORT_PATH_NONE;
    counts.set(key, (counts.get(key) || 0) + 1);
    total += 1;
    if (raw) withPath += 1;
    else withoutPath += 1;
  }

  const keys = new Set<string>([...counts.keys(), ...Object.keys(visitBySource)]);
  // 방문만 있고 예약 없는 경로도 행으로
  for (const key of Object.keys(visitBySource)) {
    if (!counts.has(key)) counts.set(key, 0);
  }

  const visitTotal =
    opts.visitTotal ??
    Object.values(visitBySource).reduce((s, n) => s + n, 0);

  const rows: ShortPathRow[] = [...keys]
    .map((source) => {
      const count = counts.get(source) || 0;
      const visits = source === SHORT_PATH_NONE ? 0 : visitBySource[source] || 0;
      return {
        source,
        label: shortPathLabel(source),
        count,
        visits,
        pct: total > 0 ? Math.round((count / total) * 100) : 0,
      };
    })
    .filter((row) => row.count > 0 || row.visits > 0)
    .sort((a, b) => {
      if (a.source === SHORT_PATH_NONE) return 1;
      if (b.source === SHORT_PATH_NONE) return -1;
      const aScore = a.visits + a.count;
      const bScore = b.visits + b.count;
      return bScore - aScore || b.count - a.count || a.source.localeCompare(b.source);
    });

  return { total, withPath, withoutPath, visitTotal, rows, fromYmd, toYmd };
}
