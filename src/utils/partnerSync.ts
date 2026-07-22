import type { Company, Employee, PartnerCompany } from '../types';
import { isAirpickHeadquarters } from '../constants/platform';
import { isSubOperatorCompany } from './operatorHierarchy';

export const PARTNERS_STORAGE_KEY = 'super_partners_list';

const LEGACY_DEFAULT_PASSWORD = '1234';

/** 브라우저 캐시에 비밀번호를 남기지 않음 (로그인·직원 비번은 secrets/Callable) */
export function sanitizePartnersForStorage(partners: PartnerCompany[]): PartnerCompany[] {
  return partners.map((p) => ({
    ...p,
    password: '',
    employees: (p.employees || []).map(
      (e): Employee => ({
        id: e.id,
        name: e.name,
        loginId: e.loginId,
        role: e.role || 'driver',
      })
    ),
  }));
}

export function writePartnersToStorage(
  partners: PartnerCompany[],
  setItem: (key: string, value: string) => void = (k, v) => localStorage.setItem(k, v)
): void {
  setItem(PARTNERS_STORAGE_KEY, JSON.stringify(sanitizePartnersForStorage(partners)));
}

function normalizePassword(value?: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value.trim();
  // 숫자·객체 등 레거시/깨진 값 방어
  if (typeof value === 'number' || typeof value === 'boolean') return String(value).trim();
  return '';
}

/** Firestore password는 비어 있거나 레거시 기본값이면 로컬 비밀번호 유지 */
export function resolvePartnerPassword(
  firestorePassword?: unknown,
  localPassword?: unknown
): string {
  const fromFs = normalizePassword(firestorePassword);
  const fromLocal = normalizePassword(localPassword);

  if (fromFs && fromFs !== LEGACY_DEFAULT_PASSWORD) {
    return fromFs;
  }
  if (fromLocal) {
    return fromLocal;
  }
  if (fromFs) {
    return fromFs;
  }
  return '';
}

export function companyDocToPartner(company: Company): PartnerCompany {
  const raw = company as Company & {
    password?: string;
    settlementMemo?: string;
    status?: string;
    employees?: PartnerCompany['employees'];
  };

  return {
    companyId: company.id,
    password: normalizePassword(raw.password),
    name: company.name,
    representative: company.representative || '',
    phone: company.phone || '',
    settlementMemo: raw.settlementMemo || '지급 기본 정산 기준 보류',
    status: raw.status === 'suspended' ? 'suspended' : 'active',
    employees: raw.employees || [],
  };
}

/**
 * Firestore companies → super_partners_list 병합.
 * 로컬·메모리에 있는 password / employees 를 Firestore 스냅샷이 덮어쓰지 않도록 함.
 */
export function mergePartnersFromFirestore(
  firestoreCompanies: Company[],
  ...lowerPrioritySources: PartnerCompany[][]
): PartnerCompany[] {
  const mergedMap = new Map<string, PartnerCompany>();

  const applySource = (list: PartnerCompany[]) => {
    for (const p of list) {
      if (p?.companyId) {
        mergedMap.set(p.companyId, p);
      }
    }
  };

  for (const source of lowerPrioritySources) {
    applySource(source);
  }

  const subOperatorIds = new Set(
    firestoreCompanies.filter((c) => isSubOperatorCompany(c)).map((c) => c.id)
  );

  const fromFirestore = firestoreCompanies
    .filter(
      (c) => c?.id && !isAirpickHeadquarters(c.id) && !isSubOperatorCompany(c)
    )
    .map(companyDocToPartner);

  for (const fromDb of fromFirestore) {
    const existing = mergedMap.get(fromDb.companyId);
    mergedMap.set(fromDb.companyId, {
      ...fromDb,
      password: resolvePartnerPassword(fromDb.password, existing?.password),
      name: fromDb.name || existing?.name || fromDb.companyId,
      phone: fromDb.phone || existing?.phone || '',
      representative: fromDb.representative || existing?.representative || '',
      settlementMemo: fromDb.settlementMemo || existing?.settlementMemo || '',
      status: fromDb.status || existing?.status || 'active',
      employees:
        existing?.employees && existing.employees.length > 0
          ? existing.employees
          : fromDb.employees || [],
    });
  }

  return Array.from(mergedMap.values()).filter((p) => !subOperatorIds.has(p.companyId));
}

export function readPartnersFromStorage(
  getItem: (key: string) => string | null
): PartnerCompany[] {
  try {
    const saved = getItem('super_partners_list');
    if (!saved) return [];
    const parsed = JSON.parse(saved);
    if (!Array.isArray(parsed)) return [];
    // 레거시 캐시에 password가 객체로 남은 경우 방어
    return parsed
      .filter((p): p is PartnerCompany => !!p && typeof p === 'object' && !!(p as PartnerCompany).companyId)
      .map((p) => ({
        ...p,
        companyId: String(p.companyId || ''),
        password: normalizePassword(p.password),
        name: typeof p.name === 'string' ? p.name : String(p.name || p.companyId || ''),
        phone: typeof p.phone === 'string' ? p.phone : String(p.phone || ''),
        representative:
          typeof p.representative === 'string'
            ? p.representative
            : String(p.representative || ''),
        settlementMemo:
          typeof p.settlementMemo === 'string' ? p.settlementMemo : String(p.settlementMemo || ''),
        status: p.status === 'suspended' ? 'suspended' : 'active',
        employees: Array.isArray(p.employees) ? p.employees : [],
      }));
  } catch {
    return [];
  }
}

/** companies/{id}.blockedDates 단일 소스 — 로컬 캐시 fallback */
export function resolveBlockedDatesForCompany(
  companyId: string,
  companies: Company[],
  getItem: (key: string) => string | null
): string[] {
  const id = (companyId || '').trim();
  if (!id) return [];

  const matched = companies.find((c) => c.id === id);
  if (matched && Array.isArray(matched.blockedDates)) {
    return matched.blockedDates;
  }

  try {
    const local = getItem(`${id}_blockedDates`);
    if (local) {
      const parsed = JSON.parse(local);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (_) {}

  return [];
}
