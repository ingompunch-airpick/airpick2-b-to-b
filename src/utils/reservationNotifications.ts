import type { Reservation } from '../types';
import { reservationBelongsToCompany } from './reservationScope';
import { filterReservationsForOperatorGroup } from './operatorHierarchy';
import { isPending } from './reservationStatus';
import { resolveBookingSource } from './bookingSource';
import {
  DEFAULT_RESERVATION_ALERT_COPY,
  alertTitleForBookingSource,
  type ReservationAlertCopy,
} from './reservationAlertCopy';

const ENABLED_KEY = 'reservation_alerts_enabled';
const PERMISSION_ASKED_KEY = 'reservation_alerts_permission_asked';

let runtimeAlertCopy: ReservationAlertCopy = DEFAULT_RESERVATION_ALERT_COPY;

export function setRuntimeReservationAlertCopy(copy: ReservationAlertCopy): void {
  runtimeAlertCopy = copy;
}

export function getRuntimeReservationAlertCopy(): ReservationAlertCopy {
  return runtimeAlertCopy;
}

export function areReservationAlertsEnabled(): boolean {
  return localStorage.getItem(ENABLED_KEY) !== 'false';
}

export function setReservationAlertsEnabled(enabled: boolean): void {
  localStorage.setItem(ENABLED_KEY, enabled ? 'true' : 'false');
}

export function wasNotificationPermissionAsked(): boolean {
  return localStorage.getItem(PERMISSION_ASKED_KEY) === 'true';
}

export function markNotificationPermissionAsked(): void {
  localStorage.setItem(PERMISSION_ASKED_KEY, 'true');
}

export async function requestReservationNotificationPermission(): Promise<NotificationPermission> {
  markNotificationPermissionAsked();
  if (typeof Notification === 'undefined') return 'denied';
  if (Notification.permission === 'granted') return 'granted';
  if (Notification.permission === 'denied') return 'denied';
  return Notification.requestPermission();
}

/** 선택한 알림 제목만 읽어 줌 (비프음 없음 — 문구만) */
export function speakReservationAlertPreview(input: {
  title: string;
  body?: string;
  kind?: 'airpick' | 'other';
}): void {
  const title = String(input.title || '').trim();
  if (!title) return;

  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;

  try {
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(title);
    utter.lang = 'ko-KR';
    utter.rate = 1.05;
    utter.pitch = input.kind === 'airpick' ? 1.15 : 1.0;

    const pickKoVoice = () => {
      const voices = window.speechSynthesis.getVoices();
      const ko =
        voices.find((v) => v.lang === 'ko-KR') ||
        voices.find((v) => v.lang.toLowerCase().startsWith('ko'));
      if (ko) utter.voice = ko;
      window.speechSynthesis.speak(utter);
    };

    if (window.speechSynthesis.getVoices().length > 0) {
      pickKoVoice();
    } else {
      window.speechSynthesis.addEventListener('voiceschanged', pickKoVoice, {
        once: true,
      });
      window.setTimeout(pickKoVoice, 250);
    }
  } catch {
    // TTS 미지원
  }
}

/** 에어픽 B2C → titleAirpick, 홈·현장 → titleOther */
export function newReservationAlertTitle(
  res: Pick<Reservation, 'createdBy'> & Partial<Reservation>,
  copy: ReservationAlertCopy = runtimeAlertCopy
): string {
  const source = resolveBookingSource(
    res.createdBy,
    res as unknown as Record<string, unknown>
  );
  return alertTitleForBookingSource(copy, source);
}

export function notifyNewReservation(res: Reservation, _companyLabel: string): void {
  if (!areReservationAlertsEnabled()) return;

  const title = newReservationAlertTitle(res);
  const kind =
    resolveBookingSource(res.createdBy, res as unknown as Record<string, unknown>) ===
    'airpick-b2c'
      ? 'airpick'
      : 'other';

  // 비프 없이 제목만 읽음 (옛 알림음과 겹치지 않게)
  speakReservationAlertPreview({ title, kind });

  if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
    try {
      new Notification(title, {
        tag: `res-${res.id}`,
        renotify: true,
        silent: true,
      } as NotificationOptions & { renotify?: boolean; silent?: boolean });
    } catch {
      // mobile Safari 등
    }
  }
}

export function findNewIncomingReservations(
  prev: Reservation[],
  next: Reservation[],
  companyId: string,
  operatorCompanyIds?: string[]
): Reservation[] {
  const prevIds = new Set(prev.map((r) => r.id).filter(Boolean) as string[]);
  const scoped =
    operatorCompanyIds && operatorCompanyIds.length > 0
      ? filterReservationsForOperatorGroup(next, operatorCompanyIds)
      : next.filter((r) => reservationBelongsToCompany(r, companyId));

  return scoped.filter((r) => {
    if (!r.id || prevIds.has(r.id)) return false;
    if (!isPending(r.status)) return false;
    // 재구독·부트스트랩 시 오래된 건 신규 알림으로 오인하지 않음 (2분 이내만)
    if (r.createdAt) {
      const createdMs = new Date(r.createdAt).getTime();
      if (Number.isFinite(createdMs) && Date.now() - createdMs > 2 * 60 * 1000) {
        return false;
      }
    }
    return true;
  });
}
