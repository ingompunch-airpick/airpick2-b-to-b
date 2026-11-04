import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { waitForAuthReady } from './firebaseAuth';
import { isAirpickHeadquarters } from '../constants/platform';

async function sha256Hex(value: string): Promise<string> {
  const data = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function persistFcmToken(params: {
  token: string;
  companyId: string;
  scopeCompanyIds: string[];
  platform: string;
}): Promise<void> {
  const { token, companyId, scopeCompanyIds, platform } = params;
  if (!token || !companyId || isAirpickHeadquarters(companyId)) return;

  const user = await waitForAuthReady();
  if (!user) {
    throw new Error('푸시 등록을 위해 로그인이 필요합니다.');
  }
  // partnerCompanyId claim 반영을 위해 토큰 갱신
  await user.getIdToken(true);

  const id = await sha256Hex(token);
  const scopes = Array.from(
    new Set([companyId, ...scopeCompanyIds].map((s) => String(s || '').trim()).filter(Boolean))
  );

  await setDoc(
    doc(db, 'fcmTokens', id),
    {
      token,
      companyId,
      scopeCompanyIds: scopes,
      platform,
      enabled: true,
      updatedAt: new Date().toISOString(),
      uid: user.uid,
    },
    { merge: true }
  );
}

/** functions/src/partnerPush.ts 와 같은 값 */
export const PARTNER_PUSH_CHANNEL_ID = 'reservation_alerts';

export type PartnerPushStatus = {
  /** 안드로이드 앱인지 (웹은 브라우저 알림만) */
  native: boolean;
  permission: 'granted' | 'denied' | 'prompt';
  /** 이 기기가 서버 푸시 대상에 등록됐는지 */
  registered: boolean;
};

export async function getPartnerPushStatus(): Promise<PartnerPushStatus> {
  if (!Capacitor.isNativePlatform()) {
    const p = typeof Notification === 'undefined' ? 'denied' : Notification.permission;
    return { native: false, permission: p === 'default' ? 'prompt' : p, registered: false };
  }
  const perm = await PushNotifications.checkPermissions();
  const permission =
    perm.receive === 'granted' ? 'granted' : perm.receive === 'denied' ? 'denied' : 'prompt';
  return { native: true, permission, registered: Boolean(lastFcmToken) };
}

let listenersReady = false;
let pendingContext: {
  companyId: string;
  scopeCompanyIds: string[];
} | null = null;
let lastFcmToken: string | null = null;
let registerInFlight: Promise<boolean> | null = null;

/** 앱이 꺼져 있을 때 온 출고요청 알림은 소리용이라, 앱을 열면 알림창에서 지운다 */
async function clearCheckoutNotifications(): Promise<void> {
  try {
    const { notifications } = await PushNotifications.getDeliveredNotifications();
    const checkout = notifications.filter((n) => String(n.tag || '').startsWith('out-'));
    if (checkout.length > 0) {
      await PushNotifications.removeDeliveredNotifications({ notifications: checkout });
    }
  } catch {
    // 권한 없음 등
  }
}

function ensurePushListeners(): void {
  if (listenersReady || !Capacitor.isNativePlatform()) return;
  listenersReady = true;

  void clearCheckoutNotifications();
  void App.addListener('appStateChange', ({ isActive }) => {
    if (isActive) void clearCheckoutNotifications();
  });

  void PushNotifications.addListener('registration', (event) => {
    const token = String(event.value || '').trim();
    if (!token) return;
    lastFcmToken = token;
    if (!pendingContext) return;
    void persistFcmToken({
      token,
      companyId: pendingContext.companyId,
      scopeCompanyIds: pendingContext.scopeCompanyIds,
      platform: Capacitor.getPlatform(),
    }).catch((err) => console.warn('[FCM] token save failed:', err));
  });

  void PushNotifications.addListener('registrationError', (err) => {
    console.warn('[FCM] registration error:', err);
  });

  void PushNotifications.addListener('pushNotificationReceived', () => {
    // 앱이 켜져 있으면 예약 목록 구독(notifyNewReservation)이 음성·알림창을 맡는다
  });

  void PushNotifications.addListener('pushNotificationActionPerformed', () => {
    // 탭 시 앱만 열림 (Capacitor singleTask)
  });
}

/**
 * 파트너 앱(안드로이드) FCM 토큰 등록.
 * 웹 브라우저는 no-op — 기존 브라우저 Notification 유지.
 */
export async function registerPartnerPushDevice(params: {
  companyId: string;
  scopeCompanyIds?: string[];
}): Promise<boolean> {
  const companyId = String(params.companyId || '').trim();
  if (!companyId || isAirpickHeadquarters(companyId)) return false;
  if (!Capacitor.isNativePlatform()) return false;

  if (registerInFlight) return registerInFlight;

  registerInFlight = (async () => {
    pendingContext = {
      companyId,
      scopeCompanyIds: params.scopeCompanyIds || [companyId],
    };
    ensurePushListeners();

    // 업체 전환 시 이미 받은 토큰을 새 스코프로 즉시 재등록
    if (lastFcmToken) {
      try {
        await persistFcmToken({
          token: lastFcmToken,
          companyId: pendingContext.companyId,
          scopeCompanyIds: pendingContext.scopeCompanyIds,
          platform: Capacitor.getPlatform(),
        });
      } catch (err) {
        console.warn('[FCM] token rebind failed:', err);
      }
    }

    let perm = await PushNotifications.checkPermissions();
    if (perm.receive === 'prompt' || perm.receive === 'prompt-with-rationale') {
      perm = await PushNotifications.requestPermissions();
    }
    if (perm.receive !== 'granted') {
      console.warn('[FCM] permission not granted:', perm.receive);
      return false;
    }

    try {
      // sound 를 비워야 시스템 기본 알림음. 'default' 는 raw/default 파일을 찾다가 무음이 된다.
      // 채널 소리는 만든 뒤 못 바꾸므로 id 를 새로 쓴다 (서버 channelId 와 같아야 함).
      await PushNotifications.createChannel({
        id: PARTNER_PUSH_CHANNEL_ID,
        name: '예약 알림',
        description: '앱이 꺼져 있을 때 새 예약·출고요청을 알려줍니다',
        importance: 5,
        visibility: 1,
        vibration: true,
      });
      await PushNotifications.deleteChannel({ id: 'new_reservations' }).catch(() => undefined);
    } catch {
      // 웹·구버전 무시
    }

    await PushNotifications.register();

    // registration 콜백이 늦게 올 수 있어, 이미 토큰이 있으면 저장 완료로 본다
    if (lastFcmToken) {
      try {
        await persistFcmToken({
          token: lastFcmToken,
          companyId: pendingContext.companyId,
          scopeCompanyIds: pendingContext.scopeCompanyIds,
          platform: Capacitor.getPlatform(),
        });
        return true;
      } catch (err) {
        console.warn('[FCM] token save after register failed:', err);
        return false;
      }
    }

    return true;
  })().finally(() => {
    registerInFlight = null;
  });

  return registerInFlight;
}
