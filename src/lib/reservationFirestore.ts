import { doc, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import type { Reservation } from '../types';
import { ensureFirestoreAuth } from './firebaseAuth';
import { normalizePhoneDigits } from '../utils/phone';

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

export async function patchReservation(
  id: string,
  payload: Partial<Reservation>
): Promise<void> {
  await ensureFirestoreAuth();
  const clean = stripUndefinedFields(
    withNormalizedPhone(payload as Record<string, unknown>)
  );
  await updateDoc(doc(db, 'reservations', id), clean);
}
