import * as admin from 'firebase-admin';
import * as nodeCrypto from 'crypto';
import { type AlimtalkEventType } from './constants';
import {
  applyCompanyChannel,
  fetchCompanyAlimtalkSettings,
  type CompanyAlimtalkSettings,
} from './companyPolicy';
import { resolveAlimtalkHandoffLabels } from './handoffLabels';
import {
  buildAlimtalkConfigFromEnv,
  isNcpTemplateReady,
  resolveTemplateCode,
  sendAlimtalkMessage,
} from './provider';
import type { AlimtalkButton, AlimtalkConfig, RenderedAlimtalkContent } from './shared';
import { normalizeRecipientPhone } from './phone';
import {
  buildDirectionsUrl,
  buildReceiptUrl,
  buildReviewUrl,
  resolveReceiptPathCode,
} from './receiptUrl';
import { renderTemplateBody } from './ncpTemplates';
import {
  buildCheckinParams,
  buildCheckoutParams,
  buildPartnerDetailParams,
  buildRemindParams,
  buildReserveParams,
  type AirpickDetailParamOptions,
} from './templateParams';
import type { AlimtalkTemplateParams, ReservationSnapshot } from './types';
import { resolveBookingSource, type BookingSource } from '../sheets/bookingSource';

const CLAIM_TTL_MS = 90_000;

function snapshotFromData(
  id: string,
  data: FirebaseFirestore.DocumentData | undefined
): ReservationSnapshot | null {
  if (!data) return null;
  return { id, ...data } as ReservationSnapshot;
}

async function resolveAirpickDetailOptions(
  reservation: ReservationSnapshot,
  companyPhone: string
): Promise<AirpickDetailParamOptions> {
  const handoff = await resolveAlimtalkHandoffLabels(
    reservation.companyId,
    reservation.departureTerminal,
    reservation.companyName
  );
  return {
    companyName: handoff.companyName,
    companyPhone,
    handoffMethod: handoff.handoffMethod,
    pickupGuide: handoff.pickupGuide,
  };
}

async function resolveTemplateParams(
  eventType: AlimtalkEventType,
  reservation: ReservationSnapshot,
  companyPhone: string
): Promise<AlimtalkTemplateParams> {
  const receiptUrl = buildReceiptUrl(reservation);
  switch (eventType) {
    case 'reserve':
    case 'remind': {
      const options = await resolveAirpickDetailOptions(reservation, companyPhone);
      return eventType === 'reserve'
        ? buildReserveParams(reservation, options, receiptUrl)
        : buildRemindParams(reservation, options);
    }
    case 'checkin':
      return buildCheckinParams(reservation, receiptUrl);
    case 'checkout':
      return buildCheckoutParams(reservation, companyPhone, receiptUrl);
  }
}

function resolveAlimtalkButtons(
  eventType: AlimtalkEventType,
  reservation: ReservationSnapshot
): AlimtalkButton[] | null {
  if (eventType === 'checkout') {
    const reviewUrl = buildReviewUrl(reservation);
    if (!reviewUrl) return null;
    return [
      {
        ordering: 1,
        type: 'WL',
        name: '후기 남기기',
        linkMo: reviewUrl,
        linkPc: reviewUrl,
      },
    ];
  }

  const receiptUrl = buildReceiptUrl(reservation);
  if (!receiptUrl) return null;

  if (eventType === 'checkin') {
    return [
      {
        ordering: 1,
        type: 'WL',
        name: '보관증 보기',
        linkMo: receiptUrl,
        linkPc: receiptUrl,
      },
    ];
  }

  // reservation3: 가는 길 고정 URL / remind: 토큰 경로
  const directionsUrl = buildDirectionsUrl(reservation, {
    withToken: eventType === 'remind',
  });

  return [
    {
      ordering: 1,
      type: 'WL',
      name: '접수증 보기',
      linkMo: receiptUrl,
      linkPc: receiptUrl,
    },
    {
      ordering: 2,
      type: 'WL',
      name: '가는 길 보기',
      linkMo: directionsUrl,
      linkPc: directionsUrl,
    },
  ];
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
    if (record.requestId) return false;
    return true;
  };

  if (!before) {
    if (needsSend('reserve')) events.push('reserve');
    return events;
  }

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

      if (record?.requestId && !record.error) return false;

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

async function sendEventsForReservation(args: {
  reservationId: string;
  reservation: ReservationSnapshot;
  source: BookingSource;
  companySettings: CompanyAlimtalkSettings;
  events: AlimtalkEventType[];
  config: AlimtalkConfig;
  recipientNo: string;
}): Promise<void> {
  const {
    reservationId,
    source,
    companySettings,
    events,
    config,
    recipientNo,
  } = args;

  let reservationForSend = args.reservation;
  try {
    reservationForSend = await ensureReceiptPathCode(reservationId, args.reservation);
  } catch (err) {
    console.error('[alimtalk] ensureReceiptPathCode failed', {
      reservationId,
      err: err instanceof Error ? err.message : String(err),
    });
  }

  const companyPhone = companySettings.phone;

  for (const eventType of events) {
    const partnerTemplate =
      source !== 'airpick-b2c' ? companySettings.templates?.[eventType] : undefined;

    if (source !== 'airpick-b2c' && !partnerTemplate) {
      console.log('[alimtalk] skipped — no partner template for event', {
        reservationId,
        companyId: args.reservation.companyId,
        source,
        eventType,
      });
      continue;
    }

    if (
      !partnerTemplate &&
      config.provider === 'ncp' &&
      !isNcpTemplateReady(eventType, {
        provider: config.provider,
        templateCodes: config.templateCodes,
      })
    ) {
      console.log('[alimtalk] skipped — NCP template not configured yet', {
        reservationId,
        eventType,
      });
      continue;
    }

    const claimed = await tryClaimAlimtalkSend(reservationId, eventType);
    if (!claimed) {
      console.log('[alimtalk] skipped — already claimed or sent', { reservationId, eventType });
      continue;
    }

    const templateCode =
      partnerTemplate?.code || resolveTemplateCode(eventType, config.provider);
    if (!templateCode) {
      console.log('[alimtalk] skipped — empty template code', { reservationId, eventType });
      continue;
    }

    const templateParameter = partnerTemplate
      ? buildPartnerDetailParams(reservationForSend)
      : await resolveTemplateParams(eventType, reservationForSend, companyPhone);
    const rendered: RenderedAlimtalkContent | undefined = partnerTemplate
      ? {
          ...(partnerTemplate.title ? { title: partnerTemplate.title } : {}),
          content: renderTemplateBody(partnerTemplate.body, templateParameter),
        }
      : undefined;

    const receiptUrl = buildReceiptUrl(reservationForSend);
    const buttons: AlimtalkButton[] | undefined = partnerTemplate
      ? partnerTemplate.buttonName && receiptUrl
        ? [
            {
              ordering: 1,
              type: 'WL',
              name: partnerTemplate.buttonName,
              linkMo: receiptUrl,
              linkPc: receiptUrl,
            },
          ]
        : undefined
      : resolveAlimtalkButtons(eventType, reservationForSend) || undefined;

    if (!partnerTemplate && (!buttons || buttons.length === 0)) {
      console.warn('[alimtalk] skipped — button link empty', { reservationId, eventType });
      await markAlimtalkSent(reservationId, eventType, {
        templateCode,
        recipientNo,
        error: 'button link empty',
      });
      continue;
    }
    const buttonUrl = buttons?.map((b) => b.linkMo).filter(Boolean).join(' | ') || '';

    if (
      partnerTemplate &&
      !companySettings.channel?.plusFriendId &&
      !companySettings.channel?.senderKey
    ) {
      console.warn('[alimtalk] skipped — partner template without company channel', {
        reservationId,
        companyId: args.reservation.companyId,
        source,
        eventType,
        templateCode,
      });
      await markAlimtalkSent(reservationId, eventType, {
        templateCode,
        recipientNo,
        error: 'partner template requires company channel',
      });
      continue;
    }

    const sendConfig = partnerTemplate
      ? applyCompanyChannel(config, companySettings.channel)
      : config;

    try {
      const result = await sendAlimtalkMessage(
        sendConfig,
        templateCode,
        recipientNo,
        templateParameter,
        buttons,
        rendered
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

      const allowButtonless =
        eventType === 'checkout' &&
        (result.resultCode === -3000 ||
          result.resultCode === -3019 ||
          (result.resultMessage || '').toLowerCase().includes('button'));

      if (allowButtonless) {
        const finalResult = await sendAlimtalkMessage(
          sendConfig,
          templateCode,
          recipientNo,
          templateParameter,
          undefined,
          rendered
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

export async function processReservationAlimtalk(
  reservationId: string,
  beforeData: FirebaseFirestore.DocumentData | undefined,
  afterData: FirebaseFirestore.DocumentData | undefined,
  config: ReturnType<typeof buildAlimtalkConfigFromEnv>
): Promise<void> {
  const before = snapshotFromData(reservationId, beforeData);
  const after = snapshotFromData(reservationId, afterData);

  const candidateEvents = resolveAlimtalkEvents(before, after);
  if (candidateEvents.length === 0) return;

  const source = resolveBookingSource(
    after?.createdBy,
    afterData as Record<string, unknown> | undefined
  );
  const companySettings = await fetchCompanyAlimtalkSettings(after?.companyId);
  // enabled=false 는 업체 채널(홈/현장) OFF. 에어픽 B2C(@airpickup)는 sources 만 본다.
  const policyAllows =
    source === 'airpick-b2c'
      ? companySettings.sources.includes(source)
      : companySettings.enabled && companySettings.sources.includes(source);
  if (!policyAllows) {
    console.log('[alimtalk] skipped — company policy', {
      reservationId,
      companyId: after?.companyId,
      createdBy: after?.createdBy,
      source,
      enabled: companySettings.enabled,
      sources: companySettings.sources,
    });
    return;
  }

  const events = candidateEvents.filter((e) => companySettings.events.includes(e));
  if (events.length === 0) {
    console.log('[alimtalk] skipped — event disabled for company', {
      reservationId,
      companyId: after?.companyId,
      candidateEvents,
      enabledEvents: companySettings.events,
    });
    return;
  }

  if (!config) {
    console.log('[alimtalk] skipped — credentials or ALIMTALK_ENABLED not configured', {
      reservationId,
      events,
      provider: process.env.ALIMTALK_PROVIDER || 'nhn',
    });
    return;
  }

  const recipientNo = normalizeRecipientPhone(after?.phone);
  if (!recipientNo) {
    console.warn('[alimtalk] skipped — invalid phone', { reservationId, phone: after?.phone });
    return;
  }

  await sendEventsForReservation({
    reservationId,
    reservation: after!,
    source,
    companySettings,
    events,
    config,
    recipientNo,
  });
}

/**
 * 입고 전날 19:00 리마인드 — 스케줄러에서 호출.
 * airpick-b2c 만, 예약 시 입고까지 24h 미만이면 생략.
 */
export async function processRemindAlimtalkForReservation(
  reservationId: string,
  data: FirebaseFirestore.DocumentData,
  config: NonNullable<ReturnType<typeof buildAlimtalkConfigFromEnv>>
): Promise<'sent' | 'skipped' | 'failed'> {
  const reservation = snapshotFromData(reservationId, data);
  if (!reservation) return 'skipped';
  if (reservation.status === 'cancelled') return 'skipped';
  if (
    reservation.status === 'completed_in' ||
    reservation.status === 'completed_out' ||
    reservation.status === 'request_out'
  ) {
    return 'skipped';
  }

  const sent = reservation.alimtalkSent?.remind as
    | { requestId?: string; error?: string }
    | undefined;
  if (sent?.requestId && !sent.error) return 'skipped';

  const source = resolveBookingSource(
    reservation.createdBy,
    data as Record<string, unknown>
  );
  if (source !== 'airpick-b2c') return 'skipped';

  const companySettings = await fetchCompanyAlimtalkSettings(reservation.companyId);
  // remind 는 @airpickup 공용 — 업체 enabled/events 와 무관, B2C sources 만
  if (!companySettings.sources.includes(source)) {
    return 'skipped';
  }

  if (!shouldSendRemind(reservation)) return 'skipped';

  const recipientNo = normalizeRecipientPhone(reservation.phone);
  if (!recipientNo) return 'skipped';

  await sendEventsForReservation({
    reservationId,
    reservation,
    source,
    companySettings,
    events: ['remind'],
    config,
    recipientNo,
  });

  const after = await admin.firestore().doc(`reservations/${reservationId}`).get();
  const record = after.data()?.alimtalkSent?.remind as
    | { requestId?: string; error?: string }
    | undefined;
  if (record?.requestId && !record.error) return 'sent';
  if (record?.error) return 'failed';
  return 'skipped';
}

/** 예약 생성 시점에 입고까지 24시간 미만이면 리마인드 생략 */
export function shouldSendRemind(reservation: ReservationSnapshot): boolean {
  const departureMs = kstDateTimeMs(reservation.departureDate, reservation.departureTime);
  if (!Number.isFinite(departureMs)) return false;

  const createdMs = Date.parse(String(reservation.createdAt || ''));
  if (Number.isFinite(createdMs) && departureMs - createdMs < 24 * 60 * 60 * 1000) {
    return false;
  }
  return true;
}

function kstDateTimeMs(date?: string, time?: string): number {
  const d = String(date || '').trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return NaN;
  const tRaw = String(time || '00:00').trim();
  const tm = /^(\d{1,2}):(\d{2})/.exec(tRaw);
  const hh = tm ? Number(tm[1]) : 0;
  const mm = tm ? Number(tm[2]) : 0;
  // Asia/Seoul = UTC+9
  return Date.parse(`${d}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00+09:00`);
}

export { buildAlimtalkConfigFromEnv as buildNhnConfigFromEnv };
