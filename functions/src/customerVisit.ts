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

/**
 * 신규 예약 생성 시 customers/{phoneKey}.visitCount +1
 * (홈·B2B·B2C 공통 — Firestore create 트리거)
 */
export async function bumpCustomerVisitOnCreate(
  reservationId: string,
  data: FirebaseFirestore.DocumentData
): Promise<void> {
  const phoneKey = normalizePhoneDigits(data.phone);
  if (!phoneKey || phoneKey.length < 10 || !phoneKey.startsWith('01')) {
    console.log('[customerVisit] skipped — invalid phone', { reservationId, phone: data.phone });
    return;
  }

  const nameLast = String(data.userName || data.name || '').trim();
  const companyId = String(data.companyId || '').trim();
  const now = new Date().toISOString();
  const ref = admin.firestore().collection('customers').doc(phoneKey);

  await admin.firestore().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) {
      tx.set(ref, {
        phoneKey,
        phoneDisplay: formatPhoneDisplay(phoneKey),
        visitCount: 1,
        firstAt: now,
        lastAt: now,
        lastReservationId: reservationId,
        ...(nameLast ? { nameLast } : {}),
        ...(companyId ? { companyIds: [companyId] } : {}),
        updatedAt: now,
      });
      return;
    }

    const prev = snap.data() || {};
    const companyIds = Array.isArray(prev.companyIds) ? [...prev.companyIds] : [];
    if (companyId && !companyIds.includes(companyId)) companyIds.push(companyId);

    tx.update(ref, {
      visitCount: admin.firestore.FieldValue.increment(1),
      lastAt: now,
      lastReservationId: reservationId,
      phoneDisplay: formatPhoneDisplay(phoneKey),
      updatedAt: now,
      ...(nameLast ? { nameLast } : {}),
      ...(companyIds.length ? { companyIds } : {}),
    });
  });

  console.log('[customerVisit] bumped', { reservationId, phoneKey });
}
