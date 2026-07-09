import {
  collection,
  Firestore,
  getDocs,
  onSnapshot,
  query,
  Query,
  where,
} from 'firebase/firestore';
import type { Reservation } from '../types';
import { getKSTDateOnlyString } from './kstDate';

/** 입고일(departureDate) 기준 과거·미래 동기화 창 — 성수기·장기주차 여유 */
export const RESERVATION_SYNC_LOOKBACK_DAYS = 400;
export const RESERVATION_SYNC_FUTURE_DAYS = 400;

const WAWA_FIRESTORE_COMPANY_IDS = ['wawa', 'wawa_valet', '와와', '와와발렛'];

export function shiftKSTDateOnlyString(ymd: string, dayDelta: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const base = new Date(Date.UTC(y, m - 1, d));
  base.setUTCDate(base.getUTCDate() + dayDelta);
  return base.toISOString().split('T')[0];
}

export function getReservationSyncDateRange(): { startDate: string; endDate: string } {
  const today = getKSTDateOnlyString();
  return {
    startDate: shiftKSTDateOnlyString(today, -RESERVATION_SYNC_LOOKBACK_DAYS),
    endDate: shiftKSTDateOnlyString(today, RESERVATION_SYNC_FUTURE_DAYS),
  };
}

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

/** Firestore `in` 쿼리용 — 와와 계열은 문서에 저장된 별칭 id를 모두 포함 */
export function expandCompanyIdsForFirestoreQuery(companyIds: string[]): string[] {
  const expanded = new Set<string>();
  for (const id of companyIds) {
    const norm = (id || '').trim().toLowerCase();
    if (!norm) continue;
    if (norm === 'wawa' || norm === 'wawa_valet') {
      WAWA_FIRESTORE_COMPANY_IDS.forEach((alias) => expanded.add(alias));
    } else {
      expanded.add(id.trim());
    }
  }
  return Array.from(expanded);
}

export interface ReservationSyncScope {
  isHqScope: boolean;
  operatorCompanyIds: string[];
}

export function buildReservationSyncQueries(
  db: Firestore,
  scope: ReservationSyncScope
): Query[] {
  const { startDate, endDate } = getReservationSyncDateRange();
  const base = collection(db, 'reservations');

  if (scope.isHqScope) {
    return [
      query(
        base,
        where('departureDate', '>=', startDate),
        where('departureDate', '<=', endDate)
      ),
    ];
  }

  const companyIds = expandCompanyIdsForFirestoreQuery(scope.operatorCompanyIds);
  if (!companyIds.length) return [];

  return chunkArray(companyIds, 10).map((chunk) => {
    if (chunk.length === 1) {
      return query(
        base,
        where('companyId', '==', chunk[0]),
        where('departureDate', '>=', startDate),
        where('departureDate', '<=', endDate)
      );
    }
    return query(
      base,
      where('companyId', 'in', chunk),
      where('departureDate', '>=', startDate),
      where('departureDate', '<=', endDate)
    );
  });
}

function docsToReservations(
  docs: { id: string; data: () => Record<string, unknown> }[]
): Reservation[] {
  return docs.map((d) => ({ id: d.id, ...d.data() } as Reservation));
}

function mergeReservationSnapshots(
  parts: Map<number, Reservation[]>
): Reservation[] {
  const byId = new Map<string, Reservation>();
  for (const list of parts.values()) {
    for (const row of list) {
      if (row?.id) byId.set(row.id, row);
    }
  }
  return Array.from(byId.values());
}

export async function fetchScopedReservations(
  db: Firestore,
  scope: ReservationSyncScope
): Promise<Reservation[]> {
  const queries = buildReservationSyncQueries(db, scope);
  if (!queries.length) return [];

  const parts = await Promise.all(
    queries.map(async (q) => {
      const snap = await getDocs(q);
      return docsToReservations(snap.docs);
    })
  );

  const merged = new Map<number, Reservation[]>();
  parts.forEach((list, i) => merged.set(i, list));
  return mergeReservationSnapshots(merged);
}

export function subscribeScopedReservations(
  db: Firestore,
  scope: ReservationSyncScope,
  onData: (rows: Reservation[]) => void,
  onError: (err: unknown, queryIndex: number) => void
): () => void {
  const queries = buildReservationSyncQueries(db, scope);
  if (!queries.length) {
    onData([]);
    return () => {};
  }

  const parts = new Map<number, Reservation[]>();
  const emit = () => onData(mergeReservationSnapshots(parts));

  const unsubs = queries.map((q, index) =>
    onSnapshot(
      q,
      (snap) => {
        parts.set(index, docsToReservations(snap.docs));
        emit();
      },
      (err) => onError(err, index)
    )
  );

  return () => unsubs.forEach((unsub) => unsub());
}
