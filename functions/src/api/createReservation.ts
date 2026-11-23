import * as admin from 'firebase-admin';
import { onRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';

import {
  createReservationWithCapacity,
  SOLD_OUT,
  SoldOutError,
} from '../parkingSlotCapacity';

const MAX_BODY_KEYS = 80;
const ID_RE = /^[a-zA-Z0-9_-]{1,128}$/;

function stripUndefined(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) out[k] = v;
  }
  return out;
}

/**
 * B2C 예약 생성 — 정원(partner+date+parking_type) 차감과 예약을 한 트랜잭션으로.
 * 본문 필드는 기존 Firestore setDoc 페이로드와 동일. id 는 선택(없으면 서버 발급).
 * 만차면 예약을 만들지 않고 { error: 'SOLD_OUT' }.
 */
export const createReservation = onRequest(
  { region: 'asia-northeast3', cors: true, memory: '512MiB', timeoutSeconds: 60 },
  async (req, res) => {
    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'method_not_allowed' });
      return;
    }

    // Firestore create 와 동일하게 로그인(익명 포함) 필수
    const authHeader = String(req.get('Authorization') || '');
    const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    if (!bearer) {
      res.status(401).json({ error: 'unauthenticated' });
      return;
    }
    try {
      await admin.auth().verifyIdToken(bearer);
    } catch {
      res.status(401).json({ error: 'unauthenticated' });
      return;
    }

    const body = (req.body ?? {}) as Record<string, unknown>;
    if (Object.keys(body).length > MAX_BODY_KEYS) {
      res.status(400).json({ error: 'invalid_body' });
      return;
    }

    const reservationId = String(body.id ?? `res_${Date.now()}`).trim();
    if (!ID_RE.test(reservationId)) {
      res.status(400).json({ error: 'invalid_id' });
      return;
    }

    const companyId = String(body.companyId ?? '').trim();
    if (!companyId || companyId.length > 64) {
      res.status(400).json({ error: 'missing_company_id' });
      return;
    }

    const status = String(body.status ?? 'pending').trim();
    const createdAt = String(body.createdAt ?? new Date().toISOString()).trim();
    if (!status || status.length > 64 || !createdAt || createdAt.length > 40) {
      res.status(400).json({ error: 'invalid_core_fields' });
      return;
    }

    const totalPrice = body.totalPrice;
    if (
      totalPrice !== undefined &&
      (typeof totalPrice !== 'number' || !Number.isFinite(totalPrice) || totalPrice < 0)
    ) {
      res.status(400).json({ error: 'invalid_total_price' });
      return;
    }

    // 클라이언트가 심는 정원 필드는 무시 — 서버 트랜잭션만 기록
    const {
      id: _id,
      parkingSlotHolds: _holds,
      parkingSlotsClaimed: _claimed,
      parkingSlotsReleased: _released,
      priceCheck: _priceCheck,
      ...rest
    } = body;

    const payload = stripUndefined({
      ...rest,
      companyId,
      status,
      createdAt,
    });

    try {
      const result = await createReservationWithCapacity({
        reservationId,
        payload,
      });
      res.set('Cache-Control', 'private, no-store');
      res.status(200).json({ ok: true, id: result.id });
    } catch (err) {
      if (err instanceof SoldOutError || (err as { code?: string })?.code === SOLD_OUT) {
        res.set('Cache-Control', 'private, no-store');
        res.status(409).json({ ok: false, error: SOLD_OUT });
        return;
      }
      const message = err instanceof Error ? err.message : String(err);
      if (message === 'reservation_already_exists') {
        res.status(409).json({ error: 'already_exists' });
        return;
      }
      logger.error('createReservation_failed', { reservationId, err });
      res.status(500).json({ error: 'internal' });
    }
  }
);
