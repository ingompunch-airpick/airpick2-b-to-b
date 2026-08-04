import * as admin from 'firebase-admin';

/**
 * 시간당 입고 집계 — capacity/{companyId}__{YYYY-MM-DD}
 *
 * B2C·홈페이지가 마감 여부를 보려고 예약 목록을 통째로 읽던 것을 대체한다.
 * 예약 문서에는 연락처·차량번호가 들어 있어 손님 브라우저에 내려보내면 안 된다.
 * 이 문서에는 시간대별 대수만 담기므로 공개 읽기가 안전하다.
 */
const COLLECTION = 'capacity';

export function capacityDocId(companyId: string, date: string): string {
  return `${companyId}__${date}`;
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

function statusIsCancelled(status: unknown): boolean {
  const s = String(status || '')
    .trim()
    .toLowerCase();
  return s === 'cancelled' || s === '취소';
}

async function recomputeOne(companyId: string, date: string): Promise<void> {
  const db = admin.firestore();
  const snap = await db
    .collection('reservations')
    .where('companyId', '==', companyId)
    .where('departureDate', '==', date)
    .get();

  const hours: Record<string, number> = {};
  let active = 0;
  for (const doc of snap.docs) {
    const row = doc.data();
    if (statusIsCancelled(row.status)) continue;
    active += 1;
    const hour = parseDepartureHour(row.departureTime);
    if (hour === null) continue;
    const key = String(hour);
    hours[key] = (hours[key] ?? 0) + 1;
  }

  await db.collection(COLLECTION).doc(capacityDocId(companyId, date)).set({
    companyId,
    date,
    hours,
    total: active,
    updatedAt: new Date().toISOString(),
  });
}

/**
 * 시간당 한도를 쓰는 업체의 앞으로 날짜 집계를 한 번에 채운다.
 * 집계 문서가 없으면 손님 화면이 0대로 보므로, 배포 직후·누락 대비 매일 돌린다.
 */
export async function backfillUpcomingCapacity(): Promise<number> {
  const db = admin.firestore();
  const today = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const companies = await db.collection('companies').where('hourlyCapEnabled', '==', true).get();
  let written = 0;

  for (const company of companies.docs) {
    const snap = await db
      .collection('reservations')
      .where('companyId', '==', company.id)
      .where('departureDate', '>=', today)
      .get();

    const byDate = new Map<string, Record<string, number>>();
    const totals = new Map<string, number>();
    for (const doc of snap.docs) {
      const row = doc.data();
      if (statusIsCancelled(row.status)) continue;
      const date = String(row.departureDate || '').trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;

      totals.set(date, (totals.get(date) ?? 0) + 1);
      const hour = parseDepartureHour(row.departureTime);
      if (hour === null) continue;
      const hours = byDate.get(date) ?? {};
      const key = String(hour);
      hours[key] = (hours[key] ?? 0) + 1;
      byDate.set(date, hours);
    }

    for (const [date, total] of totals) {
      await db.collection(COLLECTION).doc(capacityDocId(company.id, date)).set({
        companyId: company.id,
        date,
        hours: byDate.get(date) ?? {},
        total,
        updatedAt: new Date().toISOString(),
      });
      written += 1;
    }
  }

  return written;
}

/** 예약 변경으로 영향받은 (업체, 입고일) 조합을 다시 센다 */
export async function syncCapacityAggregate(
  before: FirebaseFirestore.DocumentData | undefined,
  after: FirebaseFirestore.DocumentData | undefined
): Promise<void> {
  const pairs = new Map<string, { companyId: string; date: string }>();

  for (const data of [before, after]) {
    const companyId = String(data?.companyId || '').trim();
    const date = String(data?.departureDate || '').trim();
    if (!companyId || !/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    pairs.set(capacityDocId(companyId, date), { companyId, date });
  }

  for (const { companyId, date } of pairs.values()) {
    await recomputeOne(companyId, date);
  }
}
