import type { Company } from '../types';

export function hqListOrderValue(company: Company | undefined, fallback = Number.MAX_SAFE_INTEGER): number {
  const n = Number(company?.hqListOrder);
  return Number.isFinite(n) ? n : fallback;
}

/** 본사 업체 선택·가맹 목록 — hqListOrder 오름차순, 없으면 맨 뒤·id */
export function sortCompaniesByHqListOrder(companies: Company[]): Company[] {
  return [...companies].sort((a, b) => {
    const oa = hqListOrderValue(a);
    const ob = hqListOrderValue(b);
    if (oa !== ob) return oa - ob;
    return String(a.id || '').localeCompare(String(b.id || ''));
  });
}

export function sortByCompanyHqListOrder<T>(
  items: T[],
  companies: Company[],
  getCompanyId: (item: T) => string
): T[] {
  const byId = new Map(companies.map((company) => [company.id, company]));
  return [...items].sort((a, b) => {
    const idA = getCompanyId(a);
    const idB = getCompanyId(b);
    const oa = hqListOrderValue(byId.get(idA));
    const ob = hqListOrderValue(byId.get(idB));
    if (oa !== ob) return oa - ob;
    return idA.localeCompare(idB);
  });
}
