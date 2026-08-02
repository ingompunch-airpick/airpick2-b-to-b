/**
 * 인천공항 무료 셔틀 — 공공데이터포털 ShtbusInfo 프록시.
 * 키: Secret Manager DATA_GO_KR_SERVICE_KEY (functions/.env 로컬 폴백).
 *
 * 도착예측 API는 정류장별 predTimes를 주지만 정류장명은 없음 → 노선 순번 기준 안내명 매핑.
 */
import { defineSecret } from 'firebase-functions/params';
import { onRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';

const dataGoKrKey = defineSecret('DATA_GO_KR_SERVICE_KEY');

const ARRIVAL_URL = 'https://apis.data.go.kr/B551177/ShtbusInfo/getShtbArrivalPredInfo';
const TIME_URL = 'https://apis.data.go.kr/B551177/ShtbusInfo/getShtbTimeInfo';

/** 노선 순번(ord) → 안내명 (공공 API에 정류장명 없음 · 공식·공개 노선도 기준) */
const STOP_LABEL_BY_ROUTE_ORD: Record<string, Record<number, string>> = {
  '11100001': {
    1: 'T1 동측 3C',
    2: 'T1 경유',
    3: 'T1 서측 13C',
    4: '장기 1번',
    5: '장기 2번',
    6: '장기 2-1번',
    7: '장기 3번',
    8: '장기 4번',
    9: '장기 4-1번',
    10: '장기 4-2번',
    11: '장기 5번',
    12: '장기 6번',
    13: '장기 회차',
    14: '터미널 방향',
    15: '터미널 방향',
    16: 'T2 연결 경유',
    17: 'T2 연결',
  },
  '11100006': {
    1: 'T2 여객터미널',
    2: '정비단지',
    3: '장기 B 탑승장',
    4: '장기 A 탑승장',
    5: '남측 주차타워',
    6: '북측 주차타워',
    7: '장기 C 탑승장',
    8: '장기 경유',
    9: '장기 경유',
    10: '장기 구역',
    11: '장기 구역',
    12: '장기 구역',
    13: '장기 구역',
    14: '장기 구역',
    15: '장기 구역',
    16: '장기 구역',
    17: '터미널 방향',
    18: 'T2 회차',
  },
};

export const SHUTTLE_BY_LOT: Record<
  string,
  { routeId: string; routeLabel: string; note: string }
> = {
  'icn-t1-longterm': {
    routeId: '11100001',
    routeLabel: '공항01 · T1↔장기주차장',
    note: '정류장별 도착은 공공 API 기준 · 정류장 안내는 노선 순번 매핑(현장 안내판 우선)',
  },
  'icn-t2-longterm': {
    routeId: '11100006',
    routeLabel: '공항02 · T2↔장기주차장',
    note: '정류장별 도착은 공공 API 기준 · 정류장 안내는 노선 순번 매핑(현장 안내판 우선)',
  },
};

type ArrivalItem = {
  stopId?: string;
  routeId?: string;
  predTimes?: string;
  ofrTime?: string;
  ord?: string;
};

type TimeItem = {
  routeId?: string;
  dayType?: string;
  stopId?: string;
  startTime?: string;
  staOrd?: string;
};

export type ShuttleStopPayload = {
  stopId: string;
  ord: number;
  name: string;
  predMinutes: number | null;
  departures?: string[];
};

let arrivalCache: { at: number; items: ArrivalItem[] } | null = null;
let timeCache: { at: number; items: TimeItem[] } | null = null;

function serviceKey(): string {
  try {
    const v = dataGoKrKey.value()?.trim();
    if (v) return v;
  } catch {
    /* local / unset */
  }
  return String(process.env.DATA_GO_KR_SERVICE_KEY ?? '').trim();
}

function seoulParts(now = new Date()) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  const parts = Object.fromEntries(fmt.formatToParts(now).map((p) => [p.type, p.value]));
  const hhmm = `${parts.hour ?? '00'}${parts.minute ?? '00'}`;
  const weekday = parts.weekday ?? '';
  const isWeekend = weekday === 'Sat' || weekday === 'Sun';
  return { hhmm, isWeekend };
}

function formatHhmm(raw: string): string {
  const s = raw.replace(/\D/g, '').padStart(4, '0').slice(0, 4);
  return `${s.slice(0, 2)}:${s.slice(2, 4)}`;
}

function stopName(routeId: string, ord: number): string {
  const mapped = STOP_LABEL_BY_ROUTE_ORD[routeId]?.[ord];
  if (mapped) return mapped;
  return `정류장 ${ord}번`;
}

async function fetchJson(url: string, key: string, pageNo: number, numOfRows: number) {
  const u = new URL(url);
  u.searchParams.set('serviceKey', key);
  u.searchParams.set('type', 'json');
  u.searchParams.set('pageNo', String(pageNo));
  u.searchParams.set('numOfRows', String(numOfRows));
  const res = await fetch(u.toString());
  if (!res.ok) throw new Error(`upstream_${res.status}`);
  return (await res.json()) as {
    response?: {
      header?: { resultCode?: string; resultMsg?: string };
      body?: { items?: ArrivalItem[] | TimeItem[] | ArrivalItem | TimeItem; totalCount?: number };
    };
  };
}

function asArray<T>(items: T[] | T | undefined): T[] {
  if (!items) return [];
  return Array.isArray(items) ? items : [items];
}

async function loadArrivals(key: string): Promise<ArrivalItem[]> {
  const now = Date.now();
  if (arrivalCache && now - arrivalCache.at < 60_000) return arrivalCache.items;
  const json = await fetchJson(ARRIVAL_URL, key, 1, 100);
  const code = json.response?.header?.resultCode;
  if (code !== '00') {
    throw new Error(json.response?.header?.resultMsg || 'arrival_error');
  }
  const items = asArray(json.response?.body?.items as ArrivalItem[] | ArrivalItem | undefined);
  arrivalCache = { at: now, items };
  return items;
}

async function loadTimes(key: string): Promise<TimeItem[]> {
  const now = Date.now();
  if (timeCache && now - timeCache.at < 30 * 60_000) return timeCache.items;

  const all: TimeItem[] = [];
  let page = 1;
  const pageSize = 1000;
  let total = Infinity;
  while (all.length < total && page <= 8) {
    const json = await fetchJson(TIME_URL, key, page, pageSize);
    const code = json.response?.header?.resultCode;
    if (code !== '00') {
      throw new Error(json.response?.header?.resultMsg || 'time_error');
    }
    total = Number(json.response?.body?.totalCount ?? 0);
    const batch = asArray(json.response?.body?.items as TimeItem[] | TimeItem | undefined);
    if (batch.length === 0) break;
    all.push(...batch);
    page += 1;
  }
  timeCache = { at: now, items: all };
  return all;
}

function parsePred(raw: string | undefined): number | null {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return n === 0 ? 0 : null;
  return n;
}

/** ofrTime(YYYYMMDDHHMISS) → 서울 기준 경과(분). 파싱 실패 시 null */
function ofrAgeMinutes(ofrTime: string | null | undefined, now = new Date()): number | null {
  if (!ofrTime || ofrTime.length < 14) return null;
  const y = ofrTime.slice(0, 4);
  const mo = ofrTime.slice(4, 6);
  const d = ofrTime.slice(6, 8);
  const h = ofrTime.slice(8, 10);
  const mi = ofrTime.slice(10, 12);
  const s = ofrTime.slice(12, 14);
  const t = Date.parse(`${y}-${mo}-${d}T${h}:${mi}:${s}+09:00`);
  if (!Number.isFinite(t)) return null;
  return (now.getTime() - t) / 60_000;
}

/**
 * 공공 API는 운행 종료·심야에도 predTimes=0 을 잔류시키는 경우가 많음.
 * 전 정류장 0 + 제공시각 오래됨 → 실시간 무효 처리.
 */
function applyLiveReliability(
  stops: ShuttleStopPayload[],
  ofrTime: string | null | undefined
): {
  stops: ShuttleStopPayload[];
  predMinutes: number | null;
  liveStatus: 'live' | 'unavailable';
  liveReason: string | null;
} {
  const preds = stops.map((s) => s.predMinutes);
  const numeric = preds.filter((n): n is number => n != null);
  const allZero = numeric.length > 0 && numeric.every((n) => n === 0);
  const age = ofrAgeMinutes(ofrTime);
  const stale = age == null || age > 20;

  if (allZero || stale) {
    return {
      stops: stops.map((s) => ({ ...s, predMinutes: null })),
      predMinutes: null,
      liveStatus: 'unavailable',
      liveReason: allZero && stale
        ? '심야·운행 대기이거나 실시간 제공이 멈춘 상태입니다'
        : allZero
          ? '전 정류장 도착예측이 0이라 실시간으로 보기 어렵습니다'
          : '실시간 제공 시각이 오래되어 도착예측을 숨겼습니다',
    };
  }

  return {
    stops,
    predMinutes: Math.min(...numeric),
    liveStatus: 'live',
    liveReason: null,
  };
}

function buildStops(items: ArrivalItem[], routeId: string): ShuttleStopPayload[] {
  return items
    .filter((i) => i.routeId === routeId)
    .map((i) => {
      const ord = Number(i.ord) || 0;
      const stopId = String(i.stopId ?? '');
      return {
        stopId,
        ord,
        name: stopName(routeId, ord),
        predMinutes: parsePred(i.predTimes),
      };
    })
    .sort((a, b) => a.ord - b.ord);
}

function upcomingForStop(
  items: TimeItem[],
  routeId: string,
  stopId: string,
  ord: number,
  hhmm: string,
  isWeekend: boolean
): string[] {
  const preferredDay = isWeekend ? '2' : '1';
  let rows = items.filter(
    (i) =>
      i.routeId === routeId &&
      i.dayType === preferredDay &&
      String(i.stopId) === stopId &&
      String(i.staOrd) === String(ord)
  );
  if (rows.length === 0) {
    rows = items.filter(
      (i) => i.routeId === routeId && i.dayType === preferredDay && String(i.stopId) === stopId
    );
  }
  if (rows.length === 0) {
    rows = items.filter((i) => i.routeId === routeId && String(i.stopId) === stopId);
  }

  const unique = [
    ...new Set(rows.map((i) => String(i.startTime ?? '').replace(/\D/g, '')).filter(Boolean)),
  ].sort();

  const upcoming = unique.filter((t) => t >= hhmm).slice(0, 8);
  if (upcoming.length > 0) return upcoming.map(formatHhmm);
  return unique.slice(0, 6).map(formatHhmm);
}

/**
 * GET /api/icn-shuttle?lotId=icn-t1-longterm
 * 또는 ?lotId=...&detail=1 이면 정류장별 출발 시각 포함
 */
export const getIcnShuttle = onRequest(
  {
    region: 'asia-northeast3',
    cors: true,
    secrets: [dataGoKrKey],
    timeoutSeconds: 60,
    memory: '512MiB',
  },
  async (req, res) => {
    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }
    if (req.method !== 'GET') {
      res.status(405).json({ error: 'method_not_allowed' });
      return;
    }

    const lotId = String(req.query.lotId ?? '').trim();
    const detail = String(req.query.detail ?? '') === '1';
    const meta = SHUTTLE_BY_LOT[lotId];
    if (!meta) {
      res.status(400).json({ error: 'unsupported_lot' });
      return;
    }

    const key = serviceKey();
    if (!key) {
      res.status(500).json({ error: 'missing_service_key' });
      return;
    }

    try {
      const { hhmm, isWeekend } = seoulParts();
      const arrivals = await loadArrivals(key);
      let stops = buildStops(arrivals, meta.routeId);
      const ofr = arrivals.find((a) => a.routeId === meta.routeId)?.ofrTime ?? null;
      const live = applyLiveReliability(stops, ofr);
      stops = live.stops;

      if (detail) {
        const times = await loadTimes(key);
        stops = stops.map((s) => ({
          ...s,
          departures: upcomingForStop(times, meta.routeId, s.stopId, s.ord, hhmm, isWeekend),
        }));
      }

      const payload: Record<string, unknown> = {
        lotId,
        routeId: meta.routeId,
        routeLabel: meta.routeLabel,
        note: meta.note,
        predMinutes: live.predMinutes,
        liveStatus: live.liveStatus,
        liveReason: live.liveReason,
        stopCount: stops.length,
        stops,
        updatedAt: ofr,
        source: 'data.go.kr / B551177/ShtbusInfo',
      };

      if (detail) {
        payload.dayHint = isWeekend ? 'weekend' : 'weekday';
      }

      res.set('Cache-Control', detail ? 'public, max-age=60' : 'public, max-age=30');
      res.status(200).json(payload);
    } catch (err) {
      logger.error('getIcnShuttle failed', err);
      res.status(502).json({ error: 'upstream_failed' });
    }
  }
);
