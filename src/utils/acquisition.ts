/**
 * 영업 유입(명함 QR 등) — createdBy(채널)와 분리된 acquisition* 필드.
 * createdBy 는 homepage / airpick-b2c / b2b 를 유지한다.
 */

export const ACQUISITION_COLLECTION = 'acquisitionClicks';

/** 알려진 source — 그 외 문자열도 허용(확장) */
export const ACQUISITION_SOURCES = [
  'business_card',
  'car_sticker',
  'flyer',
  'banner',
  'naver_place',
  'blog',
  'instagram',
  'kakao',
  'other',
] as const;

export type AcquisitionSource = (typeof ACQUISITION_SOURCES)[number] | string;

export const ACQUISITION_SOURCE_LABELS: Record<string, string> = {
  business_card: '명함',
  car_sticker: '차량 스티커',
  flyer: '전단지',
  banner: '현수막',
  naver_place: '네이버 플레이스',
  blog: '블로그',
  instagram: '인스타',
  kakao: '카카오톡',
  other: '기타',
};

export type AcquisitionAttribution = {
  acquisitionSource: string;
  acquisitionMedium: string;
  acquisitionCampaign: string;
  acquisitionClickId: string;
};

export type AcquisitionClickDoc = {
  companyId: string;
  source: string;
  medium: string;
  campaign: string;
  clickedAt: string;
  visitorKey?: string;
  landedAt?: string | null;
  convertedReservationId?: string | null;
  convertedAt?: string | null;
  userAgent?: string;
};

const SOURCE_RE = /^[a-z0-9_]{1,40}$/;
const MEDIUM_RE = /^[a-z0-9_]{1,24}$/;
const CAMPAIGN_RE = /^[a-z0-9_][a-z0-9_-]{0,79}$/i;
const COMPANY_RE = /^[a-z0-9][a-z0-9_-]{0,62}$/i;
const CLICK_ID_RE = /^acq_[a-z0-9]{8,40}$/i;

export function normalizeAcquisitionCompanyId(raw: string): string | null {
  const id = String(raw || '')
    .trim()
    .toLowerCase();
  if (!id || !COMPANY_RE.test(id)) return null;
  return id;
}

export function normalizeAcquisitionSource(raw?: string | null): string {
  const s = String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_');
  if (s && SOURCE_RE.test(s)) return s;
  return 'business_card';
}

export function normalizeAcquisitionMedium(raw?: string | null): string {
  const s = String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_');
  if (s && MEDIUM_RE.test(s)) return s;
  return 'qr';
}

export function defaultAcquisitionCampaign(
  companyId: string,
  source: string,
  year = new Date().getFullYear()
): string {
  const id = normalizeAcquisitionCompanyId(companyId) || 'vendor';
  const src = normalizeAcquisitionSource(source);
  return `${id}_${year}_${src}`;
}

export function normalizeAcquisitionCampaign(
  raw: string | null | undefined,
  companyId: string,
  source: string
): string {
  const s = String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '_');
  if (s && CAMPAIGN_RE.test(s)) return s.slice(0, 80);
  return defaultAcquisitionCampaign(companyId, source);
}

export function createAcquisitionClickId(): string {
  const rand =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().replace(/-/g, '').slice(0, 16)
      : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  return `acq_${rand}`;
}

export function isValidAcquisitionClickId(id: string): boolean {
  return CLICK_ID_RE.test(String(id || '').trim());
}

/** 명함·전단지 QR용 — 예약 페이지(/h/)에 src 쿼리. 일반 /h/ 와 구분 */
export function buildAcquisitionBookingPath(
  companyId: string,
  opts?: { source?: string; medium?: string; campaign?: string }
): string {
  const id = normalizeAcquisitionCompanyId(companyId);
  if (!id) return '';
  const source = normalizeAcquisitionSource(opts?.source);
  const medium = normalizeAcquisitionMedium(opts?.medium);
  const campaign = normalizeAcquisitionCampaign(opts?.campaign, id, source);
  const q = new URLSearchParams();
  q.set('src', source);
  if (medium !== 'qr') q.set('med', medium);
  if (campaign !== defaultAcquisitionCampaign(id, source)) q.set('cmp', campaign);
  return `/h/${encodeURIComponent(id)}?${q.toString()}`;
}

export function buildAcquisitionBookingUrl(
  companyId: string,
  opts?: { source?: string; medium?: string; campaign?: string; origin?: string }
): string {
  const path = buildAcquisitionBookingPath(companyId, opts);
  if (!path) return '';
  const origin = (opts?.origin || 'https://airpick-reservation.web.app').replace(/\/$/, '');
  return `${origin}${path}`;
}

export function buildHomepageBookingUrlWithAid(
  companyId: string,
  clickId: string,
  origin?: string
): string {
  const id = normalizeAcquisitionCompanyId(companyId);
  if (!id || !isValidAcquisitionClickId(clickId)) return '';
  const base = (origin || 'https://airpick-reservation.web.app').replace(/\/$/, '');
  return `${base}/h/${encodeURIComponent(id)}?aid=${encodeURIComponent(clickId)}`;
}

export function parseAidFromSearch(search: string): string | null {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const aid = String(params.get('aid') || '').trim();
  return isValidAcquisitionClickId(aid) ? aid : null;
}

/** src/med/cmp 가 있으면 영업 유입 의도 (aid 없을 때 클릭 생성) */
export function parseAcquisitionIntentFromSearch(search: string): {
  source: string;
  medium: string;
  campaignRaw: string | null;
} | null {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  if (parseAidFromSearch(search)) return null;
  const src = params.get('src') || params.get('source');
  const med = params.get('med') || params.get('medium');
  const cmp = params.get('cmp') || params.get('campaign');
  if (!src && !med && !cmp) return null;
  return {
    source: normalizeAcquisitionSource(src),
    medium: normalizeAcquisitionMedium(med),
    campaignRaw: cmp,
  };
}

export function acquisitionSourceLabel(source: string): string {
  return ACQUISITION_SOURCE_LABELS[source] || source;
}
