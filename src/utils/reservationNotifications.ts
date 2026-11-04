import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import type { Reservation } from '../types';
import { reservationBelongsToCompany } from './reservationScope';
import { filterReservationsForOperatorGroup } from './operatorHierarchy';
import { isPending } from './reservationStatus';
import {
  DEFAULT_RESERVATION_ALERT_COPY,
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

  const synth = window.speechSynthesis;
  const speakOnce = (retry: boolean) => {
    const utter = new SpeechSynthesisUtterance(title);
    utter.lang = 'ko-KR';
    utter.rate = 1.05;
    utter.pitch = input.kind === 'airpick' ? 1.15 : 1.0;
    // 목록이 아직 비어 있으면 lang 만으로 한국어 음성을 고른다 (기다리면 두 번 읽힐 수 있음)
    const voices = synth.getVoices();
    const ko =
      voices.find((v) => v.lang === 'ko-KR') ||
      voices.find((v) => v.lang.toLowerCase().startsWith('ko'));
    if (ko) utter.voice = ko;

    let started = false;
    utter.onstart = () => {
      started = true;
    };
    utter.onerror = (e) => console.warn('[alert voice]', e.error);
    // 크롬은 참조가 없는 utterance 를 버려 소리가 끊긴다
    activeUtterance = utter;
    synth.resume();
    synth.speak(utter);

    // 크롬이 「말하는 중」에 멈춰 아무 소리도 안 내는 경우가 있다 — 한 번만 다시 시도
    if (retry) {
      window.setTimeout(() => {
        if (started || activeUtterance !== utter) return;
        synth.cancel();
        window.setTimeout(() => speakOnce(false), 120);
      }, 1500);
    }
  };

  try {
    if (synth.speaking || synth.pending) {
      // cancel 직후 바로 speak 하면 크롬이 새 문장을 삼킨다
      synth.cancel();
      window.setTimeout(() => speakOnce(true), 120);
    } else {
      speakOnce(true);
    }
  } catch {
    // TTS 미지원
  }
}

let activeUtterance: SpeechSynthesisUtterance | null = null;

/** 유입과 관계없이 같은 신규 예약 문구 */
export function newReservationAlertTitle(
  _res?: Pick<Reservation, 'createdBy'> & Partial<Reservation>,
  copy: ReservationAlertCopy = runtimeAlertCopy
): string {
  return copy.titleReserve;
}

/** 앱 안 알림창용 — 소리 없음(LOW). 소리는 음성 한 번만 */
const IN_APP_CHANNEL_ID = 'reservation_inapp';
let inAppChannelReady: Promise<void> | null = null;

function ensureInAppChannel(): Promise<void> {
  if (!inAppChannelReady) {
    inAppChannelReady = LocalNotifications.createChannel({
      id: IN_APP_CHANNEL_ID,
      name: '예약 알림 (앱 사용 중)',
      description: '앱을 보고 있을 때 들어온 예약을 알림창에 남깁니다. 소리는 음성으로만 납니다.',
      importance: 2,
      visibility: 1,
    }).catch(() => undefined);
  }
  return inAppChannelReady;
}

function notificationIdFromTag(tag: string): number {
  let h = 0;
  for (let i = 0; i < tag.length; i += 1) h = (h * 31 + tag.charCodeAt(i)) | 0;
  return Math.abs(h) || 1;
}

/** 알림창(안드로이드)·윈도우 알림(PC)에 남긴다 */
async function showTrayNotification(title: string, tag: string): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    try {
      const perm = await LocalNotifications.checkPermissions();
      if (perm.display !== 'granted') return;
      await ensureInAppChannel();
      await LocalNotifications.schedule({
        notifications: [
          { id: notificationIdFromTag(tag), title, body: '', channelId: IN_APP_CHANNEL_ID },
        ],
      });
    } catch {
      // 권한·플러그인 없음
    }
    return;
  }
  if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
    try {
      new Notification(title, {
        tag,
        renotify: true,
        silent: true,
      } as NotificationOptions & { renotify?: boolean; silent?: boolean });
    } catch {
      // mobile Safari 등
    }
  }
}

/**
 * 앱이 뒤로 가 있으면 서버 푸시가 알림창·소리를 맡는다 (같이 울리면 두 번 남).
 * PC 브라우저는 서버 푸시가 없으니 숨겨져 있어도 알린다.
 */
function shouldAlertInApp(): boolean {
  if (!Capacitor.isNativePlatform()) return true;
  return typeof document === 'undefined' || document.visibilityState === 'visible';
}

function alertInApp(title: string, tag: string, opts: { tray: boolean }): void {
  if (!shouldAlertInApp()) return;
  speakReservationAlertPreview({ title, kind: 'other' });
  if (opts.tray) void showTrayNotification(title, tag);
}

/** 알림 화면 「테스트」 — 실제 예약 알림과 같은 소리·알림창 */
export function sendTestReservationAlert(): void {
  const title = newReservationAlertTitle();
  speakReservationAlertPreview({ title, kind: 'other' });
  void showTrayNotification(title, `test-${Date.now()}`);
}

export function notifyNewReservation(res: Reservation, _companyLabel: string): void {
  if (!areReservationAlertsEnabled()) return;
  alertInApp(newReservationAlertTitle(res), `res-${res.id}`, { tray: true });
}

/** 출고 탭으로 넘어온 건. 비행기 자동 전환과 출고요청 버튼 모두 같은 문구. */
export function checkoutAlertTitle(): string {
  return getRuntimeReservationAlertCopy().titleCheckout;
}

export function notifyRequestOut(res: Reservation): void {
  if (!areReservationAlertsEnabled()) return;

  /** 출고요청은 소리만. 알림창에는 예약만 남긴다 */
  alertInApp(checkoutAlertTitle(), `out-${res.id}`, { tray: false });
}

export function findRequestOutReservations(
  prev: Reservation[],
  next: Reservation[],
  companyId: string,
  operatorCompanyIds?: string[]
): Reservation[] {
  const prevById = new Map(
    prev.filter((r) => r.id).map((r) => [r.id as string, r])
  );
  const scoped =
    operatorCompanyIds && operatorCompanyIds.length > 0
      ? filterReservationsForOperatorGroup(next, operatorCompanyIds)
      : next.filter((r) => reservationBelongsToCompany(r, companyId));

  return scoped.filter((r) => {
    if (!r.id) return false;
    const before = prevById.get(r.id);
    if (!before || before.status === 'request_out') return false;
    return r.status === 'request_out';
  });
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
