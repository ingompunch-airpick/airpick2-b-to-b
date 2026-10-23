import * as admin from 'firebase-admin';

type DayCount = { indoor: number; outdoor: number };

function kstToday(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function shiftYmd(ymd: string, deltaDays: number): string {
  const [y, m, d] = ymd.split('-').map((part) => parseInt(part, 10));
  if (!y || !m || !d) return ymd;
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + deltaDays);
  const yy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(date.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

function normalizeYmd(value: unknown): string {
  const text = String(value ?? '').trim();
  const match = text.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : '';
}

function occupies(status: unknown): boolean {
  const s = String(status || '')
    .trim()
    .toLowerCase();
  if (!s) return true;
  if (s === 'cancelled' || s === '취소') return false;
  if (s === 'completed_out' || s === '출차완료' || s === '인도완료' || s === '출고완료') {
    return false;
  }
  return true;
}

/** 한 업체의 날짜별 실내/야외 주차 대수를 다시 센다. 손님은 이 문서 한 장만 읽는다. */
export async function recomputeParkingOccupancy(companyId: string): Promise<void> {
  const id = companyId.trim();
  if (!id) return;
  const today = kstToday();
  const windowStart = shiftYmd(today, -1);
  const windowEnd = shiftYmd(today, 400);
  const lookback = shiftYmd(today, -200);

  const snap = await admin
    .firestore()
    .collection('reservations')
    .where('companyId', '==', id)
    .where('departureDate', '>=', lookback)
    .get();

  const days: Record<string, DayCount> = {};
  const bump = (day: string, outdoor: boolean) => {
    if (day < windowStart || day > windowEnd) return;
    const cell = days[day] || { indoor: 0, outdoor: 0 };
    if (outdoor) cell.outdoor += 1;
    else cell.indoor += 1;
    days[day] = cell;
  };

  for (const docSnap of snap.docs) {
    const row = docSnap.data();
    if (!occupies(row.status)) continue;
    const start = normalizeYmd(row.departureDate) || normalizeYmd(row.entryDate);
    if (!start) continue;
    const end =
      normalizeYmd(row.arrivalDate) ||
      normalizeYmd(row.exitDate) ||
      normalizeYmd(row.endDate) ||
      start;
    const last = end >= start ? end : start;
    const outdoor = row.isIndoor === false;
    let cursor = start > windowStart ? start : windowStart;
    for (let i = 0; i < 420 && cursor <= last && cursor <= windowEnd; i += 1) {
      bump(cursor, outdoor);
      if (cursor === last || cursor === windowEnd) break;
      cursor = shiftYmd(cursor, 1);
    }
  }

  await admin
    .firestore()
    .collection('parkingOccupancy')
    .doc(id)
    .set({ days, updatedAt: new Date().toISOString() });
}

function occupancyKey(row: FirebaseFirestore.DocumentData | null | undefined): string {
  if (!row) return '';
  const start = normalizeYmd(row.departureDate) || normalizeYmd(row.entryDate);
  const end =
    normalizeYmd(row.arrivalDate) || normalizeYmd(row.exitDate) || normalizeYmd(row.endDate);
  return [
    String(row.companyId || '').trim(),
    start,
    end,
    occupies(row.status) ? '1' : '0',
    row.isIndoor === false ? 'out' : 'in',
  ].join('|');
}

/** 업체·날짜·상태·실내외가 바뀐 쓰기만 다시 센다. 사진·메모 저장은 건너뛴다. */
export async function syncParkingOccupancy(
  before: FirebaseFirestore.DocumentData | null | undefined,
  after: FirebaseFirestore.DocumentData | null | undefined
): Promise<void> {
  if (occupancyKey(before) === occupancyKey(after)) return;
  const ids = new Set<string>();
  for (const row of [before, after]) {
    const id = String(row?.companyId || '').trim();
    if (id) ids.add(id);
  }
  await Promise.all(Array.from(ids).map((id) => recomputeParkingOccupancy(id)));
}

const WAWA_OCCUPANCY_IDS = ['wawa', 'wawa_valet', '와와', '와와발렛'];

/** 만차를 쓰는 업체만 하루 한 번 다시 센다. 와와 별칭 문서도 같이 맞춘다. */
export async function refreshAllParkingOccupancy(): Promise<number> {
  const snap = await admin.firestore().collection('companies').get();
  const ids = new Set<string>();
  for (const docSnap of snap.docs) {
    if (docSnap.data().parkingCapEnabled !== true) continue;
    ids.add(docSnap.id);
    if (WAWA_OCCUPANCY_IDS.includes(docSnap.id)) {
      for (const alias of WAWA_OCCUPANCY_IDS) ids.add(alias);
    }
  }
  for (const id of ids) await recomputeParkingOccupancy(id);
  return ids.size;
}
