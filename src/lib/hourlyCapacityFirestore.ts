import {
  collection,
  getDocs,
  query,
  where,
  type Firestore,
} from 'firebase/firestore';
import { db } from '../firebase';
import {
  evaluateHourlyCapacity,
  isHourlyCapActive,
  parseDepartureHour,
  reservationInHourBucket,
  type HourlyCapCompany,
  type HourlyCapacityResult,
} from '../utils/hourlyCapacity';
import { expandCompanyIdsForFirestoreQuery } from '../utils/reservationQuery';
import { normalizeDateString } from '../utils/reservationNormalize';
import { ensureFirestoreAuth } from './firebaseAuth';

async function fetchDayReservations(
  firestore: Firestore,
  companyId: string,
  departureDate: string
): Promise<Array<{ departureDate?: string; departureTime?: string; status?: string }>> {
  const date = normalizeDateString(departureDate);
  if (!date) return [];

  const ids = expandCompanyIdsForFirestoreQuery([companyId]);
  if (!ids.length) return [];

  const base = collection(firestore, 'reservations');
  const snaps = await Promise.all(
    ids.length === 1
      ? [getDocs(query(base, where('companyId', '==', ids[0]), where('departureDate', '==', date)))]
      : [
          // Firestore `in` 최대 10 — 와와 별칭은 소수
          getDocs(
            query(base, where('companyId', 'in', ids.slice(0, 10)), where('departureDate', '==', date))
          ),
        ]
  );

  const byId = new Map<string, { departureDate?: string; departureTime?: string; status?: string }>();
  for (const snap of snaps) {
    for (const d of snap.docs) {
      byId.set(d.id, d.data() as { departureDate?: string; departureTime?: string; status?: string });
    }
  }
  return Array.from(byId.values());
}

export async function countReservationsInDepartureHour(
  companyId: string,
  departureDate: string,
  departureTime: string,
  firestore: Firestore = db
): Promise<{ count: number; hour: number | null }> {
  const hour = parseDepartureHour(departureTime);
  if (hour === null) return { count: 0, hour: null };

  await ensureFirestoreAuth();
  const rows = await fetchDayReservations(firestore, companyId, departureDate);
  const count = rows.filter((r) => reservationInHourBucket(r, departureDate, hour)).length;
  return { count, hour };
}

export async function checkHourlyCapacityForBooking(
  company: HourlyCapCompany & { id?: string },
  companyId: string,
  departureDate: string,
  departureTime: string,
  firestore: Firestore = db
): Promise<HourlyCapacityResult> {
  if (!isHourlyCapActive(company)) {
    return evaluateHourlyCapacity({
      company,
      departureDate,
      departureTime,
      existingCount: 0,
    });
  }

  const { count } = await countReservationsInDepartureHour(
    companyId,
    departureDate,
    departureTime,
    firestore
  );

  return evaluateHourlyCapacity({
    company,
    departureDate,
    departureTime,
    existingCount: count,
  });
}

/** 한도 초과 시 Error throw */
export async function assertHourlyCapacityAvailable(
  company: HourlyCapCompany & { id?: string },
  companyId: string,
  departureDate: string,
  departureTime: string,
  firestore: Firestore = db
): Promise<HourlyCapacityResult> {
  const result = await checkHourlyCapacityForBooking(
    company,
    companyId,
    departureDate,
    departureTime,
    firestore
  );
  if (!result.ok) {
    throw new Error(result.message);
  }
  return result;
}
