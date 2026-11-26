import { randomBytes } from 'crypto';
import * as admin from 'firebase-admin';

import {
  currentPaymentMode,
  FULL_REFUND_HOURS,
  isPaymentRequired,
  LATE_REFUND_RATIO,
  PAYMENT_HOLD_MINUTES,
  portoneStoreIdParam,
} from './config';
import { cancelPortonePayment, getPortonePayment } from './portoneApi';
import { checkB2cReservationPrice } from '../reservations/priceCheck';
import { settlePointSpendOnCreate } from '../points/ledger';
import { enforceHourlyCapacityOnCreate } from '../hourlyCapacity';
import { enforceDailyIntakeOnCreate } from '../dailyIntakeCapacity';
import { enforceParkingCapacityOnCreate } from '../parkingCapacity';

/**
 * 예약 결제 상태 — reservations/{id}.payment (서버만 쓴다, Rules 로 손님·업체 수정 금지)
 *   status: awaiting(결제 대기) → paid → refunded | partial_refunded
 *           awaiting → expired(15분 초과, 예약 취소)
 * 결제 시도: paymentAttempts/{paymentId} = { reservationId, amount } (서버 전용)
 */

export type PaymentState =
  | 'paid'
  | 'pending'
  | 'failed'
  | 'refunded_late'
  | 'refunded_duplicate'
  | 'refunded_mismatch'
  | 'unknown';

const won = (v: unknown) => Math.max(0, Math.round(Number(v) || 0));
const db = () => admin.firestore();
const resRef = (id: string) => db().doc(`reservations/${id}`);
const attemptRef = (paymentId: string) => db().doc(`paymentAttempts/${paymentId}`);

export class PaymentError extends Error {
  constructor(
    readonly code:
      | 'not_found'
      | 'forbidden'
      | 'not_required'
      | 'expired'
      | 'already_paid'
      | 'cancelled'
      | 'price_mismatch',
    message: string
  ) {
    super(message);
    this.name = 'PaymentError';
  }
}

function newPaymentId(): string {
  // 영문·숫자만 (PG 공통 안전)
  return `ap${Date.now().toString(36)}${randomBytes(5).toString('hex')}`;
}

function holdUntilIso(fromMs = Date.now()): string {
  return new Date(fromMs + PAYMENT_HOLD_MINUTES * 60 * 1000).toISOString();
}

/** 생성 트리거·결제 준비에서 호출 — 결제 대상인데 payment 가 없으면 대기로 잡는다 */
export async function ensureAwaitingPayment(
  reservationId: string,
  data: FirebaseFirestore.DocumentData
): Promise<FirebaseFirestore.DocumentData> {
  if (data.payment || !isPaymentRequired(data)) return data;
  return db().runTransaction(async (tx) => {
    const snap = await tx.get(resRef(reservationId));
    if (!snap.exists) return data;
    const cur = snap.data() || {};
    if (cur.payment) return cur;
    const created = Date.parse(String(cur.createdAt || ''));
    const payment = {
      required: true,
      status: 'awaiting',
      holdUntil: holdUntilIso(Number.isFinite(created) ? Math.min(created, Date.now()) : Date.now()),
      paymentIds: [] as string[],
    };
    tx.update(resRef(reservationId), { payment });
    return { ...cur, payment };
  });
}

/**
 * 결제창을 열기 전 — 서버가 금액을 정하고 결제 번호를 만든다.
 * 포인트 0원 결제면 결제창 없이 바로 확정.
 */
export async function preparePayment(
  reservationId: string,
  callerUid: string,
  apiSecret: string
): Promise<{ paymentId: string; amount: number; holdUntil: string } | { paid: true; amount: 0 }> {
  const snap = await resRef(reservationId).get();
  if (!snap.exists) throw new PaymentError('not_found', '예약을 찾지 못했습니다. 마감됐을 수 있어요.');
  let data = snap.data() || {};
  if (String(data.userId || '') !== callerUid) {
    throw new PaymentError('forbidden', '예약한 본인만 결제할 수 있습니다.');
  }
  if (!isPaymentRequired(data)) throw new PaymentError('not_required', '결제가 필요 없는 예약입니다.');
  data = await ensureAwaitingPayment(reservationId, data);
  const payment = (data.payment || {}) as Record<string, unknown>;

  if (payment.status === 'paid') throw new PaymentError('already_paid', '이미 결제된 예약입니다.');
  if (String(data.status || '') === 'cancelled' || payment.status !== 'awaiting') {
    throw new PaymentError('cancelled', '취소된 예약입니다. 처음부터 다시 예약해 주세요.');
  }
  if (Date.parse(String(payment.holdUntil || '')) <= Date.now()) {
    throw new PaymentError('expired', '결제 시간(15분)이 지났습니다. 처음부터 다시 예약해 주세요.');
  }

  // 이전 결제 시도가 실제로 결제됐으면 새로 받지 않는다
  const prevIds = Array.isArray(payment.paymentIds) ? (payment.paymentIds as string[]) : [];
  for (const pid of prevIds.slice(-3)) {
    const prev = await getPortonePayment(apiSecret, pid);
    if (prev?.status === 'PAID') {
      await settlePayment(pid, apiSecret);
      throw new PaymentError('already_paid', '이미 결제된 예약입니다.');
    }
  }

  // 포인트 차감 확정(생성 트리거보다 먼저 올 수 있음)
  if (data.pointSpendWon && data.pointSpendSettled !== true) {
    data = await settlePointSpendOnCreate(reservationId, data);
  }

  // 금액은 손님 화면이 아니라 서버 검사를 통과한 값으로만
  const gross = won(data.totalPrice) + won(data.pointSpentWon);
  const check = await checkB2cReservationPrice(reservationId, { ...data, totalPrice: gross });
  if (check && !check.ok) {
    console.warn('[payment] price check failed', { reservationId, issues: check.issues });
    throw new PaymentError('price_mismatch', '요금이 바뀌었어요. 처음부터 다시 예약해 주세요.');
  }
  const amount = won(data.totalPrice);

  if (amount === 0) {
    await resRef(reservationId).update({
      'payment.status': 'paid',
      'payment.amount': 0,
      'payment.method': 'points',
      'payment.paidAt': new Date().toISOString(),
      paymentMethod: 'points',
    });
    return { paid: true, amount: 0 };
  }

  const paymentId = newPaymentId();
  await attemptRef(paymentId).set({
    reservationId,
    amount,
    uid: callerUid,
    mode: currentPaymentMode(),
    createdAt: new Date().toISOString(),
  });
  await resRef(reservationId).update({
    'payment.amount': amount,
    'payment.paymentIds': admin.firestore.FieldValue.arrayUnion(paymentId),
    'payment.lastPaymentId': paymentId,
  });
  return { paymentId, amount, holdUntil: String(payment.holdUntil) };
}

async function refundWholePayment(paymentId: string, amount: number, reason: string, apiSecret: string) {
  try {
    await cancelPortonePayment(apiSecret, paymentId, {
      reason,
      currentCancellableAmount: amount,
    });
  } catch (err) {
    console.error('[payment] auto refund failed — 본사 확인 필요', { paymentId, reason, err });
    await attemptRef(paymentId).set(
      { refundError: String(err instanceof Error ? err.message : err), refundReason: reason },
      { merge: true }
    );
    return;
  }
  await attemptRef(paymentId).set(
    { refundedAt: new Date().toISOString(), refundReason: reason },
    { merge: true }
  );
}

/** 15분 초과로 취소된 예약에 결제가 늦게 들어오면 — 자리가 남으면 되살린다 */
async function tryReviveLatePaid(reservationId: string): Promise<boolean> {
  const snap = await resRef(reservationId).get();
  const data = snap.data();
  if (!data) return false;
  const opts = { dryRun: true };
  const over =
    (await enforceHourlyCapacityOnCreate(reservationId, data, opts)) ||
    (await enforceDailyIntakeOnCreate(reservationId, data, opts)) ||
    (await enforceParkingCapacityOnCreate(reservationId, data, opts));
  return !over;
}

/**
 * 결제 확인 — 결제 완료 화면·웹훅·시간초과 작업이 같이 쓴다. 여러 번 불러도 결과가 같다.
 */
export async function settlePayment(
  paymentId: string,
  apiSecret: string
): Promise<{ state: PaymentState; reservationId?: string; bookingNo?: string }> {
  const attemptSnap = await attemptRef(paymentId).get();
  if (!attemptSnap.exists) return { state: 'unknown' };
  const attempt = attemptSnap.data() || {};
  const reservationId = String(attempt.reservationId || '');
  const amount = won(attempt.amount);

  const pay = await getPortonePayment(apiSecret, paymentId);
  if (!pay) return { state: 'pending', reservationId };
  if (pay.status === 'FAILED') return { state: 'failed', reservationId };
  if (pay.status !== 'PAID') {
    // 이미 우리가 환불한 건이면 그 결과를 돌려준다
    return { state: pay.status === 'CANCELLED' ? 'refunded_late' : 'pending', reservationId };
  }

  const storeId = String(portoneStoreIdParam.value() || '').trim();
  const paidTotal = won(pay.amount?.total);
  if ((storeId && pay.storeId && pay.storeId !== storeId) || paidTotal !== amount || (pay.currency && pay.currency !== 'KRW')) {
    console.error('[payment] amount/store mismatch', { paymentId, paidTotal, amount, store: pay.storeId });
    await refundWholePayment(paymentId, paidTotal, '결제 금액 불일치 자동 취소', apiSecret);
    return { state: 'refunded_mismatch', reservationId };
  }

  type TxResult =
    | { kind: 'paid'; bookingNo?: string }
    | { kind: 'already'; bookingNo?: string }
    | { kind: 'refund'; reason: string }
    | { kind: 'revive' };

  const now = new Date().toISOString();
  const result: TxResult = await db().runTransaction(async (tx) => {
    const snap = await tx.get(resRef(reservationId));
    if (!snap.exists) return { kind: 'refund', reason: '예약 없음(마감) 자동 취소' };
    const data = snap.data() || {};
    const p = (data.payment || {}) as Record<string, unknown>;
    const bookingNo = typeof data.bookingNo === 'string' ? data.bookingNo : undefined;
    if (p.status === 'paid' || p.status === 'refunded' || p.status === 'partial_refunded') {
      if (p.paymentId === paymentId) return { kind: 'already', bookingNo };
      return { kind: 'refund', reason: '중복 결제 자동 취소' };
    }
    const paidFields = {
      'payment.status': 'paid',
      'payment.paymentId': paymentId,
      'payment.amount': amount,
      'payment.paidAt': pay.paidAt || now,
      'payment.pgTxId': pay.transactionId || '',
      'payment.method': pay.method?.type || 'card',
      paymentMethod: 'online',
    };
    if (String(data.status || '') === 'cancelled') {
      const lateRevivable =
        data.cancelledBy === 'payment_timeout' && !(won(data.pointSpentWon) > 0 && data.pointRefunded === true);
      if (!lateRevivable) return { kind: 'refund', reason: '취소된 예약 결제 자동 취소' };
      tx.update(resRef(reservationId), {
        ...paidFields,
        status: 'pending',
        cancelledAt: admin.firestore.FieldValue.delete(),
        cancelledBy: admin.firestore.FieldValue.delete(),
        'payment.lateRevivedAt': now,
      });
      return { kind: 'revive' };
    }
    tx.update(resRef(reservationId), paidFields);
    return { kind: 'paid', bookingNo };
  });

  if (result.kind === 'paid' || result.kind === 'already') {
    return { state: 'paid', reservationId, bookingNo: result.bookingNo };
  }
  if (result.kind === 'refund') {
    await refundWholePayment(paymentId, amount, result.reason, apiSecret);
    return {
      state: result.reason.startsWith('중복') ? 'refunded_duplicate' : 'refunded_late',
      reservationId,
    };
  }
  // revive: 자리 다시 확인
  const ok = await tryReviveLatePaid(reservationId);
  if (ok) {
    const snap = await resRef(reservationId).get();
    return { state: 'paid', reservationId, bookingNo: snap.data()?.bookingNo };
  }
  await resRef(reservationId).update({
    status: 'cancelled',
    cancelledAt: now,
    cancelledBy: 'payment_late_full',
    'payment.status': 'refunded',
    paymentRefund: { won: amount, ratio: 1, reason: '결제 시간 초과 후 자리 마감', source: 'server', at: now },
  });
  await refundWholePayment(paymentId, amount, '결제 시간 초과 후 자리 마감 자동 취소', apiSecret);
  return { state: 'refunded_late', reservationId };
}

/** 맡기는 시간(KST) */
export function parseKstCheckIn(departureDate: unknown, departureTime: unknown): Date | null {
  const date = String(departureDate ?? '').trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const rawTime = String(departureTime ?? '').trim();
  const time = /^\d{2}:\d{2}$/.test(rawTime) ? rawTime : '00:00';
  const dt = new Date(`${date}T${time}:00+09:00`);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

/** 손님 취소 환불 비율 — 24시간 전 100%, 맡기기 전 50%, 그 뒤 null(셀프 취소 불가) */
export function customerRefundRatio(checkIn: Date, at = new Date()): number | null {
  const t = at.getTime();
  if (t <= checkIn.getTime() - FULL_REFUND_HOURS * 60 * 60 * 1000) return 1;
  if (t < checkIn.getTime()) return LATE_REFUND_RATIO;
  return null;
}

/**
 * 결제 완료 예약 환불. 같은 예약을 두 번 환불하지 않는다.
 * 반환: 환불 금액 (결제 안 된 예약이면 null)
 */
export async function refundReservationPayment(
  reservationId: string,
  args: { ratio: number; reason: string; source: 'customer' | 'partner' | 'server' },
  apiSecret: string
): Promise<{ won: number; ratio: number } | null> {
  const ratio = Math.max(0, Math.min(1, args.ratio));
  const claim = await db().runTransaction(async (tx) => {
    const snap = await tx.get(resRef(reservationId));
    const data = snap.data();
    if (!data) return null;
    const p = (data.payment || {}) as Record<string, unknown>;
    if (p.status !== 'paid' || data.paymentRefund || data.paymentRefundClaim) return null;
    const paid = won(p.amount);
    const paymentId = String(p.paymentId || '');
    tx.update(resRef(reservationId), {
      paymentRefundClaim: { at: new Date().toISOString(), source: args.source },
    });
    return { paid, paymentId };
  });
  if (!claim) return null;

  const refundWon = Math.floor(claim.paid * ratio);
  let cancellation: { id?: string; status?: string } = {};
  try {
    if (refundWon > 0 && claim.paymentId) {
      cancellation = await cancelPortonePayment(apiSecret, claim.paymentId, {
        amount: refundWon,
        reason: args.reason,
        currentCancellableAmount: claim.paid,
      });
    }
  } catch (err) {
    await resRef(reservationId).update({
      paymentRefundClaim: admin.firestore.FieldValue.delete(),
      paymentRefundError: {
        at: new Date().toISOString(),
        message: String(err instanceof Error ? err.message : err).slice(0, 300),
      },
    });
    throw err;
  }

  await resRef(reservationId).update({
    'payment.status': ratio >= 1 ? 'refunded' : refundWon > 0 ? 'partial_refunded' : 'paid',
    paymentRefund: {
      won: refundWon,
      ratio,
      reason: args.reason,
      source: args.source,
      at: new Date().toISOString(),
      cancellationId: cancellation.id || '',
      cancellationStatus: cancellation.status || (refundWon > 0 ? 'REQUESTED' : 'NONE'),
    },
    paymentRefundClaim: admin.firestore.FieldValue.delete(),
    paymentRefundError: admin.firestore.FieldValue.delete(),
  });
  return { won: refundWon, ratio };
}

/** 5분마다 — 결제 대기 15분 지난 예약 정리 */
export async function expireAwaitingPayments(apiSecret: string): Promise<{ expired: number; settled: number }> {
  const snap = await db()
    .collection('reservations')
    .where('payment.status', '==', 'awaiting')
    .limit(300)
    .get();
  const nowMs = Date.now();
  let expired = 0;
  let settled = 0;
  for (const doc of snap.docs) {
    const data = doc.data();
    const p = (data.payment || {}) as Record<string, unknown>;
    if (Date.parse(String(p.holdUntil || '')) > nowMs) continue;

    // 결제는 됐는데 확인이 안 된 건부터
    let paidFound = false;
    const ids = Array.isArray(p.paymentIds) ? (p.paymentIds as string[]) : [];
    for (const pid of ids.slice(-3).reverse()) {
      try {
        const pay = await getPortonePayment(apiSecret, pid);
        if (pay?.status === 'PAID') {
          await settlePayment(pid, apiSecret);
          paidFound = true;
          settled += 1;
          break;
        }
      } catch (err) {
        console.warn('[payment] expire check failed', { id: doc.id, pid, err });
        paidFound = true; // 확인 못 하면 이번엔 건드리지 않음
        break;
      }
    }
    if (paidFound) continue;

    const done = await db().runTransaction(async (tx) => {
      const cur = await tx.get(doc.ref);
      const d = cur.data();
      if (!d || (d.payment as { status?: string } | undefined)?.status !== 'awaiting') return false;
      if (String(d.status || '') === 'cancelled') {
        // 손님·업체가 이미 취소한 결제 대기 — 결제 상태만 정리
        tx.update(doc.ref, { 'payment.status': 'expired' });
        return false;
      }
      tx.update(doc.ref, {
        status: 'cancelled',
        cancelledAt: new Date().toISOString(),
        cancelledBy: 'payment_timeout',
        'payment.status': 'expired',
      });
      return true;
    });
    if (done) expired += 1;
  }
  return { expired, settled };
}
