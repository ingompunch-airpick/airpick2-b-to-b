import { Reservation } from '../types';
import { isAirpickHeadquarters } from '../constants/platform';

/** 예약 1건이 특정 업체 파티션에 속하는지 (App visibleReservations 와 동일 규칙) */
export function reservationBelongsToCompany(
  reservation: Reservation,
  companyId: string
): boolean {
  const targetCompId = (companyId || '').trim().toLowerCase();
  if (isAirpickHeadquarters(targetCompId)) return true;

  const rCompId = (reservation.companyId || '').trim().toLowerCase();
  const belongsToWawa =
    !rCompId ||
    rCompId === 'wawa' ||
    rCompId === 'wawa_valet' ||
    rCompId === '와와발렛' ||
    rCompId === '와와';

  if (targetCompId === 'wawa' || targetCompId === 'wawa_valet') {
    return belongsToWawa;
  }

  return rCompId === targetCompId;
}

export function filterReservationsForCompany(
  reservations: Reservation[],
  companyId: string
): Reservation[] {
  if (isAirpickHeadquarters(companyId)) return reservations;
  return reservations.filter((r) => reservationBelongsToCompany(r, companyId));
}

interface StorageLike {
  setItem?: (key: string, value: string) => void;
  getItem?: (key: string) => string | null;
  removeItem?: (key: string) => void;
}

/**
 * @deprecated 예약은 Firestore가 단일 소스. 로컬 이중 저장은 더 이상 하지 않음.
 * 호출부는 호환을 위해 남겨 두되 no-op.
 */
export function persistReservationStores(
  _storage: StorageLike,
  _allReservations: Reservation[],
  _activeCompanyId: string,
  _options?: { cacheFirestore?: boolean; operatorCompanyIds?: string[] }
): void {
  /* no-op — Firestore realtime subscription is the source of truth */
}

/** 예전 `{업체}_reservations` / `firestore_reservations_cache` 잔여 키 정리 */
export function clearLegacyReservationLocalCaches(
  storage: StorageLike = typeof localStorage !== 'undefined' ? localStorage : {}
): void {
  try {
    storage.removeItem?.('firestore_reservations_cache');
    const keys =
      typeof localStorage !== 'undefined' ? Object.keys(localStorage) : [];
    for (const key of keys) {
      if (key.endsWith('_reservations') || key.endsWith('_drivers')) {
        storage.removeItem?.(key);
      }
    }
  } catch {
    /* ignore */
  }
}
