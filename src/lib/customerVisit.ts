import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { ensureFirestoreAuth } from './firebaseAuth';
import { formatPhoneDisplay, normalizePhoneDigits } from '../utils/phone';

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

export function customerDocId(phone: string | undefined | null): string | null {
  const key = normalizePhoneDigits(phone);
  if (!key || key.length < 10) return null;
  return key;
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
