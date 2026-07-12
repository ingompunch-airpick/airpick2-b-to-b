/** 인천국제공항 터미널 기준 좌표 (공개 자료 근사값) */
export const ICN_TERMINAL_COORDS = {
  T1: { lat: 37.44749, lng: 126.4524 },
  T2: { lat: 37.46874, lng: 126.4334 },
} as const;

export type LatLng = { lat: number; lng: number };

const EARTH_RADIUS_KM = 6371;

/** 두 좌표 사이 직선거리 (km), 소수 1자리 */
export function haversineKm(a: LatLng, b: LatLng): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  const km = 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
  return Math.round(km * 10) / 10;
}

/** 직선거리 기반 대략 이동 분 (시속 ~24km 가정) */
export function estimateDriveMinutes(distanceKm: number): number {
  if (!(distanceKm > 0)) return 0;
  return Math.max(1, Math.round(distanceKm / 0.4));
}

export function distancesFromParkingPin(pin: LatLng): {
  T1: { distanceKm: number; driveMinutes: number };
  T2: { distanceKm: number; driveMinutes: number };
} {
  const t1Km = haversineKm(pin, ICN_TERMINAL_COORDS.T1);
  const t2Km = haversineKm(pin, ICN_TERMINAL_COORDS.T2);
  return {
    T1: { distanceKm: t1Km, driveMinutes: estimateDriveMinutes(t1Km) },
    T2: { distanceKm: t2Km, driveMinutes: estimateDriveMinutes(t2Km) },
  };
}

export function parseLatLng(latRaw: string, lngRaw: string): LatLng | null {
  const lat = Number(latRaw.trim());
  const lng = Number(lngRaw.trim());
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

export function buildNaverMapCoordUrl(lat: number, lng: number): string {
  return `https://map.naver.com/p?c=${lng},${lat},16,0,0,0,dh`;
}

/** OSM embed — API 키 없이 작은 미리보기 */
export function buildOsmEmbedUrl(lat: number, lng: number, delta = 0.008): string {
  const bbox = [lng - delta, lat - delta, lng + delta, lat + delta].join(',');
  return `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(bbox)}&layer=mapnik&marker=${lat}%2C${lng}`;
}
