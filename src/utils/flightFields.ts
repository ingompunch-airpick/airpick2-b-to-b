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

export const DEFAULT_AIRLINES = [
  '대한항공',
  '아시아나항공',
  '진에어',
  '제주항공',
  '티웨이항공',
  '에어부산',
] as const;

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
