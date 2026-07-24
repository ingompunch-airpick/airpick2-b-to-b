import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { ensureFirestoreAuth } from './firebaseAuth';
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

  await ensureFirestoreAuth();
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
    },
    { merge: true }
  );
}

let listenersReady = false;
let pendingContext: {
  companyId: string;
  scopeCompanyIds: string[];
} | null = null;

function ensurePushListeners(): void {
  if (listenersReady || !Capacitor.isNativePlatform()) return;
  listenersReady = true;

  void PushNotifications.addListener('registration', (event) => {
    const token = String(event.value || '').trim();
    if (!token || !pendingContext) return;
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
    // 포그라운드는 기존 in-app 알림(notifyNewReservation)과 병행
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

  pendingContext = {
    companyId,
    scopeCompanyIds: params.scopeCompanyIds || [companyId],
  };
  ensurePushListeners();

  let perm = await PushNotifications.checkPermissions();
  if (perm.receive === 'prompt' || perm.receive === 'prompt-with-rationale') {
    perm = await PushNotifications.requestPermissions();
  }
  if (perm.receive !== 'granted') {
    console.warn('[FCM] permission not granted:', perm.receive);
    return false;
  }

  try {
    await PushNotifications.createChannel({
      id: 'new_reservations',
      name: '신규 예약',
      description: '신규 입고예정 예약 알림',
      importance: 5,
      visibility: 1,
      sound: 'default',
      vibration: true,
    });
  } catch {
    // 웹·구버전 무시
  }

  await PushNotifications.register();
  return true;
}
