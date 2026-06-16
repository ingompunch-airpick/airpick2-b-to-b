import type { Reservation } from '../types';
import { reservationBelongsToCompany } from './reservationScope';
import { filterReservationsForOperatorGroup } from './operatorHierarchy';
import { isPending } from './reservationStatus';

const ENABLED_KEY = 'reservation_alerts_enabled';
const PERMISSION_ASKED_KEY = 'reservation_alerts_permission_asked';

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

/** 짧은 알림음 (mp3 파일 없이 Web Audio) */
export function playNewReservationAlertSound(): void {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const playTone = (freq: number, start: number, duration: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.25, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + duration + 0.05);
    };
    const t = ctx.currentTime;
    playTone(880, t, 0.12);
    playTone(1174, t + 0.14, 0.18);
    window.setTimeout(() => void ctx.close(), 500);
  } catch {
    // ignore — 일부 브라우저는 사용자 제스처 없이 AudioContext 차단
  }
}

function formatReservationAlertBody(res: Reservation): string {
  const car = res.carNumber || '차량미상';
  const name = res.userName || '';
  const date = res.departureDate || '';
  const time = res.departureTime || '';
  const schedule = [date, time].filter(Boolean).join(' ');
  return [car, name, schedule].filter(Boolean).join(' · ');
}

export function notifyNewReservation(res: Reservation, companyLabel: string): void {
  if (!areReservationAlertsEnabled()) return;

  playNewReservationAlertSound();

  if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
    try {
      const body = formatReservationAlertBody(res);
      new Notification(`📥 신규 입고예정 · ${companyLabel}`, {
        body,
        tag: `res-${res.id}`,
        renotify: true,
      } as NotificationOptions & { renotify?: boolean });
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
    return isPending(r.status);
  });
}
