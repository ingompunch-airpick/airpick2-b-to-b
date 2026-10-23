import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { ensurePlatformAdminAuth } from './firebaseAuth';
import { shiftYmd } from '../utils/kstDate';
import { presentHqMonth, type HqLedgerBundle, type HqMonthLedger } from './hqMonthLedgerApi';
import type { Company } from '../types';

import { RESERVATION_DATA_RETENTION_DAYS } from '../constants/dataRetention';

/** 그달 1일 출차도 보관 기간이 지나기 전이면 앱에 아직 있다. */
export function monthStillInApp(month: string, today: string): boolean {
  if (month >= today.slice(0, 7)) return true;
  return shiftYmd(`${month}-01`, RESERVATION_DATA_RETENTION_DAYS) > today;
}

/** 앱에서 지운 출차 완료 수(전화번호별). 본사 재방문 판단에 더한다. */
export async function fetchPurgedVisitCounts(): Promise<Record<string, number>> {
  await ensurePlatformAdminAuth();
  const snap = await getDoc(doc(db, 'hqCustomerHistory', 'purgedVisits'));
  const raw = (snap.exists() ? snap.data().counts : null) as Record<string, unknown> | null;
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(raw || {})) {
    const n = Number(value);
    if (Number.isFinite(n) && n > 0) out[key] = n;
  }
  return out;
}

export async function fetchHqMonthSnapshot(
  month: string,
  companies: Company[]
): Promise<HqMonthLedger | null> {
  await ensurePlatformAdminAuth();
  const snap = await getDoc(doc(db, 'hqMonthSnapshots', month));
  if (!snap.exists()) return null;
  const data = snap.data() as HqLedgerBundle['months'][string];
  return presentHqMonth(month, { months: { [month]: data }, visits: [] }, companies);
}
