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
  /** 업체별 출고 완료 횟수 */
  visits?: Record<string, number>;
}

/** 예약 카드용: 같은 번호의 N번째 예약(취소 제외, createdAt 순) */
export type VisitOrdinalReservation = {
  id?: string;
  phone?: string;
  companyId?: string;
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
    if (!sameCompany(target, r)) continue;
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

function sortByCreatedAt(list: VisitOrdinalReservation[]): VisitOrdinalReservation[] {
  return [...list].sort((a, b) => {
    const ta = Date.parse(a.createdAt || '') || 0;
    const tb = Date.parse(b.createdAt || '') || 0;
    if (ta !== tb) return ta - tb;
    return String(a.id || '').localeCompare(String(b.id || ''));
  });
}

function sameCompany(left: VisitOrdinalReservation, right: VisitOrdinalReservation): boolean {
  const companyId = String(left.companyId || '').trim().toLowerCase();
  if (!companyId) return true;
  return String(right.companyId || '').trim().toLowerCase() === companyId;
}

/**
 * 화면에 보일 방문 순번. 같은 업체의 출고만 센다.
 * 출고로 이미 센 횟수(지워진 예약 포함)에, 아직 출고 전인 이번 예약을 더한다.
 */
export function displayedVisitCount(
  target: VisitOrdinalReservation,
  pool: VisitOrdinalReservation[],
  storedVisitCount: number | null
): number | null {
  const phone = normalizePhoneDigits(target.phone);
  if (!phone || !target.id) return null;
  if (normalizeReservationStatus(target.status) === 'cancelled') return null;

  const byId = new Map<string, VisitOrdinalReservation>();
  for (const reservation of pool) {
    if (!reservation?.id) continue;
    if (normalizePhoneDigits(reservation.phone) !== phone) continue;
    if (!sameCompany(target, reservation)) continue;
    if (normalizeReservationStatus(reservation.status) === 'cancelled') continue;
    byId.set(String(reservation.id), reservation);
  }
  byId.set(String(target.id), target);

  const same = [...byId.values()];
  const completed = same.filter(
    (reservation) => normalizeReservationStatus(reservation.status) === 'completed_out'
  );
  const open = same.filter(
    (reservation) => normalizeReservationStatus(reservation.status) !== 'completed_out'
  );
  const lifetime =
    storedVisitCount == null
      ? completed.length
      : Math.max(storedVisitCount, completed.length);
  const purged = lifetime - completed.length;
  const rankIn = (list: VisitOrdinalReservation[]) => {
    const index = sortByCreatedAt(list).findIndex(
      (reservation) => String(reservation.id) === String(target.id)
    );
    return index >= 0 ? index + 1 : 1;
  };

  if (normalizeReservationStatus(target.status) === 'completed_out') {
    return purged + rankIn(completed);
  }
  return lifetime + rankIn(open);
}

const visitCountCache = new Map<string, Promise<number | null>>();

export async function fetchCustomerVisitCount(
  phone: string | undefined | null,
  companyId?: string | null
): Promise<number | null> {
  const id = customerDocId(phone);
  if (!id) return null;
  const company = String(companyId || '').trim().toLowerCase();
  const cacheKey = `${id}:${company}`;
  const cached = visitCountCache.get(cacheKey);
  if (cached) return cached;
  const pending = (async () => {
    await ensureFirestoreAuth();
    const snap = await getDoc(doc(db, 'customers', id));
    if (!snap.exists()) return null;
    const visits = snap.data()?.visits;
    if (!company || !visits || typeof visits !== 'object') return null;
    const n = (visits as Record<string, unknown>)[company];
    return typeof n === 'number' && n >= 0 ? n : 0;
  })();
  visitCountCache.set(cacheKey, pending);
  pending.catch(() => {
    visitCountCache.delete(cacheKey);
  });
  return pending;
}

export function displayPhoneFromAny(phone: string | undefined | null): string {
  return formatPhoneDisplay(phone);
}
