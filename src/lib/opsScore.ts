import { doc, getDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functionsSeoul } from '../firebase';
import { ensurePlatformAdminAuth } from './firebaseAuth';

/** functions/src/partnerScore/compute.ts 의 CompanyScore 와 같은 모양 (Functions만 씀) */
export type OpsMissKind = 'photo' | 'parking' | 'speed' | 'checkout' | 'cancel' | 'review';

export type OpsMiss = {
  kind: OpsMissKind;
  reservationId: string;
  ymd: string;
  carTail?: string;
  note: string;
  blocking?: boolean;
};

export type OpsRatioItem = { ok: number; total: number; points: number; max: number };

export type OpsCompanyScore = {
  companyId: string;
  companyName: string;
  month: string;
  strict: boolean;
  airpickIntakes: number;
  checkedIn: number;
  items: {
    photo: OpsRatioItem;
    parking: OpsRatioItem;
    speed: OpsRatioItem;
    checkout: OpsRatioItem;
    review: { low: number; points: number; max: number };
    cancel: { count: number; points: number; max: number };
    own: { count: number; points: number };
  };
  score: number;
  minimum: {
    ratio: number;
    photo: boolean;
    parking: boolean;
    checkoutOpen: number;
    checkout: boolean;
    cancelMax: number;
    cancel: boolean;
  };
  status: 'ranked' | 'few' | 'below';
  rank: number | null;
  rankedCount: number;
  weight: 0 | 1 | 2 | 3;
  badge: boolean;
  misses: OpsMiss[];
  missTotal: number;
  final: boolean;
  trial: boolean;
  computedAt: string;
};

export type OpsMonthRow = {
  companyId: string;
  companyName: string;
  score: number;
  status: OpsCompanyScore['status'];
  rank: number | null;
  weight: number;
  badge: boolean;
  airpickIntakes: number;
  checkedIn: number;
  missTotal: number;
};

export type OpsMonthSummary = {
  month: string;
  strict: boolean;
  final: boolean;
  trial: boolean;
  computedAt: string;
  companies: OpsMonthRow[];
};

export function kstMonth(offset = 0): string {
  const now = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1));
  return d.toISOString().slice(0, 7);
}

export function monthLabel(month: string): string {
  return `${Number(month.slice(5, 7))}월`;
}

export function nextMonth(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 7);
}

/** 업체 하나의 그달 점수. 계산 전이면 null */
export async function fetchCompanyScore(
  companyId: string,
  month: string
): Promise<OpsCompanyScore | null> {
  const id = companyId.trim();
  if (!id || !/^\d{4}-\d{2}$/.test(month)) return null;
  const snap = await getDoc(doc(db, 'partnerScores', id, 'months', month));
  return snap.exists() ? (snap.data() as OpsCompanyScore) : null;
}

/** 본사 — 그달 전체 업체 순위 */
export async function fetchScoreMonth(month: string): Promise<OpsMonthSummary | null> {
  await ensurePlatformAdminAuth();
  const snap = await getDoc(doc(db, 'partnerScoreMonths', month));
  return snap.exists() ? (snap.data() as OpsMonthSummary) : null;
}

/** 본사 — 지금 다시 계산 (이번 달: 진행 중 · 지난달: 확정) */
export async function recomputeScoreMonth(month: string): Promise<void> {
  await ensurePlatformAdminAuth();
  const call = httpsCallable<{ month: string }, unknown>(functionsSeoul, 'recomputePartnerScores');
  await call({ month });
}
