import type { Company, PartnerCompany } from '../types';
import { isAirpickHeadquarters } from '../constants/platform';

const LEGACY_DEFAULT_PASSWORD = '1234';

function normalizePassword(value?: string | null): string {
  return (value || '').trim();
}

/** Firestore password는 비어 있거나 레거시 기본값이면 로컬 비밀번호 유지 */
export function resolvePartnerPassword(
  firestorePassword?: string | null,
  localPassword?: string | null
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
    status: raw.status || 'active',
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

  const fromFirestore = firestoreCompanies
    .filter((c) => c?.id && !isAirpickHeadquarters(c.id))
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

  return Array.from(mergedMap.values());
}

export function readPartnersFromStorage(
  getItem: (key: string) => string | null
): PartnerCompany[] {
  try {
    const saved = getItem('super_partners_list');
    if (!saved) return [];
    const parsed = JSON.parse(saved);
    return Array.isArray(parsed) ? parsed : [];
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
