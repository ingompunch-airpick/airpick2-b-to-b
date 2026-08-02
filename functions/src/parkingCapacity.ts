import * as admin from 'firebase-admin';

const WAWA_ALIASES = ['wawa', 'wawa_valet', '와와', '와와발렛'];

type CapCompany = {
  parkingCapEnabled?: boolean;
  maxParkedCars?: number;
};

function normalizeMaxParkedCars(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(999, Math.floor(n)));
}

function isParkingCapActive(company: CapCompany | undefined): boolean {
  if (!company || company.parkingCapEnabled !== true) return false;
  return normalizeMaxParkedCars(company.maxParkedCars) > 0;
}

function expandCompanyIds(companyId: string): string[] {
  const norm = (companyId || '').trim().toLowerCase();
  if (norm === 'wawa' || norm === 'wawa_valet') return [...WAWA_ALIASES];
  return companyId.trim() ? [companyId.trim()] : [];
}

function normalizeYmd(value: unknown): string {
  const s = String(value || '').trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return '';
}

function statusOccupies(status: unknown): boolean {
  const s = String(status || '')
    .trim()
    .toLowerCase();
  if (!s) return true;
  if (s === 'cancelled' || s === '취소') return false;
  if (
    s === 'completed_out' ||
    s === '출차완료' ||
    s === '인도완료' ||
    s === '출고완료'
  ) {
    return false;
  }
  return true;
}

function shiftYmd(ymd: string, deltaDays: number): string {
  const [y, m, d] = ymd.split('-').map((n) => parseInt(n, 10));
  if (!y || !m || !d) return ymd;
  const next = new Date(Date.UTC(y, m - 1, d + deltaDays));
  return next.toISOString().slice(0, 10);
}

function eachYmdInclusive(start: string, end: string): string[] {
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

function occupiesDay(
  row: FirebaseFirestore.DocumentData,
  day: string
): boolean {
  if (!statusOccupies(row.status)) return false;
  const dep = normalizeYmd(row.departureDate) || normalizeYmd(row.entryDate);
  if (!dep) return false;
  const arr =
    normalizeYmd(row.arrivalDate) ||
    normalizeYmd(row.exitDate) ||
    normalizeYmd(row.endDate) ||
    dep;
  const end = arr >= dep ? arr : dep;
  return dep <= day && day <= end;
}

/**
 * 신규 예약이 동시 주차 한도(만차)를 넘으면 즉시 취소.
 * 점유: 입고일~출고일, 취소·출고완료 제외.
 */
export async function enforceParkingCapacityOnCreate(
  reservationId: string,
  data: FirebaseFirestore.DocumentData
): Promise<boolean> {
  const companyId = String(data.companyId || '').trim();
  const departureDate =
    normalizeYmd(data.departureDate) || normalizeYmd(data.entryDate);
  const arrivalDate =
    normalizeYmd(data.arrivalDate) ||
    normalizeYmd(data.exitDate) ||
    normalizeYmd(data.endDate) ||
    departureDate;
  if (!companyId || !departureDate) return false;
  if (!statusOccupies(data.status)) return false;

  const db = admin.firestore();
  const companySnap = await db.collection('companies').doc(companyId).get();
  const company = (companySnap.data() || {}) as CapCompany;
  if (!isParkingCapActive(company)) return false;

  const max = normalizeMaxParkedCars(company.maxParkedCars);
  if (max <= 0) return false;

  const rangeEnd = arrivalDate && arrivalDate >= departureDate ? arrivalDate : departureDate;
  const days = eachYmdInclusive(departureDate, rangeEnd);
  if (!days.length) return false;

  const ids = expandCompanyIds(companyId);
  const snaps = await Promise.all(
    ids.map((id) =>
      db
        .collection('reservations')
        .where('companyId', '==', id)
        .where('departureDate', '<=', rangeEnd)
        .get()
    )
  );

  const byId = new Map<string, FirebaseFirestore.DocumentData>();
  for (const snap of snaps) {
    for (const doc of snap.docs) {
      byId.set(doc.id, doc.data());
    }
  }
  // 방금 생성된 문서 포함 보장
  byId.set(reservationId, data);

  let fullDate = '';
  for (const day of days) {
    let used = 0;
    for (const row of byId.values()) {
      if (occupiesDay(row, day)) used += 1;
    }
    if (used > max) {
      fullDate = day;
      break;
    }
  }

  if (!fullDate) return false;

  const now = new Date().toISOString();
  await db.collection('reservations').doc(reservationId).update({
    status: 'cancelled',
    cancelledAt: now,
    cancelReason: 'parking_capacity',
    cancelNote: `${fullDate} 동시 주차 ${max}대 한도 초과(만차·자동취소)`,
    updatedAt: now,
  });

  console.warn(
    `[parkingCapacity] rejected ${reservationId} company=${companyId} full=${fullDate} max=${max}`
  );
  return true;
}
