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

function normalizeCarNumber(raw: string): string {
  return String(raw || '').trim().replace(/\s+/g, '');
}

function carNumberTailOf(raw: string): string | null {
  const digits = normalizeCarNumber(raw).replace(/\D/g, '');
  if (digits.length < 4) return null;
  return digits.slice(-4);
}

async function addReservationSnap(
  byId: Map<string, Reservation>,
  field: 'carNumberTail' | 'carNumber',
  value: string
): Promise<void> {
  const q = query(collection(db, 'reservations'), where(field, '==', value));
  const snap = await getDocs(q);
  for (const d of snap.docs) {
    const [row] = normalizeDocsArray([{ id: d.id, ...d.data() }]);
    if (row?.id) byId.set(row.id, row);
  }
}

async function fetchReservationsByCar(raw: string): Promise<Reservation[]> {
  const byId = new Map<string, Reservation>();
  const compact = normalizeCarNumber(raw);
  const tail = carNumberTailOf(raw);
  const isSuffixOnly = /^\d{4}$/.test(compact);

  if (isSuffixOnly && tail) {
    await addReservationSnap(byId, 'carNumberTail', tail);
    await addReservationSnap(byId, 'carNumber', compact);
  } else {
    if (compact) await addReservationSnap(byId, 'carNumber', compact);
    if (raw.trim() && raw.trim() !== compact) {
      await addReservationSnap(byId, 'carNumber', raw.trim());
    }
    if (tail) await addReservationSnap(byId, 'carNumberTail', tail);
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

/** 차량번호 전체 또는 끝 4자리로 예약 조회 */
export async function lookupCustomerByCar(
  rawCar: string
): Promise<HqCustomerLookupResult> {
  await ensurePlatformAdminAuth();

  const compact = normalizeCarNumber(rawCar);
  const tail = carNumberTailOf(rawCar);
  if (!compact || (!tail && compact.length < 4)) {
    throw new Error('차량번호 전체 또는 숫자 끝 4자리를 입력해 주세요. (예: 31소3456 / 3456)');
  }

  const reservations = await fetchReservationsByCar(rawCar);
  const label = tail ? `차량 ·${tail}` : `차량 ${compact}`;
  if (reservations.length === 0) {
    return {
      phoneKey: '',
      phoneDisplay: label,
      customer: null,
      reservations: [],
    };
  }

  const firstPhone = normalizePhoneDigits(String(reservations[0]?.phone || ''));
  if (firstPhone.length >= 10 && firstPhone.startsWith('01')) {
    try {
      const byPhone = await lookupCustomerByPhone(firstPhone);
      const merged = new Map<string, Reservation>();
      for (const r of [...byPhone.reservations, ...reservations]) {
        if (r?.id) merged.set(r.id, r);
      }
      return {
        ...byPhone,
        reservations: Array.from(merged.values())
          .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
          .slice(0, 50),
      };
    } catch {
      /* 전화 조회 실패 시 차량 결과만 */
    }
  }

  return {
    phoneKey: firstPhone,
    phoneDisplay: firstPhone ? formatPhoneDisplay(firstPhone) : label,
    customer: null,
    reservations: reservations.slice(0, 50),
  };
}

/** 전화(01…)면 전화, 아니면 차량번호 */
export async function lookupHqCustomer(raw: string): Promise<HqCustomerLookupResult> {
  const trimmed = String(raw || '').trim();
  const phoneDigits = normalizePhoneDigits(trimmed);
  if (phoneDigits.length >= 10 && phoneDigits.startsWith('01')) {
    return lookupCustomerByPhone(trimmed);
  }
  return lookupCustomerByCar(trimmed);
}
