import * as admin from 'firebase-admin';

export const SOLD_OUT = 'SOLD_OUT' as const;

export type ParkingType = 'indoor' | 'outdoor';

export class SoldOutError extends Error {
  readonly code = SOLD_OUT;
  constructor(message = '만차입니다') {
    super(message);
    this.name = 'SoldOutError';
  }
}

type CapCompany = {
  parkingCapEnabled?: boolean;
  maxParkedCars?: number;
  maxParkedCarsIndoor?: number;
  maxParkedCarsOutdoor?: number;
};

const COLLECTION = 'parkingSlots';

function normalizeMaxParkedCars(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(999, Math.floor(n)));
}

export function isParkingCapActive(company: CapCompany | undefined): boolean {
  if (!company || company.parkingCapEnabled !== true) return false;
  return (
    normalizeMaxParkedCars(company.maxParkedCars) > 0 ||
    normalizeMaxParkedCars(company.maxParkedCarsIndoor) > 0 ||
    normalizeMaxParkedCars(company.maxParkedCarsOutdoor) > 0
  );
}

function usesSplitCap(company: CapCompany): boolean {
  return (
    normalizeMaxParkedCars(company.maxParkedCarsIndoor) > 0 ||
    normalizeMaxParkedCars(company.maxParkedCarsOutdoor) > 0
  );
}

export function capacityForParkingType(company: CapCompany, parkingType: ParkingType): number {
  if (usesSplitCap(company)) {
    return normalizeMaxParkedCars(
      parkingType === 'indoor' ? company.maxParkedCarsIndoor : company.maxParkedCarsOutdoor
    );
  }
  return normalizeMaxParkedCars(company.maxParkedCars);
}

export function parkingTypeFromIndoor(isIndoor: unknown): ParkingType {
  return isIndoor === false ? 'outdoor' : 'indoor';
}

export function normalizeYmd(value: unknown): string {
  const s = String(value || '').trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return '';
}

function shiftYmd(ymd: string, deltaDays: number): string {
  const [y, m, d] = ymd.split('-').map((n) => parseInt(n, 10));
  if (!y || !m || !d) return ymd;
  const next = new Date(Date.UTC(y, m - 1, d + deltaDays));
  return next.toISOString().slice(0, 10);
}

export function eachYmdInclusive(start: string, end: string): string[] {
  if (!start) return [];
  const last = end && end >= start ? end : start;
  const out: string[] = [];
  let cur = start;
  for (let i = 0; i < 400 && cur <= last; i++) {
    out.push(cur);
    if (cur === last) break;
    cur = shiftYmd(cur, 1);
  }
  return out;
}

/** partner_id + date + parking_type */
export function parkingSlotDocId(
  partnerId: string,
  date: string,
  parkingType: ParkingType
): string {
  return `${partnerId.trim()}__${date}__${parkingType}`;
}

export function stayDatesFromReservation(data: FirebaseFirestore.DocumentData): string[] {
  const start =
    normalizeYmd(data.departureDate) || normalizeYmd(data.entryDate);
  if (!start) return [];
  const end =
    normalizeYmd(data.arrivalDate) ||
    normalizeYmd(data.exitDate) ||
    normalizeYmd(data.endDate) ||
    start;
  return eachYmdInclusive(start, end);
}

function seedBookedFromOccupancy(
  occupancy: FirebaseFirestore.DocumentData | undefined,
  date: string,
  parkingType: ParkingType,
  split: boolean
): number {
  const cell = (occupancy?.days || {})[date] as
    | { indoor?: number; outdoor?: number }
    | undefined;
  if (!cell) return 0;
  const indoor = Math.max(0, Math.floor(Number(cell.indoor) || 0));
  const outdoor = Math.max(0, Math.floor(Number(cell.outdoor) || 0));
  if (split) return parkingType === 'indoor' ? indoor : outdoor;
  return indoor + outdoor;
}

export type SlotClaimPlan = {
  partnerId: string;
  parkingType: ParkingType;
  capacity: number;
  dates: string[];
  holdIds: string[];
  split: boolean;
};

export function buildSlotClaimPlan(
  partnerId: string,
  data: FirebaseFirestore.DocumentData,
  company: CapCompany
): SlotClaimPlan | null {
  if (!isParkingCapActive(company)) return null;
  const id = partnerId.trim();
  if (!id) return null;
  const split = usesSplitCap(company);
  // 통합 한도(split 아님)면 실내·야외가 같은 카운터를 씀 → indoor 키로 통일
  const parkingType: ParkingType = split
    ? parkingTypeFromIndoor(data.isIndoor)
    : 'indoor';
  const capacity = capacityForParkingType(company, parkingTypeFromIndoor(data.isIndoor));
  if (capacity <= 0) return null;
  const dates = stayDatesFromReservation(data);
  if (!dates.length) return null;
  return {
    partnerId: id,
    parkingType,
    capacity,
    dates,
    holdIds: dates.map((d) => parkingSlotDocId(id, d, parkingType)),
    split,
  };
}

/**
 * 트랜잭션 안에서 슬롯 차감. booked < capacity 일 때만 +1.
 * 불충족 시 SoldOutError.
 */
export async function claimParkingSlotsInTx(
  tx: FirebaseFirestore.Transaction,
  db: FirebaseFirestore.Firestore,
  plan: SlotClaimPlan
): Promise<void> {
  const occRef = db.collection('parkingOccupancy').doc(plan.partnerId);
  const occSnap = await tx.get(occRef);
  const occupancy = occSnap.exists ? occSnap.data() : undefined;

  const snaps = await Promise.all(
    plan.holdIds.map((holdId) => tx.get(db.collection(COLLECTION).doc(holdId)))
  );

  for (let i = 0; i < plan.holdIds.length; i++) {
    const holdId = plan.holdIds[i];
    const date = plan.dates[i];
    const snap = snaps[i];
    const booked = snap.exists
      ? Math.max(0, Math.floor(Number(snap.data()?.booked) || 0))
      : seedBookedFromOccupancy(occupancy, date, plan.parkingType, plan.split);

    if (!(booked < plan.capacity)) {
      throw new SoldOutError();
    }

    tx.set(
      db.collection(COLLECTION).doc(holdId),
      {
        partnerId: plan.partnerId,
        date,
        parkingType: plan.parkingType,
        booked: booked + 1,
        capacity: plan.capacity,
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );
  }
}

export function holdIdsFromReservation(
  data: FirebaseFirestore.DocumentData | undefined
): string[] {
  if (!data) return [];
  const raw = data.parkingSlotHolds;
  if (Array.isArray(raw)) {
    return raw.map((v) => String(v || '').trim()).filter(Boolean);
  }
  return [];
}

/**
 * 예약 생성 + 정원 차감을 한 트랜잭션으로.
 * 정원 미사용 업체는 예약만 생성.
 */
export async function createReservationWithCapacity(args: {
  reservationId: string;
  payload: Record<string, unknown>;
}): Promise<{ id: string; parkingSlotHolds: string[] }> {
  const db = admin.firestore();
  const companyId = String(args.payload.companyId || '').trim();
  if (!companyId) {
    throw new Error('missing_company_id');
  }

  const companySnap = await db.collection('companies').doc(companyId).get();
  const company = (companySnap.data() || {}) as CapCompany;
  const plan = buildSlotClaimPlan(companyId, args.payload, company);

  const reservationRef = db.collection('reservations').doc(args.reservationId);

  await db.runTransaction(async (tx) => {
    const existing = await tx.get(reservationRef);
    if (existing.exists) {
      throw new Error('reservation_already_exists');
    }

    if (plan) {
      await claimParkingSlotsInTx(tx, db, plan);
    }

    const body: Record<string, unknown> = { ...args.payload };
    if (plan) {
      body.parkingSlotHolds = plan.holdIds;
      body.parkingSlotsClaimed = true;
    }
    // Firestore 거부 방지
    for (const key of Object.keys(body)) {
      if (body[key] === undefined) delete body[key];
    }
    tx.set(reservationRef, body);
  });

  return {
    id: args.reservationId,
    parkingSlotHolds: plan?.holdIds ?? [],
  };
}

export function resolveHoldIdsForRelease(
  data: FirebaseFirestore.DocumentData
): string[] {
  const holds = holdIdsFromReservation(data);
  if (holds.length) return holds;
  if (data.parkingSlotsClaimed !== true) return [];
  const companyId = String(data.companyId || '').trim();
  if (!companyId) return [];
  const parkingType = parkingTypeFromIndoor(data.isIndoor);
  return stayDatesFromReservation(data).map((d) =>
    parkingSlotDocId(companyId, d, parkingType)
  );
}

/**
 * 슬롯 복구용 스냅샷을 먼저 읽는다 (트랜잭션: 모든 get 후 set/update).
 * 호출측에서 reservation get 직후·아무 write 전에 호출할 것.
 */
export async function readSlotsForReleaseInTx(
  tx: FirebaseFirestore.Transaction,
  db: FirebaseFirestore.Firestore,
  data: FirebaseFirestore.DocumentData
): Promise<{ holdIds: string[]; snaps: FirebaseFirestore.DocumentSnapshot[] } | null> {
  if (data.parkingSlotsReleased === true) return null;
  const holdIds = resolveHoldIdsForRelease(data);
  if (!holdIds.length) return null;
  const unique = [...new Set(holdIds)];
  const snaps = await Promise.all(
    unique.map((id) => tx.get(db.collection(COLLECTION).doc(id)))
  );
  return { holdIds: unique, snaps };
}

/** readSlotsForReleaseInTx 결과로 슬롯 -1 및 예약 released 마킹 */
export function applySlotReleaseInTx(
  tx: FirebaseFirestore.Transaction,
  reservationRef: FirebaseFirestore.DocumentReference,
  prepared: { holdIds: string[]; snaps: FirebaseFirestore.DocumentSnapshot[] }
): void {
  for (const snap of prepared.snaps) {
    if (!snap.exists) continue;
    const row = snap.data() || {};
    const booked = Math.max(0, Math.floor(Number(row.booked) || 0));
    tx.set(
      snap.ref,
      {
        ...row,
        booked: Math.max(0, booked - 1),
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );
  }
  tx.update(reservationRef, {
    parkingSlotsReleased: true,
    parkingSlotHolds: admin.firestore.FieldValue.delete(),
  });
}

/**
 * 취소·출고완료 시 정원 복구 (한 번만).
 * 예약 문서의 parkingSlotHolds 를 비우고 parkingSlotsReleased 를 표시한다.
 */
export async function releaseReservationParkingSlots(
  reservationId: string,
  data: FirebaseFirestore.DocumentData
): Promise<boolean> {
  if (data.parkingSlotsReleased === true) return false;
  if (!resolveHoldIdsForRelease(data).length) return false;

  const db = admin.firestore();
  const ref = db.collection('reservations').doc(reservationId);
  let released = false;

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return;
    const prepared = await readSlotsForReleaseInTx(tx, db, snap.data() || {});
    if (!prepared) return;
    applySlotReleaseInTx(tx, ref, prepared);
    released = true;
  });

  return released;
}

/** 테스트·동시성 시뮬레이션용 순수 차감 */
export function tryClaimBooked(booked: number, capacity: number): number | typeof SOLD_OUT {
  if (!(booked < capacity)) return SOLD_OUT;
  return booked + 1;
}
