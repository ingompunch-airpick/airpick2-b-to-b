import * as admin from 'firebase-admin';
import { normalizePhoneDigits } from './customerVisit';

/**
 * hqCustomerHistory/purgedVisits.counts[전화번호] = 앱에서 지운 출차 완료 예약 수.
 * 본사 재방문은 앱에 남은 예약 수 + 이 값으로 판단한다. 본사만 읽는다.
 */
export const PURGED_VISITS_DOC = 'hqCustomerHistory/purgedVisits';

export function customerPhoneKey(phone: unknown): string {
  const digits = normalizePhoneDigits(phone);
  return digits.length >= 10 && digits.startsWith('01') ? digits : '';
}

export async function recordPurgedVisit(data: FirebaseFirestore.DocumentData): Promise<void> {
  if (String(data.status || '') !== 'completed_out') return;
  const key = customerPhoneKey(data.phone);
  if (!key) return;
  await admin
    .firestore()
    .doc(PURGED_VISITS_DOC)
    .set(
      {
        counts: { [key]: admin.firestore.FieldValue.increment(1) },
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );
}

export async function loadPurgedVisitCounts(): Promise<Map<string, number>> {
  const snap = await admin.firestore().doc(PURGED_VISITS_DOC).get();
  const raw = (snap.data()?.counts || {}) as Record<string, unknown>;
  const out = new Map<string, number>();
  for (const [key, value] of Object.entries(raw)) {
    const n = Number(value);
    if (Number.isFinite(n) && n > 0) out.set(key, n);
  }
  return out;
}
