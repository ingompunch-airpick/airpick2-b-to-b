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

  const snap = await db()
    .collection('fcmTokens')
    .where('enabled', '==', true)
    .where('scopeCompanyIds', 'array-contains', companyId)
    .limit(100)
    .get();

  if (snap.empty) {
    console.log('[partnerPush] no tokens', { reservationId, companyId });
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

  const companyLabel = String(data.companyName || companyId).trim() || companyId;
  const title = `신규 입고예정 · ${companyLabel}`;
  const body = formatPushBody(data);

  const response = await admin.messaging().sendEachForMulticast({
    tokens,
    notification: { title, body },
    data: {
      reservationId,
      companyId,
      type: 'new_reservation',
    },
    android: {
      priority: 'high',
      notification: {
        channelId: 'new_reservations',
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
    success: response.successCount,
    failure: response.failureCount,
    pruned: staleDocs.length,
  });
}
