import { collection, documentId, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { ensurePlatformAdminAuth } from './firebaseAuth';
import { getKSTDateOnlyString, shiftYmd } from '../utils/kstDate';
import {
  shortPathRange,
  type ShortPathPeriod,
} from '../utils/airpickShortPathStats';

export type B2cShortPathDayStat = {
  date: string;
  pageViews: number;
  sources: Record<string, number>;
};

function countFromUnknown(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.max(0, Math.floor(value));
  return 0;
}

function sourcesFromUnknown(value: unknown): Record<string, number> {
  if (!value || typeof value !== 'object') return {};
  const out: Record<string, number> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    const n = countFromUnknown(raw);
    if (n > 0) out[key] = n;
  }
  return out;
}

/** 최근 약 2달 분량 — 월간·7일 토글에 충분 */
export async function fetchB2cShortPathDays(
  todayYmd = getKSTDateOnlyString()
): Promise<B2cShortPathDayStat[]> {
  await ensurePlatformAdminAuth();
  const start = shiftYmd(todayYmd, -62);
  const snap = await getDocs(
    query(
      collection(db, 'b2cShortPathStats', 'airpick', 'days'),
      where(documentId(), '>=', start),
      where(documentId(), '<=', todayYmd)
    )
  );
  return snap.docs.map((item) => {
    const data = item.data() as { pageViews?: unknown; sources?: unknown };
    return {
      date: item.id,
      pageViews: countFromUnknown(data.pageViews),
      sources: sourcesFromUnknown(data.sources),
    };
  });
}

export function sumB2cShortPathVisits(
  days: B2cShortPathDayStat[],
  period: ShortPathPeriod,
  monthPrefix: string,
  todayYmd = getKSTDateOnlyString()
): { pageViews: number; bySource: Record<string, number> } {
  const { fromYmd, toYmd } = shortPathRange(period, monthPrefix, todayYmd);
  const bySource: Record<string, number> = {};
  let pageViews = 0;
  for (const day of days) {
    if (day.date < fromYmd || day.date > toYmd) continue;
    pageViews += day.pageViews;
    for (const [key, n] of Object.entries(day.sources)) {
      bySource[key] = (bySource[key] || 0) + n;
    }
  }
  return { pageViews, bySource };
}
