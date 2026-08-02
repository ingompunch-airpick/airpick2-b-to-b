import * as admin from 'firebase-admin';
import { onRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';

import {
  reservationPasswordMatches,
  sanitizeReservation,
} from '../reservations/publicReservation';
import {
  carNumberLookupNeedles,
  carNumberTail,
  isCarNumberSuffixQuery,
  normalizeCarNumber,
} from '../utils/carNumber';
import { normalizeKoreanPhone } from '../utils/phone';

type LookupMode = 'carNumber' | 'phone';

function phoneLookupNeedles(value: string): string[] {
  const trimmed = value.trim();
  const digits = trimmed.replace(/\D/g, '');
  const needles = [trimmed, digits];
  const intl = normalizeKoreanPhone(trimmed);
  if (intl) {
    needles.push(intl);
    if (intl.startsWith('82')) needles.push(`0${intl.slice(2)}`);
  }
  return [...new Set(needles.filter(Boolean))];
}

/**
 * 예약 조회 — 서버에서 비밀번호를 검증하고 민감 필드를 제거한 뒤 반환.
 * 차량번호: 전체 일치 또는 끝 숫자 4자리(carNumberTail) 일치.
 * 비밀번호가 틀리면 존재 여부를 숨기기 위해 빈 배열(200)을 돌려준다.
 */
export const lookupReservation = onRequest(
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
    const mode = String(body.mode ?? '') as LookupMode;
    const value = String(body.value ?? '').trim();
    const password = String(body.password ?? '').trim();

    if (mode !== 'carNumber' && mode !== 'phone') {
      res.status(400).json({ error: 'invalid_mode' });
      return;
    }
    if (!value || !/^\d{4}$/.test(password)) {
      res.status(400).json({ error: 'missing_params' });
      return;
    }

    try {
      const db = admin.firestore();
      const seen = new Map<string, Record<string, unknown>>();

      const addSnap = async (field: string, needle: string) => {
        const snap = await db.collection('reservations').where(field, '==', needle).get();
        for (const doc of snap.docs) {
          if (!seen.has(doc.id)) {
            seen.set(doc.id, doc.data() as Record<string, unknown>);
          }
        }
      };

      if (mode === 'phone') {
        for (const needle of phoneLookupNeedles(value)) {
          await addSnap('phone', needle);
        }
      } else if (isCarNumberSuffixQuery(value)) {
        const tail = carNumberTail(value)!;
        await addSnap('carNumberTail', tail);
        // 예전 문서에 tail 없을 수 있음 — 전체 번호로 우연히 4자리만 저장된 경우도 커버
        await addSnap('carNumber', normalizeCarNumber(value));
      } else {
        for (const needle of carNumberLookupNeedles(value)) {
          await addSnap('carNumber', needle);
        }
        const tail = carNumberTail(value);
        if (tail) await addSnap('carNumberTail', tail);
      }

      const matched = [...seen.entries()].filter(([, data]) =>
        reservationPasswordMatches(data.reservationPassword, password)
      );

      const reservations = await Promise.all(
        matched.map(async ([id, data]) => {
          const reviewSnap = await db.doc(`reviews/${id}`).get();
          // 조회 성공 시 예전 예약에 carNumberTail 보강 (다음 끝4자리 조회용)
          const stored = String(data.carNumber ?? '');
          const nextTail = carNumberTail(stored);
          if (nextTail && data.carNumberTail !== nextTail) {
            void db.doc(`reservations/${id}`).update({ carNumberTail: nextTail }).catch(() => {
              /* ignore */
            });
          }
          return {
            id,
            data: {
              ...sanitizeReservation(data),
              hasReview: reviewSnap.exists,
            },
          };
        })
      );

      res.set('Cache-Control', 'private, no-store');
      res.json({ reservations });
    } catch (err) {
      logger.error('lookupReservation_failed', { mode, err });
      res.status(500).json({ error: 'internal' });
    }
  }
);
