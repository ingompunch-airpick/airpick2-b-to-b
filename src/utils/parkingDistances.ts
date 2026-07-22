import type { Company, ParkingDistanceEntry, ParkingDistances } from '../types';
import { airportTerminalCodes, normalizeAirportId } from './airport';

export type AirportTerminal = string;

/** 폼 입력용 — 숫자 필드는 문자열로 관리 */
export interface TerminalParkingDistanceForm {
  distanceKm: string;
  driveMinutes: string;
  parkingLotName: string;
  parkingLotAddress: string;
  effectiveFrom: string;
}

export const EMPTY_TERMINAL_PARKING_FORM: TerminalParkingDistanceForm = {
  distanceKm: '',
  driveMinutes: '',
  parkingLotName: '',
  parkingLotAddress: '',
  effectiveFrom: '',
};

/** 터미널 코드 → 폼 (ICN: T1/T2, GMP: DOM/INT …) */
export type ParkingDistancesFormInput = Record<string, TerminalParkingDistanceForm>;

export function emptyParkingDistancesForm(
  terminalCodes: string[]
): ParkingDistancesFormInput {
  const out: ParkingDistancesFormInput = {};
  for (const code of terminalCodes) {
    out[code] = { ...EMPTY_TERMINAL_PARKING_FORM };
  }
  return out;
}

function resolveTerminalCodes(
  airportOrCodes?: string | string[] | null,
  company?: Partial<Company>
): string[] {
  if (Array.isArray(airportOrCodes) && airportOrCodes.length > 0) {
    return airportOrCodes;
  }
  if (typeof airportOrCodes === 'string' && airportOrCodes.trim()) {
    return airportTerminalCodes(airportOrCodes);
  }
  if (company?.airport) {
    return airportTerminalCodes(company.airport);
  }
  if (company?.terminals && company.terminals.length > 0) {
    return company.terminals;
  }
  return airportTerminalCodes(normalizeAirportId(null));
}

export function EMPTY_PARKING_DISTANCES_FORM_FOR(
  airportId?: string | null
): ParkingDistancesFormInput {
  return emptyParkingDistancesForm(airportTerminalCodes(airportId));
}

/** @deprecated ICN 기본 — 새 코드는 emptyParkingDistancesForm / EMPTY_PARKING_DISTANCES_FORM_FOR 사용 */
export const EMPTY_PARKING_DISTANCES_FORM: ParkingDistancesFormInput =
  emptyParkingDistancesForm(['T1', 'T2']);

function readTerminalForm(entry?: ParkingDistanceEntry): TerminalParkingDistanceForm {
  if (!entry) return { ...EMPTY_TERMINAL_PARKING_FORM };
  return {
    distanceKm: entry.distanceKm != null ? String(entry.distanceKm) : '',
    driveMinutes: entry.driveMinutes != null ? String(entry.driveMinutes) : '',
    parkingLotName: entry.parkingLotName || '',
    parkingLotAddress: entry.parkingLotAddress || '',
    effectiveFrom: entry.effectiveFrom || '',
  };
}

export function readParkingDistancesFormFromCompany(
  company?: Partial<Company>,
  terminalCodes?: string[]
): ParkingDistancesFormInput {
  const codes = resolveTerminalCodes(terminalCodes, company);
  const pd = company?.parkingDistances;
  const out: ParkingDistancesFormInput = {};
  for (const code of codes) {
    out[code] = readTerminalForm(pd?.[code]);
  }
  return out;
}

function parseOptionalNonNegativeInt(raw: string, label: string): number | undefined {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  const n = Number(trimmed);
  if (Number.isNaN(n) || n < 0 || !Number.isInteger(n)) {
    throw new Error(`${label}은(는) 0 이상의 정수여야 합니다.`);
  }
  return n;
}

function parseOptionalNonNegativeFloat(raw: string, label: string): number | undefined {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  const n = Number(trimmed);
  if (Number.isNaN(n) || n < 0) {
    throw new Error(`${label}은(는) 0 이상의 숫자여야 합니다.`);
  }
  return n;
}

function parseTerminalEntry(
  form: TerminalParkingDistanceForm,
  terminal: AirportTerminal,
  now: string
): ParkingDistanceEntry | null {
  const kmRaw = form.distanceKm.trim();
  if (!kmRaw) return null;

  const distanceKm = parseOptionalNonNegativeFloat(kmRaw, `${terminal} 거리(km)`);
  if (distanceKm === undefined) return null;

  const entry: ParkingDistanceEntry = {
    distanceKm,
    updatedAt: now,
  };

  const driveMinutes = parseOptionalNonNegativeInt(form.driveMinutes, `${terminal} 이동 시간(분)`);
  if (driveMinutes !== undefined) entry.driveMinutes = driveMinutes;

  const name = form.parkingLotName.trim();
  if (name) entry.parkingLotName = name;

  const address = form.parkingLotAddress.trim();
  if (address) entry.parkingLotAddress = address;

  return entry;
}

/** 폼 → Firestore parkingDistances. distanceKm 없는 터미널은 제외 */
export function buildParkingDistancesFromForm(
  input: ParkingDistancesFormInput
): ParkingDistances {
  const now = new Date().toISOString();
  const result: ParkingDistances = {};

  for (const [code, form] of Object.entries(input || {})) {
    if (!form) continue;
    const entry = parseTerminalEntry(form, code, now);
    if (entry) result[code] = entry;
  }

  return result;
}

export function validateParkingDistancesForm(input: ParkingDistancesFormInput): string | null {
  try {
    buildParkingDistancesFromForm(input);
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : '터미널 거리 입력값을 확인해 주세요.';
  }
}

/** B2C 거리순 정렬용 — 터미널 기준 km (없으면 undefined) */
export function getParkingDistanceKm(
  company: Partial<Company> | undefined,
  terminal: AirportTerminal
): number | undefined {
  const entry = company?.parkingDistances?.[terminal];
  if (!entry || entry.distanceKm == null) return undefined;
  const km = Number(entry.distanceKm);
  return Number.isNaN(km) ? undefined : km;
}

export function parkingDistancesForFirestore(
  input: ParkingDistancesFormInput
): Record<string, unknown> {
  return { parkingDistances: buildParkingDistancesFromForm(input) };
}

export type ParkingLotKind = 'indoor' | 'outdoor';

export interface LotParkingDistancesFormInput {
  indoor: ParkingDistancesFormInput;
  outdoor: ParkingDistancesFormInput;
}

export function emptyLotParkingDistancesForm(
  terminalCodes: string[]
): LotParkingDistancesFormInput {
  return {
    indoor: emptyParkingDistancesForm(terminalCodes),
    outdoor: emptyParkingDistancesForm(terminalCodes),
  };
}

export function EMPTY_LOT_PARKING_DISTANCES_FORM_FOR(
  airportId?: string | null
): LotParkingDistancesFormInput {
  return emptyLotParkingDistancesForm(airportTerminalCodes(airportId));
}

/** @deprecated ICN 기본 */
export const EMPTY_LOT_PARKING_DISTANCES_FORM: LotParkingDistancesFormInput =
  emptyLotParkingDistancesForm(['T1', 'T2']);

/** 업체 문서 → 실내/야외 폼. 롯별 필드 없으면 레거시 parkingDistances로 양쪽 시드 */
export function readLotParkingDistancesFormFromCompany(
  company?: Partial<Company>
): LotParkingDistancesFormInput {
  const codes = resolveTerminalCodes(undefined, company);
  const legacy = company?.parkingDistances;
  const indoorSrc = company?.parkingDistancesIndoor ?? legacy;
  const outdoorSrc = company?.parkingDistancesOutdoor ?? legacy;
  const readSide = (src?: ParkingDistances): ParkingDistancesFormInput => {
    const out: ParkingDistancesFormInput = {};
    for (const code of codes) {
      out[code] = readTerminalForm(src?.[code]);
    }
    return out;
  };
  return {
    indoor: readSide(indoorSrc),
    outdoor: readSide(outdoorSrc),
  };
}

export function buildLotParkingDistancesPayload(input: LotParkingDistancesFormInput): {
  parkingDistancesIndoor: ParkingDistances | null;
  parkingDistancesOutdoor: ParkingDistances | null;
  parkingDistances: ParkingDistances | null;
} {
  const indoor = buildParkingDistancesFromForm(input.indoor);
  const outdoor = buildParkingDistancesFromForm(input.outdoor);
  const indoorOrNull = Object.keys(indoor).length > 0 ? indoor : null;
  const outdoorOrNull = Object.keys(outdoor).length > 0 ? outdoor : null;
  // 하위 호환: 대표 = 실내 우선, 없으면 야외 (B2C 구버전 폴백)
  const primary = indoorOrNull ?? outdoorOrNull;
  return {
    parkingDistancesIndoor: indoorOrNull,
    parkingDistancesOutdoor: outdoorOrNull,
    parkingDistances: primary,
  };
}

export function validateLotParkingDistancesForm(input: LotParkingDistancesFormInput): string | null {
  const a = validateParkingDistancesForm(input.indoor);
  if (a) return `실내: ${a}`;
  const b = validateParkingDistancesForm(input.outdoor);
  if (b) return `야외: ${b}`;
  return null;
}
