import * as admin from 'firebase-admin';
import { delayMinutes, formatHhmm, normalizeFlightId } from './flightId';
import { fetchIncheonArrivals, findArrivalForFlight, type IncheonArrival } from './incheonArrivals';
import { notifyPartnersFlightDelay } from '../partnerPush';

const MIN_DELAY_MINUTES = 15;
const ACTIVE_STATUSES = new Set([
  'pending',
  'pending_in',
  'completed_in',
  'request_out',
]);

function db() {
  return admin.firestore();
}

/** Asia/Seoul YYYY-MM-DD */
export function kstTodayYmd(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

function resolveArrivalDate(data: FirebaseFirestore.DocumentData): string {
  return String(data.arrivalDate || data.exitDate || '')
    .trim()
    .slice(0, 10);
}

function resolveArrivalFlight(data: FirebaseFirestore.DocumentData): string {
  const nested =
    data.flight && typeof data.flight === 'object'
      ? (data.flight as Record<string, unknown>)
      : null;
  const arr =
    nested?.arrival && typeof nested.arrival === 'object'
      ? (nested.arrival as Record<string, unknown>)
      : null;

  return String(
    data.arrivalFlight ||
      data.exitFlight ||
      data.inboundFlight ||
      arr?.flight ||
      arr?.flightNo ||
      ''
  ).trim();
}

function resolveAirport(data: FirebaseFirestore.DocumentData): string {
  return String(data.airport || 'ICN')
    .trim()
    .toUpperCase();
}

function isDelayed(arrival: IncheonArrival): {
  delayed: boolean;
  minutes: number;
  cancelled: boolean;
} {
  const remark = arrival.remark || '';
  const cancelled = remark.includes('결항');
  const remarkDelay = remark.includes('지연');
  const minutes = delayMinutes(arrival.scheduleHhmm, arrival.estimatedHhmm) ?? 0;
  const delayed = !cancelled && (remarkDelay || minutes >= MIN_DELAY_MINUTES);
  return { delayed, minutes: Math.max(0, minutes), cancelled };
}

function notifyFingerprint(arrival: IncheonArrival, kind: 'delay' | 'cancel'): string {
  return `${kind}|${arrival.estimatedHhmm}|${arrival.remark}`;
}

export type FlightDelayCheckResult = {
  skipped?: string;
  arrivalsFetched: number;
  candidates: number;
  matched: number;
  notified: number;
  errors: number;
};

/**
 * 오늘(KST) 출고 예정 + 입국 항공편이 있는 예약을
 * 인천공항 당일 도착 현황과 대조해 연착/결항 시 파트너 푸시.
 */
export async function runFlightDelayCheck(serviceKey: string): Promise<FlightDelayCheckResult> {
  const key = serviceKey.trim();
  if (!key) {
    return {
      skipped: 'DATA_GO_KR_SERVICE_KEY empty',
      arrivalsFetched: 0,
      candidates: 0,
      matched: 0,
      notified: 0,
      errors: 0,
    };
  }

  const today = kstTodayYmd();
  const arrivals = await fetchIncheonArrivals({ serviceKey: key });

  // arrivalDate == today (및 레거시 exitDate)
  const [byArrival, byExit] = await Promise.all([
    db().collection('reservations').where('arrivalDate', '==', today).limit(500).get(),
    db().collection('reservations').where('exitDate', '==', today).limit(500).get(),
  ]);

  const docs = new Map<string, FirebaseFirestore.QueryDocumentSnapshot>();
  for (const d of byArrival.docs) docs.set(d.id, d);
  for (const d of byExit.docs) docs.set(d.id, d);

  let candidates = 0;
  let matched = 0;
  let notified = 0;
  let errors = 0;

  for (const doc of docs.values()) {
    const data = doc.data();
    const status = String(data.status || '');
    if (!ACTIVE_STATUSES.has(status)) continue;

    const airport = resolveAirport(data);
    if (airport && airport !== 'ICN') continue;

    const flightRaw = resolveArrivalFlight(data);
    if (!normalizeFlightId(flightRaw)) continue;

    if (resolveArrivalDate(data) !== today) continue;

    candidates += 1;
    const arrival = findArrivalForFlight(arrivals, flightRaw);
    if (!arrival) continue;
    matched += 1;

    const { delayed, minutes, cancelled } = isDelayed(arrival);
    if (!delayed && !cancelled) {
      await doc.ref
        .set(
          {
            flightTracking: {
              arrivalFlight: arrival.flightId,
              scheduleHhmm: arrival.scheduleHhmm,
              estimatedHhmm: arrival.estimatedHhmm,
              remark: arrival.remark,
              delayMinutes: minutes,
              lastCheckedAt: new Date().toISOString(),
            },
          },
          { merge: true }
        )
        .catch(() => undefined);
      continue;
    }

    const kind = cancelled ? 'cancel' : 'delay';
    const fp = notifyFingerprint(arrival, kind);
    const prev = (data.flightTracking || {}) as Record<string, unknown>;
    if (String(prev.lastNotifiedFingerprint || '') === fp) {
      continue;
    }

    try {
      await notifyPartnersFlightDelay(doc.id, data, {
        flightId: arrival.flightId,
        scheduleLabel: formatHhmm(arrival.scheduleHhmm),
        estimatedLabel: formatHhmm(arrival.estimatedHhmm),
        delayMinutes: minutes,
        remark: arrival.remark,
        cancelled,
      });
      notified += 1;

      await doc.ref.set(
        {
          flightTracking: {
            arrivalFlight: arrival.flightId,
            scheduleHhmm: arrival.scheduleHhmm,
            estimatedHhmm: arrival.estimatedHhmm,
            remark: arrival.remark,
            delayMinutes: minutes,
            lastCheckedAt: new Date().toISOString(),
            lastNotifiedAt: new Date().toISOString(),
            lastNotifiedFingerprint: fp,
          },
        },
        { merge: true }
      );
    } catch (err) {
      errors += 1;
      console.error('[flightDelay] notify failed', {
        id: doc.id,
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return {
    arrivalsFetched: arrivals.length,
    candidates,
    matched,
    notified,
    errors,
  };
}
