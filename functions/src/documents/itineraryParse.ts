/**
 * 항공권·여행사 일정표 읽기 — AI 응답을 검사하고 인천 출국편·귀국편을 고른다.
 * AI 가 구간(leg)을 전부 적어 주면, 어떤 편이 출국·귀국인지는 여기서 코드로 정한다.
 */

export type ItineraryLeg = {
  airlineCode: string;
  airlineName: string;
  flightNumber: string;
  fromAirport: string;
  toAirport: string;
  departDate: string;
  departTime: string;
  arriveDate: string;
  arriveTime: string;
  departTerminal: 'T1' | 'T2' | null;
  arriveTerminal: 'T1' | 'T2' | null;
};

export type PickedFlight = {
  airlineCode: string;
  airlineName: string;
  flightNumber: string;
  /** 출국편: 인천 출발 날짜·시간 / 귀국편: 인천 도착 날짜·시간 (모두 한국 시간) */
  date: string;
  time: string;
  /** 일정표에 적힌 인천 터미널. 없으면 null (화면에서 항공사로 추정) */
  terminal: 'T1' | 'T2' | null;
  /** 출국편 도착지 / 귀국편 출발지 (공항 코드) */
  otherAirport: string;
};

export type ItineraryPick = {
  outbound: PickedFlight | null;
  inbound: PickedFlight | null;
  warnings: string[];
};

const FLIGHT_RE = /^[A-Z0-9]{2}\d{1,4}[A-Z]?$/;
const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;
const ICN = 'ICN';

function clean(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

function normalizeYmd(v: unknown): string {
  const s = clean(v);
  const m = s.match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})$/);
  if (!m) return '';
  const out = `${m[1]}-${m[2]!.padStart(2, '0')}-${m[3]!.padStart(2, '0')}`;
  const d = new Date(`${out}T00:00:00Z`);
  return YMD_RE.test(out) && !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === out ? out : '';
}

function normalizeHm(v: unknown): string {
  const m = clean(v).match(/^(\d{1,2}):?(\d{2})$/);
  if (!m) return '';
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return '';
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

function normalizeTerminal(v: unknown): 'T1' | 'T2' | null {
  const s = clean(v).toUpperCase();
  if (/^(T?1|제?1(여객)?터미널|TERMINAL ?1)$/.test(s)) return 'T1';
  if (/^(T?2|제?2(여객)?터미널|TERMINAL ?2)$/.test(s)) return 'T2';
  return null;
}

/** 「KE 0701」「ke701」 → KE701 */
export function normalizeFlightNumber(raw: unknown, airlineCode = ''): string {
  let s = clean(raw).toUpperCase().replace(/[\s-]/g, '');
  if (/^\d{1,4}[A-Z]?$/.test(s) && /^[A-Z0-9]{2}$/.test(airlineCode)) s = `${airlineCode}${s}`;
  const m = s.match(/^([A-Z0-9]{2})0*(\d{1,4}[A-Z]?)$/);
  if (m) s = `${m[1]}${m[2]}`;
  return FLIGHT_RE.test(s) ? s : '';
}

/** AI 응답(JSON 문자열) → 검사한 구간 목록. 형식이 틀린 구간은 버린다. */
export function parseItineraryResponse(text: string): { isItinerary: boolean; legs: ItineraryLeg[] } {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { isItinerary: false, legs: [] };
  }
  const obj = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const list = Array.isArray(obj.legs) ? obj.legs : [];
  const legs: ItineraryLeg[] = [];
  for (const item of list.slice(0, 12)) {
    const r = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>;
    const airlineCode = clean(r.airlineCode).toUpperCase();
    const flightNumber = normalizeFlightNumber(r.flightNumber, airlineCode);
    const fromAirport = clean(r.fromAirport).toUpperCase();
    const toAirport = clean(r.toAirport).toUpperCase();
    const departDate = normalizeYmd(r.departDate);
    const departTime = normalizeHm(r.departTime);
    const arriveDate = normalizeYmd(r.arriveDate) || departDate;
    const arriveTime = normalizeHm(r.arriveTime);
    if (!flightNumber || !/^[A-Z]{3}$/.test(fromAirport) || !/^[A-Z]{3}$/.test(toAirport)) continue;
    if (!departDate || !departTime) continue;
    legs.push({
      airlineCode: /^[A-Z0-9]{2}$/.test(airlineCode) ? airlineCode : flightNumber.slice(0, 2),
      airlineName: clean(r.airlineName).slice(0, 40),
      flightNumber,
      fromAirport,
      toAirport,
      departDate,
      departTime,
      arriveDate,
      arriveTime,
      departTerminal: normalizeTerminal(r.departTerminal),
      arriveTerminal: normalizeTerminal(r.arriveTerminal),
    });
  }
  return { isItinerary: obj.isItinerary === true || legs.length > 0, legs };
}

/**
 * 출국편 = 인천에서 출발하는 첫 구간
 * 귀국편 = 그 뒤 인천에 도착하는 마지막 구간 (경유면 마지막 편)
 */
export function pickTrip(legs: ItineraryLeg[], todayYmd: string): ItineraryPick {
  const warnings: string[] = [];
  const sorted = [...legs].sort((a, b) =>
    `${a.departDate} ${a.departTime}`.localeCompare(`${b.departDate} ${b.departTime}`)
  );

  const out = sorted.find((l) => l.fromAirport === ICN);
  const outKey = out ? `${out.departDate} ${out.departTime}` : '';
  const inbound = [...sorted]
    .reverse()
    .find(
      (l) =>
        l.toAirport === ICN &&
        !!l.arriveTime &&
        (!out || `${l.arriveDate} ${l.arriveTime}` > outKey)
    );

  if (!out) {
    warnings.push(
      sorted.some((l) => l.fromAirport === 'GMP')
        ? '김포공항 출발 일정이에요. 에어픽은 인천공항 주차대행만 예약할 수 있어요.'
        : '인천공항에서 출발하는 항공편을 찾지 못했어요.'
    );
  } else if (out.departDate < todayYmd) {
    warnings.push('출국 날짜가 이미 지났어요. 일정표 날짜를 확인해 주세요.');
  }
  if (!inbound) {
    warnings.push('인천공항으로 돌아오는 항공편을 찾지 못했어요. 귀국편은 직접 넣어 주세요.');
  } else if (inbound.fromAirport !== out?.toAirport && out) {
    // 경유·다구간 — 안내만
    warnings.push(`귀국편은 인천에 도착하는 ${inbound.flightNumber}편으로 넣었어요. 경유편이면 맞는지 확인해 주세요.`);
  }

  return {
    outbound: out
      ? {
          airlineCode: out.airlineCode,
          airlineName: out.airlineName,
          flightNumber: out.flightNumber,
          date: out.departDate,
          time: out.departTime,
          terminal: out.departTerminal,
          otherAirport: out.toAirport,
        }
      : null,
    inbound: inbound
      ? {
          airlineCode: inbound.airlineCode,
          airlineName: inbound.airlineName,
          flightNumber: inbound.flightNumber,
          date: inbound.arriveDate,
          time: inbound.arriveTime,
          terminal: inbound.arriveTerminal,
          otherAirport: inbound.fromAirport,
        }
      : null,
    warnings,
  };
}
