import * as admin from 'firebase-admin';

type DayCount = { indoor: number; outdoor: number };

const WAWA_OCCUPANCY_IDS = ['wawa', 'wawa_valet', '와와', '와와발렛'] as const;
const WAWA_CANONICAL_ID = 'wawa';

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

function isWawaAlias(companyId: string): boolean {
  return (WAWA_OCCUPANCY_IDS as readonly string[]).includes(companyId);
}

/** 와와 별칭은 companies/wawa 의 parkingCapEnabled 를 본다. */
export function parkingCapCompanyDocId(companyId: string): string {
  const id = companyId.trim();
  if (!id) return '';
  return isWawaAlias(id) ? WAWA_CANONICAL_ID : id;
}

export async function isParkingCapEnabledForCompany(companyId: string): Promise<boolean> {
  const capId = parkingCapCompanyDocId(companyId);
  if (!capId) return false;
  const snap = await admin.firestore().collection('companies').doc(capId).get();
  return snap.exists && snap.data()?.parkingCapEnabled === true;
}

/** 재집계 대상 ID — 와와면 별칭 문서 전부. */
export function occupancyRecomputeIds(companyId: string): string[] {
  const id = companyId.trim();
  if (!id) return [];
  if (isWawaAlias(id)) return [...WAWA_OCCUPANCY_IDS];
  return [id];
}

/**
 * 한 업체의 날짜별 실내/야외 주차 대수를 다시 센다.
 * arrivalDate >= 어제 인 예약만 읽어 아직 주차 중·앞으로 들어올 건만 포함.
 */
export async function recomputeParkingOccupancy(companyId: string): Promise<void> {
  const id = companyId.trim();
  if (!id) return;
  const today = kstToday();
  const windowStart = shiftYmd(today, -1);
  const windowEnd = shiftYmd(today, 400);

  const snap = await admin
    .firestore()
    .collection('reservations')
    .where('companyId', '==', id)
    .where('arrivalDate', '>=', windowStart)
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

/**
 * 업체·날짜·상태·실내외가 바뀐 쓰기만 다시 센다.
 * parkingCapEnabled 업체가 아니면 건너뛴다 (와와는 대표 문서 기준).
 */
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

  const toRecompute = new Set<string>();
  for (const id of ids) {
    if (!(await isParkingCapEnabledForCompany(id))) continue;
    for (const target of occupancyRecomputeIds(id)) toRecompute.add(target);
  }
  if (!toRecompute.size) return;
  await Promise.all(Array.from(toRecompute).map((id) => recomputeParkingOccupancy(id)));
}

/** 만차를 쓰는 업체만 하루 한 번 다시 센다. 와와 별칭 문서도 같이 맞춘다. */
export async function refreshAllParkingOccupancy(): Promise<number> {
  const snap = await admin.firestore().collection('companies').get();
  const ids = new Set<string>();
  for (const docSnap of snap.docs) {
    if (docSnap.data().parkingCapEnabled !== true) continue;
    ids.add(docSnap.id);
    if (isWawaAlias(docSnap.id)) {
      for (const alias of WAWA_OCCUPANCY_IDS) ids.add(alias);
    }
  }
  for (const id of ids) await recomputeParkingOccupancy(id);
  return ids.size;
}

/**
 * parkingCapEnabled false→true 전환 시 즉시 한 번 재집계.
 * @returns 재집계한 occupancy 문서 수
 */
export async function recomputeParkingOccupancyIfCapEnabled(
  companyId: string,
  before: FirebaseFirestore.DocumentData | null | undefined,
  after: FirebaseFirestore.DocumentData | null | undefined
): Promise<number> {
  const id = companyId.trim();
  if (!id || !after) return 0;
  const wasOn = before?.parkingCapEnabled === true;
  const nowOn = after.parkingCapEnabled === true;
  if (wasOn || !nowOn) return 0;

  const targets = occupancyRecomputeIds(id);
  // 와와 별칭 문서에 플래그만 켠 경우에도 대표 기준으로 허용된 것과 동일하게 별칭 전부 맞춤
  await Promise.all(targets.map((target) => recomputeParkingOccupancy(target)));
  return targets.length;
}
