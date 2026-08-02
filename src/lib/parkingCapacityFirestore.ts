import {
  collection,
  getDocs,
  query,
  where,
  type Firestore,
} from 'firebase/firestore';
import { db } from '../firebase';
import {
  evaluateParkingCapacity,
  isParkingCapActive,
  type ParkingCapCompany,
  type ParkingCapReservation,
  type ParkingCapacityResult,
} from '../utils/parkingCapacity';
import { expandCompanyIdsForFirestoreQuery } from '../utils/reservationQuery';
import { normalizeDateString } from '../utils/reservationNormalize';
import { ensureFirestoreAuth } from './firebaseAuth';

async function fetchOverlappingReservations(
  firestore: Firestore,
  companyId: string,
  rangeStart: string,
  rangeEnd: string
): Promise<ParkingCapReservation[]> {
  const start = normalizeDateString(rangeStart);
  const end = normalizeDateString(rangeEnd) || start;
  if (!start) return [];

  const ids = expandCompanyIdsForFirestoreQuery([companyId]);
  if (!ids.length) return [];

  const base = collection(firestore, 'reservations');
  // departureDate <= rangeEnd 인 후보만 가져온 뒤, arrivalDate >= rangeStart 로 필터
  const snaps = await Promise.all(
    ids.length === 1
      ? [
          getDocs(
            query(base, where('companyId', '==', ids[0]), where('departureDate', '<=', end))
          ),
        ]
      : [
          getDocs(
            query(
              base,
              where('companyId', 'in', ids.slice(0, 10)),
              where('departureDate', '<=', end)
            )
          ),
        ]
  );

  const byId = new Map<string, ParkingCapReservation>();
  for (const snap of snaps) {
    for (const d of snap.docs) {
      const row = d.data() as ParkingCapReservation;
      const arr = normalizeDateString(row.arrivalDate) || normalizeDateString(row.departureDate);
      const dep = normalizeDateString(row.departureDate);
      if (!dep || !arr) continue;
      if (arr < start) continue;
      byId.set(d.id, row);
    }
  }
  return Array.from(byId.values());
}

export async function checkParkingCapacityForBooking(
  company: ParkingCapCompany & { id?: string },
  companyId: string,
  departureDate: string,
  arrivalDate: string,
  firestore: Firestore = db
): Promise<ParkingCapacityResult> {
  if (!isParkingCapActive(company)) {
    return evaluateParkingCapacity({
      company,
      departureDate,
      arrivalDate,
      existingReservations: [],
    });
  }

  await ensureFirestoreAuth();
  const existing = await fetchOverlappingReservations(
    firestore,
    companyId,
    departureDate,
    arrivalDate
  );

  return evaluateParkingCapacity({
    company,
    departureDate,
    arrivalDate,
    existingReservations: existing,
    countingIncludesCandidate: false,
  });
}

export async function assertParkingCapacityAvailable(
  company: ParkingCapCompany & { id?: string },
  companyId: string,
  departureDate: string,
  arrivalDate: string,
  firestore: Firestore = db
): Promise<ParkingCapacityResult> {
  const result = await checkParkingCapacityForBooking(
    company,
    companyId,
    departureDate,
    arrivalDate,
    firestore
  );
  if (result.ok === false) {
    throw new Error(result.message);
  }
  return result;
}
