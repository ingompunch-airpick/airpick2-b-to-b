import { doc, getDoc, type Firestore } from 'firebase/firestore';
import { db } from '../firebase';
import {
  evaluateHourlyCapacity,
  isHourlyCapActive,
  parseDepartureHour,
  type HourlyCapCompany,
  type HourlyCapacityResult,
} from '../utils/hourlyCapacity';
import { expandCompanyIdsForFirestoreQuery } from '../utils/reservationQuery';
import { normalizeDateString } from '../utils/reservationNormalize';

/**
 * capacity/{companyId}__{날짜} — 시간대별 대수만.
 * 예약 목록을 읽지 않는다 (Rules list 조임 대비 · 손님 PII 노출 방지).
 */
async function fetchCapacityHours(
  firestore: Firestore,
  companyId: string,
  date: string
): Promise<Record<string, number>> {
  const ids = expandCompanyIdsForFirestoreQuery([companyId]);
  if (!ids.length) return {};

  const snaps = await Promise.all(
    ids.map((id) => getDoc(doc(firestore, 'capacity', `${id}__${date}`)))
  );

  const merged: Record<string, number> = {};
  for (const snap of snaps) {
    if (!snap.exists()) continue;
    const hours = (snap.data() as { hours?: Record<string, unknown> }).hours ?? {};
    for (const [key, value] of Object.entries(hours)) {
      const n = Number(value);
      if (!Number.isFinite(n)) continue;
      merged[key] = (merged[key] ?? 0) + n;
    }
  }
  return merged;
}

export async function countReservationsInDepartureHour(
  companyId: string,
  departureDate: string,
  departureTime: string,
  firestore: Firestore = db
): Promise<{ count: number; hour: number | null }> {
  const hour = parseDepartureHour(departureTime);
  if (hour === null) return { count: 0, hour: null };

  const date = normalizeDateString(departureDate);
  if (!date) return { count: 0, hour };

  const hours = await fetchCapacityHours(firestore, companyId, date);
  return { count: Number(hours[String(hour)] ?? 0), hour };
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
  if (result.ok === false) {
    throw new Error(result.message);
  }
  return result;
}
