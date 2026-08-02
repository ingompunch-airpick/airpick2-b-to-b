import type { Reservation } from '../types';
import { isParked } from './reservationStatus';

const MIN_DELAY_MINUTES = 15;

/**
 * 출고예정·출고 탭에 연착/결항 배지.
 * 출고로 넘어간 뒤에도 남겨 두어 연착 여부를 서로 확인할 수 있게 함.
 */
export function getFlightDelayBadge(
  res: Pick<Reservation, 'status' | 'flightTracking'>
): { label: string; delayMinutes: number } | null {
  if (!isParked(res.status)) return null;
  const t = res.flightTracking;
  if (!t) return null;

  const remark = String(t.remark || '');
  if (remark.includes('결항')) {
    return { label: '결항', delayMinutes: 0 };
  }

  const minutes = Math.max(0, Number(t.delayMinutes) || 0);
  const delayed = remark.includes('지연') || minutes >= MIN_DELAY_MINUTES;
  if (!delayed) return null;

  return {
    label: '연착',
    delayMinutes: minutes,
  };
}
