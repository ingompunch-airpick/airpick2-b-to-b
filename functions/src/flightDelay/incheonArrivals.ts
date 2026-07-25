import { normalizeFlightId } from './flightId';

export type IncheonArrival = {
  flightId: string;
  normalizedFlightId: string;
  masterFlightId: string;
  scheduleHhmm: string;
  estimatedHhmm: string;
  remark: string;
  airline: string;
  terminalId: string;
};

type ApiItem = Record<string, unknown>;

function asString(v: unknown): string {
  if (v == null) return '';
  return String(v).trim();
}

function unwrapItems(payload: unknown): ApiItem[] {
  if (!payload || typeof payload !== 'object') return [];
  const root = payload as Record<string, unknown>;
  const response = (root.response as Record<string, unknown> | undefined) || root;
  const body = (response.body as Record<string, unknown> | undefined) || response;
  const items = body.items as Record<string, unknown> | ApiItem[] | undefined;

  if (Array.isArray(items)) return items.filter(Boolean) as ApiItem[];
  if (items && typeof items === 'object') {
    const item = (items as Record<string, unknown>).item;
    if (Array.isArray(item)) return item.filter(Boolean) as ApiItem[];
    if (item && typeof item === 'object') return [item as ApiItem];
  }
  return [];
}

function parseArrival(raw: ApiItem): IncheonArrival | null {
  const flightId = asString(raw.flightId || raw.flight_id);
  if (!flightId) return null;
  const scheduleHhmm = asString(raw.scheduleDateTime).replace(/\D/g, '').slice(-4);
  const estimatedRaw = asString(raw.estimatedDateTime).replace(/\D/g, '');
  const estimatedHhmm = estimatedRaw.slice(-4) || scheduleHhmm;
  const masterFlightId = asString(raw.masterflightid || raw.masterFlightId);

  return {
    flightId,
    normalizedFlightId: normalizeFlightId(flightId),
    masterFlightId,
    scheduleHhmm,
    estimatedHhmm,
    remark: asString(raw.remark),
    airline: asString(raw.airline),
    terminalId: asString(raw.terminalId || raw.terminalid),
  };
}

function buildServiceUrl(serviceKey: string, params: Record<string, string>): string {
  const base =
    'https://apis.data.go.kr/B551177/StatusOfPassengerFlightsOdp/getPassengerArrivalsOdp';
  const qs = new URLSearchParams({ type: 'json', lang: 'K', ...params });
  // 공공데이터 키는 이미 URL-인코딩된 경우가 많음 → 이중 인코딩 방지
  if (/%[0-9A-Fa-f]{2}/.test(serviceKey)) {
    return `${base}?serviceKey=${serviceKey}&${qs.toString()}`;
  }
  qs.set('serviceKey', serviceKey);
  return `${base}?${qs.toString()}`;
}

/**
 * 인천공항 당일 도착편 현황 (다국어 API).
 * from/to 미지정 시 0000–2400 전체.
 */
export async function fetchIncheonArrivals(params: {
  serviceKey: string;
  fromTime?: string;
  toTime?: string;
  flightId?: string;
}): Promise<IncheonArrival[]> {
  const { serviceKey, fromTime = '0000', toTime = '2400', flightId } = params;
  if (!serviceKey.trim()) throw new Error('DATA_GO_KR_SERVICE_KEY missing');

  const query: Record<string, string> = {
    from_time: fromTime,
    to_time: toTime,
  };
  if (flightId) query.flight_id = flightId;

  const url = buildServiceUrl(serviceKey.trim(), query);
  const res = await fetch(url, { method: 'GET' });
  if (!res.ok) {
    throw new Error(`Incheon arrivals HTTP ${res.status}`);
  }

  const json = (await res.json()) as Record<string, unknown>;
  const header =
    ((json.response as Record<string, unknown> | undefined)?.header as
      | Record<string, unknown>
      | undefined) || (json.header as Record<string, unknown> | undefined);
  const resultCode = asString(header?.resultCode);
  if (resultCode && resultCode !== '00') {
    throw new Error(
      `Incheon arrivals API ${resultCode}: ${asString(header?.resultMsg) || 'unknown'}`
    );
  }

  return unwrapItems(json)
    .map(parseArrival)
    .filter((x): x is IncheonArrival => Boolean(x));
}

/** 편명(및 마스터 편명)으로 매칭 */
export function findArrivalForFlight(
  arrivals: IncheonArrival[],
  rawFlightId: string
): IncheonArrival | null {
  const key = normalizeFlightId(rawFlightId);
  if (!key) return null;
  const exact =
    arrivals.find((a) => a.normalizedFlightId === key) ||
    arrivals.find((a) => normalizeFlightId(a.masterFlightId) === key);
  return exact || null;
}
