/**
 * 인천공항 실시간 참고 정보 (출국장 혼잡·주차장 여유).
 * 출국시간 계산식에는 반영하지 않음 — UI 참고 전용.
 * 키: Secret Manager DATA_GO_KR_SERVICE_KEY
 *
 * 공공데이터포털에서 아래 API 각각 활용신청 필요(항공편 조회와 별도):
 * - 주차: StatusOfParking/getTrackingParking
 * - 출국장 혼잡: statusOfDepartureCongestion/getDepartureCongestion
 */
import { defineSecret } from 'firebase-functions/params';
import { onRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';

const dataGoKrKey = defineSecret('DATA_GO_KR_SERVICE_KEY');

const PARKING_URL =
  'https://apis.data.go.kr/B551177/StatusOfParking/getTrackingParking';
/** swagger host: apis.data.go.kr/B551177/statusOfDepartureCongestion */
const DEPARTURE_CONGESTION_URL =
  'https://apis.data.go.kr/B551177/statusOfDepartureCongestion/getDepartureCongestion';

type CongestionHall = {
  gate: string;
  side: string | null;
  passengers: number;
  waitMinutes: number | null;
  level: '여유' | '보통' | '혼잡' | '매우혼잡';
};

type ParkingLotLive = {
  name: string;
  occupied: number;
  total: number;
  available: number | null;
  operating: boolean;
};

function serviceKey(): string {
  try {
    const v = dataGoKrKey.value()?.trim();
    if (v) return v;
  } catch {
    /* unset */
  }
  return String(process.env.DATA_GO_KR_SERVICE_KEY ?? '').trim();
}

function asList<T>(raw: unknown): T[] {
  if (raw == null) return [];
  return Array.isArray(raw) ? (raw as T[]) : [raw as T];
}

function unpackItems(json: unknown): Record<string, unknown>[] {
  const root = json as {
    response?: { body?: { items?: { item?: unknown } | unknown[] } };
    body?: { items?: { item?: unknown } | unknown[] };
    items?: { item?: unknown } | unknown[];
  };
  const items =
    root?.response?.body?.items ?? root?.body?.items ?? root?.items ?? null;
  if (items == null) return [];
  if (Array.isArray(items)) return items as Record<string, unknown>[];
  if (typeof items === 'object' && items !== null && 'item' in items) {
    return asList<Record<string, unknown>>((items as { item: unknown }).item);
  }
  return [];
}

function responseMeta(json: unknown): { resultCode: string | null; resultMsg: string | null } {
  const header = (json as { response?: { header?: { resultCode?: string; resultMsg?: string } } })
    ?.response?.header;
  return {
    resultCode: header?.resultCode != null ? String(header.resultCode) : null,
    resultMsg: header?.resultMsg != null ? String(header.resultMsg) : null,
  };
}

function congestionLevel(passengers: number): CongestionHall['level'] {
  if (passengers <= 30) return '여유';
  if (passengers <= 80) return '보통';
  if (passengers <= 150) return '혼잡';
  return '매우혼잡';
}

/** DG3_E → gate 3 / 동편 */
function parseGateId(gateId: string): { gate: string; side: string | null } {
  const s = gateId.trim().toUpperCase();
  const m = s.match(/^DG(\d+)[_-]?(E|W)?$/i);
  if (m) {
    return {
      gate: m[1],
      side: m[2] === 'E' ? '동편' : m[2] === 'W' ? '서편' : null,
    };
  }
  return { gate: gateId || '—', side: null };
}

async function fetchJson(url: string, params: Record<string, string>): Promise<unknown> {
  const u = new URL(url);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  const res = await fetch(u.toString(), {
    headers: { Accept: 'application/json' },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`upstream_${res.status}:${text.slice(0, 120)}`);
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error(`invalid_json:${text.slice(0, 80)}`);
  }
}

async function fetchParking(key: string): Promise<{
  lots: ParkingLotLive[];
  asOf: string | null;
}> {
  const json = await fetchJson(PARKING_URL, {
    serviceKey: key,
    numOfRows: '30',
    pageNo: '1',
    type: 'json',
  });
  const { resultCode, resultMsg } = responseMeta(json);
  if (resultCode && resultCode !== '00') {
    throw new Error(`parking_api_${resultCode}:${resultMsg ?? ''}`);
  }
  const items = unpackItems(json);
  let asOf: string | null = null;
  const lots: ParkingLotLive[] = items.map((it) => {
    const name = String(it.floor ?? it.parkingAirportCodeName ?? '').trim() || '주차장';
    const occupied = Number(it.parking ?? 0);
    const total = Number(it.parkingarea ?? 0);
    const datetm = String(it.datetm ?? '').trim();
    if (datetm && !asOf) asOf = datetm;
    const operating = total > 0;
    const available =
      operating && Number.isFinite(occupied) ? Math.max(0, total - occupied) : null;
    return {
      name,
      occupied: Number.isFinite(occupied) ? occupied : 0,
      total: Number.isFinite(total) ? total : 0,
      available,
      operating,
    };
  });
  return { lots, asOf };
}

async function fetchCongestion(
  key: string,
  terminal: 'T1' | 'T2'
): Promise<{ halls: CongestionHall[]; asOf: string | null; available: boolean }> {
  const terminalId = terminal === 'T2' ? 'P03' : 'P01';
  try {
    const json = await fetchJson(DEPARTURE_CONGESTION_URL, {
      serviceKey: key,
      pageNo: '1',
      numOfRows: '20',
      terminalId,
      type: 'json',
    });
    const { resultCode, resultMsg } = responseMeta(json);
    if (resultCode && resultCode !== '00') {
      logger.warn('departure congestion api error', { resultCode, resultMsg });
      return { halls: [], asOf: null, available: false };
    }
    const items = unpackItems(json);
    if (items.length === 0) return { halls: [], asOf: null, available: false };

    let asOf: string | null = null;
    const halls: CongestionHall[] = items.map((it) => {
      const gateId = String(it.gateId ?? it.gateid ?? '').trim();
      const { gate, side } = parseGateId(gateId);
      const passengers = Math.max(0, Math.floor(Number(it.waitLength ?? it.waitlength ?? 0) || 0));
      const waitRaw = Number(it.waitTime ?? it.waittime);
      const waitMinutes = Number.isFinite(waitRaw) ? Math.max(0, Math.floor(waitRaw)) : null;
      const occur = String(it.occurtime ?? it.datetm ?? '').trim();
      if (occur && !asOf) asOf = occur;
      return {
        gate,
        side,
        passengers,
        waitMinutes,
        level: congestionLevel(passengers),
      };
    });
    return { halls, asOf, available: true };
  } catch (err) {
    logger.warn('departure congestion unavailable', err);
    return { halls: [], asOf: null, available: false };
  }
}

function summarizeParking(lots: ParkingLotLive[], terminal: 'T1' | 'T2') {
  const prefix = terminal === 'T2' ? 'T2' : 'T1';
  const relevant = lots.filter((l) => l.name.includes(prefix) || l.name.includes(terminal));
  const list = relevant.length > 0 ? relevant : lots;
  const longLots = list.filter((l) => /장기|타워|P\d/i.test(l.name) && !/단기/i.test(l.name));
  const shortLots = list.filter((l) => /단기/i.test(l.name));
  const sumAvail = (arr: ParkingLotLive[]) =>
    arr.reduce((a, l) => a + (l.available ?? 0), 0);
  return {
    available: lots.length > 0,
    longAvailable: sumAvail(longLots),
    shortAvailable: sumAvail(shortLots),
    lots: list.slice(0, 8),
  };
}

function pickBusiest(halls: CongestionHall[]): CongestionHall | null {
  if (halls.length === 0) return null;
  return [...halls].sort((a, b) => b.passengers - a.passengers)[0] ?? null;
}

/**
 * GET /api/icn-airport-live?terminal=T1
 */
export const getIcnAirportLive = onRequest(
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

    const terminalRaw = String(req.query.terminal ?? 'T1').toUpperCase();
    const terminal: 'T1' | 'T2' = terminalRaw === 'T2' ? 'T2' : 'T1';

    const key = serviceKey();
    if (!key) {
      res.status(500).json({ error: 'missing_service_key' });
      return;
    }

    try {
      const [parking, congestion] = await Promise.all([
        fetchParking(key).catch((err) => {
          logger.warn('parking live failed', err);
          return { lots: [] as ParkingLotLive[], asOf: null as string | null };
        }),
        fetchCongestion(key, terminal),
      ]);

      const parkingSummary = summarizeParking(parking.lots, terminal);
      const busiest = pickBusiest(congestion.halls);

      res.set('Cache-Control', 'public, max-age=60');
      res.status(200).json({
        terminal,
        referenceOnly: true,
        disclaimer:
          '실시간 참고 정보이며 출국시간 계산에는 반영하지 않습니다. 출발 당일 상황이 달라질 수 있습니다.',
        congestion: {
          available: congestion.available,
          asOf: congestion.asOf,
          halls: congestion.halls,
          busiest,
          note:
            terminal === 'T2' && !congestion.available
              ? 'T2 출국장 혼잡도는 공공데이터에서 아직 제한적으로 제공됩니다.'
              : null,
        },
        parking: {
          available: parkingSummary.available,
          asOf: parking.asOf,
          longAvailable: parkingSummary.longAvailable,
          shortAvailable: parkingSummary.shortAvailable,
          lots: parkingSummary.lots,
        },
        source:
          'data.go.kr / B551177 StatusOfParking · statusOfDepartureCongestion',
      });
    } catch (err) {
      logger.error('getIcnAirportLive failed', err);
      res.status(502).json({
        error: 'upstream_failed',
        message: '공항 실시간 정보를 불러오지 못했습니다.',
      });
    }
  }
);
