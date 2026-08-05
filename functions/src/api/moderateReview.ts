import * as admin from 'firebase-admin';
import { defineSecret } from 'firebase-functions/params';
import { onRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import { timingSafeEqual } from 'crypto';

import { PLATFORM_ADMIN_EMAILS } from '../admin/constants';
import { recomputeCompanyRating } from '../reviews/aggregate';

const reviewAdminSecret = defineSecret('REVIEW_ADMIN_SECRET');

function secretMatches(stored: string, provided: string): boolean {
  const a = Buffer.from(stored.trim());
  const b = Buffer.from(provided.trim());
  if (a.length === 0 || a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

type ReqLike = {
  method?: string;
  body?: unknown;
  headers?: Record<string, string | string[] | undefined>;
  get?: (name: string) => string | undefined;
};

type ResLike = {
  status: (c: number) => { json: (b: unknown) => void };
};

function readAuthHeader(req: ReqLike): string {
  const fromGet = typeof req.get === 'function' ? req.get('authorization') : undefined;
  if (fromGet) return fromGet;
  const raw = req.headers?.authorization ?? req.headers?.Authorization;
  if (Array.isArray(raw)) return String(raw[0] || '');
  return String(raw || '');
}

/**
 * 본사 인증: Firebase ID 토큰(권장) 또는 REVIEW_ADMIN_SECRET(레거시 B2C 관리 페이지).
 */
async function assertReviewAdmin(
  req: ReqLike,
  res: ResLike
): Promise<{ email: string; via: 'token' | 'secret' } | null> {
  const authHeader = readAuthHeader(req);
  const bearer = authHeader.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  if (bearer) {
    try {
      const decoded = await admin.auth().verifyIdToken(bearer);
      const email = String(decoded.email || '')
        .trim()
        .toLowerCase();
      if (email && (PLATFORM_ADMIN_EMAILS as readonly string[]).includes(email)) {
        return { email, via: 'token' };
      }
      res.status(403).json({ error: 'forbidden' });
      return null;
    } catch (err) {
      logger.warn('review_admin_token_invalid', { err });
      res.status(401).json({ error: 'unauthenticated' });
      return null;
    }
  }

  const body = (req.body ?? {}) as Record<string, unknown>;
  const provided = String(body.secret ?? '').trim();
  const expected = reviewAdminSecret.value();
  if (secretMatches(expected, provided)) {
    return { email: 'secret', via: 'secret' };
  }

  res.status(403).json({ error: 'forbidden' });
  return null;
}

function mapReviewDoc(id: string, data: Record<string, unknown>) {
  const photosRaw = data.photoUrls;
  const photoUrls = Array.isArray(photosRaw)
    ? photosRaw.map((u) => String(u || '').trim()).filter(Boolean)
    : [];
  return {
    id,
    companyId: String(data.companyId ?? ''),
    companyName: String(data.companyName ?? ''),
    reservationId: String(data.reservationId ?? id),
    rating: Number(data.rating) || 0,
    body: data.body ? String(data.body) : undefined,
    authorMask: String(data.authorMask ?? '익명'),
    carMask: data.carMask ? String(data.carMask) : undefined,
    status: String(data.status ?? ''),
    createdAt: String(data.createdAt ?? ''),
    photoUrls,
  };
}

/**
 * 본사만 — 후기 목록 (숨김 포함).
 * Authorization: Bearer <platform admin idToken> 또는 body.secret.
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
    if (!(await assertReviewAdmin(req, res))) return;

    try {
      const snap = await admin
        .firestore()
        .collection('reviews')
        .orderBy('createdAt', 'desc')
        .limit(200)
        .get();
      const reviews = snap.docs.map((d) => mapReviewDoc(d.id, d.data() as Record<string, unknown>));
      res.set('Cache-Control', 'private, no-store');
      res.json({ reviews });
    } catch (err) {
      logger.error('listAdminReviews_failed', { err });
      res.status(500).json({ error: 'internal' });
    }
  }
);

/**
 * 본사만 — 후기 숨김 또는 삭제.
 * Authorization: Bearer <platform admin idToken> 또는 body.secret.
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
    const adminAuth = await assertReviewAdmin(req, res);
    if (!adminAuth) return;

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
          moderatedBy: adminAuth.email || 'platform_admin',
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
