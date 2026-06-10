import { doc, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import type { Reservation } from '../types';
import { ensureFirestoreAuth } from './firebaseAuth';

export { ensureFirestoreAuth, ensurePlatformAdminAuth } from './firebaseAuth';

/** B2B·홈페이지 공통 업체 ID (와와) */
export const WAWA_COMPANY_ID = 'wawa';

export function createReservationId(): string {
  return `res_${Date.now()}`;
}

export async function persistReservation(
  id: string,
  payload: Omit<Reservation, 'id'>
): Promise<void> {
  await ensureFirestoreAuth();
  await setDoc(doc(db, 'reservations', id), payload);
}

export async function patchReservation(
  id: string,
  payload: Partial<Reservation>
): Promise<void> {
  await ensureFirestoreAuth();
  await updateDoc(doc(db, 'reservations', id), payload);
}
