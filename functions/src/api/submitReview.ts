import * as admin from 'firebase-admin';
import { onRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';

import { reservationPasswordMatches } from '../reservations/publicReservation';
import { recomputeCompanyRating } from '../reviews/aggregate';
import { uploadReviewPhotosFromDataUrls } from '../reviews/uploadPhotos';
import { maskCarNumber } from '../utils/carNumber';

const REVIEWABLE_STATUSES = new Set(['checked_out', 'completed_out']);
const BODY_MAX = 200;

function maskAuthorName(name: string): string {
  const t = name.trim();
  if (!t) return '익명';
  if (t.length === 1) return '*';
  if (t.length === 2) return `${t[0]}*`;
  return `${t[0]}*${t.slice(-1)}`;
}

/**
 * 고객 업체 후기 작성 — 출고 완료 예약 + 비밀번호 검증 후 reviews/{reservationId} 생성.
 * 사진(선택, 최대 3장)은 data URL로 받아 Storage에 올린 뒤 photoUrls에 저장.
 */
export const submitReview = onRequest(
  {
    region: 'asia-northeast3',
    cors: true,
    timeoutSeconds: 120,
    memory: '512MiB',
  },
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
    const rating = Number(body.rating);
    const rawBody = body.body != null ? String(body.body) : '';
    const reviewBody = rawBody.trim().slice(0, BODY_MAX);
    const photoDataUrls = body.photos;

    if (!id) {
      res.status(400).json({ error: 'missing_id' });
      return;
    }
    if (!/^\d{4}$/.test(password)) {
      res.status(400).json({ error: 'invalid_password' });
      return;
    }
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      res.status(400).json({ error: 'invalid_rating' });
      return;
    }

    try {
      const db = admin.firestore();
      const reservationRef = db.doc(`reservations/${id}`);
      const reviewRef = db.doc(`reviews/${id}`);

      const reservationSnap = await reservationRef.get();
      if (!reservationSnap.exists) {
        res.status(404).json({ error: 'not_found' });
        return;
      }

      const data = reservationSnap.data() as Record<string, unknown>;
      if (!reservationPasswordMatches(data.reservationPassword, password)) {
        res.status(403).json({ error: 'invalid_password' });
        return;
      }

      const status = String(data.status ?? '');
      if (!REVIEWABLE_STATUSES.has(status)) {
        res.status(409).json({ error: 'not_reviewable' });
        return;
      }

      const companyId = String(data.companyId ?? '').trim();
      if (!companyId) {
        res.status(400).json({ error: 'missing_company' });
        return;
      }

      const companySnap = await db.doc(`companies/${companyId}`).get();
      if (!companySnap.exists) {
        res.status(403).json({ error: 'not_partner' });
        return;
      }

      const existing = await reviewRef.get();
      if (existing.exists) {
        res.status(409).json({ error: 'already_reviewed' });
        return;
      }

      const companyName =
        String(data.companyName ?? '').trim() ||
        String(companySnap.data()?.name ?? '').trim() ||
        companyId;

      let photoUrls: string[] = [];
      try {
        photoUrls = await uploadReviewPhotosFromDataUrls(id, photoDataUrls);
      } catch (uploadErr) {
        logger.error('submitReview_photo_upload_failed', { id, uploadErr });
        res.status(502).json({ error: 'photo_upload_failed' });
        return;
      }

      const createdAt = new Date().toISOString();
      const carMask = maskCarNumber(String(data.carNumber ?? ''));
      await reviewRef.create({
        companyId,
        companyName,
        reservationId: id,
        rating,
        ...(reviewBody ? { body: reviewBody } : {}),
        ...(photoUrls.length ? { photoUrls } : {}),
        authorMask: maskAuthorName(String(data.userName ?? '')),
        ...(carMask ? { carMask } : {}),
        status: 'published',
        createdAt,
        createdBy: 'customer',
      });

      const aggregate = await recomputeCompanyRating(db, companyId);

      res.set('Cache-Control', 'private, no-store');
      res.json({
        ok: true,
        review: {
          id,
          companyId,
          rating,
          body: reviewBody || undefined,
          photoUrls: photoUrls.length ? photoUrls : undefined,
          createdAt,
        },
        aggregate,
      });
    } catch (err) {
      logger.error('submitReview_failed', { id, err });
      res.status(500).json({ error: 'internal' });
    }
  }
);
