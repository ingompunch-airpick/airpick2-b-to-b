import * as admin from 'firebase-admin';

/**
 * 예약 비밀번호 보관소 — reservations/{id}/secrets/lookup
 *
 * 예약 본문은 로그인한 클라이언트가 읽을 수 있으므로 4자리 비밀번호를 본문에 두면
 * 조회·취소·후기 인증이 그대로 뚫린다. 하위 문서는 Rules 로 전면 차단하고
 * Admin SDK(Functions)만 읽는다.
 */
const SECRET_DOC_ID = 'lookup';

export function reservationSecretRef(reservationId: string) {
  return admin
    .firestore()
    .collection('reservations')
    .doc(reservationId)
    .collection('secrets')
    .doc(SECRET_DOC_ID);
}

function trimmedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * 본문에 남아 있는 비밀번호를 secrets 로 옮기고 본문에서 제거한다.
 * 이미 옮겨졌거나 비어 있으면 아무것도 하지 않는다.
 */
export async function stashReservationPassword(
  reservationId: string,
  data: Record<string, unknown> | undefined
): Promise<void> {
  const password = trimmedString(data?.reservationPassword);
  if (!password) return;

  await reservationSecretRef(reservationId).set(
    { password, updatedAt: new Date().toISOString() },
    { merge: true }
  );
  await admin
    .firestore()
    .collection('reservations')
    .doc(reservationId)
    .update({ reservationPassword: admin.firestore.FieldValue.delete() });
}

/**
 * 검증용 비밀번호 조회. secrets 우선, 없으면 레거시 본문 값을 쓰고 즉시 이전한다.
 * data 를 넘기지 않으면 예약 문서를 직접 읽는다.
 */
export async function resolveReservationPassword(
  reservationId: string,
  data?: Record<string, unknown>
): Promise<string | null> {
  const secretSnap = await reservationSecretRef(reservationId).get();
  const fromSecrets = trimmedString(secretSnap.data()?.password);
  if (fromSecrets) return fromSecrets;

  let body = data;
  if (!body) {
    const snap = await admin.firestore().collection('reservations').doc(reservationId).get();
    body = snap.data() as Record<string, unknown> | undefined;
  }

  const legacy = trimmedString(body?.reservationPassword);
  if (!legacy) return null;

  // 조회된 김에 이전 — 실패해도 인증 자체는 통과시킨다
  await stashReservationPassword(reservationId, body).catch((err) => {
    console.warn('[reservationSecrets] stash on read failed', { reservationId, err });
  });
  return legacy;
}

/** 예약 문서를 지울 때 하위 secrets 도 같이 지운다 (하위 컬렉션은 자동 삭제되지 않음) */
export async function deleteReservationSecrets(reservationId: string): Promise<void> {
  await reservationSecretRef(reservationId)
    .delete()
    .catch((err) => {
      console.warn('[reservationSecrets] delete failed', { reservationId, err });
    });
}

/**
 * 이미 저장돼 있는 예약 중 본문에 비밀번호가 남은 건을 옮긴다.
 * orderBy 는 해당 필드가 있는 문서만 반환하므로 남은 건만 골라진다.
 */
export async function sweepReservationPasswords(budget = 500): Promise<number> {
  let moved = 0;

  while (moved < budget) {
    const snap = await admin
      .firestore()
      .collection('reservations')
      .orderBy('reservationPassword')
      .limit(Math.min(100, budget - moved))
      .get();
    if (snap.empty) break;

    for (const doc of snap.docs) {
      try {
        await stashReservationPassword(doc.id, doc.data() as Record<string, unknown>);
        moved += 1;
      } catch (err) {
        console.warn('[reservationSecrets] sweep failed', { id: doc.id, err });
        return moved;
      }
    }
  }

  return moved;
}

/**
 * 예약 문서 변경이 "비밀번호 필드 제거"뿐인지 판별.
 * stashReservationPassword 가 유발한 재진입에서 알림톡·시트가 다시 돌지 않게 한다.
 */
export function isPasswordStripOnlyChange(
  before: Record<string, unknown> | undefined,
  after: Record<string, unknown> | undefined
): boolean {
  if (!before || !after) return false;
  if (!('reservationPassword' in before)) return false;
  if ('reservationPassword' in after) return false;

  const beforeKeys = Object.keys(before)
    .filter((k) => k !== 'reservationPassword')
    .sort();
  const afterKeys = Object.keys(after).sort();
  if (beforeKeys.join('\u0000') !== afterKeys.join('\u0000')) return false;

  return afterKeys.every(
    (key) => JSON.stringify(after[key]) === JSON.stringify(before[key])
  );
}
