/**
 * /h/{업체} 최초 유입 — localStorage 30일.
 * src·utm_source·단축 경로. 예약 acquisitionSource 와 같은 키.
 */

const STORAGE_PREFIX = 'airpick.h.firstTouch.';
const TTL_MS = 30 * 24 * 60 * 60 * 1000;
const SOURCE_RE = /^[a-z0-9_-]{1,40}$/;

const RESERVED = new Set([
  'admin',
  'h',
  'r',
  'api',
  'assets',
  'login',
  'stats',
  'affiliate',
]);

export type HomepageFirstTouch = {
  source: string;
  medium: string;
  campaign: string;
  capturedAt: string;
  expiresAt: string;
};

function storageKey(companyId: string): string {
  return `${STORAGE_PREFIX}${companyId.trim().toLowerCase()}`;
}

export function normalizeHomepageSource(raw: string | null | undefined): string | null {
  const source = String(raw || '')
    .trim()
    .toLowerCase();
  if (!SOURCE_RE.test(source) || RESERVED.has(source)) return null;
  return source;
}

/** src → utm_source → (드물게) 경로 한 단어 */
export function sourceFromHomepageLocation(pathname: string, search = ''): string | null {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const fromSrc = normalizeHomepageSource(params.get('src') || params.get('source'));
  if (fromSrc) return fromSrc;
  const fromUtm = normalizeHomepageSource(params.get('utm_source'));
  if (fromUtm) return fromUtm;
  const slug = pathname.replace(/^\/+|\/+$/g, '').toLowerCase();
  // /h/{company} 자체는 소스가 아님
  if (!slug || slug.startsWith('h/') || slug.includes('/')) return null;
  return normalizeHomepageSource(slug);
}

function parseHit(raw: string | null): HomepageFirstTouch | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<HomepageFirstTouch>;
    const source = normalizeHomepageSource(parsed.source);
    if (!source) return null;
    const capturedAt =
      typeof parsed.capturedAt === 'string' ? parsed.capturedAt : new Date().toISOString();
    const expiresAt =
      typeof parsed.expiresAt === 'string'
        ? parsed.expiresAt
        : new Date(Date.parse(capturedAt) + TTL_MS).toISOString();
    if (Date.parse(expiresAt) <= Date.now()) return null;
    return {
      source,
      medium: typeof parsed.medium === 'string' ? parsed.medium.slice(0, 80) : '',
      campaign: typeof parsed.campaign === 'string' ? parsed.campaign.slice(0, 80) : '',
      capturedAt,
      expiresAt,
    };
  } catch {
    return null;
  }
}

export function peekHomepageFirstTouch(companyId: string): HomepageFirstTouch | null {
  if (typeof localStorage === 'undefined') return null;
  const id = companyId.trim().toLowerCase();
  if (!id) return null;
  try {
    const hit = parseHit(localStorage.getItem(storageKey(id)));
    if (!hit) {
      localStorage.removeItem(storageKey(id));
      return null;
    }
    return hit;
  } catch {
    return null;
  }
}

export function captureHomepageFirstTouch(
  companyId: string,
  pathname = typeof window !== 'undefined' ? window.location.pathname : '/',
  search = typeof window !== 'undefined' ? window.location.search : ''
): HomepageFirstTouch | null {
  const id = companyId.trim().toLowerCase();
  if (!id) return null;
  if (peekHomepageFirstTouch(id)) return null;

  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const source = sourceFromHomepageLocation(pathname, search);
  if (!source) return null;

  const fromSrc = Boolean(normalizeHomepageSource(params.get('src') || params.get('source')));
  const medium =
    String(params.get('utm_medium') || params.get('med') || '')
      .trim()
      .slice(0, 80) || (fromSrc ? 'src' : 'path');
  const campaign = String(params.get('utm_campaign') || params.get('cmp') || '')
    .trim()
    .slice(0, 80);
  const capturedAt = new Date().toISOString();
  const hit: HomepageFirstTouch = {
    source,
    medium,
    campaign,
    capturedAt,
    expiresAt: new Date(Date.now() + TTL_MS).toISOString(),
  };
  try {
    localStorage.setItem(storageKey(id), JSON.stringify(hit));
  } catch {
    /* ignore */
  }
  return hit;
}

/** 예약 payload용 — aid 없을 때 사용 */
export function homepageFirstTouchFields(
  companyId: string
): Partial<{
  acquisitionSource: string;
  acquisitionMedium: string;
  acquisitionCampaign: string;
}> {
  const hit = peekHomepageFirstTouch(companyId);
  if (!hit?.source) return {};
  return {
    acquisitionSource: hit.source,
    ...(hit.medium ? { acquisitionMedium: hit.medium } : {}),
    ...(hit.campaign ? { acquisitionCampaign: hit.campaign } : {}),
  };
}

/** 파트너 홈에서 넘긴 via=ph 이면 /h/ 방문 재집계 생략 */
export function shouldSkipHomepageVisitCount(search: string): boolean {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  return params.get('via') === 'ph';
}
