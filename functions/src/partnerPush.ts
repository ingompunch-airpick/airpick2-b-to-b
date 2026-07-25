import * as admin from 'firebase-admin';

function db() {
  return admin.firestore();
}

function formatPushBody(data: FirebaseFirestore.DocumentData): string {
  const car = String(data.carNumber || '차량미상').trim();
  const name = String(data.userName || '').trim();
  const date = String(data.departureDate || '').trim();
  const time = String(data.departureTime || '').trim();
  const schedule = [date, time].filter(Boolean).join(' ');
  return [car, name, schedule].filter(Boolean).join(' · ');
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
    notification: { title, body },
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

  const companyLabel = String(data.companyName || companyId).trim() || companyId;
  await sendPartnerMulticast({
    companyId,
    reservationId,
    title: `신규 입고예정 · ${companyLabel}`,
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

/** 입국 항공편 연착·결항 시 파트너 푸시 */
export async function notifyPartnersFlightDelay(
  reservationId: string,
  data: FirebaseFirestore.DocumentData,
  info: FlightDelayPushInfo
): Promise<void> {
  const companyId = String(data.companyId || '').trim();
  if (!companyId) return;

  const car = String(data.carNumber || '').trim();
  const name = String(data.userName || '').trim();
  const who = [name, car].filter(Boolean).join(' · ') || '고객';

  const title = info.cancelled
    ? `항공편 결항 · ${info.flightId}`
    : `항공편 연착 · ${info.flightId}`;
  const body = info.cancelled
    ? `${who} · 결항 (${info.remark || '결항'})`
    : `${who} · ${info.scheduleLabel} → ${info.estimatedLabel} (+${info.delayMinutes}분)`;

  await sendPartnerMulticast({
    companyId,
    reservationId,
    title,
    body,
    type: info.cancelled ? 'flight_cancel' : 'flight_delay',
    channelId: 'flight_delays',
    extraData: {
      flightId: info.flightId,
      schedule: info.scheduleLabel,
      estimated: info.estimatedLabel,
      delayMinutes: String(info.delayMinutes),
    },
  });
}
