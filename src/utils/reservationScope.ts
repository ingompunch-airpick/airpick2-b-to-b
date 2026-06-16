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
  setItem: (key: string, value: string) => void;
}

/** 전체 예약 배열 변경 시 — 업체 키에는 해당 업체(또는 통합 그룹) 것만, Firestore 캐시에는 전체 저장 */
export function persistReservationStores(
  storage: StorageLike,
  allReservations: Reservation[],
  activeCompanyId: string,
  options?: { cacheFirestore?: boolean; operatorCompanyIds?: string[] }
): void {
  if (options?.cacheFirestore) {
    storage.setItem('firestore_reservations_cache', JSON.stringify(allReservations));
  }

  if (!activeCompanyId || isAirpickHeadquarters(activeCompanyId)) {
    return;
  }

  const ids =
    options?.operatorCompanyIds && options.operatorCompanyIds.length > 0
      ? options.operatorCompanyIds
      : [activeCompanyId];

  const scoped =
    ids.length > 1
      ? allReservations.filter((r) =>
          ids.some((id) => reservationBelongsToCompany(r, id))
        )
      : filterReservationsForCompany(allReservations, activeCompanyId);

  storage.setItem(`${activeCompanyId}_reservations`, JSON.stringify(scoped));
}
