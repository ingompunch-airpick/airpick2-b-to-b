import type { Reservation } from '../types';
import { normalizeDateString } from './reservationNormalize';
import { isParked } from './reservationStatus';

/** 출차 예정 시각 기준 임박 판정 (분) */
export const DEPARTURE_IMMINENT_WINDOW_MINUTES = 60;

export type DepartureAlertLevel = 'imminent' | 'overdue';

export type DepartureAlertItem = {
  res: Reservation;
  level: DepartureAlertLevel;
  minutes: number;
};

/** arrivalDate + arrivalTime → UTC ms (KST 벽시계 기준) */
export function getScheduledDepartureMsKST(
  res: Pick<Reservation, 'arrivalDate' | 'arrivalTime'>
): number | null {
  const date = normalizeDateString(res.arrivalDate);
  if (!date) return null;

  const timeRaw = (res.arrivalTime || '00:00').trim();
  const timeMatch = timeRaw.match(/^(\d{1,2}):(\d{2})/);
  if (!timeMatch) return null;

  const hh = parseInt(timeMatch[1], 10);
  const mm = parseInt(timeMatch[2], 10);
  const [y, mo, d] = date.split('-').map(Number);
  if (!y || !mo || !d) return null;

  return Date.UTC(y, mo - 1, d, hh, mm, 0, 0) - 9 * 60 * 60 * 1000;
}

export function getMinutesUntilDeparture(
  res: Reservation,
  nowMs = Date.now()
): number | null {
  const depMs = getScheduledDepartureMsKST(res);
  if (depMs == null) return null;
  return Math.round((depMs - nowMs) / 60_000);
}

export function getDepartureAlertLevel(
  res: Reservation,
  withinMinutes = DEPARTURE_IMMINENT_WINDOW_MINUTES,
  nowMs = Date.now()
): DepartureAlertLevel | null {
  if (!isParked(res.status)) return null;
  const minutes = getMinutesUntilDeparture(res, nowMs);
  if (minutes == null) return null;
  if (minutes < 0) return 'overdue';
  if (minutes <= withinMinutes) return 'imminent';
  return null;
}

export function formatDepartureCountdown(minutes: number): string {
  if (minutes < 0) {
    const abs = Math.abs(minutes);
    if (abs < 60) return `${abs}분 지연`;
    const h = Math.floor(abs / 60);
    const m = abs % 60;
    return m > 0 ? `${h}시간 ${m}분 지연` : `${h}시간 지연`;
  }
  if (minutes <= 0) return '곧 출차';
  if (minutes < 60) return `${minutes}분 후 출차`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}시간 ${m}분 후` : `${h}시간 후 출차`;
}

/** 주차 중·출고요청 차량 중 임박·지연 목록 (출차 예정 빠른 순) */
export function collectDepartureAlerts(
  reservations: Reservation[],
  withinMinutes = DEPARTURE_IMMINENT_WINDOW_MINUTES,
  nowMs = Date.now()
): DepartureAlertItem[] {
  return reservations
    .map((res) => {
      const level = getDepartureAlertLevel(res, withinMinutes, nowMs);
      const minutes = getMinutesUntilDeparture(res, nowMs);
      if (!level || minutes == null) return null;
      return { res, level, minutes };
    })
    .filter((x): x is DepartureAlertItem => x != null)
    .sort((a, b) => a.minutes - b.minutes);
}
