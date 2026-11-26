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
  // 업체는 이 하위 문서(자기 업체 것)만 읽는다 — 다른 업체 방문 기록·손님 이름은 못 본다
  const companyVisitRef = companyId ? custRef.collection('companyVisits').doc(companyId) : null;

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

      if (companyVisitRef) {
        tx.set(
          companyVisitRef,
          { count: admin.firestore.FieldValue.increment(1), lastAt: now, updatedAt: now },
          { merge: true }
        );
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
    if (companyVisitRef) {
      tx.set(
        companyVisitRef,
        { count: admin.firestore.FieldValue.increment(-1), updatedAt: now },
        { merge: true }
      );
    }
    tx.update(resRef, {
      visitBumpedAt: admin.firestore.FieldValue.delete(),
    });
  });
  console.log('[customerVisit] reverted on undo checkout', { reservationId, phoneKey });
}

/**
 * 예전 customers 문서의 visits 맵 → 업체별 하위 문서(companyVisits/{companyId})로 옮겨 둔다.
 * 매일 새벽 작업에서 조금씩. 옮긴 문서엔 companyVisitsSynced 표시.
 */
export async function backfillCustomerCompanyVisits(budget = 400): Promise<number> {
  const db = admin.firestore();
  const snap = await db.collection('customers').limit(2000).get();
  let done = 0;
  for (const doc of snap.docs) {
    if (done >= budget) break;
    const data = doc.data() || {};
    if (data.companyVisitsSynced === true) continue;
    const visits = data.visits && typeof data.visits === 'object' ? (data.visits as Record<string, unknown>) : {};
    const batch = db.batch();
    for (const [companyId, n] of Object.entries(visits)) {
      if (!companyId || typeof n !== 'number') continue;
      batch.set(
        doc.ref.collection('companyVisits').doc(companyId),
        { count: Math.max(0, Math.floor(n)), lastAt: data.lastAt || null, updatedAt: new Date().toISOString() },
        { merge: false }
      );
    }
    batch.update(doc.ref, { companyVisitsSynced: true });
    await batch.commit();
    done += 1;
  }
  return done;
}
