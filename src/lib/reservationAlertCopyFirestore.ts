import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { ensureFirestoreAuth, ensurePlatformAdminAuth } from './firebaseAuth';
import {
  RESERVATION_ALERTS_COLLECTION,
  RESERVATION_ALERTS_DOC_ID,
  coerceReservationAlertCopy,
  type ReservationAlertCopy,
} from '../utils/reservationAlertCopy';

let cached: ReservationAlertCopy | null = null;
let cacheAt = 0;
const CACHE_MS = 60_000;

function alertsDocRef() {
  return doc(db, RESERVATION_ALERTS_COLLECTION, RESERVATION_ALERTS_DOC_ID);
}

export async function fetchReservationAlertCopy(opts?: {
  force?: boolean;
}): Promise<ReservationAlertCopy> {
  if (!opts?.force && cached && Date.now() - cacheAt < CACHE_MS) {
    return cached;
  }
  await ensureFirestoreAuth();
  const snap = await getDoc(alertsDocRef());
  const next = coerceReservationAlertCopy(
    snap.exists() ? (snap.data() as Partial<ReservationAlertCopy>) : null
  );
  cached = next;
  cacheAt = Date.now();
  return next;
}

export function peekReservationAlertCopyCache(): ReservationAlertCopy | null {
  return cached;
}

export async function saveReservationAlertCopy(
  input: ReservationAlertCopy
): Promise<ReservationAlertCopy> {
  await ensurePlatformAdminAuth();
  const next = coerceReservationAlertCopy(input);
  await setDoc(
    alertsDocRef(),
    {
      ...next,
      updatedAt: new Date().toISOString(),
    },
    { merge: true }
  );
  cached = next;
  cacheAt = Date.now();
  return next;
}
