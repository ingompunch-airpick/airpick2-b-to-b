import type { Company, ParkingDistanceEntry, ParkingDistances } from '../types';

export type AirportTerminal = 'T1' | 'T2';

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

export interface ParkingDistancesFormInput {
  T1: TerminalParkingDistanceForm;
  T2: TerminalParkingDistanceForm;
}

export const EMPTY_PARKING_DISTANCES_FORM: ParkingDistancesFormInput = {
  T1: { ...EMPTY_TERMINAL_PARKING_FORM },
  T2: { ...EMPTY_TERMINAL_PARKING_FORM },
};

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
  company?: Partial<Company>
): ParkingDistancesFormInput {
  const pd = company?.parkingDistances;
  return {
    T1: readTerminalForm(pd?.T1),
    T2: readTerminalForm(pd?.T2),
  };
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

/** 폼 → Firestore parkingDistances. T1/T2 중 distanceKm 없는 터미널은 제외 */
export function buildParkingDistancesFromForm(
  input: ParkingDistancesFormInput
): ParkingDistances {
  const now = new Date().toISOString();
  const result: ParkingDistances = {};

  const t1 = parseTerminalEntry(input.T1, 'T1', now);
  const t2 = parseTerminalEntry(input.T2, 'T2', now);
  if (t1) result.T1 = t1;
  if (t2) result.T2 = t2;

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
