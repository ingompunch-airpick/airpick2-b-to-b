/** 홈페이지 전용 예약 경로 `/h/{companyId}` */

const HOMEPAGE_BOOKING_PATH_RE = /^\/h\/([^/?#]+)\/?$/i;

export function parseHomepageCompanyIdFromPath(pathname: string): string | null {
  const match = pathname.match(HOMEPAGE_BOOKING_PATH_RE);
  if (!match?.[1]) return null;
  try {
    return decodeURIComponent(match[1]).trim().toLowerCase();
  } catch {
    return match[1].trim().toLowerCase();
  }
}

export function buildHomepageBookingPath(companyId: string): string {
  const id = companyId.trim().toLowerCase();
  return id ? `/h/${encodeURIComponent(id)}` : '';
}
