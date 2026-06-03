import { signInAnonymously, signInWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc, updateDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';
import type { Reservation } from '../types';

/** B2B·홈페이지 공통 업체 ID (와와) */
export const WAWA_COMPANY_ID = 'wawa';

export function createReservationId(): string {
  return `res_${Date.now()}`;
}

/**
 * Firestore 쓰기 전 익명 로그인(홈페이지·앱 동일 패턴).
 * Firebase Console → Authentication → Sign-in method → Anonymous 활성화 필요.
 */
export async function ensureFirestoreAuth(): Promise<void> {
  if (auth.currentUser) return;
  try {
    await signInAnonymously(auth);
    return;
  } catch (e: unknown) {
    const code = (e as { code?: string })?.code;
    if (code === 'auth/admin-restricted-operation') {
      await signInWithEmailAndPassword(auth, 'ingompunch@gmail.com', 'admin1234');
      return;
    }
    throw e;
  }
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
