/** airpick 플랫폼 본사(통합 관제). 로그인 ID는 `airpick`, 컨텍스트 companyId도 동일. */
export const AIRPICK_HQ_ID = 'airpick';

/** AI Studio가 본사로 잘못 쓰던 레거시 ID — 일반 업체와 동일, 본사 로직에 사용하지 않음 */
export const LEGACY_MISUSED_HQ_IDS = ['gayu', 'gayu_partner'] as const;

export function isAirpickHeadquarters(companyId?: string | null): boolean {
  return (companyId || '').trim().toLowerCase() === AIRPICK_HQ_ID;
}

export function isLegacyMisusedHqId(companyId?: string | null): boolean {
  const id = (companyId || '').trim().toLowerCase();
  return (LEGACY_MISUSED_HQ_IDS as readonly string[]).includes(id);
}

/** localStorage 등에 남은 gayu 본사 컨텍스트 → airpick */
export function normalizePlatformCompanyId(companyId?: string | null): string {
  const raw = (companyId || '').trim();
  if (!raw) return '';
  if (isLegacyMisusedHqId(raw)) return AIRPICK_HQ_ID;
  return raw;
}
