import * as admin from 'firebase-admin';
import { onRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';

import { reservationPasswordMatches } from '../reservations/publicReservation';
import { resolveReservationPassword } from '../reservations/reservationSecrets';

/** 셀프 취소 가능한 상태 (입고 전) — B2C `reservationCancel.ts` 와 동일 */
const CANCELLABLE_STATUSES = new Set(['pending', 'scheduled', 'pending_in']);

/** 업체에 cancelCutoffHours 가 없을 때 기준 — 고객 화면 안내와 동일 */
const DEFAULT_CANCEL_CUTOFF_HOURS = 24;

/** `2026-08-02` + `10:00` → KST 기준 Date (서버 TZ가 UTC여도 동일 결과) */
function parseKstCheckIn(departureDate: unknown, departureTime: unknown): Date | null {
  const date = String(departureDate ?? '').trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const rawTime = String(departureTime ?? '').trim();
  const time = /^\d{2}:\d{2}$/.test(rawTime) ? rawTime : '00:00';
  const dt = new Date(`${date}T${time}:00+09:00`);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

async function resolveCancelCutoffHours(companyId: unknown): Promise<number> {
  const id = String(companyId ?? '').trim();
  if (!id) return DEFAULT_CANCEL_CUTOFF_HOURS;
  try {
    const snap = await admin.firestore().doc(`companies/${id}`).get();
    const raw = snap.exists ? (snap.data() || {}).cancelCutoffHours : undefined;
    if (typeof raw === 'number' && Number.isFinite(raw) && raw >= 0) return raw;
  } catch (err) {
    logger.warn('cancelReservation_company_read_failed', { companyId: id, err });
  }
  return DEFAULT_CANCEL_CUTOFF_HOURS;
}

/**
 * 고객 셀프 취소 — 서버에서 비밀번호·상태·취소 마감을 모두 검증하고 status: cancelled 로 변경.
 * 클라이언트 화면만 막으면 API 직접 호출로 입고 완료된 차량까지 취소되므로 서버에서 다시 본다.
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
      const storedPassword = await resolveReservationPassword(id, data);
      if (!reservationPasswordMatches(storedPassword, password)) {
        res.status(403).json({ error: 'invalid_password' });
        return;
      }
      const status = String(data.status ?? '');
      if (status === 'cancelled') {
        res.status(409).json({ error: 'already_cancelled' });
        return;
      }
      if (!CANCELLABLE_STATUSES.has(status)) {
        res.status(409).json({ error: 'not_cancellable_status' });
        return;
      }

      const checkIn = parseKstCheckIn(data.departureDate, data.departureTime);
      if (checkIn) {
        const cutoffHours = await resolveCancelCutoffHours(data.companyId);
        const deadline = checkIn.getTime() - cutoffHours * 60 * 60 * 1000;
        if (Date.now() > deadline) {
          res.status(409).json({ error: 'cancel_deadline_passed', cutoffHours });
          return;
        }
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
