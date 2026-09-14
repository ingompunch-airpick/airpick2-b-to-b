import * as admin from 'firebase-admin';
import { resolveBookingSource } from './sheets/bookingSource';

function db() {
  return admin.firestore();
}

const DEFAULT_TITLE_AIRPICK = '에어픽 예약';
const DEFAULT_TITLE_OTHER = '예약';

type AlertCopy = { titleAirpick: string; titleOther: string };

let alertCopyCache: AlertCopy | null = null;
let alertCopyCacheAt = 0;
const ALERT_COPY_CACHE_MS = 60_000;

function normalizeTitle(raw: unknown, fallback: string): string {
  const s = String(raw ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, 24);
  return s || fallback;
}

async function loadAlertCopy(): Promise<AlertCopy> {
  if (alertCopyCache && Date.now() - alertCopyCacheAt < ALERT_COPY_CACHE_MS) {
    return alertCopyCache;
  }
  try {
    const snap = await db().doc('appConfig/reservationAlerts').get();
    const data = snap.exists ? (snap.data() as Record<string, unknown>) : {};
    alertCopyCache = {
      titleAirpick: normalizeTitle(data.titleAirpick, DEFAULT_TITLE_AIRPICK),
      titleOther: normalizeTitle(data.titleOther, DEFAULT_TITLE_OTHER),
    };
  } catch (err) {
    console.warn('[partnerPush] alert copy load failed', err);
    alertCopyCache = {
      titleAirpick: DEFAULT_TITLE_AIRPICK,
      titleOther: DEFAULT_TITLE_OTHER,
    };
  }
  alertCopyCacheAt = Date.now();
  return alertCopyCache;
}

function formatPushBody(_data: FirebaseFirestore.DocumentData): string {
  // 제목만 울림 — 차량번호·일정 본문 없음
  return '';
}

/** 에어픽 B2C vs 홈·현장 알림 제목 분리 (appConfig/reservationAlerts) */
async function newReservationPushTitle(
  data: FirebaseFirestore.DocumentData
): Promise<string> {
  const copy = await loadAlertCopy();
  const source = resolveBookingSource(
    typeof data.createdBy === 'string' ? data.createdBy : null,
    data as Record<string, unknown>
  );
  return source === 'airpick-b2c' ? copy.titleAirpick : copy.titleOther;
}

async function sendPartnerMulticast(params: {
  companyId: string;
  reservationId: string;
  title: string;
  body: string;
  type: string;
  channelId: string;
  extraData?: Record<string, string>;
}): Promise<void> {
  const { companyId, reservationId, title, body, type, channelId, extraData } = params;

  const snap = await db()
    .collection('fcmTokens')
    .where('enabled', '==', true)
    .where('scopeCompanyIds', 'array-contains', companyId)
    .limit(100)
    .get();

  if (snap.empty) {
    console.log('[partnerPush] no tokens', { reservationId, companyId, type });
    return;
  }

  const tokens = Array.from(
    new Set(
      snap.docs
        .map((d) => String(d.data().token || '').trim())
        .filter(Boolean)
    )
  );
  if (!tokens.length) return;

  const response = await admin.messaging().sendEachForMulticast({
    tokens,
    notification: body.trim()
      ? { title, body }
      : { title },
    data: {
      reservationId,
      companyId,
      type,
      ...(extraData || {}),
    },
    android: {
      priority: 'high',
      notification: {
        channelId,
        sound: 'default',
      },
    },
  });

  const staleDocs: FirebaseFirestore.DocumentReference[] = [];
  response.responses.forEach((res, idx) => {
    if (res.success) return;
    const code = res.error?.code || '';
    if (
      code === 'messaging/registration-token-not-registered' ||
      code === 'messaging/invalid-registration-token'
    ) {
      const token = tokens[idx];
      const doc = snap.docs.find((d) => d.data().token === token);
      if (doc) staleDocs.push(doc.ref);
    }
  });

  await Promise.all(staleDocs.map((ref) => ref.delete().catch(() => undefined)));

  console.log('[partnerPush] sent', {
    reservationId,
    companyId,
    type,
    success: response.successCount,
    failure: response.failureCount,
    pruned: staleDocs.length,
  });
}

/**
 * 신규 예약 생성 시 해당 업체(및 운영 그룹) 단말로 FCM 푸시.
 * 토큰은 파트너 앱이 `fcmTokens`에 저장한다.
 */
export async function notifyPartnersNewReservation(
  reservationId: string,
  data: FirebaseFirestore.DocumentData
): Promise<void> {
  const companyId = String(data.companyId || '').trim();
  if (!companyId) return;

  await sendPartnerMulticast({
    companyId,
    reservationId,
    title: await newReservationPushTitle(data),
    body: formatPushBody(data),
    type: 'new_reservation',
    channelId: 'new_reservations',
  });
}

export type FlightDelayPushInfo = {
  flightId: string;
  scheduleLabel: string;
  estimatedLabel: string;
  delayMinutes: number;
  remark: string;
  cancelled: boolean;
};

/** 입국 항공편 연착·결항 시 파트너 푸시 — 사용 안 함(예약 유입만 알림) */
export async function notifyPartnersFlightDelay(
  _reservationId: string,
  _data: FirebaseFirestore.DocumentData,
  _info: FlightDelayPushInfo
): Promise<void> {
  return;
}

/** 입국 항공편 도착 시 출고요청 자동 전환 알림 — 사용 안 함 */
export async function notifyPartnersFlightArrival(
  _reservationId: string,
  _data: FirebaseFirestore.DocumentData,
  _info: { flightId: string; estimatedLabel: string }
): Promise<void> {
  return;
}

/**
 * 출고예정 → 출고(request_out) 수동 전환 알림 — 사용 안 함(예약 유입만 알림).
 */
export async function notifyPartnersValetStatusChange(
  _reservationId: string,
  _before: FirebaseFirestore.DocumentData | undefined,
  _after: FirebaseFirestore.DocumentData
): Promise<void> {
  return;
}
