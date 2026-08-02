import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import type { Company, Reservation } from '../types';
import { ensureFirestoreAuth } from './firebaseAuth';
import { normalizePhoneDigits } from '../utils/phone';
import { enrichReservationWritePatch } from '../utils/reservationPatchGuard';

export { ensureFirestoreAuth, ensurePlatformAdminAuth } from './firebaseAuth';

/** B2B·홈페이지 공통 업체 ID (와와) */
export const WAWA_COMPANY_ID = 'wawa';

export function createReservationId(): string {
  return `res_${Date.now()}`;
}

/** Firestore는 undefined 필드 값을 거부함 — 빈 항공·메모 등 미입력 시 setDoc 실패 원인 */
export function stripUndefinedFields<T extends Record<string, unknown>>(obj: T): T {
  const out = { ...obj };
  for (const key of Object.keys(out)) {
    if (out[key] === undefined) delete out[key];
  }
  return out;
}

function withNormalizedPhone<T extends Record<string, unknown>>(payload: T): T {
  if (typeof payload.phone !== 'string') return payload;
  const digits = normalizePhoneDigits(payload.phone);
  if (!digits) return payload;
  return { ...payload, phone: digits };
}

export async function persistReservation(
  id: string,
  payload: Omit<Reservation, 'id'>
): Promise<void> {
  await ensureFirestoreAuth();
  const clean = stripUndefinedFields(
    withNormalizedPhone(payload as Record<string, unknown>)
  );
  await setDoc(doc(db, 'reservations', id), clean);
}

async function loadCompanyForPrice(companyId?: string): Promise<Company | null> {
  const id = (companyId || '').trim();
  if (!id) return null;
  try {
    const snap = await getDoc(doc(db, 'companies', id));
    if (!snap.exists()) return null;
    return { id: snap.id, ...(snap.data() as object) } as Company;
  } catch {
    return null;
  }
}

/**
 * 예약 부분 업데이트.
 * 일정·실내외 등이 바뀌면 서버 문서 기준으로 요금/start·endDate/inboundFlight를 자동 보정한다.
 */
export async function patchReservation(
  id: string,
  payload: Partial<Reservation>,
  options?: {
    /** true면 요금 자동재계산 생략 (관리자 수동 수납 등) */
    skipPriceEnrich?: boolean;
    company?: Company | null;
  }
): Promise<void> {
  await ensureFirestoreAuth();
  let patch: Record<string, unknown> = { ...payload };

  try {
    const snap = await getDoc(doc(db, 'reservations', id));
    if (snap.exists()) {
      const current = { id: snap.id, ...(snap.data() as object) } as Reservation;
      const company =
        options?.company !== undefined
          ? options.company
          : await loadCompanyForPrice(current.companyId);
      const enriched = enrichReservationWritePatch(current, payload, company);
      if (options?.skipPriceEnrich) {
        if (payload.totalPrice !== undefined) {
          enriched.totalPrice = payload.totalPrice;
        } else {
          delete enriched.totalPrice;
        }
      }
      patch = enriched;
    }
  } catch (err) {
    console.warn('[patchReservation] enrich skipped:', err);
  }

  const clean = stripUndefinedFields(withNormalizedPhone(patch));
  await updateDoc(doc(db, 'reservations', id), clean);
}
