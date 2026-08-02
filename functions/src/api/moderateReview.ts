import * as admin from 'firebase-admin';
import { defineSecret } from 'firebase-functions/params';
import { onRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import { timingSafeEqual } from 'crypto';

import { recomputeCompanyRating } from '../reviews/aggregate';

const reviewAdminSecret = defineSecret('REVIEW_ADMIN_SECRET');

function secretMatches(stored: string, provided: string): boolean {
  const a = Buffer.from(stored.trim());
  const b = Buffer.from(provided.trim());
  if (a.length === 0 || a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function assertAdminSecret(req: { body?: unknown }, res: {
  status: (c: number) => { json: (b: unknown) => void };
}): string | null {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const provided = String(body.secret ?? '').trim();
  const expected = reviewAdminSecret.value();
  if (!secretMatches(expected, provided)) {
    res.status(403).json({ error: 'forbidden' });
    return null;
  }
  return provided;
}

/**
 * 본사만 — 후기 목록 (숨김 포함). REVIEW_ADMIN_SECRET 필요.
 */
export const listAdminReviews = onRequest(
  { region: 'asia-northeast3', cors: true, secrets: [reviewAdminSecret] },
  async (req, res) => {
    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'method_not_allowed' });
      return;
    }
    if (!assertAdminSecret(req, res)) return;

    try {
      const snap = await admin.firestore().collection('reviews').orderBy('createdAt', 'desc').limit(200).get();
      const reviews = snap.docs.map((d) => {
        const data = d.data() as Record<string, unknown>;
        return {
          id: d.id,
          companyId: String(data.companyId ?? ''),
          companyName: String(data.companyName ?? ''),
          reservationId: String(data.reservationId ?? d.id),
          rating: Number(data.rating) || 0,
          body: data.body ? String(data.body) : undefined,
          authorMask: String(data.authorMask ?? '익명'),
          carMask: data.carMask ? String(data.carMask) : undefined,
          status: String(data.status ?? ''),
          createdAt: String(data.createdAt ?? ''),
        };
      });
      res.set('Cache-Control', 'private, no-store');
      res.json({ reviews });
    } catch (err) {
      logger.error('listAdminReviews_failed', { err });
      res.status(500).json({ error: 'internal' });
    }
  }
);

/**
 * 본사만 — 후기 숨김 또는 삭제. REVIEW_ADMIN_SECRET 필요.
 */
export const moderateReview = onRequest(
  { region: 'asia-northeast3', cors: true, secrets: [reviewAdminSecret] },
  async (req, res) => {
    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'method_not_allowed' });
      return;
    }
    if (!assertAdminSecret(req, res)) return;

    const body = (req.body ?? {}) as Record<string, unknown>;
    const id = String(body.id ?? '').trim();
    const action = String(body.action ?? '').trim();

    if (!id) {
      res.status(400).json({ error: 'missing_id' });
      return;
    }
    if (action !== 'hide' && action !== 'delete') {
      res.status(400).json({ error: 'invalid_action' });
      return;
    }

    try {
      const db = admin.firestore();
      const ref = db.doc(`reviews/${id}`);
      const snap = await ref.get();
      if (!snap.exists) {
        res.status(404).json({ error: 'not_found' });
        return;
      }

      const data = snap.data() as Record<string, unknown>;
      const companyId = String(data.companyId ?? '').trim();

      if (action === 'hide') {
        if (String(data.status) === 'hidden') {
          res.status(409).json({ error: 'already_hidden' });
          return;
        }
        await ref.update({
          status: 'hidden',
          moderatedAt: new Date().toISOString(),
          moderatedBy: 'platform_admin',
        });
      } else {
        await ref.delete();
      }

      const aggregate = companyId
        ? await recomputeCompanyRating(db, companyId)
        : { rating: 0, reviews_count: 0 };

      res.set('Cache-Control', 'private, no-store');
      res.json({ ok: true, action, aggregate });
    } catch (err) {
      logger.error('moderateReview_failed', { id, action, err });
      res.status(500).json({ error: 'internal' });
    }
  }
);
