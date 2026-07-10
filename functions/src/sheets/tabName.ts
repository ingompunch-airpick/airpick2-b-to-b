import { resolveBookingSource } from './bookingSource';
import { COMPANY_TAB_BY_ID, FALLBACK_TAB, TAB_AIRPICK_B2C } from './constants';

const INVALID_TAB_CHARS = /[\\/?*[\]]/g;

export function sanitizeSheetTabName(name: string): string {
  return name.replace(INVALID_TAB_CHARS, ' ').trim().slice(0, 100) || FALLBACK_TAB;
}

function tabFromCompany(companyId?: string, companyName?: string): string {
  const id = (companyId || '').trim().toLowerCase();
  if (id && COMPANY_TAB_BY_ID[id]) return COMPANY_TAB_BY_ID[id];

  const rawName = (companyName || '').trim();
  if (rawName) {
    if (rawName.includes('와와')) return '와와';
    if (rawName.includes('가유')) return '가유';
    return sanitizeSheetTabName(rawName.replace(/주차장/g, '').trim());
  }

  if (id) return sanitizeSheetTabName(id);
  return FALLBACK_TAB;
}

/** 에어픽(B2C) → 「에어픽」 탭, 그 외 → 업체별 탭(와와·가유·…) */
export function resolveSheetTabName(data: Record<string, unknown>): string {
  const source = resolveBookingSource(
    typeof data.createdBy === 'string' ? data.createdBy : null,
    data
  );

  if (source === 'airpick-b2c') return TAB_AIRPICK_B2C;

  return tabFromCompany(
    typeof data.companyId === 'string' ? data.companyId : undefined,
    typeof data.companyName === 'string' ? data.companyName : undefined
  );
}
