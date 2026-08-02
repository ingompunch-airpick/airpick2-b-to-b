/**
 * 인천공항 여객 출발편 → 터미널·체크인 카운터 조회.
 * 키: Secret Manager DATA_GO_KR_SERVICE_KEY
 */
import { defineSecret } from 'firebase-functions/params';
import { onRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';

const dataGoKrKey = defineSecret('DATA_GO_KR_SERVICE_KEY');

const DEPARTURE_URL =
  'https://apis.data.go.kr/B551177/StatusOfPassengerFlightsDeOdp/getPassengerDeparturesDeOdp';

type FlightItem = {
  airline?: string;
  flightId?: string;
  airport?: string;
  airportCode?: string;
  chkinrange?: string;
  terminalid?: string;
  scheduleDateTime?: string;
  estimatedDateTime?: string;
  remark?: string;
  codeshare?: string;
  masterflightid?: string;
};

type CacheEntry = { at: number; item: FlightItem | null; miss: boolean };
type ListCacheEntry = { at: number; items: FlightItem[]; totalCount: number };
const cache = new Map<string, CacheEntry>();
const listCache = new Map<string, ListCacheEntry>();

const SEARCH_ROW_LIMIT = 20;

function serviceKey(): string {
  try {
    const v = dataGoKrKey.value()?.trim();
    if (v) return v;
  } catch {
    /* local / unset */
  }
  return String(process.env.DATA_GO_KR_SERVICE_KEY ?? '').trim();
}

function seoulYmd(d = new Date()): string {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = Object.fromEntries(fmt.formatToParts(d).map((p) => [p.type, p.value]));
  return `${parts.year}${parts.month}${parts.day}`;
}

/** KE101 / ke-101 / KE 101 → KE101 */
export function normalizeFlightId(raw: string): string {
  const s = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const m = s.match(/^([A-Z]{1,3})(\d{1,4})$/);
  if (!m) return s;
  return `${m[1]}${m[2]}`;
}

function mapTerminal(terminalid: string | undefined): {
  terminal: 'T1' | 'T2' | null;
  terminalLabel: string | null;
  terminalId: string | null;
} {
  const id = String(terminalid ?? '').trim().toUpperCase();
  if (id === 'P03') {
    return { terminal: 'T2', terminalLabel: '제2여객터미널', terminalId: id };
  }
  if (id === 'P01') {
    return { terminal: 'T1', terminalLabel: '제1여객터미널', terminalId: id };
  }
  if (id === 'P02') {
    return { terminal: 'T1', terminalLabel: '제1여객터미널·탑승동', terminalId: id };
  }
  return { terminal: null, terminalLabel: null, terminalId: id || null };
}

function formatCheckIn(raw: string | undefined): string | null {
  const s = String(raw ?? '').trim();
  if (!s || s === '-' || s === '—' || s.toLowerCase() === 'null') return null;
  // "A B C D" → "A·B·C·D", "E01-E04" 유지
  if (/^[A-Z](\s+[A-Z])+$/i.test(s)) {
    return s.split(/\s+/).join('·');
  }
  return s.replace(/\s+/g, ' ');
}

function formatSchedule(raw: string | undefined): string | null {
  const s = String(raw ?? '').replace(/\D/g, '');
  if (s.length < 12) return null;
  return `${s.slice(8, 10)}:${s.slice(10, 12)}`;
}

function asArray<T>(items: T[] | T | undefined): T[] {
  if (!items) return [];
  return Array.isArray(items) ? items : [items];
}

function parseDepartureItems(json: {
  response?: {
    header?: { resultCode?: string; resultMsg?: string };
    body?: {
      items?: { item?: FlightItem | FlightItem[] } | FlightItem | FlightItem[];
      totalCount?: number;
    };
  };
}): { list: FlightItem[]; totalCount: number } {
  const code = json.response?.header?.resultCode;
  if (code !== '00') {
    throw new Error(json.response?.header?.resultMsg || 'flight_error');
  }

  const bodyItems = json.response?.body?.items;
  let list: FlightItem[] = [];
  if (bodyItems && typeof bodyItems === 'object' && 'item' in bodyItems) {
    list = asArray((bodyItems as { item?: FlightItem | FlightItem[] }).item);
  } else {
    list = asArray(bodyItems as FlightItem | FlightItem[] | undefined);
  }

  const totalCount = Number(json.response?.body?.totalCount ?? list.length);
  return { list, totalCount };
}

function isMasterFlight(item: FlightItem): boolean {
  return String(item.codeshare ?? '').toLowerCase() === 'master';
}

function scheduleSortKey(item: FlightItem): number {
  const raw = String(item.scheduleDateTime ?? item.estimatedDateTime ?? '').replace(/\D/g, '');
  if (raw.length >= 12) return Number(raw.slice(8, 12));
  if (raw.length >= 4) return Number(raw.slice(0, 4));
  return 9999;
}

/** codeshare 중복 제거, master 우선, 편명 prefix 필터, 출발시각순 */
export function buildFlightSearchResults(items: FlightItem[], query: string): FlightItem[] {
  const q = query.toUpperCase();
  const byId = new Map<string, FlightItem>();

  for (const item of items) {
    const id = String(item.flightId ?? '')
      .trim()
      .toUpperCase();
    if (!id) continue;
    // 2글자(IATA)·3글자 이상 모두 편명 prefix로 좁힘 (airline=KE 는 업스트림이 무시하는 경우 있음)
    if (q.length >= 2 && !id.startsWith(q)) continue;

    const prev = byId.get(id);
    if (!prev || (isMasterFlight(item) && !isMasterFlight(prev))) {
      byId.set(id, item);
    }
  }

  return [...byId.values()].sort((a, b) => scheduleSortKey(a) - scheduleSortKey(b));
}

function mapFlightSummary(item: FlightItem) {
  const term = mapTerminal(item.terminalid);
  return {
    flightId: String(item.flightId ?? '').toUpperCase(),
    airline: item.airline ?? null,
    destination: item.airport ?? null,
    destinationCode: item.airportCode ?? null,
    scheduleTime: formatSchedule(item.scheduleDateTime),
    estimatedTime: formatSchedule(item.estimatedDateTime),
    remark: item.remark ?? null,
    terminal: term.terminal,
    terminalLabel: term.terminalLabel,
    codeshare: item.codeshare ?? null,
    masterFlightId: item.masterflightid || null,
  };
}

function normalizeSearchQuery(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function searchModeForQuery(q: string): 'airline' | 'flight_id' | null {
  if (q.length < 2) return null;
  if (q.length === 2 && /^[A-Z]{2}$/.test(q)) return 'airline';
  return 'flight_id';
}

async function fetchDepartureList(
  key: string,
  date: string,
  opts: { airline?: string; flightId?: string }
): Promise<{ items: FlightItem[]; totalCount: number }> {
  const cacheKey = `${date}:${opts.airline ?? ''}:${opts.flightId ?? ''}`;
  const hit = listCache.get(cacheKey);
  if (hit && Date.now() - hit.at < 60_000) {
    return { items: hit.items, totalCount: hit.totalCount };
  }

  const u = new URL(DEPARTURE_URL);
  u.searchParams.set('serviceKey', key);
  u.searchParams.set('type', 'json');
  u.searchParams.set('pageNo', '1');
  u.searchParams.set('numOfRows', String(SEARCH_ROW_LIMIT));
  u.searchParams.set('searchday', date);
  u.searchParams.set('from_time', '0000');
  u.searchParams.set('to_time', '2400');
  u.searchParams.set('lang', 'K');
  if (opts.airline) u.searchParams.set('airline', opts.airline);
  if (opts.flightId) u.searchParams.set('flight_id', opts.flightId);

  const res = await fetch(u.toString());
  if (!res.ok) throw new Error(`upstream_${res.status}`);
  const json = (await res.json()) as Parameters<typeof parseDepartureItems>[0];
  const { list, totalCount } = parseDepartureItems(json);

  listCache.set(cacheKey, { at: Date.now(), items: list, totalCount });
  return { items: list, totalCount };
}

async function fetchDeparture(key: string, date: string, flightId: string): Promise<FlightItem | null> {
  const cacheKey = `${date}:${flightId}`;
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.at < 60_000) {
    return hit.miss ? null : hit.item;
  }

  const u = new URL(DEPARTURE_URL);
  u.searchParams.set('serviceKey', key);
  u.searchParams.set('type', 'json');
  u.searchParams.set('pageNo', '1');
  u.searchParams.set('numOfRows', '20');
  u.searchParams.set('searchday', date);
  u.searchParams.set('from_time', '0000');
  u.searchParams.set('to_time', '2400');
  u.searchParams.set('lang', 'K');
  u.searchParams.set('flight_id', flightId);

  const res = await fetch(u.toString());
  if (!res.ok) throw new Error(`upstream_${res.status}`);
  const json = (await res.json()) as Parameters<typeof parseDepartureItems>[0];
  const { list } = parseDepartureItems(json);

  const exact = list.filter((i) => String(i.flightId ?? '').toUpperCase() === flightId);
  const pool = exact.length > 0 ? exact : list;
  // Master 편 우선, 없으면 첫 결과
  const master = pool.find((i) => String(i.codeshare ?? '').toLowerCase() === 'master');
  const item = master ?? pool[0] ?? null;

  cache.set(cacheKey, { at: Date.now(), item, miss: !item });
  return item;
}

/**
 * GET /api/icn-flight?flightId=KE101&date=20260719
 */
export const getIcnFlight = onRequest(
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

    const key = serviceKey();
    if (!key) {
      res.status(500).json({ error: 'missing_service_key' });
      return;
    }

    try {
      const item = await fetchDeparture(key, date, flightId);
      if (!item) {
        res.status(404).json({
          error: 'not_found',
          flightId,
          date,
          message: '해당 날짜에 출발편이 없습니다. 편명·날짜를 확인해 주세요.',
        });
        return;
      }

      const term = mapTerminal(item.terminalid);
      const checkInCounter = formatCheckIn(item.chkinrange);

      res.set('Cache-Control', 'public, max-age=60');
      res.status(200).json({
        flightId: String(item.flightId ?? flightId),
        airline: item.airline ?? null,
        destination: item.airport ?? null,
        destinationCode: item.airportCode ?? null,
        date,
        scheduleTime: formatSchedule(item.scheduleDateTime),
        estimatedTime: formatSchedule(item.estimatedDateTime),
        remark: item.remark ?? null,
        terminal: term.terminal,
        terminalLabel: term.terminalLabel,
        terminalId: term.terminalId,
        checkInCounter,
        codeshare: item.codeshare ?? null,
        masterFlightId: item.masterflightid || null,
        source: 'data.go.kr / B551177/StatusOfPassengerFlightsDeOdp',
      });
    } catch (err) {
      logger.error('getIcnFlight failed', err);
      res.status(502).json({
        error: 'upstream_failed',
        message: '운항 정보를 불러오지 못했습니다. 공공 API 활용신청·키를 확인해 주세요.',
      });
    }
  }
);

/**
 * GET /api/icn-flight-search?q=KE&date=20260719
 * - 2글자 이상: 항상 flight_id prefix 검색 (KE → KE101…)
 * - mode=airline 은 2글자 IATA 입력임을 UI/로그용으로만 표기
 *   (업스트림 airline= 는 IATA를 무시하고 전체 출발 목록을 주는 경우가 있음)
 */
export const getIcnFlightSearch = onRequest(
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

    const query = normalizeSearchQuery(String(req.query.q ?? req.query.query ?? ''));
    const dateRaw = String(req.query.date ?? '').replace(/\D/g, '');
    const date = dateRaw.length === 8 ? dateRaw : seoulYmd();
    const mode = searchModeForQuery(query);

    if (!query || !mode) {
      res.status(400).json({
        error: 'invalid_query',
        message: '항공편명 또는 항공사 코드 2글자 이상 입력해 주세요.',
      });
      return;
    }

    const key = serviceKey();
    if (!key) {
      res.status(500).json({ error: 'missing_service_key' });
      return;
    }

    try {
      const upstream = await fetchDepartureList(key, date, { flightId: query });

      const flights = buildFlightSearchResults(upstream.items, query).map(mapFlightSummary);
      const truncated = upstream.totalCount > flights.length || upstream.items.length >= SEARCH_ROW_LIMIT;

      res.set('Cache-Control', 'public, max-age=60');
      res.status(200).json({
        date,
        query,
        mode,
        flights,
        truncated,
        source: 'data.go.kr / B551177/StatusOfPassengerFlightsDeOdp',
      });
    } catch (err) {
      logger.error('getIcnFlightSearch failed', err);
      res.status(502).json({
        error: 'upstream_failed',
        message: '운항 정보를 불러오지 못했습니다. 공공 API 활용신청·키를 확인해 주세요.',
      });
    }
  }
);
