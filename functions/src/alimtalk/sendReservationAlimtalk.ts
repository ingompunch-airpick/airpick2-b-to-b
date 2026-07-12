import * as admin from 'firebase-admin';
import {
  ALIMTALK_TEMPLATE_CODES,
  DEFAULT_COMPANY_PHONE,
  type AlimtalkEventType,
} from './constants';
import { sendAlimtalkMessage, type NhnAlimtalkConfig, type NhnAlimtalkButton } from './nhnClient';
import { normalizeRecipientPhone } from './phone';
import { buildReceiptUrl, buildReviewUrl } from './receiptUrl';
import {
  buildCheckinParams,
  buildCheckoutParams,
  buildReserveParams,
} from './templateParams';
import type { AlimtalkTemplateParams, ReservationSnapshot } from './types';
import { resolveBookingSource } from '../sheets/bookingSource';

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
    const record = after.alimtalkSent?.[key];
    // 성공 기록만 스킵 — 실패(error)는 재시도
    return !record || Boolean(record.error);
  };

  if (!before) {
    if (needsSend('reserve')) events.push('reserve');
    return events;
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

async function markAlimtalkSent(
  reservationId: string,
  eventType: AlimtalkEventType,
  record: {
    templateCode: string;
    recipientNo: string;
    requestId?: string;
    error?: string;
  }
): Promise<void> {
  await admin.firestore().doc(`reservations/${reservationId}`).update({
    [`alimtalkSent.${eventType}`]: {
      sentAt: new Date().toISOString(),
      templateCode: record.templateCode,
      recipientNo: record.recipientNo,
      ...(record.requestId ? { requestId: record.requestId } : {}),
      ...(record.error ? { error: record.error } : {}),
    },
  });
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

  const companyPhone = events.includes('checkout')
    ? await fetchCompanyPhone(after?.companyId)
    : DEFAULT_COMPANY_PHONE;

  for (const eventType of events) {
    const templateCode = ALIMTALK_TEMPLATE_CODES[eventType];
    const templateParameter = resolveTemplateParams(eventType, after!, companyPhone);
    const button = resolveAlimtalkButton(eventType, after!);
    if (!button) {
      console.warn('[alimtalk] skipped — button link empty', { reservationId, eventType });
      continue;
    }
    const buttons: NhnAlimtalkButton[] = [button];

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
        });
        console.log('[alimtalk] sent', {
          reservationId,
          eventType,
          templateCode,
          requestId: result.requestId,
        });
      } else {
        // 버튼 없는 템플릿이면 본문만 재시도 (신규제한 대응: URL은 짧은 문구)
        const retryWithoutButtons =
          result.resultCode === -3000 ||
          result.resultCode === -3019 ||
          (result.resultMessage || '').toLowerCase().includes('button');

        const finalResult = retryWithoutButtons
          ? await sendAlimtalkMessage(config, templateCode, recipientNo, templateParameter)
          : result;

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
        } else {
          await markAlimtalkSent(reservationId, eventType, {
            templateCode,
            recipientNo,
            error: finalResult.resultMessage ?? 'send failed',
          });
          console.error('[alimtalk] send failed', {
            reservationId,
            eventType,
            templateCode,
            resultCode: finalResult.resultCode,
            resultMessage: finalResult.resultMessage,
          });
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await markAlimtalkSent(reservationId, eventType, {
        templateCode,
        recipientNo,
        error: message,
      });
      console.error('[alimtalk] exception', { reservationId, eventType, message });
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
