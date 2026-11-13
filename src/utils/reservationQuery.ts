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

/**
 * 실시간 구독 창 (현장용) — docs/work/reservation-load-plan.md
 * 입고일 또는 출고일이 이 창 안이면 실시간. 창 밖이라도 처리 안 끝난 예약(UNRESOLVED)은 실시간.
 * 그보다 오래되거나 먼 예약은 화면이 필요할 때 useReservationRange 로 그 기간만 구독한다.
 */
export const RESERVATION_SYNC_LOOKBACK_DAYS = 3;
export const RESERVATION_SYNC_FUTURE_DAYS = 14;

/** 아직 끝나지 않은 상태 — 날짜와 관계없이 현장 화면에 있어야 함 (장기 주차·노쇼 포함) */
export const UNRESOLVED_RESERVATION_STATUSES = ['pending', 'pending_in', 'completed_in', 'request_out'];

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

type DateField = 'departureDate' | 'arrivalDate' | 'createdAt';

function scopedCompanyChunks(scope: ReservationSyncScope, size: number): string[][] {
  const companyIds = expandCompanyIdsForFirestoreQuery(scope.operatorCompanyIds);
  return companyIds.length ? chunkArray(companyIds, size) : [];
}

/** field 가 [startDate, endDate] 안인 예약 (본사=전체, 업체=자기 업체) */
export function buildReservationRangeQueries(
  db: Firestore,
  scope: ReservationSyncScope,
  field: DateField,
  startDate: string,
  endDate: string
): Query[] {
  const base = collection(db, 'reservations');
  if (scope.isHqScope) {
    return [query(base, where(field, '>=', startDate), where(field, '<=', endDate))];
  }
  return scopedCompanyChunks(scope, 10).map((chunk) =>
    query(
      base,
      chunk.length === 1 ? where('companyId', '==', chunk[0]) : where('companyId', 'in', chunk),
      where(field, '>=', startDate),
      where(field, '<=', endDate)
    )
  );
}

/** 입고일이 창보다 앞인데 아직 안 끝난 예약 (장기 주차·출고요청·노쇼) */
function buildUnresolvedQueries(
  db: Firestore,
  scope: ReservationSyncScope,
  beforeDate: string
): Query[] {
  const base = collection(db, 'reservations');
  const statuses = UNRESOLVED_RESERVATION_STATUSES;
  if (scope.isHqScope) {
    return [query(base, where('status', 'in', statuses), where('departureDate', '<', beforeDate))];
  }
  // in × in 조합 한도(30) — 업체 7개 × 상태 4개 = 28
  return scopedCompanyChunks(scope, 7).map((chunk) =>
    query(
      base,
      chunk.length === 1 ? where('companyId', '==', chunk[0]) : where('companyId', 'in', chunk),
      where('status', 'in', statuses),
      where('departureDate', '<', beforeDate)
    )
  );
}

/** 현장 실시간 구독 쿼리 = 입고일 창 + 출고일 창 + 최근 접수 + 창 이전의 미처리 예약 */
export function buildReservationSyncQueries(
  db: Firestore,
  scope: ReservationSyncScope
): Query[] {
  const { startDate, endDate } = getReservationSyncDateRange();
  if (!scope.isHqScope && !scopedCompanyChunks(scope, 10).length) return [];
  return [
    ...buildReservationRangeQueries(db, scope, 'departureDate', startDate, endDate),
    ...buildReservationRangeQueries(db, scope, 'arrivalDate', startDate, endDate),
    // 최근 접수(먼 미래 입고 포함) — 「오늘 접수」 목록·새 예약 알림용. createdAt 은 ISO 문자열(UTC)
    ...buildReservationRangeQueries(db, scope, 'createdAt', `${startDate}T00:00:00`, '9999-12-31'),
    ...buildUnresolvedQueries(db, scope, startDate),
  ];
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

function subscribeQueries(
  queries: Query[],
  onData: (rows: Reservation[]) => void,
  onError: (err: unknown, queryIndex: number) => void
): () => void {
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

export function subscribeScopedReservations(
  db: Firestore,
  scope: ReservationSyncScope,
  onData: (rows: Reservation[]) => void,
  onError: (err: unknown, queryIndex: number) => void
): () => void {
  return subscribeQueries(buildReservationSyncQueries(db, scope), onData, onError);
}

/** 화면이 필요한 기간(입고일 기준)만 구독 — 화면을 닫으면 해제 */
export function subscribeReservationRange(
  db: Firestore,
  scope: ReservationSyncScope,
  startDate: string,
  endDate: string,
  onData: (rows: Reservation[]) => void,
  onError: (err: unknown, queryIndex: number) => void
): () => void {
  return subscribeQueries(
    buildReservationRangeQueries(db, scope, 'departureDate', startDate, endDate),
    onData,
    onError
  );
}
