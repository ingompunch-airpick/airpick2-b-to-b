import * as admin from 'firebase-admin';

const WAWA_ALIASES = ['wawa', 'wawa_valet', '와와', '와와발렛'];

type CapCompany = {
  dailyIntakeCapEnabled?: boolean;
  maxCarsPerDay?: number;
};

function normalizeMaxCarsPerDay(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(999, Math.floor(n)));
}

function isDailyIntakeCapActive(company: CapCompany | undefined): boolean {
  if (!company || company.dailyIntakeCapEnabled !== true) return false;
  return normalizeMaxCarsPerDay(company.maxCarsPerDay) > 0;
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

/**
 * 신규 예약이 입고일 하루 대수를 넘으면 즉시 취소.
 * 시간당·동시 주차와 별개. 취소 건은 대수에서 제외하고, 아직 입고 전 예약도 포함한다.
 */
export async function enforceDailyIntakeOnCreate(
  reservationId: string,
  data: FirebaseFirestore.DocumentData
): Promise<boolean> {
  const companyId = String(data.companyId || '').trim();
  const departureDate = String(data.departureDate || '').trim().slice(0, 10);
  if (!companyId || !/^\d{4}-\d{2}-\d{2}$/.test(departureDate)) return false;
  if (statusIsCancelled(data.status)) return false;

  const db = admin.firestore();
  const companySnap = await db.collection('companies').doc(companyId).get();
  const company = (companySnap.data() || {}) as CapCompany;
  if (!isDailyIntakeCapActive(company)) return false;

  const max = normalizeMaxCarsPerDay(company.maxCarsPerDay);
  if (max <= 0) return false;

  const ids = expandCompanyIds(companyId);
  const snaps = await Promise.all(
    ids.map((id) =>
      db.collection('reservations').where('companyId', '==', id).where('departureDate', '==', departureDate).get()
    )
  );

  const seen = new Set<string>();
  let used = 0;
  for (const snap of snaps) {
    for (const doc of snap.docs) {
      if (seen.has(doc.id)) continue;
      seen.add(doc.id);
      if (statusIsCancelled(doc.data().status)) continue;
      used += 1;
    }
  }

  if (used <= max) return false;

  const now = new Date().toISOString();
  await db.collection('reservations').doc(reservationId).update({
    status: 'cancelled',
    cancelledAt: now,
    cancelReason: 'daily_intake_capacity',
    cancelNote: `입고일 하루 ${max}대 한도 초과(자동취소)`,
    updatedAt: now,
  });
  console.warn(
    `[dailyIntake] rejected ${reservationId} company=${companyId} ${departureDate} used=${used} max=${max}`
  );
  return true;
}
