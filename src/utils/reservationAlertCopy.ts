/** 신규 예약 푸시·인앱 알림 문구 (에어픽 B2C vs 홈·현장) */

export const DEFAULT_ALERT_TITLE_AIRPICK = '에어픽 예약';
export const DEFAULT_ALERT_TITLE_OTHER = '예약';

/** 짧은 제목만 */
export const ALERT_TITLE_AIRPICK_PRESETS = ['에어픽 예약'] as const;

export const ALERT_TITLE_OTHER_PRESETS = ['예약'] as const;

export type ReservationAlertCopy = {
  titleAirpick: string;
  titleOther: string;
};

export const DEFAULT_RESERVATION_ALERT_COPY: ReservationAlertCopy = {
  titleAirpick: DEFAULT_ALERT_TITLE_AIRPICK,
  titleOther: DEFAULT_ALERT_TITLE_OTHER,
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
    titleAirpick: normalizeAlertTitle(
      raw?.titleAirpick,
      DEFAULT_ALERT_TITLE_AIRPICK
    ),
    titleOther: normalizeAlertTitle(raw?.titleOther, DEFAULT_ALERT_TITLE_OTHER),
  };
}

export function alertTitleForBookingSource(
  copy: ReservationAlertCopy,
  source: 'airpick-b2c' | 'homepage' | 'b2b' | 'unknown'
): string {
  return source === 'airpick-b2c' ? copy.titleAirpick : copy.titleOther;
}

/** 미리보기용 — 제목만 쓰므로 본문은 비움 */
export function sampleAlertBody(_kind: 'airpick' | 'other'): string {
  return '';
}
