import { collection, doc, getDoc, getDocs, limit, query, where } from 'firebase/firestore';
import type { Company, Reservation } from '../types';
import { db } from '../firebase';
import { ensureFirestoreAuth } from './firebaseAuth';
import { normalizeDocsArray } from '../utils/reservationNormalize';

export async function fetchCompanyById(companyId: string): Promise<Company | null> {
  const id = companyId.trim();
  if (!id) return null;
  const snap = await getDoc(doc(db, 'companies', id));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as Company;
}

/** `receiptCode` 또는 Firestore 문서 ID로 예약 조회 */
export async function fetchReservationByLookupCode(code: string): Promise<Reservation | null> {
  const lookup = code.trim();
  if (!lookup) return null;

  await ensureFirestoreAuth();

  const direct = await getDoc(doc(db, 'reservations', lookup));
  if (direct.exists()) {
    const normalized = normalizeDocsArray([{ id: direct.id, ...direct.data() }]);
    return normalized[0] ?? null;
  }

  const q = query(
    collection(db, 'reservations'),
    where('receiptCode', '==', lookup),
    limit(1)
  );
  const snap = await getDocs(q);
  if (snap.empty) return null;

  const normalized = normalizeDocsArray(
    snap.docs.map((d) => ({ id: d.id, ...d.data() }))
  );
  return normalized[0] ?? null;
}
