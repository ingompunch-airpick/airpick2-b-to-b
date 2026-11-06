/** B2C `src/utils/insurance.ts`와 동일 — 업체가 적은 상품명은 그대로 저장 */

export const CANONICAL_INSURANCE_PRODUCT_NAME = '배상책임보험';

export function normalizeInsuranceProductName(name?: string): string | undefined {
  const trimmed = name?.trim();
  return trimmed || undefined;
}

export function resolveInsuranceProductNameForStorage(name?: string, enrolled = true): string | undefined {
  const normalized = normalizeInsuranceProductName(name);
  if (normalized) return normalized;
  return enrolled ? CANONICAL_INSURANCE_PRODUCT_NAME : undefined;
}

export function shouldMigrateInsuranceProductName(name?: string): boolean {
  if (!name?.trim()) return false;
  const normalized = normalizeInsuranceProductName(name);
  return normalized !== name.trim();
}
