import * as nodeCrypto from 'crypto';
import * as admin from 'firebase-admin';

/**
 * 접수증 링크용 짧은 비밀 코드(receiptLinkCode).
 * 예약 문서 직접 읽기를 본사·업체·본인으로 막았기 때문에,
 * 손님에게 가는 링크는 모두 추측할 수 없는 코드로 열려야 한다.
 */

const FIELD = 'receiptLinkCode';
const ACTIVE_STATUSES = ['pending', 'pending_in', 'completed_in', 'request_out'];

function createCode(): string {
  return nodeCrypto.randomBytes(6).toString('hex');
}

/** 링크로 쓸 비밀 코드(짧은 토큰 또는 링크 코드)가 없는 예약 */
export function needsReceiptLinkCode(data: Record<string, unknown> | undefined): boolean {
  if (!data) return false;
  const link = typeof data[FIELD] === 'string' ? (data[FIELD] as string).trim() : '';
  if (link) return false;
  const token = typeof data.receiptToken === 'string' ? data.receiptToken.trim() : '';
  return !(token && token.length <= 14);
}

/** 링크 코드만 붙인 변경 — 시트·알림 재실행 없이 넘긴다 */
export function isReceiptLinkStampOnlyChange(
  before: Record<string, unknown> | undefined,
  after: Record<string, unknown> | undefined
): boolean {
  if (!before || !after) return false;
  if (FIELD in before) return false;
  if (!(FIELD in after)) return false;
  const beforeKeys = Object.keys(before).sort();
  const afterKeys = Object.keys(after)
    .filter((k) => k !== FIELD)
    .sort();
  if (beforeKeys.join('\u0000') !== afterKeys.join('\u0000')) return false;
  return afterKeys.every((key) => JSON.stringify(after[key]) === JSON.stringify(before[key]));
}

/** 없으면 붙이고, 붙인 데이터를 돌려준다 */
export async function ensureReceiptLinkCode(
  reservationId: string,
  data: Record<string, unknown>
): Promise<Record<string, unknown>> {
  if (!needsReceiptLinkCode(data)) return data;
  const code = createCode();
  await admin.firestore().doc(`reservations/${reservationId}`).update({ [FIELD]: code });
  return { ...data, [FIELD]: code };
}

/** 매일 새벽 — 진행 중 예약 중 링크 코드가 없는 건에 붙인다 (예전 예약 대비) */
export async function backfillActiveReceiptLinkCodes(budget = 500): Promise<number> {
  const snap = await admin
    .firestore()
    .collection('reservations')
    .where('status', 'in', ACTIVE_STATUSES)
    .limit(2000)
    .get();
  let stamped = 0;
  for (const doc of snap.docs) {
    if (stamped >= budget) break;
    const data = doc.data() as Record<string, unknown>;
    if (!needsReceiptLinkCode(data)) continue;
    try {
      await doc.ref.update({ [FIELD]: createCode() });
      stamped += 1;
    } catch (err) {
      console.warn('[receiptLink] backfill failed', { id: doc.id, err });
    }
  }
  return stamped;
}
