import * as admin from 'firebase-admin';

const WAWA_ALIASES = ['wawa', 'wawa_valet', '와와', '와와발렛'];

type CapCompany = {
  hourlyCapEnabled?: boolean;
  maxCarsPerHour?: number;
};

function normalizeMaxCarsPerHour(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(99, Math.floor(n)));
}

function isHourlyCapActive(company: CapCompany | undefined): boolean {
  if (!company || company.hourlyCapEnabled !== true) return false;
  return normalizeMaxCarsPerHour(company.maxCarsPerHour) > 0;
}

function parseDepartureHour(time: unknown): number | null {
  const m = String(time || '')
    .trim()
    .match(/^(\d{1,2})/);
  if (!m) return null;
  const h = Number(m[1]);
  if (!Number.isFinite(h) || h < 0 || h > 23) return null;
  return h;
}

function expandCompanyIds(companyId: string): string[] {
  const norm = (companyId || '').trim().toLowerCase();
  if (norm === 'wawa' || norm === 'wawa_valet') return [...WAWA_ALIASES];
  return companyId.trim() ? [companyId.trim()] : [];
}

function statusIsCancelled(status: unknown): boolean {
  const s = String(status || '')
    .trim()
    .toLowerCase();
  return s === 'cancelled' || s === '취소';
}

function formatHourLabel(hour: number): string {
  const hh = String(hour).padStart(2, '0');
  return `${hh}:00–${hh}:59`;
}

/**
 * 신규 예약이 시간당 한도를 넘으면 즉시 취소 처리.
 * 클라이언트 선검사가 주력이고, 동시 예약 레이스 백스톱용.
 * @returns true면 한도 초과로 취소됨 → 알림톡 등 스킵
 */
export async function enforceHourlyCapacityOnCreate(
  reservationId: string,
  data: FirebaseFirestore.DocumentData
): Promise<boolean> {
  const companyId = String(data.companyId || '').trim();
  const departureDate = String(data.departureDate || '').trim();
  const departureTime = String(data.departureTime || '').trim();
  if (!companyId || !departureDate || !departureTime) return false;
  if (statusIsCancelled(data.status)) return false;

  const db = admin.firestore();
  const companySnap = await db.collection('companies').doc(companyId).get();
  const company = (companySnap.data() || {}) as CapCompany;
  if (!isHourlyCapActive(company)) return false;

  const max = normalizeMaxCarsPerHour(company.maxCarsPerHour);
  const hour = parseDepartureHour(departureTime);
  if (hour === null || max <= 0) return false;

  const ids = expandCompanyIds(companyId);
  const snaps = await Promise.all(
    ids.map((id) =>
      db
        .collection('reservations')
        .where('companyId', '==', id)
        .where('departureDate', '==', departureDate)
        .get()
    )
  );

  const byId = new Map<string, FirebaseFirestore.DocumentData>();
  for (const snap of snaps) {
    for (const doc of snap.docs) {
      byId.set(doc.id, doc.data());
    }
  }

  let used = 0;
  for (const [id, row] of byId) {
    if (statusIsCancelled(row.status)) continue;
    if (parseDepartureHour(row.departureTime) !== hour) continue;
    used += 1;
    void id;
  }

  // 이번 예약 포함 used — 한도 이하면 OK
  if (used <= max) return false;

  const now = new Date().toISOString();
  await db.collection('reservations').doc(reservationId).update({
    status: 'cancelled',
    cancelledAt: now,
    cancelReason: 'hourly_capacity',
    cancelNote: `${formatHourLabel(hour)} 시간당 ${max}대 한도 초과(자동취소)`,
    updatedAt: now,
  });

  console.warn(
    `[hourlyCapacity] rejected ${reservationId} company=${companyId} ${departureDate} h=${hour} used=${used} max=${max}`
  );
  return true;
}
