import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  type Firestore,
} from 'firebase/firestore';
import { db } from '../firebase';
import {
  evaluateParkingCapacity,
  evaluateParkingCapacityFromDailyCounts,
  isParkingCapActive,
  usesSplitParkingCap,
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

type OccupancyCell = { indoor?: number; outdoor?: number };

/** 집계 문서가 하나도 없으면 null. 그러면 예전 목록 조회로 넘어간다. */
async function readOccupancyDays(
  firestore: Firestore,
  companyId: string
): Promise<Record<string, OccupancyCell> | null> {
  const ids = expandCompanyIdsForFirestoreQuery([companyId]);
  if (!ids.length) return null;
  const snaps = await Promise.all(
    ids.map((id) => getDoc(doc(firestore, 'parkingOccupancy', id)))
  );
  if (snaps.every((snap) => !snap.exists())) return null;
  const days: Record<string, OccupancyCell> = {};
  for (const snap of snaps) {
    if (!snap.exists()) continue;
    const raw = (snap.data().days || {}) as Record<string, OccupancyCell>;
    for (const [day, cell] of Object.entries(raw)) {
      const prev = days[day] || { indoor: 0, outdoor: 0 };
      days[day] = {
        indoor: (prev.indoor || 0) + Number(cell?.indoor || 0),
        outdoor: (prev.outdoor || 0) + Number(cell?.outdoor || 0),
      };
    }
  }
  return days;
}

function usedByDayForSide(
  days: Record<string, OccupancyCell>,
  company: ParkingCapCompany,
  isIndoor: boolean
): Record<string, number> {
  const split = usesSplitParkingCap(company);
  const used: Record<string, number> = {};
  for (const [day, cell] of Object.entries(days)) {
    const indoor = Number(cell.indoor || 0);
    const outdoor = Number(cell.outdoor || 0);
    used[day] = split ? (isIndoor ? indoor : outdoor) : indoor + outdoor;
  }
  return used;
}

export async function checkParkingCapacityForBooking(
  company: ParkingCapCompany & { id?: string },
  companyId: string,
  departureDate: string,
  arrivalDate: string,
  firestore: Firestore = db,
  isIndoor = true
): Promise<ParkingCapacityResult> {
  if (!isParkingCapActive(company)) {
    return evaluateParkingCapacity({
      company,
      departureDate,
      arrivalDate,
      existingReservations: [],
      isIndoor,
    });
  }

  await ensureFirestoreAuth();
  try {
    const days = await readOccupancyDays(firestore, companyId);
    if (days) {
      return evaluateParkingCapacityFromDailyCounts({
        company,
        departureDate,
        arrivalDate,
        isIndoor,
        usedByDay: usedByDayForSide(days, company, isIndoor),
        countingIncludesCandidate: false,
      });
    }
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code;
    if (code !== 'permission-denied') throw err;
  }

  let existing: ParkingCapReservation[] = [];
  try {
    existing = await fetchOverlappingReservations(
      firestore,
      companyId,
      departureDate,
      arrivalDate
    );
  } catch (err: unknown) {
    // list 조임 후 손님(/h/)·익명은 예약 목록을 못 읽음 → 서버 enforceParkingCapacityOnCreate 에 맡김
    const code = (err as { code?: string })?.code;
    if (code === 'permission-denied') {
      return evaluateParkingCapacity({
        company,
        departureDate,
        arrivalDate,
        existingReservations: [],
        isIndoor,
        countingIncludesCandidate: false,
      });
    }
    throw err;
  }

  return evaluateParkingCapacity({
    company,
    departureDate,
    arrivalDate,
    existingReservations: existing,
    isIndoor,
    countingIncludesCandidate: false,
  });
}

export async function assertParkingCapacityAvailable(
  company: ParkingCapCompany & { id?: string },
  companyId: string,
  departureDate: string,
  arrivalDate: string,
  firestore: Firestore = db,
  isIndoor = true
): Promise<ParkingCapacityResult> {
  const result = await checkParkingCapacityForBooking(
    company,
    companyId,
    departureDate,
    arrivalDate,
    firestore,
    isIndoor
  );
  if (result.ok === false) {
    throw new Error(result.message);
  }
  return result;
}
