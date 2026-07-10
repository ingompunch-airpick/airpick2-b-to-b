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

async function queryReservationByField(
  field: 'receiptCode' | 'receiptToken',
  value: string
): Promise<Reservation | null> {
  const snap = await getDocs(
    query(collection(db, 'reservations'), where(field, '==', value), limit(1))
  );
  if (snap.empty) return null;
  const normalized = normalizeDocsArray(
    snap.docs.map((d) => ({ id: d.id, ...d.data() }))
  );
  return normalized[0] ?? null;
}

/** 문서 ID · `receiptCode` · `receiptToken`(홈페이지) 로 예약 조회 */
export async function fetchReservationByLookupCode(code: string): Promise<Reservation | null> {
  const lookup = code.trim();
  if (!lookup) return null;

  await ensureFirestoreAuth();

  const direct = await getDoc(doc(db, 'reservations', lookup));
  if (direct.exists()) {
    const normalized = normalizeDocsArray([{ id: direct.id, ...direct.data() }]);
    return normalized[0] ?? null;
  }

  const byReceiptCode = await queryReservationByField('receiptCode', lookup);
  if (byReceiptCode) return byReceiptCode;

  return queryReservationByField('receiptToken', lookup);
}
