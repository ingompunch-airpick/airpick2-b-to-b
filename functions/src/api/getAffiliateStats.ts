import * as admin from 'firebase-admin';
import { onRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';

const CODE_RE = /^[a-z0-9_]{3,16}$/;

function num(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

async function resolveAffiliateCodeFromAuth(req: {
  get: (name: string) => string | undefined;
}): Promise<string | null> {
  const header = String(req.get('Authorization') || '');
  const match = /^Bearer\s+(.+)$/i.exec(header);
  if (!match?.[1]) return null;
  try {
    const decoded = await admin.auth().verifyIdToken(match[1]);
    if (String(decoded.role || '') !== 'affiliate') return null;
    const code = String(decoded.affiliateCode || '')
      .trim()
      .toLowerCase();
    return CODE_RE.test(code) ? code : null;
  } catch {
    return null;
  }
}

/**
 * 제휴 실적 포털 — Firebase Auth(제휴 claim) 검증 후 집계만 반환 (고객 PII 없음).
 * Authorization: Bearer <idToken>
 * GET ?days=
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

    const code = await resolveAffiliateCodeFromAuth(req);
    if (!code) {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }

    try {
      const db = admin.firestore();
      const affSnap = await db.doc(`affiliates/${code}`).get();

      if (!affSnap.exists) {
        res.status(404).json({ error: 'not_found' });
        return;
      }

      const aff = affSnap.data() as Record<string, unknown>;

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
