import { doc, setDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase';
import type { Company, PartnerCompany } from '../types';
import { ensureFirestoreAuth, ensurePlatformAdminAuth } from '../lib/firebaseAuth';

export const DEFAULT_SETTLEMENT_MEMO = '지급 기본 정산 기준 보류';

export function sanitizePartnerCompanyId(raw: string): string {
  return raw.trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
}

/** Firestore setDoc — undefined 필드는 거부되므로 제거 */
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
}

/** 신규 제휴업체 Firestore companies/{id} 기본 스키마 */
export function createPartnerCompanySkeleton(input: CreatePartnerCompanyInput): Company {
  return {
    id: input.companyId,
    name: input.name.trim(),
    phone: input.phone.trim(),
    representative: input.representative.trim(),
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
    terminals: ['T1', 'T2'],
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
  await ensurePlatformAdminAuth();
  await setDoc(
    doc(db, 'companies', company.id),
    omitUndefinedDeep({
      ...company,
      isOperatorPrimary: company.isOperatorPrimary ?? true,
      password: partner.password,
      settlementMemo: partner.settlementMemo,
      status: 'active',
      blockedDates: [],
      updatedAt: new Date().toISOString(),
    })
  );
}

export interface CreateSubOperatorInput {
  companyId: string;
  name: string;
  phone: string;
  representative: string;
  parentCompanyId: string;
}

/** 하위 업체 — B2C 전용, partners/비밀번호 없음 */
export function createSubOperatorSkeleton(input: CreateSubOperatorInput): Company {
  const base = createPartnerCompanySkeleton({
    companyId: input.companyId,
    name: input.name,
    phone: input.phone,
    representative: input.representative,
  });
  return {
    ...base,
    parentCompanyId: sanitizePartnerCompanyId(input.parentCompanyId),
    isOperatorPrimary: false,
  };
}

export async function writeSubOperatorToFirestore(company: Company): Promise<void> {
  // 주소·핀·거리·사진 포함 — 최고관리자(플랫폼) 계정으로만 기록
  await ensurePlatformAdminAuth();
  await setDoc(
    doc(db, 'companies', company.id),
    omitUndefinedDeep({
      ...company,
      parentCompanyId: company.parentCompanyId,
      isOperatorPrimary: false,
      status: 'active',
      blockedDates: company.blockedDates ?? [],
      updatedAt: new Date().toISOString(),
    })
  );
}

export async function deletePartnerFromFirestore(
  companyId: string,
  options?: { isSubOperator?: boolean }
): Promise<void> {
  if (options?.isSubOperator) {
    await ensureFirestoreAuth();
  } else {
    await ensurePlatformAdminAuth();
  }
  await deleteDoc(doc(db, 'companies', companyId));
}

export type StorageAdapter = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem?: (key: string) => void;
};

export function initPartnerLocalPartitions(companyId: string, storage: StorageAdapter): void {
  const reservationsKey = `${companyId}_reservations`;
  if (!storage.getItem(reservationsKey)) {
    storage.setItem(reservationsKey, JSON.stringify([]));
  }
}

export function removePartnerLocalPartitions(companyId: string, storage: StorageAdapter): void {
  storage.removeItem?.(`${companyId}_reservations`);
  storage.removeItem?.(`${companyId}_drivers`);
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
