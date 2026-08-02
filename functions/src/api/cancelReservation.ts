import * as admin from 'firebase-admin';
import { onRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';

import { reservationPasswordMatches } from '../reservations/publicReservation';

/**
 * 고객 셀프 취소 — 서버에서 비밀번호를 검증하고 status: cancelled 로 변경.
 */
export const cancelReservation = onRequest(
  { region: 'asia-northeast3', cors: true },
  async (req, res) => {
    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'method_not_allowed' });
      return;
    }

    const body = (req.body ?? {}) as Record<string, unknown>;
    const id = String(body.id ?? '').trim();
    const password = String(body.password ?? '').trim();

    if (!id) {
      res.status(400).json({ error: 'missing_id' });
      return;
    }
    if (!/^\d{4}$/.test(password)) {
      res.status(400).json({ error: 'invalid_password' });
      return;
    }

    try {
      const ref = admin.firestore().doc(`reservations/${id}`);
      const snap = await ref.get();
      if (!snap.exists) {
        res.status(404).json({ error: 'not_found' });
        return;
      }

      const data = snap.data() as Record<string, unknown>;
      if (!reservationPasswordMatches(data.reservationPassword, password)) {
        res.status(403).json({ error: 'invalid_password' });
        return;
      }
      if (String(data.status ?? '') === 'cancelled') {
        res.status(409).json({ error: 'already_cancelled' });
        return;
      }

      await ref.update({
        status: 'cancelled',
        cancelledAt: new Date().toISOString(),
        cancelledBy: 'customer',
      });

      res.set('Cache-Control', 'private, no-store');
      res.json({ ok: true });
    } catch (err) {
      logger.error('cancelReservation_failed', { id, err });
      res.status(500).json({ error: 'internal' });
    }
  }
);
