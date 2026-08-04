/**
 * 인천공항 도착편 → 예정 시각·터미널 조회 (홈페이지 /h/ 출고시각 자동 채움용).
 * - 당일: StatusOfPassengerFlightsOdp (실시간)
 * - D+1~D+6: StatusOfPassengerFlightsDSOdp (주간)
 */
import { defineSecret } from 'firebase-functions/params';
import { onRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';

import {
  fetchIncheonArrivals,
  findArrivalForFlight,
} from '../flightDelay/incheonArrivals';
import { formatHhmm, normalizeFlightId } from '../flightDelay/flightId';

const dataGoKrKey = defineSecret('DATA_GO_KR_SERVICE_KEY');

const WEEKLY_ARRIVAL_URL =
  'https://apis.data.go.kr/B551177/StatusOfPassengerFlightsDSOdp/getPassengerArrivalsDSOdp';

type WeeklyItem = {
  airline?: string;
  flightId?: string;
  scheduleDateTime?: string;
  estimatedDateTime?: string;
  airport?: string;
  airportCode?: string;
  remark?: string;
  terminalid?: string;
  codeshare?: string;
  masterflightid?: string;
};

type CacheEntry = {
  at: number;
  flightId: string;
  date: string;
  payload: ArrivalLookupResult | null;
};

const lookupCache = new Map<string, CacheEntry>();
let weeklyCache: { at: number; items: WeeklyItem[] } | null = null;

export type ArrivalLookupResult = {
  flightId: string;
  airline: string | null;
  origin: string | null;
  originCode: string | null;
  date: string;
  scheduleTime: string | null;
  estimatedTime: string | null;
  remark: string | null;
  terminal: 'T1' | 'T2' | null;
  terminalLabel: string | null;
  source: 'live' | 'weekly';
};

function serviceKey(): string {
  try {
    const v = dataGoKrKey.value()?.trim();
    if (v) return v;
  } catch {
    /* local */
  }
  return String(process.env.DATA_GO_KR_SERVICE_KEY ?? '').trim();
}

function seoulYmd(d = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
    .format(d)
    .replace(/-/g, '');
}

function addDaysYmd(ymd: string, days: number): string {
  const y = Number(ymd.slice(0, 4));
  const m = Number(ymd.slice(4, 6));
  const d = Number(ymd.slice(6, 8));
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yy}${mm}${dd}`;
}

function mapTerminal(terminalid: string | undefined): {
  terminal: 'T1' | 'T2' | null;
  terminalLabel: string | null;
} {
  const id = String(terminalid ?? '').trim().toUpperCase();
  if (id === 'P03') return { terminal: 'T2', terminalLabel: '제2여객터미널' };
  if (id === 'P01' || id === 'P02') {
    return {
      terminal: 'T1',
      terminalLabel: id === 'P02' ? '제1여객터미널·탑승동' : '제1여객터미널',
    };
  }
  return { terminal: null, terminalLabel: null };
}

function hhmmToLabel(raw: string): string | null {
  const digits = String(raw || '').replace(/\D/g, '');
  const hhmm = digits.length >= 4 ? digits.slice(-4) : digits;
  const label = formatHhmm(hhmm);
  return /^\d{2}:\d{2}$/.test(label) ? label : null;
}

function parseWeeklySchedule(raw: string | undefined): { date: string; time: string | null } | null {
  const digits = String(raw || '').replace(/\D/g, '');
  if (digits.length < 12) return null;
  return {
    date: digits.slice(0, 8),
    time: hhmmToLabel(digits.slice(8, 12)),
  };
}

function asArray<T>(items: T | T[] | undefined): T[] {
  if (!items) return [];
  return Array.isArray(items) ? items : [items];
}

async function fetchWeeklyArrivals(key: string): Promise<WeeklyItem[]> {
  const now = Date.now();
  if (weeklyCache && now - weeklyCache.at < 180_000) return weeklyCache.items;

  const u = new URL(WEEKLY_ARRIVAL_URL);
  // 키가 이미 인코딩된 경우가 있어 URLSearchParams 대신 수동 조합
  const qs = new URLSearchParams({ type: 'json' });
  const url = /%[0-9A-Fa-f]{2}/.test(key)
    ? `${u.origin}${u.pathname}?serviceKey=${key}&${qs.toString()}`
    : `${u.origin}${u.pathname}?${new URLSearchParams({ serviceKey: key, type: 'json' }).toString()}`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`weekly_upstream_${res.status}`);
  const json = (await res.json()) as {
    response?: {
      header?: { resultCode?: string; resultMsg?: string };
      body?: { items?: { item?: WeeklyItem | WeeklyItem[] } | WeeklyItem | WeeklyItem[] };
    };
  };
  const code = json.response?.header?.resultCode;
  if (code && code !== '00') {
    throw new Error(json.response?.header?.resultMsg || 'weekly_arrival_error');
  }

  const bodyItems = json.response?.body?.items;
  let list: WeeklyItem[] = [];
  if (bodyItems && typeof bodyItems === 'object' && 'item' in bodyItems) {
    list = asArray((bodyItems as { item?: WeeklyItem | WeeklyItem[] }).item);
  } else {
    list = asArray(bodyItems as WeeklyItem | WeeklyItem[] | undefined);
  }

  weeklyCache = { at: now, items: list };
  return list;
}

function pickWeeklyMatch(items: WeeklyItem[], flightId: string, date: string): WeeklyItem | null {
  const want = normalizeFlightId(flightId);
  const pool = items.filter((item) => {
    const id = normalizeFlightId(String(item.flightId ?? ''));
    const master = normalizeFlightId(String(item.masterflightid ?? ''));
    if (id !== want && master !== want) return false;
    const sched = parseWeeklySchedule(item.scheduleDateTime || item.estimatedDateTime);
    return sched?.date === date;
  });
  if (!pool.length) return null;
  const master = pool.find((i) => String(i.codeshare ?? '').toLowerCase() === 'master');
  return master ?? pool[0] ?? null;
}

async function lookupArrival(
  key: string,
  flightId: string,
  date: string
): Promise<ArrivalLookupResult | null> {
  const today = seoulYmd();
  const max = addDaysYmd(today, 6);
  if (date < today || date > max) return null;

  if (date === today) {
    const arrivals = await fetchIncheonArrivals({ serviceKey: key, flightId });
    const hit = findArrivalForFlight(arrivals, flightId);
    if (!hit) return null;
    const term = mapTerminal(hit.terminalId);
    return {
      flightId: hit.flightId,
      airline: hit.airline || null,
      origin: null,
      originCode: null,
      date,
      scheduleTime: hhmmToLabel(hit.scheduleHhmm),
      estimatedTime: hhmmToLabel(hit.estimatedHhmm),
      remark: hit.remark || null,
      terminal: term.terminal,
      terminalLabel: term.terminalLabel,
      source: 'live',
    };
  }

  const weekly = await fetchWeeklyArrivals(key);
  const item = pickWeeklyMatch(weekly, flightId, date);
  if (!item) return null;
  const sched = parseWeeklySchedule(item.scheduleDateTime);
  const est = parseWeeklySchedule(item.estimatedDateTime);
  const term = mapTerminal(item.terminalid);
  return {
    flightId: String(item.flightId ?? flightId).toUpperCase(),
    airline: item.airline ?? null,
    origin: item.airport ?? null,
    originCode: item.airportCode ?? null,
    date,
    scheduleTime: sched?.time ?? null,
    estimatedTime: est?.time ?? sched?.time ?? null,
    remark: item.remark ?? null,
    terminal: term.terminal,
    terminalLabel: term.terminalLabel,
    source: 'weekly',
  };
}

/**
 * GET /api/icn-arrival?flightId=7C1704&date=20260804
 */
export const getIcnArrival = onRequest(
  {
    region: 'asia-northeast3',
    cors: true,
    secrets: [dataGoKrKey],
    timeoutSeconds: 30,
    memory: '256MiB',
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

    const flightId = normalizeFlightId(String(req.query.flightId ?? req.query.flight_id ?? ''));
    const dateRaw = String(req.query.date ?? '').replace(/\D/g, '');
    const date = dateRaw.length === 8 ? dateRaw : seoulYmd();

    if (!flightId || flightId.length < 3) {
      res.status(400).json({ error: 'invalid_flight_id' });
      return;
    }

    const today = seoulYmd();
    const max = addDaysYmd(today, 6);
    if (date < today || date > max) {
      res.status(422).json({
        error: 'date_out_of_range',
        flightId,
        date,
        message: '출고일 기준 오늘부터 6일 이내만 공항 시각을 자동으로 가져올 수 있습니다.',
      });
      return;
    }

    const key = serviceKey();
    if (!key) {
      res.status(500).json({ error: 'missing_service_key' });
      return;
    }

    const cacheKey = `${date}:${flightId}`;
    const cached = lookupCache.get(cacheKey);
    if (cached && Date.now() - cached.at < 60_000) {
      if (!cached.payload) {
        res.status(404).json({
          error: 'not_found',
          flightId,
          date,
          message: '해당 날짜에 도착편이 없습니다. 편명·날짜를 확인해 주세요.',
        });
        return;
      }
      res.set('Cache-Control', 'public, max-age=60');
      res.json(cached.payload);
      return;
    }

    try {
      const payload = await lookupArrival(key, flightId, date);
      lookupCache.set(cacheKey, { at: Date.now(), flightId, date, payload });
      if (!payload || !payload.scheduleTime) {
        res.status(404).json({
          error: 'not_found',
          flightId,
          date,
          message: '해당 날짜에 도착편이 없습니다. 편명·날짜를 확인해 주세요.',
        });
        return;
      }
      res.set('Cache-Control', 'public, max-age=60');
      res.json(payload);
    } catch (err) {
      logger.error('getIcnArrival_failed', { flightId, date, err });
      res.status(502).json({
        error: 'upstream',
        message: err instanceof Error ? err.message : 'arrival_lookup_failed',
      });
    }
  }
);
