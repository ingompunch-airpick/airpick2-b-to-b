import { resolveBookingSource } from './bookingSource';
import {
  COMPANY_TAB_BY_ID,
  FALLBACK_TAB,
  homepageTabFromCompanyTab,
  TAB_AIRPICK_B2C,
} from './constants';

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
    if (rawName.includes('시즌')) return '시즌';
    if (rawName.includes('안녕')) return '안녕';
    return sanitizeSheetTabName(rawName.replace(/주차장|주차대행|발렛/g, '').trim());
  }

  if (id) return sanitizeSheetTabName(id);
  return FALLBACK_TAB;
}

/**
 * 탭 분리:
 * - 에어픽 B2C → 「에어픽」
 * - 업체 홈페이지 → 「와와홈」「가유홈」…
 * - 현장·B2B → 「와와」「가유」…
 */
export function resolveSheetTabName(data: Record<string, unknown>): string {
  const source = resolveBookingSource(
    typeof data.createdBy === 'string' ? data.createdBy : null,
    data
  );

  if (source === 'airpick-b2c') return TAB_AIRPICK_B2C;

  const companyTab = tabFromCompany(
    typeof data.companyId === 'string' ? data.companyId : undefined,
    typeof data.companyName === 'string' ? data.companyName : undefined
  );

  if (source === 'homepage') return homepageTabFromCompanyTab(companyTab);

  return companyTab;
}
