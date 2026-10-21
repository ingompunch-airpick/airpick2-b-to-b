/** 홈페이지·레거시 Firestore 필드 → B2B 표준 항공·여행 필드 */

function pickString(source: Record<string, unknown> | undefined, keys: string[]): string {
  if (!source) return '';
  for (const key of keys) {
    const v = source[key];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return '';
}

/** 홈페이지 "대한항공 (Korean Air)" → select 호환 "대한항공" */
export function normalizeAirlineName(value: string): string {
  const v = value.trim();
  const paren = v.indexOf(' (');
  if (paren > 0) return v.slice(0, paren).trim();
  return v;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

/** B2C 예약과 같은 인천 취항 목록. 홈 예약·접수 셀렉트가 같이 쓴다. */
export const AIRLINE_GROUPS: { label: string; names: readonly string[] }[] = [
  {
    label: '국내 항공사',
    names: [
      '대한항공',
      '아시아나항공',
      '진에어',
      '제주항공',
      '티웨이항공',
      '에어부산',
      '에어서울',
      '이스타항공',
      '에어프레미아',
    ],
  },
  {
    label: '국제선',
    names: [
      '베트남항공',
      '싱가포르항공',
      '일본항공',
      '전일본항공',
      '중국국제항공',
      '중국동방항공',
      '중국남방항공',
      '태국항공',
      '캐세이퍼시픽',
      '홍콩항공',
      '에바항공',
      '중화항공',
      '필리핀항공',
      '세부퍼시픽',
      '말레이시아항공',
      '가루다인도네시아',
      '카타르항공',
      '에미레이트항공',
      '에티하드항공',
      '터키항공',
      '델타항공',
      '유나이티드항공',
      '아메리칸항공',
      '에어캐나다',
      '에어프랑스',
      '루프트한자',
      '영국항공',
    ],
  },
];

export const DEFAULT_AIRLINES = AIRLINE_GROUPS.flatMap((group) => group.names);

/** 공항 조회 항공사명을 목록 이름에 맞춘다. 없으면 조회값을 그대로 둔다. */
export function matchAirlineName(raw: string): string {
  const cleaned = normalizeAirlineName(raw).replace(/\s+/g, '');
  if (!cleaned) return '';
  const exact = DEFAULT_AIRLINES.find((name) => name.replace(/\s+/g, '') === cleaned);
  return exact || normalizeAirlineName(raw);
}

/** 셀렉트에서 「기타」 선택 시 내부 값 */
export const OTHER_AIRLINE_VALUE = '__other__';

export function isListedAirline(
  name: string,
  airlines: readonly string[] = DEFAULT_AIRLINES
): boolean {
  const v = name.trim();
  return Boolean(v) && (airlines as readonly string[]).includes(v);
}

/** select 목록에 없는 홈페이지 값도 표시 */
export function airlineSelectOptions(
  currentValue: string,
  airlines: readonly string[] = DEFAULT_AIRLINES
): string[] {
  const v = currentValue.trim();
  if (!v || airlines.includes(v)) return [...airlines];
  return [v, ...airlines];
}

export function resolveFlightFields(raw: Record<string, unknown>): {
  departureAirline?: string;
  departureFlight?: string;
  arrivalAirline?: string;
  arrivalFlight?: string;
  destination?: string;
  reservationPassword?: string;
  customerNotes?: string;
  userRequest?: string;
} {
  const flight = asRecord(raw.flight) ?? asRecord(raw.flightInfo) ?? asRecord(raw.travelInfo);
  const dep = asRecord(flight?.departure) ?? asRecord(flight?.dep) ?? asRecord(raw.departure);
  const arr = asRecord(flight?.arrival) ?? asRecord(flight?.arr) ?? asRecord(raw.arrival);

  const departureAirlineRaw =
    pickString(raw, [
      'departureAirline',
      'depAirline',
      'dep_airline',
      'outboundAirline',
      'outAirline',
      'airlineDeparture',
      'departure_airline',
      'entryAirline',
      'entry_airline',
    ]) || pickString(dep, ['airline', 'airlineName', 'carrier', 'name']);
  const departureAirline = departureAirlineRaw
    ? normalizeAirlineName(departureAirlineRaw)
    : '';

  const departureFlight =
    pickString(raw, [
      'departureFlight',
      'depFlight',
      'dep_flight',
      'outboundFlight',
      'outFlight',
      'flightDeparture',
      'departure_flight',
      'depFlightNo',
      'flightNo',
      'flightNumber',
      'entryFlight',
      'entry_flight',
    ]) || pickString(dep, ['flight', 'flightNo', 'flightNumber', 'number', 'code']);

  const arrivalAirlineRaw =
    pickString(raw, [
      'arrivalAirline',
      'arrAirline',
      'arr_airline',
      'inboundAirline',
      'inAirline',
      'airlineArrival',
      'arrival_airline',
      'exitAirline',
      'exit_airline',
    ]) || pickString(arr, ['airline', 'airlineName', 'carrier', 'name']);
  const arrivalAirline = arrivalAirlineRaw ? normalizeAirlineName(arrivalAirlineRaw) : '';

  const arrivalFlight =
    pickString(raw, [
      'arrivalFlight',
      'arrFlight',
      'arr_flight',
      'inboundFlight',
      'inFlight',
      'flightArrival',
      'arrival_flight',
      'arrFlightNo',
      'inboundFlightNo',
      'exitFlight',
      'exit_flight',
    ]) || pickString(arr, ['flight', 'flightNo', 'flightNumber', 'number', 'code']);

  const destination =
    pickString(raw, ['destination', 'travelDestination', 'dest', 'travel_to', 'travelPlace']) ||
    pickString(flight, ['destination', 'dest']);

  const reservationPassword = pickString(raw, [
    'reservationPassword',
    'bookingPassword',
    'cancelPassword',
    'password',
  ]);

  const customerNotes =
    pickString(raw, ['customerNotes', 'customer_notes', 'memo', 'request', 'notes']) ||
    pickString(raw, ['userRequest', 'user_request']);

  const userRequest = pickString(raw, ['userRequest', 'user_request']) || customerNotes;

  const out: ReturnType<typeof resolveFlightFields> = {};
  if (departureAirline) out.departureAirline = departureAirline;
  if (departureFlight) out.departureFlight = departureFlight.toUpperCase();
  if (arrivalAirline) out.arrivalAirline = arrivalAirline;
  if (arrivalFlight) out.arrivalFlight = arrivalFlight.toUpperCase();
  if (destination) out.destination = destination;
  if (reservationPassword) out.reservationPassword = reservationPassword;
  if (customerNotes) out.customerNotes = customerNotes;
  if (userRequest) out.userRequest = userRequest;

  return out;
}
