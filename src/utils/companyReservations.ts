import type { Reservation } from '../types';

/** App.tsx visibleReservations와 동일한 업체 소속 판별 */
export function reservationBelongsToCompany(
  reservation: Reservation,
  companyId: string
): boolean {
  const targetCompId = (companyId || '').trim().toLowerCase();
  if (!targetCompId) return false;

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
  return reservations.filter((r) => reservationBelongsToCompany(r, companyId));
}

/** 업체별 localStorage 키에는 해당 업체 예약만 저장 */
export function persistCompanyReservationsLocalStorage(
  companyId: string,
  allReservations: Reservation[]
): void {
  if (!companyId?.trim()) return;
  const scoped = filterReservationsForCompany(allReservations, companyId);
  localStorage.setItem(`${companyId}_reservations`, JSON.stringify(scoped));
}
