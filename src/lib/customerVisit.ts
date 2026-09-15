import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { ensureFirestoreAuth } from './firebaseAuth';
import { formatPhoneDisplay, normalizePhoneDigits } from '../utils/phone';
import { normalizeReservationStatus } from '../utils/reservationStatus';

export interface CustomerVisitDoc {
  phoneKey: string;
  phoneDisplay?: string;
  nameLast?: string;
  visitCount: number;
  firstAt?: string;
  lastAt?: string;
  lastReservationId?: string;
  companyIds?: string[];
}

/** 예약 카드용: 같은 번호의 N번째 예약(취소 제외, createdAt 순) */
export type VisitOrdinalReservation = {
  id?: string;
  phone?: string;
  createdAt?: string;
  status?: string;
};

export function customerDocId(phone: string | undefined | null): string | null {
  const key = normalizePhoneDigits(phone);
  if (!key || key.length < 10) return null;
  return key;
}

export function computeReservationVisitOrdinal(
  target: VisitOrdinalReservation,
  pool: VisitOrdinalReservation[]
): number | null {
  const phone = normalizePhoneDigits(target.phone);
  if (!phone || !target.id) return null;
  if (normalizeReservationStatus(target.status) === 'cancelled') return null;

  const byId = new Map<string, VisitOrdinalReservation>();
  for (const r of pool) {
    if (!r?.id) continue;
    if (normalizePhoneDigits(r.phone) !== phone) continue;
    if (normalizeReservationStatus(r.status) === 'cancelled') continue;
    byId.set(String(r.id), r);
  }
  // CRM 목록만 넘어온 경우 등 — 대상 예약이 pool에 없어도 본인을 포함
  byId.set(String(target.id), target);

  const same = [...byId.values()].sort((a, b) => {
    const ta = Date.parse(a.createdAt || '') || 0;
    const tb = Date.parse(b.createdAt || '') || 0;
    if (ta !== tb) return ta - tb;
    return String(a.id || '').localeCompare(String(b.id || ''));
  });

  const idx = same.findIndex((r) => String(r.id) === String(target.id));
  return idx >= 0 ? idx + 1 : 1;
}

export async function fetchCustomerVisitCount(
  phone: string | undefined | null
): Promise<number | null> {
  const id = customerDocId(phone);
  if (!id) return null;
  await ensureFirestoreAuth();
  const snap = await getDoc(doc(db, 'customers', id));
  if (!snap.exists()) return null;
  const n = snap.data()?.visitCount;
  return typeof n === 'number' && n >= 0 ? n : null;
}

export function displayPhoneFromAny(phone: string | undefined | null): string {
  return formatPhoneDisplay(phone);
}
