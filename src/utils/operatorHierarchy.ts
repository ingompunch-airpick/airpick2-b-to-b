import type { Company, Reservation } from '../types';
import { isAirpickHeadquarters } from '../constants/platform';
import { filterReservationsForCompany, reservationBelongsToCompany } from './reservationScope';

function normId(id: string | undefined | null): string {
  return (id || '').trim().toLowerCase();
}

export function isSubOperatorCompany(company?: Partial<Company> | null): boolean {
  return !!normId(company?.parentCompanyId);
}

export function isOperatorPrimaryCompany(company?: Partial<Company> | null): boolean {
  return !!company?.isOperatorPrimary;
}

/** 대표 로그인 id → 본인 + parentCompanyId가 일치하는 하위 업체 id 목록 */
export function resolveOperatorCompanyIds(
  primaryId: string,
  companies: Company[]
): string[] {
  const primary = normId(primaryId);
  if (!primary || isAirpickHeadquarters(primary)) return [];

  const ids = new Set<string>();
  ids.add(primary);

  for (const c of companies) {
    if (!c?.id) continue;
    if (normId(c.parentCompanyId) === primary) {
      ids.add(normId(c.id));
    }
  }

  return Array.from(ids);
}

export function getSubOperatorCompanies(
  primaryId: string,
  companies: Company[]
): Company[] {
  const primary = normId(primaryId);
  return companies.filter((c) => c?.id && normId(c.parentCompanyId) === primary);
}

export function filterReservationsForOperatorGroup(
  reservations: Reservation[],
  companyIds: string[]
): Reservation[] {
  if (!companyIds.length) return reservations;
  if (companyIds.length === 1) {
    return filterReservationsForCompany(reservations, companyIds[0]);
  }
  return reservations.filter((r) =>
    companyIds.some((id) => reservationBelongsToCompany(r, id))
  );
}

/** B2B 로그인 차단 — 하위 업체 id 직접 로그인 불가 */
export function isSubOperatorLoginBlocked(
  companyId: string,
  companies: Company[]
): boolean {
  const id = normId(companyId);
  const company = companies.find((c) => normId(c.id) === id);
  return isSubOperatorCompany(company);
}

/** 헤더용 — 다중 업체일 때만 라벨 반환 */
export function formatOperatorGroupLabel(
  primaryId: string,
  companies: Company[]
): string | null {
  const ids = resolveOperatorCompanyIds(primaryId, companies);
  if (ids.length <= 1) return null;

  const names = ids.map((id) => {
    const c = companies.find((x) => normId(x.id) === id);
    return c?.name?.trim() || id;
  });

  return `통합 관리: ${names.join(' · ')}`;
}

/** 접수·마감 등 — 대표 + 하위 업체 선택 목록 */
export function getOperatorIntakeCompanyOptions(
  primaryId: string,
  companies: Company[]
): Array<{ id: string; name: string }> {
  const ids = resolveOperatorCompanyIds(primaryId, companies);
  if (ids.length <= 1) return [];

  return ids.map((id) => {
    const c = companies.find((x) => normId(x.id) === id);
    return { id, name: c?.name?.trim() || id };
  });
}

/** 대표 업체 후보 (하위 등록 시 선택) */
export function getPrimaryOperatorCandidates(companies: Company[]): Company[] {
  return companies.filter(
    (c) => c?.id && !isSubOperatorCompany(c) && (c.isOperatorPrimary || !c.parentCompanyId)
  );
}
