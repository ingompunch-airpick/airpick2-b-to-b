import * as admin from 'firebase-admin';
import * as nodeCrypto from 'crypto';
import {
  ALIMTALK_TEMPLATE_CODES,
  DEFAULT_COMPANY_PHONE,
  type AlimtalkEventType,
} from './constants';
import { sendAlimtalkMessage, type NhnAlimtalkConfig, type NhnAlimtalkButton } from './nhnClient';
import { normalizeRecipientPhone } from './phone';
import { buildReceiptUrl, buildReviewUrl, resolveReceiptPathCode } from './receiptUrl';
import {
  buildCheckinParams,
  buildCheckoutParams,
  buildReserveParams,
} from './templateParams';
import type { AlimtalkTemplateParams, ReservationSnapshot } from './types';
import { resolveBookingSource } from '../sheets/bookingSource';

const CLAIM_TTL_MS = 90_000;

function snapshotFromData(id: string, data: FirebaseFirestore.DocumentData | undefined): ReservationSnapshot | null {
  if (!data) return null;
  return { id, ...data } as ReservationSnapshot;
}

async function fetchCompanyPhone(companyId: string | undefined): Promise<string> {
  if (!companyId) return DEFAULT_COMPANY_PHONE;
  const snap = await admin.firestore().doc(`companies/${companyId}`).get();
  const phone = snap.data()?.phone;
  return typeof phone === 'string' && phone.trim() ? phone.trim() : DEFAULT_COMPANY_PHONE;
}

function resolveTemplateParams(
  eventType: AlimtalkEventType,
  reservation: ReservationSnapshot,
  companyPhone: string
): AlimtalkTemplateParams {
  const receiptUrl = buildReceiptUrl(reservation);
  switch (eventType) {
    case 'reserve':
      return buildReserveParams(reservation, receiptUrl);
    case 'checkin':
      return buildCheckinParams(reservation, receiptUrl);
    case 'checkout':
      return buildCheckoutParams(reservation, companyPhone, receiptUrl);
  }
}

function resolveAlimtalkButton(
  eventType: AlimtalkEventType,
  reservation: ReservationSnapshot
): NhnAlimtalkButton | null {
  if (eventType === 'checkout') {
    const reviewUrl = buildReviewUrl(reservation);
    if (!reviewUrl) return null;
    return {
      ordering: 1,
      type: 'WL',
      name: '후기 남기기',
      linkMo: reviewUrl,
      linkPc: reviewUrl,
    };
  }

  const receiptUrl = buildReceiptUrl(reservation);
  if (!receiptUrl) return null;
  return {
    ordering: 1,
    type: 'WL',
    name: eventType === 'checkin' ? '보관증 보기' : '접수증 보기',
    linkMo: receiptUrl,
    linkPc: receiptUrl,
  };
}

export function resolveAlimtalkEvents(
  before: ReservationSnapshot | null,
  after: ReservationSnapshot | null
): AlimtalkEventType[] {
  if (!after) return [];
  if (after.status === 'cancelled') return [];

  const events: AlimtalkEventType[] = [];

  const needsSend = (key: AlimtalkEventType) => {
    const record = after.alimtalkSent?.[key] as
      | { requestId?: string; error?: string; claimAt?: string }
      | undefined;
    if (!record) return true;
    if (record.error) return true;
    // requestId 있으면 성공 — claimAt만 있으면 mark 실패·중단으로 간주 → 재시도
    if (record.requestId) return false;
    return true;
  };

  if (!before) {
    if (needsSend('reserve')) events.push('reserve');
    return events;
  }

  // secretKey 오류 등 이전 실패분 — 상태 변화 없어도 문서 갱신 시 재시도
  if (after.alimtalkSent?.reserve?.error && needsSend('reserve')) {
    events.push('reserve');
  }

  if (before.status === after.status) return events;

  if (after.status === 'completed_in' && needsSend('checkin')) {
    events.push('checkin');
  }
  if (after.status === 'completed_out' && needsSend('checkout')) {
    events.push('checkout');
  }

  return events;
}

type SentRecordPayload = {
  templateCode: string;
  recipientNo: string;
  requestId?: string;
  error?: string;
  buttonUrl?: string;
};

/** 동시 트리거(시트 sync 등)로 알림톡이 두 번 나가는 것 방지 */
async function tryClaimAlimtalkSend(
  reservationId: string,
  eventType: AlimtalkEventType
): Promise<boolean> {
  const ref = admin.firestore().doc(`reservations/${reservationId}`);
  try {
    return await admin.firestore().runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const record = (snap.data()?.alimtalkSent || {})[eventType] as
        | {
            requestId?: string;
            error?: string;
            claimAt?: string;
          }
        | undefined;

      // 이미 성공
      if (record?.requestId && !record.error) return false;

      // 다른 인스턴스가 claim 중
      const claimMs = Date.parse(String(record?.claimAt || ''));
      if (
        Number.isFinite(claimMs) &&
        Date.now() - claimMs < CLAIM_TTL_MS &&
        !record?.requestId
      ) {
        return false;
      }

      tx.update(ref, {
        [`alimtalkSent.${eventType}.claimAt`]: new Date().toISOString(),
      });
      return true;
    });
  } catch (error) {
    console.warn('[alimtalk] claim failed', { reservationId, eventType, error });
    return false;
  }
}

async function markAlimtalkSent(
  reservationId: string,
  eventType: AlimtalkEventType,
  record: SentRecordPayload
): Promise<void> {
  // 맵 통째 교체로 claimAt 제거 — nested FieldValue.delete() 는 Firestore에서 불가
  await admin.firestore().doc(`reservations/${reservationId}`).update({
    [`alimtalkSent.${eventType}`]: {
      sentAt: new Date().toISOString(),
      templateCode: record.templateCode,
      recipientNo: record.recipientNo,
      ...(record.requestId ? { requestId: record.requestId } : {}),
      ...(record.error ? { error: record.error } : {}),
      ...(record.buttonUrl ? { buttonUrl: record.buttonUrl } : {}),
    },
  });
}

function createShortReceiptLinkCode(): string {
  return nodeCrypto.randomBytes(6).toString('hex');
}

/**
 * 구형 32자 receiptToken 예약 — 알림톡 #{토큰}(≤14)용 receiptLinkCode 부여.
 * 신규 12자 토큰은 그대로 사용.
 */
async function ensureReceiptPathCode(
  reservationId: string,
  reservation: ReservationSnapshot
): Promise<ReservationSnapshot> {
  if (resolveReceiptPathCode(reservation)) return reservation;

  const code = createShortReceiptLinkCode();
  await admin.firestore().doc(`reservations/${reservationId}`).set(
    { receiptLinkCode: code, updatedAt: new Date().toISOString() },
    { merge: true }
  );
  return { ...reservation, receiptLinkCode: code };
}

export async function processReservationAlimtalk(
  reservationId: string,
  beforeData: FirebaseFirestore.DocumentData | undefined,
  afterData: FirebaseFirestore.DocumentData | undefined,
  config: NhnAlimtalkConfig | null
): Promise<void> {
  const before = snapshotFromData(reservationId, beforeData);
  const after = snapshotFromData(reservationId, afterData);

  // @airpickup 알림톡은 에어픽(B2C) 예약만 — 홈페이지·현장 B2B는 시트만 동기화
  const source = resolveBookingSource(after?.createdBy, afterData as Record<string, unknown> | undefined);
  if (source !== 'airpick-b2c') {
    console.log('[alimtalk] skipped — not airpick-b2c', {
      reservationId,
      createdBy: after?.createdBy,
      source,
    });
    return;
  }

  const events = resolveAlimtalkEvents(before, after);

  if (events.length === 0) return;

  if (!config) {
    console.log('[alimtalk] skipped — NHN credentials or ALIMTALK_ENABLED not configured', {
      reservationId,
      events,
    });
    return;
  }

  const recipientNo = normalizeRecipientPhone(after?.phone);
  if (!recipientNo) {
    console.warn('[alimtalk] skipped — invalid phone', { reservationId, phone: after?.phone });
    return;
  }

  let reservationForSend = after!;
  try {
    reservationForSend = await ensureReceiptPathCode(reservationId, after!);
  } catch (err) {
    console.error('[alimtalk] ensureReceiptPathCode failed', {
      reservationId,
      err: err instanceof Error ? err.message : String(err),
    });
  }

  const companyPhone = events.includes('checkout')
    ? await fetchCompanyPhone(reservationForSend.companyId)
    : DEFAULT_COMPANY_PHONE;

  for (const eventType of events) {
    const claimed = await tryClaimAlimtalkSend(reservationId, eventType);
    if (!claimed) {
      console.log('[alimtalk] skipped — already claimed or sent', { reservationId, eventType });
      continue;
    }

    const templateCode = ALIMTALK_TEMPLATE_CODES[eventType];
    const templateParameter = resolveTemplateParams(eventType, reservationForSend, companyPhone);
    const button = resolveAlimtalkButton(eventType, reservationForSend);
    if (!button) {
      console.warn('[alimtalk] skipped — button link empty', { reservationId, eventType });
      await markAlimtalkSent(reservationId, eventType, {
        templateCode,
        recipientNo,
        error: 'button link empty',
      });
      continue;
    }
    const buttons: NhnAlimtalkButton[] = [button];
    const buttonUrl = button.linkMo || '';

    try {
      const result = await sendAlimtalkMessage(
        config,
        templateCode,
        recipientNo,
        templateParameter,
        buttons
      );

      if (result.ok) {
        await markAlimtalkSent(reservationId, eventType, {
          templateCode,
          recipientNo,
          requestId: result.requestId,
          buttonUrl,
        });
        console.log('[alimtalk] sent', {
          reservationId,
          eventType,
          templateCode,
          requestId: result.requestId,
          buttonUrl,
        });
        continue;
      }

      // 접수/입차는 버튼(접수증) 없이 성공 처리하지 않음 — 홈/대표링크만 열리는 것 방지
      const allowButtonless =
        eventType === 'checkout' &&
        (result.resultCode === -3000 ||
          result.resultCode === -3019 ||
          (result.resultMessage || '').toLowerCase().includes('button'));

      if (allowButtonless) {
        const finalResult = await sendAlimtalkMessage(
          config,
          templateCode,
          recipientNo,
          templateParameter
        );
        if (finalResult.ok) {
          await markAlimtalkSent(reservationId, eventType, {
            templateCode,
            recipientNo,
            requestId: finalResult.requestId,
          });
          console.log('[alimtalk] sent (no button)', {
            reservationId,
            eventType,
            templateCode,
            requestId: finalResult.requestId,
          });
          continue;
        }
        await markAlimtalkSent(reservationId, eventType, {
          templateCode,
          recipientNo,
          buttonUrl,
          error: finalResult.resultMessage ?? 'send failed',
        });
        console.error('[alimtalk] send failed', {
          reservationId,
          eventType,
          templateCode,
          resultCode: finalResult.resultCode,
          resultMessage: finalResult.resultMessage,
          buttonUrl,
        });
        continue;
      }

      await markAlimtalkSent(reservationId, eventType, {
        templateCode,
        recipientNo,
        buttonUrl,
        error: result.resultMessage ?? 'send failed',
      });
      console.error('[alimtalk] send failed', {
        reservationId,
        eventType,
        templateCode,
        resultCode: result.resultCode,
        resultMessage: result.resultMessage,
        buttonUrl,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await markAlimtalkSent(reservationId, eventType, {
        templateCode,
        recipientNo,
        buttonUrl,
        error: message,
      });
      console.error('[alimtalk] exception', { reservationId, eventType, message, buttonUrl });
    }
  }
}

export function buildNhnConfigFromEnv(): NhnAlimtalkConfig | null {
  if (process.env.ALIMTALK_ENABLED !== 'true') return null;

  const appKey = process.env.NHN_ALIMTALK_APP_KEY?.trim();
  const secretKey = process.env.NHN_ALIMTALK_SECRET_KEY?.trim();
  const senderKey = process.env.NHN_ALIMTALK_SENDER_KEY?.trim();

  if (!appKey || !secretKey || !senderKey) return null;

  return { appKey, secretKey, senderKey };
}
