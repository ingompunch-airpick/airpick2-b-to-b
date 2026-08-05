import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
} from 'firebase/firestore';
import { db } from '../firebase';
import { ensurePlatformAdminAuth } from './firebaseAuth';
import type { CustomerVisitDoc } from './customerVisit';
import type { Reservation } from '../types';
import { formatPhoneDisplay, normalizePhoneDigits } from '../utils/phone';
import { normalizeDocsArray } from '../utils/reservationNormalize';

export type HqCustomerLookupResult = {
  phoneKey: string;
  phoneDisplay: string;
  customer: CustomerVisitDoc | null;
  reservations: Reservation[];
};

function phoneVariants(phoneKey: string): string[] {
  const display = formatPhoneDisplay(phoneKey);
  const set = new Set<string>([phoneKey, display]);
  if (phoneKey.length === 11) {
    set.add(`${phoneKey.slice(0, 3)}-${phoneKey.slice(3, 7)}-${phoneKey.slice(7)}`);
  }
  return Array.from(set).filter(Boolean);
}

async function fetchReservationsByPhone(phoneKey: string): Promise<Reservation[]> {
  const variants = phoneVariants(phoneKey);
  const byId = new Map<string, Reservation>();

  // Firestore `in` 최대 10개 — 변형은 보통 2~3개
  const q = query(
    collection(db, 'reservations'),
    where('phone', 'in', variants.slice(0, 10))
  );
  const snap = await getDocs(q);
  for (const d of snap.docs) {
    const [row] = normalizeDocsArray([{ id: d.id, ...d.data() }]);
    if (row?.id) byId.set(row.id, row);
  }

  return Array.from(byId.values()).sort((a, b) =>
    String(b.createdAt || '').localeCompare(String(a.createdAt || ''))
  );
}

export async function lookupCustomerByPhone(
  rawPhone: string
): Promise<HqCustomerLookupResult> {
  await ensurePlatformAdminAuth();

  const phoneKey = normalizePhoneDigits(rawPhone);
  if (!phoneKey || phoneKey.length < 10 || !phoneKey.startsWith('01')) {
    throw new Error('휴대폰 번호를 확인해 주세요. (예: 01012345678)');
  }

  const customerSnap = await getDoc(doc(db, 'customers', phoneKey));
  const customer = customerSnap.exists()
    ? ({ ...(customerSnap.data() as CustomerVisitDoc), phoneKey } as CustomerVisitDoc)
    : null;

  let reservations = await fetchReservationsByPhone(phoneKey);

  const lastId = String(customer?.lastReservationId || '').trim();
  if (lastId && !reservations.some((r) => r.id === lastId)) {
    const lastSnap = await getDoc(doc(db, 'reservations', lastId));
    if (lastSnap.exists()) {
      const [row] = normalizeDocsArray([{ id: lastSnap.id, ...lastSnap.data() }]);
      if (row) reservations = [row, ...reservations];
    }
  }

  return {
    phoneKey,
    phoneDisplay: customer?.phoneDisplay || formatPhoneDisplay(phoneKey),
    customer,
    reservations: reservations.slice(0, 50),
  };
}
