/** 알림 문구. 신규 예약은 유입과 관계없이 한 문구, 출고는 따로. */

export const DEFAULT_ALERT_TITLE_RESERVE = '예약';
export const DEFAULT_ALERT_TITLE_CHECKOUT = '출고요청';

export const ALERT_TITLE_RESERVE_PRESETS = ['예약'] as const;

export const ALERT_TITLE_CHECKOUT_PRESETS = ['출고요청', '비행기도착'] as const;

export type ReservationAlertCopy = {
  titleReserve: string;
  titleCheckout: string;
};

export const DEFAULT_RESERVATION_ALERT_COPY: ReservationAlertCopy = {
  titleReserve: DEFAULT_ALERT_TITLE_RESERVE,
  titleCheckout: DEFAULT_ALERT_TITLE_CHECKOUT,
};

export const RESERVATION_ALERTS_COLLECTION = 'appConfig';
export const RESERVATION_ALERTS_DOC_ID = 'reservationAlerts';

const TITLE_MAX = 24;

export function normalizeAlertTitle(raw: unknown, fallback: string): string {
  const s = String(raw ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, TITLE_MAX);
  return s || fallback;
}

export function coerceReservationAlertCopy(
  raw?: Partial<ReservationAlertCopy> | null
): ReservationAlertCopy {
  return {
    titleReserve: normalizeAlertTitle(
      raw?.titleReserve,
      DEFAULT_ALERT_TITLE_RESERVE
    ),
    titleCheckout: normalizeAlertTitle(
      raw?.titleCheckout,
      DEFAULT_ALERT_TITLE_CHECKOUT
    ),
  };
}
