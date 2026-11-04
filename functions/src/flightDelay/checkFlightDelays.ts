import * as admin from 'firebase-admin';
import { delayMinutes, formatHhmm, normalizeFlightId } from './flightId';
import {
  fetchIncheonArrivals,
  findArrivalForFlight,
  isFlightArrived,
  type IncheonArrival,
} from './incheonArrivals';
import { notifyPartnersFlightArrival, notifyPartnersFlightDelay } from '../partnerPush';

const MIN_DELAY_MINUTES = 15;
const HEALTH_DOC = 'appConfig/flightDelayHealth';
const FAIL_BACKOFF_AFTER = 3;
const FAIL_BACKOFF_MS = 15 * 60 * 1000;
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

function trackingSnapshotUnchanged(
  prev: Record<string, unknown>,
  base: {
    arrivalFlight: string;
    scheduleHhmm: string;
    estimatedHhmm: string;
    remark: string;
    delayMinutes: number;
  }
): boolean {
  return (
    String(prev.arrivalFlight || '') === base.arrivalFlight &&
    String(prev.scheduleHhmm || '') === base.scheduleHhmm &&
    String(prev.estimatedHhmm || '') === base.estimatedHhmm &&
    String(prev.remark || '') === base.remark &&
    Number(prev.delayMinutes || 0) === base.delayMinutes
  );
}

/** 공항 예상시각(HHMM) → 예약 arrivalTime(HH:mm) · endDate 동기화 */
function arrivalSchedulePatch(
  data: FirebaseFirestore.DocumentData,
  estimatedHhmm: string
): Record<string, string> {
  const label = formatHhmm(estimatedHhmm);
  if (!/^\d{2}:\d{2}$/.test(label)) return {};
  const current = String(data.arrivalTime || '').trim();
  if (current === label) return {};

  const patch: Record<string, string> = { arrivalTime: label };
  const endDate = String(data.endDate || '').trim();
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(endDate)) {
    patch.endDate = `${endDate.slice(0, 10)}T${label}`;
  } else if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(endDate)) {
    patch.endDate = `${endDate.slice(0, 10)} ${label}`;
  } else {
    const arrDate = String(data.arrivalDate || '').trim().slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(arrDate)) {
      patch.endDate = `${arrDate}T${label}`;
    }
  }
  return patch;
}

export type FlightDelayCheckResult = {
  skipped?: string;
  arrivalsFetched: number;
  candidates: number;
  matched: number;
  notified: number;
  promotedToRequestOut: number;
  errors: number;
};

type FlightDelayHealth = {
  consecutiveFailures?: number;
  lastFailedAt?: string;
  lastSuccessAt?: string;
  lastError?: string;
};

function emptyResult(skipped: string): FlightDelayCheckResult {
  return {
    skipped,
    arrivalsFetched: 0,
    candidates: 0,
    matched: 0,
    notified: 0,
    promotedToRequestOut: 0,
    errors: 0,
  };
}

async function readHealth(): Promise<FlightDelayHealth> {
  const snap = await db().doc(HEALTH_DOC).get();
  return (snap.data() || {}) as FlightDelayHealth;
}

function isInBackoff(health: FlightDelayHealth, now = Date.now()): boolean {
  const n = Number(health.consecutiveFailures) || 0;
  if (n < FAIL_BACKOFF_AFTER) return false;
  const t = Date.parse(String(health.lastFailedAt || ''));
  if (!Number.isFinite(t)) return false;
  return now - t < FAIL_BACKOFF_MS;
}

async function markAirportSuccess(): Promise<void> {
  await db()
    .doc(HEALTH_DOC)
    .set(
      { consecutiveFailures: 0, lastSuccessAt: new Date().toISOString() },
      { merge: true }
    );
}

async function markAirportFailure(err: unknown): Promise<void> {
  const prev = await readHealth();
  const n = (Number(prev.consecutiveFailures) || 0) + 1;
  await db()
    .doc(HEALTH_DOC)
    .set(
      {
        consecutiveFailures: n,
        lastFailedAt: new Date().toISOString(),
        lastError: (err instanceof Error ? err.message : String(err)).slice(0, 200),
      },
      { merge: true }
    );
}

/** exitDate만 있는 예전 예약은 arrivalDate로 옮긴다. 끝나면 true. */
async function copyExitDateIntoArrivalDate(): Promise<boolean> {
  const flagRef = db().doc('appConfig/reservationFieldBackfill');
  const flag = await flagRef.get();
  if (flag.get('exitDateCopied') === true) return true;

  const lastId = String(flag.get('exitDateCursor') || '');
  let query = db()
    .collection('reservations')
    .orderBy(admin.firestore.FieldPath.documentId())
    .limit(300);
  if (lastId) query = query.startAfter(lastId);
  const page = await query.get();

  const batch = db().batch();
  let writes = 0;
  for (const doc of page.docs) {
    const data = doc.data();
    const arrival = String(data.arrivalDate || '').trim();
    const exit = String(data.exitDate || '').trim().slice(0, 10);
    if (arrival || !/^\d{4}-\d{2}-\d{2}$/.test(exit)) continue;
    batch.update(doc.ref, { arrivalDate: exit });
    writes += 1;
  }
  if (writes > 0) await batch.commit();

  if (page.size < 300) {
    await flagRef.set({ exitDateCopied: true, exitDateCopiedAt: new Date().toISOString() }, { merge: true });
    return true;
  }
  const cursor = page.docs[page.docs.length - 1]?.id;
  if (cursor) await flagRef.set({ exitDateCursor: cursor }, { merge: true });
  return false;
}

type TodayCandidate = {
  doc: FirebaseFirestore.QueryDocumentSnapshot;
  data: FirebaseFirestore.DocumentData;
  flightRaw: string;
};

/** 오늘 출고 + 인천 입국편이 있는 예약만. 공항 API 전에 걸러 호출을 아낀다. */
async function loadTodayCandidates(): Promise<TodayCandidate[]> {
  const today = kstTodayYmd();
  const exitDatesCopied = await copyExitDateIntoArrivalDate();
  const queries = [
    db().collection('reservations').where('arrivalDate', '==', today).limit(500).get(),
  ];
  if (!exitDatesCopied) {
    queries.push(db().collection('reservations').where('exitDate', '==', today).limit(500).get());
  }
  const listed = await Promise.all(queries);
  const docs = new Map<string, FirebaseFirestore.QueryDocumentSnapshot>();
  for (const d of listed[0].docs) docs.set(d.id, d);
  for (const d of listed[1]?.docs || []) docs.set(d.id, d);

  const out: TodayCandidate[] = [];
  for (const doc of docs.values()) {
    const data = doc.data();
    if (!ACTIVE_STATUSES.has(String(data.status || ''))) continue;
    const airport = resolveAirport(data);
    if (airport && airport !== 'ICN') continue;
    const flightRaw = resolveArrivalFlight(data);
    if (!normalizeFlightId(flightRaw)) continue;
    if (resolveArrivalDate(data) !== today) continue;
    out.push({ doc, data, flightRaw });
  }
  return out;
}

/**
 * 오늘(KST) 출고 예정 + 입국 항공편이 있는 예약을
 * 인천공항 당일 도착 현황과 대조해
 * - 입국편 도착 시 주차완료(출고예정) → 출고요청 자동 전환
 * - 공항 예상시각이 바뀔 때마다 출고 예정 시각(arrivalTime·endDate) 맞춤. 연착·조착 모두
 * - 15분 이상 연착/결항 시 파트너 FCM 푸시
 */
export async function runFlightDelayCheck(serviceKey: string): Promise<FlightDelayCheckResult> {
  const key = serviceKey.trim();
  if (!key) return emptyResult('DATA_GO_KR_SERVICE_KEY empty');

  const candidatesList = await loadTodayCandidates();
  if (candidatesList.length === 0) {
    return emptyResult('no arrival flights today');
  }

  const health = await readHealth();
  if (isInBackoff(health)) {
    return {
      ...emptyResult('airport backoff 15m after 3 failures'),
      candidates: candidatesList.length,
    };
  }

  let arrivals: IncheonArrival[] = [];
  try {
    arrivals = await fetchIncheonArrivals({ serviceKey: key });
    await markAirportSuccess();
  } catch (err) {
    await markAirportFailure(err);
    console.error('[flightDelay] airport fetch failed', {
      err: err instanceof Error ? err.message : String(err),
    });
    return {
      ...emptyResult('airport fetch failed'),
      candidates: candidatesList.length,
      errors: 1,
    };
  }

  let matched = 0;
  let notified = 0;
  let promotedToRequestOut = 0;
  let errors = 0;

  for (const { doc, data, flightRaw } of candidatesList) {
    const status = String(data.status || '');
    const arrival = findArrivalForFlight(arrivals, flightRaw);
    if (!arrival) continue;
    matched += 1;

    const { delayed, minutes, cancelled } = isDelayed(arrival);
    const arrived = isFlightArrived(arrival.remark);
    const now = new Date().toISOString();
    const prev = (data.flightTracking || {}) as Record<string, unknown>;
    const trackingBase = {
      arrivalFlight: arrival.flightId,
      scheduleHhmm: arrival.scheduleHhmm,
      estimatedHhmm: arrival.estimatedHhmm,
      remark: arrival.remark,
      delayMinutes: minutes,
      lastCheckedAt: now,
    };

    // 주차완료(출고예정) + 입국편 도착 → 출고요청 자동 전환
    if (arrived && status === 'completed_in' && !prev.autoRequestOutAt) {
      try {
        await doc.ref.update({
          status: 'request_out',
          updatedBy: 'flight-arrival-auto',
          updatedAt: now,
          ...arrivalSchedulePatch(data, arrival.estimatedHhmm),
          flightTracking: {
            ...trackingBase,
            landedAt: now,
            autoRequestOutAt: now,
          },
        });
        promotedToRequestOut += 1;
        await notifyPartnersFlightArrival(doc.id, data, {
          flightId: arrival.flightId,
          estimatedLabel: formatHhmm(arrival.estimatedHhmm),
        });
      } catch (err) {
        errors += 1;
        console.error('[flightDelay] auto request_out failed', {
          id: doc.id,
          err: err instanceof Error ? err.message : String(err),
        });
      }
      continue;
    }

    const schedulePatch = cancelled
      ? {}
      : arrivalSchedulePatch(data, arrival.estimatedHhmm);

    if (!delayed && !cancelled) {
      const timeChanged = Object.keys(schedulePatch).length > 0;
      if (!timeChanged && trackingSnapshotUnchanged(prev, trackingBase)) continue;
      await doc.ref
        .set(
          {
            ...schedulePatch,
            ...(timeChanged
              ? { updatedBy: 'flight-schedule', updatedAt: now }
              : {}),
            flightTracking: trackingBase,
          },
          { merge: true }
        )
        .catch(() => undefined);
      continue;
    }

    const kind = cancelled ? 'cancel' : 'delay';
    const fp = notifyFingerprint(arrival, kind);

    if (String(prev.lastNotifiedFingerprint || '') === fp) {
      // 알림은 이미 보냈어도, 예상시각이 바뀌었으면 출고예정 시각만 맞춤
      if (Object.keys(schedulePatch).length > 0) {
        await doc.ref
          .set(
            {
              ...schedulePatch,
              updatedBy: 'flight-delay-schedule',
              updatedAt: now,
              flightTracking: trackingBase,
            },
            { merge: true }
          )
          .catch(() => undefined);
      }
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
          ...schedulePatch,
          ...(Object.keys(schedulePatch).length > 0
            ? { updatedBy: 'flight-delay-schedule', updatedAt: now }
            : {}),
          flightTracking: {
            ...trackingBase,
            lastNotifiedAt: now,
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
    candidates: candidatesList.length,
    matched,
    notified,
    promotedToRequestOut,
    errors,
  };
}
