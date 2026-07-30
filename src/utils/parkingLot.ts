import type { Company, CompanyParkingLot, Reservation } from '../types';
import { listCompanyParkingLots } from './companyProfile';
import { isNotYetAdmitted } from './reservationStatus';

/**
 * 현장·배차표용 주차장 표기.
 * parkingLotId → lot 이름 우선. 구역(B-12)만 있으면 lot명 · 구역.
 */
export function formatParkingLotLabel(
  res: {
    parkingLotId?: string | null;
    parkingSpace?: string | null;
    isIndoor?: boolean | null;
  },
  lots: CompanyParkingLot[] = []
): string {
  const lot = findParkingLot(lots, res.parkingLotId);
  const space = String(res.parkingSpace || '').trim();
  const zone = space && !isGenericParkingSpaceLabel(space) ? space : '';

  if (lot?.name) {
    if (zone && zone !== lot.name) return `${lot.name} · ${zone}`;
    return lot.name;
  }

  if (zone) return zone;
  if (res.isIndoor === false) return '실외';
  if (res.isIndoor === true) return '실내';
  return '미배정';
}

/** 구역명에서 요금/시설 타입 추정 (실내* → indoor) */
export function inferLotFacilityType(
  lotLabel: string
): 'indoor' | 'outdoor' | null {
  const s = lotLabel.trim();
  if (!s || s === '미배정') return null;
  if (/^실외|야외|outdoor/i.test(s)) return 'outdoor';
  if (/^실내|indoor/i.test(s)) return 'indoor';
  return null;
}

export function isGenericParkingSpaceLabel(space: string): boolean {
  const s = space.trim();
  return /^(실내|실외|야외)\s*주차장?$/i.test(s) || s === '미지정';
}

export function findParkingLot(
  lots: CompanyParkingLot[],
  lotId?: string | null
): CompanyParkingLot | undefined {
  const id = String(lotId || '').trim();
  if (!id) return undefined;
  return lots.find((l) => l.id === id);
}

export function lotsForIndoorPreference(
  lots: CompanyParkingLot[],
  isIndoor: boolean
): CompanyParkingLot[] {
  const wanted: 'indoor' | 'outdoor' = isIndoor ? 'indoor' : 'outdoor';
  const matched = lots.filter((l) => l.type === wanted);
  return matched.length > 0 ? matched : lots;
}

/** 해당 등급 lot이 1곳이면 그 id, 아니면 이미 고른 값 유지 */
export function defaultParkingLotId(
  lots: CompanyParkingLot[],
  isIndoor: boolean,
  currentId?: string | null
): string {
  const current = String(currentId || '').trim();
  const pool = lotsForIndoorPreference(lots, isIndoor);
  if (current && pool.some((l) => l.id === current)) return current;
  if (pool.length === 1) return pool[0].id;
  return current;
}

/**
 * 카드 뱃지 라벨.
 * 입고 전: 실내/야외. 입고 후: lot 이름(없으면 실내/야외 fallback).
 */
export function parkingFacilityBadgeLabel(
  res: Pick<Reservation, 'status' | 'isIndoor' | 'parkingLotId' | 'parkingSpace'>,
  lots: CompanyParkingLot[] = []
): { text: string; isIndoor: boolean } {
  const isIndoor = res.isIndoor !== false;
  const admitted = !isNotYetAdmitted(res.status);

  if (admitted) {
    const lot = findParkingLot(lots, res.parkingLotId);
    if (lot?.name) {
      return { text: lot.name, isIndoor: lot.type !== 'outdoor' };
    }
  }

  return { text: isIndoor ? '실내' : '야외', isIndoor };
}

export function resolveCompanyLotsForReservation(
  companies: Company[] | undefined,
  companyId: string | undefined
): CompanyParkingLot[] {
  if (!companies?.length || !companyId) return [];
  const id = companyId.trim().toLowerCase();
  const company = companies.find((c) => c.id.trim().toLowerCase() === id);
  return listCompanyParkingLots(company);
}

/** 입고 완료 시 Firestore에 넣을 주차장 필드 */
export function buildParkingAssignmentFields(input: {
  parkingLotId: string;
  parkingSpace?: string;
  lots: CompanyParkingLot[];
  fallbackIsIndoor: boolean;
}): {
  parkingLotId: string;
  parkingSpace: string;
  isIndoor: boolean;
} {
  const lot = findParkingLot(input.lots, input.parkingLotId);
  const zone = String(input.parkingSpace || '').trim();
  const space =
    zone && !isGenericParkingSpaceLabel(zone)
      ? zone
      : lot?.name || (input.fallbackIsIndoor ? '실내' : '실외');

  return {
    parkingLotId: String(input.parkingLotId || '').trim(),
    parkingSpace: space,
    isIndoor: lot ? lot.type !== 'outdoor' : input.fallbackIsIndoor,
  };
}
