import * as admin from 'firebase-admin';
import { onRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';

import { reservationPasswordMatches } from '../reservations/publicReservation';
import { resolveReservationPassword } from '../reservations/reservationSecrets';
import { recomputeCompanyRating } from '../reviews/aggregate';
import { uploadReviewPhotosFromDataUrls } from '../reviews/uploadPhotos';
import { maskCarNumber } from '../utils/carNumber';

const REVIEWABLE_STATUSES = new Set(['checked_out', 'completed_out']);
const BODY_MAX = 200;

function readBearer(req: { get?: (name: string) => string | undefined; headers?: Record<string, string | string[] | undefined> }): string {
  const fromGet = typeof req.get === 'function' ? req.get('authorization') : undefined;
  if (fromGet) return fromGet;
  const raw = req.headers?.authorization ?? req.headers?.Authorization;
  if (Array.isArray(raw)) return String(raw[0] || '');
  return String(raw || '');
}

/** 카카오 로그인 계정이 예약한 건이면 비밀번호 없이 후기를 받는다. */
async function kakaoOwnerUid(
  req: { get?: (name: string) => string | undefined; headers?: Record<string, string | string[] | undefined> },
  reservationUserId: string
): Promise<boolean> {
  const owner = reservationUserId.trim();
  if (!owner || owner === 'guest') return false;
  const match = readBearer(req).match(/^Bearer\s+(\S+)$/i);
  if (!match) return false;
  try {
    const decoded = await admin.auth().verifyIdToken(match[1]);
    return decoded.firebase?.sign_in_provider === 'oidc.kakao' && decoded.uid === owner;
  } catch (err) {
    logger.warn('submitReview_token_rejected', { err });
    return false;
  }
}

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
function maskName(raw: unknown): string {
  const name = String(raw ?? '').trim();
  if (!name) return '';
  return `${name.slice(0, 1)}${'*'.repeat(Math.max(1, name.length - 1))}`;
}

/**
 * 출고 알림톡 후기 링크(`/my?review={id}`) — 다른 브라우저에서 열어도 후기 카드를 띄울 수 있게
 * 가린 정보만 내려준다. 전화번호·이름 전체·비밀번호는 주지 않는다. 후기 저장은 POST 에서 비밀번호로 확인.
 */
async function sendReviewTarget(
  req: { query: Record<string, unknown> },
  res: {
    set: (k: string, v: string) => unknown;
    status: (n: number) => { json: (b: unknown) => unknown };
  }
): Promise<void> {
  res.set('Cache-Control', 'private, no-store');
  const id = String(req.query.id ?? '').trim();
  if (!id || id.length > 120 || id.includes('/')) {
    res.status(400).json({ error: 'missing_id' });
    return;
  }
  try {
    const db = admin.firestore();
    const [snap, review] = await Promise.all([
      db.doc(`reservations/${id}`).get(),
      db.doc(`reviews/${id}`).get(),
    ]);
    if (!snap.exists) {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    const d = snap.data() as Record<string, unknown>;
    const pick = (k: string) => (typeof d[k] === 'string' ? (d[k] as string) : '');
    res.status(200).json({
      reservation: {
        companyId: pick('companyId'),
        companyName: pick('companyName'),
        status: pick('status'),
        userName: maskName(d.userName),
        carNumber: maskCarNumber(pick('carNumber')),
        carModel: pick('carModel'),
        departureDate: pick('departureDate'),
        departureTime: pick('departureTime'),
        arrivalDate: pick('arrivalDate'),
        arrivalTime: pick('arrivalTime'),
        departureTerminal: pick('departureTerminal'),
        arrivalTerminal: pick('arrivalTerminal'),
        isIndoor: d.isIndoor !== false,
        checkedOutAt: pick('checkedOutAt'),
        hasReview: review.exists || d.hasReview === true,
      },
    });
  } catch (err) {
    logger.error('[submitReview] review target failed', err);
    res.status(500).json({ error: 'internal' });
  }
}

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
    if (req.method === 'GET') {
      await sendReviewTarget(req, res);
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
      const ownedByKakao = await kakaoOwnerUid(req, String(data.userId ?? ''));
      if (!ownedByKakao) {
        if (!/^\d{4}$/.test(password)) {
          res.status(400).json({ error: 'invalid_password' });
          return;
        }
        const storedPassword = await resolveReservationPassword(id, data);
        if (!reservationPasswordMatches(storedPassword, password)) {
          res.status(403).json({ error: 'invalid_password' });
          return;
        }
      }

      const status = String(data.status ?? '');
      const checkedOutAt = String(data.checkedOutAt ?? '').trim();
      const checkedOutBy = String(data.checkedOutBy ?? '').trim();
      if (
        !REVIEWABLE_STATUSES.has(status) ||
        (!checkedOutAt && !checkedOutBy)
      ) {
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
