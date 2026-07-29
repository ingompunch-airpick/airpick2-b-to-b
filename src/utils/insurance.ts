/** B2C `src/utils/insurance.ts`와 동일 상품명 규칙 */

export const CANONICAL_INSURANCE_PRODUCT_NAME = '배상책임보험';

const INSURANCE_PRODUCT_ALIASES: Record<string, string> = {
  발렛보험: CANONICAL_INSURANCE_PRODUCT_NAME,
  '발렛 보험': CANONICAL_INSURANCE_PRODUCT_NAME,
  ValetInsurance: CANONICAL_INSURANCE_PRODUCT_NAME,
  'Valet Insurance': CANONICAL_INSURANCE_PRODUCT_NAME,
};

export function normalizeInsuranceProductName(name?: string): string | undefined {
  if (!name?.trim()) return undefined;

  const trimmed = name.trim();
  const aliased =
    INSURANCE_PRODUCT_ALIASES[trimmed] ?? INSURANCE_PRODUCT_ALIASES[trimmed.replace(/\s+/g, '')];
  if (aliased) return aliased;

  if (/발렛\s*보험/i.test(trimmed)) return CANONICAL_INSURANCE_PRODUCT_NAME;

  return trimmed;
}

export function resolveInsuranceProductNameForStorage(name?: string, enrolled = true): string | undefined {
  const normalized = normalizeInsuranceProductName(name?.trim());
  if (normalized) return normalized;
  return enrolled ? CANONICAL_INSURANCE_PRODUCT_NAME : undefined;
}

export function shouldMigrateInsuranceProductName(name?: string): boolean {
  if (!name?.trim()) return false;
  const normalized = normalizeInsuranceProductName(name);
  return normalized !== name.trim();
}
