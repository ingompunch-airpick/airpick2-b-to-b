import * as admin from 'firebase-admin';

/** 저장·문서 ID용 숫자만 */
export function normalizePhoneDigits(phone: unknown): string {
  if (typeof phone !== 'string' || !phone.trim()) return '';

  let digits = phone.replace(/\D/g, '');
  if (digits.startsWith('82') && digits.length >= 11) {
    digits = `0${digits.slice(2)}`;
  }
  if (digits.length === 10 && digits.startsWith('10')) {
    digits = `0${digits}`;
  }
  return digits;
}

function formatPhoneDisplay(digits: string): string {
  if (digits.length === 11) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return digits;
}

function isCompletedOut(status: unknown): boolean {
  return String(status || '').trim() === 'completed_out';
}

/**
 * 출고 완료(completed_out) 진입 시 방문 +1 (예약당 1회).
 * completed_out 을 되돌리면 -1 하고 claim 을 풀어 재출고 시 다시 +1.
 * customers/{phone}.visits.{companyId}
 */
export async function bumpCustomerVisitOnCheckout(
  reservationId: string,
  before: FirebaseFirestore.DocumentData | undefined,
  after: FirebaseFirestore.DocumentData
): Promise<void> {
  const afterOut = isCompletedOut(after.status);
  const beforeOut = before ? isCompletedOut(before.status) : false;

  if (afterOut && beforeOut) return;
  if (!afterOut && !beforeOut) return;

  const phoneKey = normalizePhoneDigits(after.phone);
  if (!phoneKey || phoneKey.length < 10 || !phoneKey.startsWith('01')) {
    console.log('[customerVisit] skipped — invalid phone', {
      reservationId,
      phone: after.phone,
    });
    return;
  }

  const nameLast = String(after.userName || after.name || '').trim();
  const companyId = String(after.companyId || '').trim().toLowerCase();
  const now = new Date().toISOString();
  const resRef = admin.firestore().doc(`reservations/${reservationId}`);
  const custRef = admin.firestore().collection('customers').doc(phoneKey);

  if (afterOut && !beforeOut) {
    await admin.firestore().runTransaction(async (tx) => {
      const resSnap = await tx.get(resRef);
      const resData = resSnap.data() || {};
      if (resData.visitBumpedAt) return;

      const snap = await tx.get(custRef);
      if (!snap.exists) {
        tx.set(custRef, {
          phoneKey,
          phoneDisplay: formatPhoneDisplay(phoneKey),
          visitCount: 1,
          ...(companyId ? { visits: { [companyId]: 1 } } : {}),
          firstAt: now,
          lastAt: now,
          lastReservationId: reservationId,
          ...(nameLast ? { nameLast } : {}),
          ...(companyId ? { companyIds: [companyId] } : {}),
          updatedAt: now,
        });
      } else {
        const prev = snap.data() || {};
        const companyIds = Array.isArray(prev.companyIds) ? [...prev.companyIds] : [];
        if (companyId && !companyIds.includes(companyId)) companyIds.push(companyId);

        tx.update(custRef, {
          visitCount: admin.firestore.FieldValue.increment(1),
          ...(companyId
            ? { [`visits.${companyId}`]: admin.firestore.FieldValue.increment(1) }
            : {}),
          lastAt: now,
          lastReservationId: reservationId,
          phoneDisplay: formatPhoneDisplay(phoneKey),
          updatedAt: now,
          ...(nameLast ? { nameLast } : {}),
          ...(companyIds.length ? { companyIds } : {}),
        });
      }

      tx.update(resRef, { visitBumpedAt: now });
    });
    console.log('[customerVisit] bumped on checkout', { reservationId, phoneKey });
    return;
  }

  // completed_out → 그 외: 이미 bump 했으면 1회 되돌림
  await admin.firestore().runTransaction(async (tx) => {
    const resSnap = await tx.get(resRef);
    const resData = resSnap.data() || {};
    if (!resData.visitBumpedAt) return;

    const snap = await tx.get(custRef);
    if (snap.exists) {
      tx.update(custRef, {
        visitCount: admin.firestore.FieldValue.increment(-1),
        ...(companyId
          ? { [`visits.${companyId}`]: admin.firestore.FieldValue.increment(-1) }
          : {}),
        updatedAt: now,
      });
    }
    tx.update(resRef, {
      visitBumpedAt: admin.firestore.FieldValue.delete(),
    });
  });
  console.log('[customerVisit] reverted on undo checkout', { reservationId, phoneKey });
}
