import type { Company, PartnerCompany } from '../types';
import {
  adminCreateCompany,
  adminDeleteCompany,
} from '../lib/adminCompanyApi';
import { DEFAULT_AIRPORT_ID } from '../constants/airports';
import { airportTerminalCodes, type AirportId } from '../utils/airport';

export const DEFAULT_SETTLEMENT_MEMO = '지급 기본 정산 기준 보류';

export function sanitizePartnerCompanyId(raw: string): string {
  return raw.trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
}

/** Firestore / Callable — undefined 필드는 거부되므로 제거 */
function omitUndefinedDeep<T>(value: T): T {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) {
    return value.map((item) => omitUndefinedDeep(item)) as T;
  }
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      if (nested === undefined) continue;
      out[key] = omitUndefinedDeep(nested);
    }
    return out as T;
  }
  return value;
}

export interface CreatePartnerCompanyInput {
  companyId: string;
  name: string;
  phone: string;
  representative: string;
  airport?: AirportId;
}

/** 신규 제휴업체 Firestore companies/{id} 기본 스키마 */
export function createPartnerCompanySkeleton(input: CreatePartnerCompanyInput): Company {
  const airport = input.airport || DEFAULT_AIRPORT_ID;
  return {
    id: input.companyId,
    name: input.name.trim(),
    phone: input.phone.trim(),
    representative: input.representative.trim(),
    airport,
    is_indoor: true,
    supports_indoor: true,
    supports_outdoor: true,
    base_price: 15000,
    extra_day_price: 5000,
    base_days: 1,
    rating: 4.8,
    reviews_count: 12,
    features: ['기본 자율 요금 설정 상태'],
    image_url:
      'https://images.unsplash.com/photo-1542282088-fe8426682b8f?auto=format&fit=crop&q=80',
    terminals: airportTerminalCodes(airport),
    isOpen: true,
    outdoorBasePrice: 15000,
    outdoorBaseDays: 1,
    outdoorExtraPrice: 5000,
    indoorBasePrice: 30000,
    indoorBaseDays: 1,
    indoorExtraPrice: 10000,
    surchargeStartTime: '20:00',
    surchargeEndTime: '05:00',
    surchargePrice: 10000,
    t2Surcharge: 0,
    peakStartTime: '',
    peakEndTime: '',
    peakSurcharge: 0,
  };
}

export interface RegisterPartnerInput {
  companyId: string;
  password: string;
  name: string;
  representative: string;
  phone: string;
  settlementMemo?: string;
}

export function buildPartnerRecord(input: RegisterPartnerInput): PartnerCompany {
  return {
    companyId: input.companyId,
    password: input.password,
    name: input.name.trim(),
    representative: input.representative.trim(),
    phone: input.phone.trim(),
    settlementMemo: input.settlementMemo?.trim() || DEFAULT_SETTLEMENT_MEMO,
    status: 'active',
  };
}

export async function writeNewPartnerToFirestore(
  company: Company,
  partner: PartnerCompany
): Promise<void> {
  await adminCreateCompany({
    companyId: company.id,
    document: omitUndefinedDeep({
      ...company,
      isOperatorPrimary: company.isOperatorPrimary ?? true,
      password: partner.password,
      settlementMemo: partner.settlementMemo,
      status: 'active',
      blockedDates: [],
    }),
  });
}

export interface CreateSubOperatorInput {
  companyId: string;
  name: string;
  phone: string;
  representative: string;
  parentCompanyId: string;
  airport?: AirportId;
}

/** 하위 업체 — B2C 전용, partners/비밀번호 없음 */
export function createSubOperatorSkeleton(input: CreateSubOperatorInput): Company {
  const base = createPartnerCompanySkeleton({
    companyId: input.companyId,
    name: input.name,
    phone: input.phone,
    representative: input.representative,
    airport: input.airport || DEFAULT_AIRPORT_ID,
  });
  return {
    ...base,
    parentCompanyId: sanitizePartnerCompanyId(input.parentCompanyId),
    isOperatorPrimary: false,
  };
}

export async function writeSubOperatorToFirestore(company: Company): Promise<void> {
  await adminCreateCompany({
    companyId: company.id,
    document: omitUndefinedDeep({
      ...company,
      parentCompanyId: company.parentCompanyId,
      isOperatorPrimary: false,
      status: 'active',
      blockedDates: company.blockedDates ?? [],
    }),
  });
}

export async function deletePartnerFromFirestore(
  companyId: string,
  _options?: { isSubOperator?: boolean }
): Promise<void> {
  // 대표·하위 모두 본사 Callable (익명 삭제 경로 제거)
  await adminDeleteCompany({ companyId });
}

export type StorageAdapter = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem?: (key: string) => void;
};

export function initPartnerLocalPartitions(_companyId: string, _storage: StorageAdapter): void {
  // 예약 로컬 파티션은 더 이상 사용하지 않음 (Firestore 단일 소스)
}

export function removePartnerLocalPartitions(companyId: string, storage: StorageAdapter): void {
  storage.removeItem?.(`${companyId}_reservations`);
  storage.removeItem?.(`${companyId}_drivers`);
  storage.removeItem?.('firestore_reservations_cache');
}

export function mergeCompanyIntoList(companies: Company[], company: Company): Company[] {
  return [...companies.filter((c) => c.id !== company.id), company];
}

export function appendPartnerToList(
  partners: PartnerCompany[],
  partner: PartnerCompany
): PartnerCompany[] {
  if (partners.some((p) => p.companyId === partner.companyId)) {
    return partners;
  }
  return [...partners, partner];
}
