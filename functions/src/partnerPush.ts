import * as admin from 'firebase-admin';

function db() {
  return admin.firestore();
}

const DEFAULT_TITLE_RESERVE = '예약';
const DEFAULT_TITLE_CHECKOUT = '출고요청';

type AlertCopy = { titleReserve: string; titleCheckout: string };

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
      titleReserve: normalizeTitle(
        data.titleReserve || data.titleOther,
        DEFAULT_TITLE_RESERVE
      ),
      titleCheckout: normalizeTitle(data.titleCheckout, DEFAULT_TITLE_CHECKOUT),
    };
  } catch (err) {
    console.warn('[partnerPush] alert copy load failed', err);
    alertCopyCache = {
      titleReserve: DEFAULT_TITLE_RESERVE,
      titleCheckout: DEFAULT_TITLE_CHECKOUT,
    };
  }
  alertCopyCacheAt = Date.now();
  return alertCopyCache;
}

function formatPushBody(_data: FirebaseFirestore.DocumentData): string {
  // 제목만 울림 — 차량번호·일정 본문 없음
  return '';
}

/** 유입과 관계없이 같은 신규 예약 문구 */
async function newReservationPushTitle(
  _data: FirebaseFirestore.DocumentData
): Promise<string> {
  const copy = await loadAlertCopy();
  return copy.titleReserve;
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

/** 출고 탭으로 넘어가면 설정된 문구만 보낸다. 차량번호는 넣지 않는다. */
export async function notifyPartnersFlightArrival(
  reservationId: string,
  data: FirebaseFirestore.DocumentData,
  _info: { flightId: string; estimatedLabel: string }
): Promise<void> {
  await notifyRequestOutPush(reservationId, data);
}

function isRequestOutStatus(raw: unknown): boolean {
  const s = String(raw || '').trim();
  return s === 'request_out' || s === '출고요청';
}

async function notifyRequestOutPush(
  reservationId: string,
  data: FirebaseFirestore.DocumentData
): Promise<void> {
  const companyId = String(data.companyId || '').trim();
  if (!companyId) return;
  const copy = await loadAlertCopy();
  await sendPartnerMulticast({
    companyId,
    reservationId,
    title: copy.titleCheckout,
    body: '',
    type: 'request_out',
    channelId: 'new_reservations',
  });
}

/**
 * 출고 탭(request_out)으로 넘어갈 때 파트너 푸시.
 * 비행기 자동 전환은 notifyPartnersFlightArrival가 먼저 보내므로 여기선 제외한다.
 */
export async function notifyPartnersValetStatusChange(
  reservationId: string,
  before: FirebaseFirestore.DocumentData | undefined,
  after: FirebaseFirestore.DocumentData
): Promise<void> {
  if (!before) return;
  if (isRequestOutStatus(before.status) || !isRequestOutStatus(after.status)) return;
  if (String(after.updatedBy || '') === 'flight-arrival-auto') return;
  await notifyRequestOutPush(reservationId, after);
}
