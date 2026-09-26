import { resolveBookingSource } from './bookingSource';
import {
  COMPANY_TAB_BY_ID,
  FALLBACK_TAB,
  TAB_AIRPICK_B2C,
} from './constants';

const INVALID_TAB_CHARS = /[\\/?*[\]]/g;

const WAWA_COMPANY_IDS = new Set(['wawa', 'wawa_valet', '와와', '와와발렛']);

function isWawaCompanyIdentity(data: Record<string, unknown>): boolean {
  const id = String(data.companyId || '')
    .trim()
    .toLowerCase();
  const name = String(data.companyName || '').trim();
  if (WAWA_COMPANY_IDS.has(id) || WAWA_COMPANY_IDS.has(name.toLowerCase())) return true;
  return name.includes('와와');
}

/** 와와 현장·홈페이지. 에어픽(B2C) 원본은 에어픽 장부에만 둔다. */
export function isWawaSheetCompany(data: Record<string, unknown>): boolean {
  const source = resolveBookingSource(
    typeof data.createdBy === 'string' ? data.createdBy : null,
    data
  );
  if (source === 'airpick-b2c') return false;
  return isWawaCompanyIdentity(data);
}

/** 에어픽으로 들어왔지만 담당이 와와인 예약. 와와 장부에 한 번 더 복사한다. */
export function shouldCopyAirpickRowToWawa(data: Record<string, unknown>): boolean {
  const source = resolveBookingSource(
    typeof data.createdBy === 'string' ? data.createdBy : null,
    data
  );
  return source === 'airpick-b2c' && isWawaCompanyIdentity(data);
}

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
 * - 그 외(현장·B2B·업체 홈페이지) → 「와와」「가유」… (홈페이지도 같은 업체 탭)
 * 유입 구분은 시트 「유입」 열(홈페이지 / 현장·B2B)로만 본다.
 */
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
