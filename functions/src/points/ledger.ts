import * as admin from 'firebase-admin';

/** 사용 단위. 클라이언트 접수 화면과 같아야 한다. */
export const POINT_STEP_WON = 5000;

/** 출고 완료 금액의 5%. 원 단위 미만은 버린다. */
export function pointsEarnedWon(totalPrice: number): number {
  const total = Math.max(0, Math.floor(Number(totalPrice) || 0));
  return Math.floor((total * 5) / 100);
}

function kakaoUid(data: FirebaseFirestore.DocumentData): string | null {
  const uid = String(data.userId || '').trim();
  if (!uid || uid === 'guest') return null;
  if (data.memberProvider !== 'kakao') return null;
  return uid;
}

function accountRef(uid: string) {
  return admin.firestore().doc(`pointAccounts/${uid}`);
}

/**
 * 접수 문서의 totalPrice 는 포인트 적용 전 금액이다.
 * 잔액이 되면 그 금액을 빼고 pointSpentWon 을 남긴다. 아니면 금액을 그대로 둔다.
 * 반환값은 알림톡·시트가 읽을 문서다.
 */
export async function settlePointSpendOnCreate(
  reservationId: string,
  after: FirebaseFirestore.DocumentData
): Promise<FirebaseFirestore.DocumentData> {
  const db = admin.firestore();
  const ref = db.doc(`reservations/${reservationId}`);

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return after;
    const current = snap.data() || {};
    if (current.pointSpendSettled === true) return current;

    const requested = Math.floor(Number(current.pointSpendWon) || 0);
    const forged =
      typeof current.pointsEarnedWon === 'number' ||
      current.pointRefunded === true ||
      requested > 0;
    if (!forged && !('pointSpendWon' in current) && !('pointsEarnedWon' in current)) {
      return current;
    }

    const updates: Record<string, unknown> = { pointSpendSettled: true };
    if ('pointsEarnedWon' in current) {
      updates.pointsEarnedWon = admin.firestore.FieldValue.delete();
    }
    if ('pointRefunded' in current) {
      updates.pointRefunded = admin.firestore.FieldValue.delete();
    }

    const uid = kakaoUid(current);
    const gross = Math.max(0, Math.floor(Number(current.totalPrice) || 0));
    const stepOk = requested >= POINT_STEP_WON && requested % POINT_STEP_WON === 0 && requested <= gross;
    let applied = 0;

    if (uid && stepOk) {
      const accRef = accountRef(uid);
      const accSnap = await tx.get(accRef);
      const balance = Math.floor(Number(accSnap.data()?.balance) || 0);
      if (balance >= requested) {
        applied = requested;
        const nextBalance = balance - requested;
        const now = new Date().toISOString();
        tx.set(accRef, { uid, balance: nextBalance, updatedAt: now }, { merge: true });
        tx.set(accRef.collection('entries').doc(`spend_${reservationId}`), {
          type: 'spend',
          won: -requested,
          reservationId,
          balanceAfter: nextBalance,
          at: now,
        });
        updates.totalPrice = gross - requested;
        updates.pointSpentWon = requested;
      }
    }

    updates.pointSpendWon = admin.firestore.FieldValue.delete();
    if (applied === 0 && 'pointSpentWon' in current) {
      updates.pointSpentWon = admin.firestore.FieldValue.delete();
    }

    tx.update(ref, updates as FirebaseFirestore.UpdateData<FirebaseFirestore.DocumentData>);

    const next: FirebaseFirestore.DocumentData = { ...current, pointSpendSettled: true };
    delete next.pointSpendWon;
    delete next.pointsEarnedWon;
    delete next.pointRefunded;
    if (applied > 0) {
      next.totalPrice = gross - requested;
      next.pointSpentWon = requested;
    } else {
      delete next.pointSpentWon;
    }
    return next;
  });
}

async function earnOnCheckout(reservationId: string): Promise<void> {
  const db = admin.firestore();
  const ref = db.doc(`reservations/${reservationId}`);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.data();
    if (!data || String(data.status || '') !== 'completed_out') return;
    if (typeof data.pointsEarnedWon === 'number') return;

    const uid = kakaoUid(data);
    const earned = uid ? pointsEarnedWon(Number(data.totalPrice) || 0) : 0;
    if (!uid || earned < 1) return;

    const accRef = accountRef(uid);
    const accSnap = await tx.get(accRef);
    const balance = Math.floor(Number(accSnap.data()?.balance) || 0);
    const nextBalance = balance + earned;
    const now = new Date().toISOString();
    tx.set(accRef, { uid, balance: nextBalance, updatedAt: now }, { merge: true });
    tx.set(accRef.collection('entries').doc(), {
      type: 'earn',
      won: earned,
      reservationId,
      balanceAfter: nextBalance,
      at: now,
    });
    tx.update(ref, { pointsEarnedWon: earned });
  });
}

async function reverseEarn(reservationId: string): Promise<void> {
  const db = admin.firestore();
  const ref = db.doc(`reservations/${reservationId}`);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.data();
    if (!data || String(data.status || '') === 'completed_out') return;
    if (typeof data.pointsEarnedWon !== 'number') return;

    const earned = Math.floor(data.pointsEarnedWon);
    const uid = kakaoUid(data);
    if (uid && earned > 0) {
      const accRef = accountRef(uid);
      const accSnap = await tx.get(accRef);
      const balance = Math.floor(Number(accSnap.data()?.balance) || 0);
      const nextBalance = balance - earned;
      const now = new Date().toISOString();
      tx.set(accRef, { uid, balance: nextBalance, updatedAt: now }, { merge: true });
      tx.set(accRef.collection('entries').doc(), {
        type: 'reverse',
        won: -earned,
        reservationId,
        balanceAfter: nextBalance,
        at: now,
      });
    }
    tx.update(ref, { pointsEarnedWon: admin.firestore.FieldValue.delete() });
  });
}

async function refundSpend(reservationId: string): Promise<void> {
  const db = admin.firestore();
  const ref = db.doc(`reservations/${reservationId}`);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.data();
    if (!data || String(data.status || '') !== 'cancelled') return;
    if (data.pointRefunded === true) return;

    const spent = Math.floor(Number(data.pointSpentWon) || 0);
    const uid = kakaoUid(data);
    if (uid && spent > 0) {
      const accRef = accountRef(uid);
      const accSnap = await tx.get(accRef);
      const balance = Math.floor(Number(accSnap.data()?.balance) || 0);
      const nextBalance = balance + spent;
      const now = new Date().toISOString();
      tx.set(accRef, { uid, balance: nextBalance, updatedAt: now }, { merge: true });
      tx.set(accRef.collection('entries').doc(`refund_${reservationId}`), {
        type: 'refund',
        won: spent,
        reservationId,
        balanceAfter: nextBalance,
        at: now,
      });
    }
    if (spent > 0) tx.update(ref, { pointRefunded: true });
  });
}

/** 출고 완료에 적립하고, 되돌리면 빼고, 취소하면 사용한 포인트를 되돌린다. */
export async function syncPointsOnReservationUpdate(
  reservationId: string,
  before: FirebaseFirestore.DocumentData,
  after: FirebaseFirestore.DocumentData
): Promise<void> {
  const wasOut = String(before.status || '') === 'completed_out';
  const isOut = String(after.status || '') === 'completed_out';
  if (!wasOut && isOut) await earnOnCheckout(reservationId);
  if (wasOut && !isOut) await reverseEarn(reservationId);

  const becameCancelled = String(before.status || '') !== 'cancelled' && String(after.status || '') === 'cancelled';
  if (becameCancelled) await refundSpend(reservationId);
}
