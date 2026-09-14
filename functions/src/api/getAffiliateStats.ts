import { timingSafeEqual } from 'crypto';
import * as admin from 'firebase-admin';
import { onRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';

const CODE_RE = /^[a-z0-9_]{3,16}$/;

function tokenMatches(stored: string, provided: string): boolean {
  const a = Buffer.from(stored);
  const b = Buffer.from(provided);
  if (a.length !== b.length || a.length === 0) return false;
  return timingSafeEqual(a, b);
}

function num(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * 제휴 실적 포털 — code + statsToken 검증 후 집계만 반환 (고객 PII 없음).
 * GET ?code=&t=
 */
export const getAffiliateStats = onRequest(
  { region: 'asia-northeast3', cors: true },
  async (req, res) => {
    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }
    if (req.method !== 'GET') {
      res.status(405).json({ error: 'method_not_allowed' });
      return;
    }

    const code = String(req.query.code ?? '')
      .trim()
      .toLowerCase();
    const token = String(req.query.t ?? '').trim();
    if (!CODE_RE.test(code) || !token) {
      res.status(400).json({ error: 'missing_params' });
      return;
    }

    try {
      const db = admin.firestore();
      const [affSnap, secretSnap] = await Promise.all([
        db.doc(`affiliates/${code}`).get(),
        db.doc(`affiliateSecrets/${code}`).get(),
      ]);

      if (!affSnap.exists) {
        res.status(404).json({ error: 'not_found' });
        return;
      }
      if (!secretSnap.exists) {
        res.status(403).json({ error: 'invalid_token' });
        return;
      }

      const aff = affSnap.data() as Record<string, unknown>;
      const storedToken = String(
        (secretSnap.data() as { statsToken?: string }).statsToken ?? ''
      ).trim();
      if (!tokenMatches(storedToken, token)) {
        res.status(403).json({ error: 'invalid_token' });
        return;
      }

      if (String(aff.status || '') === 'suspended') {
        res.status(403).json({ error: 'suspended' });
        return;
      }

      const sinceDaysRaw = Number(req.query.days ?? 90);
      const sinceDays = Number.isFinite(sinceDaysRaw)
        ? Math.min(Math.max(Math.floor(sinceDaysRaw), 1), 365)
        : 90;
      const sinceMs = Date.now() - sinceDays * 24 * 60 * 60 * 1000;

      const q = await db
        .collection('reservations')
        .where('affiliateCode', '==', code)
        .get();

      let bookings = 0;
      let completedOut = 0;
      let cancelled = 0;
      let creditEarnedWon = 0;

      const referrerCreditWon = Math.max(0, Math.round(num(aff.referrerCreditWon)));
      const customerDiscountWon = Math.max(
        0,
        Math.round(num(aff.customerDiscountWon))
      );

      for (const docSnap of q.docs) {
        const r = docSnap.data() as Record<string, unknown>;
        const createdAt = Date.parse(String(r.createdAt || ''));
        if (!Number.isFinite(createdAt) || createdAt < sinceMs) continue;

        bookings += 1;
        const status = String(r.status || '');
        if (status === 'completed_out') {
          completedOut += 1;
          const snapCredit = num(r.affiliateReferrerCreditWon);
          creditEarnedWon +=
            snapCredit > 0 ? Math.round(snapCredit) : referrerCreditWon;
        }
        if (status === 'cancelled') cancelled += 1;
      }

      res.status(200).json({
        code,
        name: String(aff.name || code),
        status: String(aff.status || 'active'),
        days: sinceDays,
        bookings,
        completedOut,
        cancelled,
        customerDiscountWon,
        referrerCreditWon,
        creditEarnedWon,
      });
    } catch (err) {
      logger.error('[getAffiliateStats]', err);
      res.status(500).json({ error: 'internal' });
    }
  }
);
