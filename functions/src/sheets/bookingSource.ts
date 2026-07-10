export type BookingSource = 'homepage' | 'airpick-b2c' | 'b2b' | 'unknown';

const B2B_MARKERS = new Set([
  'b2b',
  '업체 마스터',
  '본사 마스터(최고관리자)',
  '본사 마스터',
]);

function hasHomepageLegacyMarkers(raw?: Record<string, unknown> | null): boolean {
  if (!raw) return false;
  const legacyKeys = ['entryAirline', 'entryFlight', 'exitAirline', 'exitFlight'] as const;
  return legacyKeys.some((key) => {
    const v = raw[key];
    return typeof v === 'string' && v.trim() !== '';
  });
}

export function resolveBookingSource(
  createdBy?: string | null,
  raw?: Record<string, unknown> | null
): BookingSource {
  const rawCreated = (createdBy || '').trim().toLowerCase();
  if (rawCreated) {
    if (rawCreated === 'homepage') return 'homepage';
    if (rawCreated === 'airpick-b2c' || rawCreated === 'airpick_b2c') return 'airpick-b2c';
    if (rawCreated === 'b2b' || B2B_MARKERS.has((createdBy || '').trim())) return 'b2b';
    if (
      rawCreated.includes('마스터') ||
      rawCreated.includes('부관리자') ||
      rawCreated.includes('기사')
    ) {
      return 'b2b';
    }
  }
  if (hasHomepageLegacyMarkers(raw)) return 'homepage';
  return 'unknown';
}

export function bookingSourceLabel(source: BookingSource): string {
  switch (source) {
    case 'homepage':
      return '홈페이지';
    case 'airpick-b2c':
      return '에어픽';
    case 'b2b':
      return '현장·B2B';
    default:
      return '미확인';
  }
}
