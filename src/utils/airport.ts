import {
  AIRPORTS,
  DEFAULT_AIRPORT_ID,
  ENABLED_AIRPORTS,
  type AirportConfig,
  type AirportId,
  type AirportTerminalDef,
} from '../constants/airports';
import type { Company } from '../types';

export type { AirportId, AirportConfig, AirportTerminalDef };

export function isAirportId(value: unknown): value is AirportId {
  return value === 'ICN' || value === 'GMP';
}

/** 미설정·잘못된 값 → ICN (기존 데이터 호환) */
export function normalizeAirportId(value?: string | null): AirportId {
  const raw = String(value || '')
    .trim()
    .toUpperCase();
  if (raw === 'GMP') return 'GMP';
  if (raw === 'ICN') return 'ICN';
  return DEFAULT_AIRPORT_ID;
}

export function getAirport(airportId?: string | null): AirportConfig {
  return AIRPORTS[normalizeAirportId(airportId)];
}

export function resolveCompanyAirportId(
  company?: Partial<Company> | null
): AirportId {
  return normalizeAirportId(company?.airport);
}

export function getEnabledAirports(): AirportConfig[] {
  return ENABLED_AIRPORTS;
}

export function getAirportTerminals(airportId?: string | null): AirportTerminalDef[] {
  return getAirport(airportId).terminals;
}

export function getDefaultTerminal(airportId?: string | null): string {
  return getAirport(airportId).defaultTerminal;
}

export function getTerminalDef(
  airportId: string | null | undefined,
  code: string | null | undefined
): AirportTerminalDef | undefined {
  const airport = getAirport(airportId);
  const c = String(code || '').trim().toUpperCase();
  return (
    airport.terminals.find((t) => t.code.toUpperCase() === c) ||
    airport.terminals.find((t) => t.code === code) ||
    undefined
  );
}

/** 알 수 없으면 defaultTerminal */
export function normalizeTerminalCode(
  airportId: string | null | undefined,
  code: string | null | undefined
): string {
  const airport = getAirport(airportId);
  const raw = String(code || '').trim();
  if (!raw) return airport.defaultTerminal;
  const hit = getTerminalDef(airportId, raw);
  return hit?.code || airport.defaultTerminal;
}

export function terminalLabel(
  airportId: string | null | undefined,
  code: string | null | undefined
): string {
  return getTerminalDef(airportId, code)?.label || String(code || '') || getDefaultTerminal(airportId);
}

export function terminalShortLabel(
  airportId: string | null | undefined,
  code: string | null | undefined
): string {
  return (
    getTerminalDef(airportId, code)?.shortLabel ||
    String(code || '') ||
    getDefaultTerminal(airportId)
  );
}

export function terminalBadgeLabel(
  airportId: string | null | undefined,
  code: string | null | undefined
): string {
  return (
    getTerminalDef(airportId, code)?.badgeLabel ||
    terminalShortLabel(airportId, code)
  );
}

/** 기존 isT2 — 출국/귀국 중 할증 대상 터미널이 있으면 true */
export function needsTerminalSurcharge(
  airportId: string | null | undefined,
  departureTerminal?: string | null,
  arrivalTerminal?: string | null
): boolean {
  const codes = new Set(
    getAirport(airportId).surchargeTerminalCodes.map((c) => c.toUpperCase())
  );
  const dep = String(departureTerminal || '').trim().toUpperCase();
  const arr = String(arrivalTerminal || '').trim().toUpperCase();
  return codes.has(dep) || codes.has(arr);
}

/** 터미널 코드 목록 (거리 키 등) */
export function airportTerminalCodes(airportId?: string | null): string[] {
  return getAirport(airportId).terminals.map((t) => t.code);
}

export function airportRegionLabel(airportId?: string | null): string {
  return getAirport(airportId).regionLabel;
}

export function airportShortName(airportId?: string | null): string {
  return getAirport(airportId).shortName;
}
