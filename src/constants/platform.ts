/** airpick 플랫폼 본사(통합 관제). 로그인 ID는 `airpick`, 컨텍스트 companyId도 동일. */
export const AIRPICK_HQ_ID = 'airpick';

export function isAirpickHeadquarters(companyId?: string | null): boolean {
  return (companyId || '').trim().toLowerCase() === AIRPICK_HQ_ID;
}

/** companyId 문자열 정규화 (공백 제거). gayu 등 제휴업체 ID는 그대로 유지. */
export function normalizePlatformCompanyId(companyId?: string | null): string {
  return (companyId || '').trim();
}
