import * as admin from 'firebase-admin';
import { onRequest } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions';

import { portoneApiSecret, portoneWebhookSecret } from './config';
import {
  expireAwaitingPayments,
  PaymentError,
  preparePayment,
  refundReservationPayment,
  settlePayment,
} from './reservationPayment';
import { verifyPortoneWebhook } from './webhookVerify';

async function uidFromBearer(header: unknown): Promise<string> {
  const raw = typeof header === 'string' ? header : '';
  const m = raw.match(/^Bearer\s+(.+)$/i);
  if (!m) return '';
  try {
    const decoded = await admin.auth().verifyIdToken(m[1]);
    return decoded.uid;
  } catch {
    return '';
  }
}

/**
 * 손님 사이트 결제 — `/api/payment` (B2C Hosting rewrite)
 *   POST { action: 'prepare', id }  (Authorization: Bearer <Firebase ID 토큰>) → { paymentId, amount, holdUntil } | { paid: true }
 *   POST { action: 'confirm', paymentId } → { state, reservationId?, bookingNo? }
 */
export const reservationPayment = onRequest(
  { region: 'asia-northeast3', cors: true, secrets: [portoneApiSecret], timeoutSeconds: 60 },
  async (req, res) => {
    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }
    res.set('Cache-Control', 'private, no-store');
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'method_not_allowed' });
      return;
    }
    const body = (req.body ?? {}) as Record<string, unknown>;
    const action = String(body.action ?? '');
    const secret = portoneApiSecret.value();
    try {
      if (action === 'prepare') {
        const id = String(body.id ?? '').trim();
        const uid = await uidFromBearer(req.headers.authorization);
        if (!id || !uid) {
          res.status(401).json({ error: 'unauthenticated' });
          return;
        }
        res.json(await preparePayment(id, uid, secret));
        return;
      }
      if (action === 'confirm') {
        const paymentId = String(body.paymentId ?? '').trim();
        if (!/^[A-Za-z0-9]{6,64}$/.test(paymentId)) {
          res.status(400).json({ error: 'invalid_payment_id' });
          return;
        }
        res.json(await settlePayment(paymentId, secret));
        return;
      }
      res.status(400).json({ error: 'unknown_action' });
    } catch (err) {
      if (err instanceof PaymentError) {
        res.status(409).json({ error: err.code, message: err.message });
        return;
      }
      logger.error('reservationPayment_failed', { action, err });
      res.status(500).json({ error: 'internal' });
    }
  }
);

/**
 * 포트원 웹훅 — 손님이 결제 후 창을 닫아도 서버가 결제를 확인한다.
 * 포트원 콘솔 웹훅 주소에 이 함수 URL 을 등록.
 */
export const portoneWebhook = onRequest(
  { region: 'asia-northeast3', secrets: [portoneApiSecret, portoneWebhookSecret], timeoutSeconds: 60 },
  async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).send('');
      return;
    }
    const raw = Buffer.isBuffer(req.rawBody) ? req.rawBody.toString('utf8') : JSON.stringify(req.body ?? {});
    if (!verifyPortoneWebhook(portoneWebhookSecret.value(), raw, req.headers as Record<string, unknown>)) {
      logger.warn('portoneWebhook_bad_signature');
      res.status(400).send('');
      return;
    }
    let event: { type?: string; data?: { paymentId?: string } } = {};
    try {
      event = JSON.parse(raw);
    } catch {
      res.status(400).send('');
      return;
    }
    try {
      const paymentId = String(event.data?.paymentId || '');
      if (event.type === 'Transaction.Paid' && paymentId) {
        const out = await settlePayment(paymentId, portoneApiSecret.value());
        logger.info('portoneWebhook_paid', { paymentId, state: out.state, reservationId: out.reservationId });
      }
      res.status(200).send('');
    } catch (err) {
      // 5xx 면 포트원이 다시 보낸다
      logger.error('portoneWebhook_failed', { type: event.type, err });
      res.status(500).send('');
    }
  }
);

/** 5분마다 — 결제 대기 15분 초과 예약 취소(결제됐는데 확인 못 한 건은 확정) */
export const expireAwaitingPaymentsJob = onSchedule(
  {
    schedule: 'every 5 minutes',
    timeZone: 'Asia/Seoul',
    region: 'asia-northeast3',
    secrets: [portoneApiSecret],
    timeoutSeconds: 240,
  },
  async () => {
    const out = await expireAwaitingPayments(portoneApiSecret.value());
    if (out.expired || out.settled) logger.info('expireAwaitingPayments', out);
  }
);

/**
 * 업체·본사가 결제 완료 예약을 취소하면 전액 환불 (대표 결정 2026-11-27).
 * 손님 셀프 취소는 취소 API 가 먼저 환불하므로 여기서 건너뛴다.
 */
export const refundOnPartnerCancel = onDocumentUpdated(
  {
    document: 'reservations/{reservationId}',
    region: 'asia-northeast3',
    secrets: [portoneApiSecret],
  },
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (!before || !after) return;
    if (String(before.status || '') === 'cancelled' || String(after.status || '') !== 'cancelled') return;
    const p = (after.payment || {}) as { status?: string };
    if (p.status !== 'paid' || after.paymentRefund || after.cancelledBy === 'customer') return;
    try {
      const out = await refundReservationPayment(
        event.params.reservationId,
        { ratio: 1, reason: '업체 취소 전액 환불', source: 'partner' },
        portoneApiSecret.value()
      );
      logger.info('refundOnPartnerCancel', { id: event.params.reservationId, out });
    } catch (err) {
      logger.error('refundOnPartnerCancel_failed — 본사 확인 필요', { id: event.params.reservationId, err });
    }
  }
);
