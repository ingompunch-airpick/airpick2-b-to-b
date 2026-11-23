/**
 * parkingSlots 백필 dry-run — 쓰지 않고 날짜별 booked/capacity 만 출력.
 *
 *   npx --yes tsx src/scripts/previewParkingSlotBackfill.ts
 *   APPLY=1 npx --yes tsx src/scripts/previewParkingSlotBackfill.ts   # 실제 쓰기 (승인 후)
 *
 * 기준: parkingCapEnabled 업체 + 점유 중인 예약(취소·출고완료 제외)의
 * 입고~출고 일자 × 실내/야외. 통합 한도면 indoor 키에 합산.
 */
import * as admin from 'firebase-admin';

if (!admin.apps.length) {
  admin.initializeApp();
}

type CapCompany = {
  name?: string;
  parkingCapEnabled?: boolean;
  maxParkedCars?: number;
  maxParkedCarsIndoor?: number;
  maxParkedCarsOutdoor?: number;
};

type ParkingType = 'indoor' | 'outdoor';

function normMax(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(999, Math.floor(n)));
}

function usesSplit(c: CapCompany): boolean {
  return normMax(c.maxParkedCarsIndoor) > 0 || normMax(c.maxParkedCarsOutdoor) > 0;
}

function capacityFor(c: CapCompany, type: ParkingType): number {
  if (usesSplit(c)) {
    return normMax(type === 'indoor' ? c.maxParkedCarsIndoor : c.maxParkedCarsOutdoor);
  }
  return normMax(c.maxParkedCars);
}

function ymd(v: unknown): string {
  const s = String(v || '').trim();
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : '';
}

function shiftYmd(date: string, delta: number): string {
  const [y, m, d] = date.split('-').map((n) => parseInt(n, 10));
  const next = new Date(Date.UTC(y, m - 1, d + delta));
  return next.toISOString().slice(0, 10);
}

function eachDay(start: string, end: string): string[] {
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

function occupies(status: unknown): boolean {
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

function slotId(partnerId: string, date: string, type: ParkingType): string {
  return `${partnerId}__${date}__${type}`;
}

type Row = {
  partnerId: string;
  partnerName: string;
  date: string;
  parkingType: ParkingType;
  booked: number;
  capacity: number;
  over: boolean;
};

async function main(): Promise<void> {
  const db = admin.firestore();
  const apply = process.env.APPLY === '1';
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  // 어제부터 앞으로 120일 (백필 윈도우)
  const windowStart = shiftYmd(today, -1);
  const windowEnd = shiftYmd(today, 120);

  const companiesSnap = await db.collection('companies').get();
  const capCompanies: { id: string; data: CapCompany }[] = [];
  for (const doc of companiesSnap.docs) {
    const data = doc.data() as CapCompany;
    if (data.parkingCapEnabled !== true) continue;
    if (
      normMax(data.maxParkedCars) <= 0 &&
      normMax(data.maxParkedCarsIndoor) <= 0 &&
      normMax(data.maxParkedCarsOutdoor) <= 0
    ) {
      continue;
    }
    capCompanies.push({ id: doc.id, data });
  }

  console.log(`# parkingSlots backfill preview (APPLY=${apply ? '1' : '0'})`);
  console.log(`# window ${windowStart} ~ ${windowEnd}`);
  console.log(`# cap companies: ${capCompanies.map((c) => c.id).join(', ') || '(none)'}`);
  console.log('');

  const allRows: Row[] = [];

  for (const { id: partnerId, data: company } of capCompanies) {
    const split = usesSplit(company);
    const counts = new Map<string, number>(); // `${date}__${type}` -> booked

    const lookback = shiftYmd(windowStart, -200);
    const snap = await db
      .collection('reservations')
      .where('companyId', '==', partnerId)
      .where('departureDate', '>=', lookback)
      .get();

    for (const doc of snap.docs) {
      const row = doc.data();
      if (!occupies(row.status)) continue;
      const start = ymd(row.departureDate) || ymd(row.entryDate);
      if (!start) continue;
      const end = ymd(row.arrivalDate) || ymd(row.exitDate) || ymd(row.endDate) || start;
      const type: ParkingType = split
        ? row.isIndoor === false
          ? 'outdoor'
          : 'indoor'
        : 'indoor';
      for (const day of eachDay(start, end)) {
        if (day < windowStart || day > windowEnd) continue;
        const key = `${day}__${type}`;
        counts.set(key, (counts.get(key) || 0) + 1);
      }
    }

    const partnerName = String(company.name || partnerId);
    const keys = [...counts.keys()].sort();
    console.log(`## ${partnerId} (${partnerName}) split=${split}`);
    if (!keys.length) {
      console.log('(no occupying reservations in window)');
      console.log('');
      continue;
    }
    console.log('date\t\ttype\tbooked\tcapacity\tover');
    for (const key of keys) {
      const [date, parkingType] = key.split('__') as [string, ParkingType];
      const booked = counts.get(key) || 0;
      const capacity = capacityFor(company, parkingType);
      const over = capacity > 0 && booked > capacity;
      console.log(
        `${date}\t${parkingType}\t${booked}\t${capacity}\t${over ? 'OVER' : 'ok'}`
      );
      allRows.push({
        partnerId,
        partnerName,
        date,
        parkingType,
        booked,
        capacity,
        over,
      });

      if (apply) {
        const id = slotId(partnerId, date, parkingType);
        await db
          .collection('parkingSlots')
          .doc(id)
          .set(
            {
              partnerId,
              date,
              parkingType,
              booked,
              capacity,
              updatedAt: new Date().toISOString(),
              backfilledAt: new Date().toISOString(),
            },
            { merge: true }
          );
      }
    }
    console.log('');
  }

  const overs = allRows.filter((r) => r.over);
  console.log(`# summary: ${allRows.length} slot docs, ${overs.length} OVER capacity`);
  if (overs.length) {
    console.log('# OVER rows:');
    for (const r of overs) {
      console.log(
        `  ${r.partnerId} ${r.date} ${r.parkingType} booked=${r.booked} capacity=${r.capacity}`
      );
    }
  }
  if (!apply) {
    console.log('# dry-run only. To write: APPLY=1 npx tsx src/scripts/previewParkingSlotBackfill.ts');
  } else {
    console.log('# wrote parkingSlots documents.');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
