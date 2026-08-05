import { doc, getDoc } from 'firebase/firestore';
import type { Company, Reservation } from '../types';
import { db } from '../firebase';
import { ensureFirestoreAuth } from './firebaseAuth';
import { normalizeDocsArray } from '../utils/reservationNormalize';

const RECEIPT_API =
  'https://asia-northeast3-airpick-reservation.cloudfunctions.net/getReceipt';

export async function fetchCompanyById(companyId: string): Promise<Company | null> {
  const id = companyId.trim();
  if (!id) return null;
  const snap = await getDoc(doc(db, 'companies', id));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as Company;
}

function dtoToReservation(data: Record<string, unknown>): Reservation {
  const id = String(data.id || '');
  return normalizeDocsArray([
    {
      id,
      companyId: data.companyId,
      companyName: data.companyName,
      userName: data.userName,
      carModel: data.carModel,
      carNumber: data.carNumber,
      phone: data.phone,
      departureDate: data.departureDate,
      departureTime: data.departureTime,
      arrivalDate: data.arrivalDate,
      arrivalTime: data.arrivalTime,
      departureTerminal: data.departureTerminal,
      arrivalTerminal: data.arrivalTerminal,
      destination: data.destination,
      departureAirline: data.departureAirline,
      departureFlight: data.departureFlight,
      arrivalAirline: data.arrivalAirline,
      arrivalFlight: data.arrivalFlight,
      totalPrice: data.totalPrice,
      isIndoor: data.isIndoor,
      createdAt: data.createdAt,
      status: data.status,
      createdBy: data.createdBy,
      receiptCode: data.receiptCode,
      paymentMethod: data.paymentMethod,
      airport: data.airport,
    },
  ])[0];
}

async function fetchViaReceiptApi(code: string): Promise<Reservation | null> {
  const qs = new URLSearchParams({ t: code });
  try {
    const res = await fetch(`${RECEIPT_API}?${qs.toString()}`);
    if (!res.ok) return null;
    const data = (await res.json()) as Record<string, unknown>;
    if (!data?.id) return null;
    return dtoToReservation(data);
  } catch {
    return null;
  }
}

/**
 * 문서 ID는 단건 get, 토큰·단축코드·receiptCode 는 Cloud Function(getReceipt).
 * 예약 list 쿼리는 Rules 에서 막히므로 클라이언트 where 조회를 쓰지 않는다.
 */
export async function fetchReservationByLookupCode(code: string): Promise<Reservation | null> {
  const lookup = code.trim();
  if (!lookup) return null;

  await ensureFirestoreAuth();

  const direct = await getDoc(doc(db, 'reservations', lookup));
  if (direct.exists()) {
    const normalized = normalizeDocsArray([{ id: direct.id, ...direct.data() }]);
    return normalized[0] ?? null;
  }

  return fetchViaReceiptApi(lookup);
}
