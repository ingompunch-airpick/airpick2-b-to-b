import { getAirport, normalizeAirportId, type AirportId } from './airport';

/** @deprecated — getAirport(id).coords 사용. ICN 호환용 re-export */
export const ICN_TERMINAL_COORDS = getAirport('ICN').coords as {
  T1: { lat: number; lng: number };
  T2: { lat: number; lng: number };
};

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

export function getTerminalCoords(
  airportId: AirportId | string | null | undefined,
  terminalCode: string
): LatLng | null {
  const coords = getAirport(airportId).coords;
  const hit = coords[terminalCode] || coords[String(terminalCode).toUpperCase()];
  return hit ? { lat: hit.lat, lng: hit.lng } : null;
}

/** 주차장 핀 → 해당 공항 전 터미널 직선거리 */
export function distancesFromParkingPin(
  pin: LatLng,
  airportId: AirportId | string | null | undefined = 'ICN'
): Record<string, { distanceKm: number; driveMinutes: number }> {
  const airport = getAirport(airportId);
  const out: Record<string, { distanceKm: number; driveMinutes: number }> = {};
  for (const t of airport.terminals) {
    const coord = airport.coords[t.code];
    if (!coord) continue;
    const distanceKm = haversineKm(pin, coord);
    out[t.code] = {
      distanceKm,
      driveMinutes: estimateDriveMinutes(distanceKm),
    };
  }
  return out;
}

export function parseLatLng(latRaw: string, lngRaw: string): LatLng | null {
  const latStr = String(latRaw ?? '').trim();
  const lngStr = String(lngRaw ?? '').trim();
  if (!latStr || !lngStr) return null;
  const lat = Number(latStr);
  const lng = Number(lngStr);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  if (lat === 0 && lng === 0) return null;
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

export function defaultMapCenter(
  airportId?: AirportId | string | null
): LatLng {
  const airport = getAirport(normalizeAirportId(airportId));
  const first = airport.terminals[0]?.code;
  const c = first ? airport.coords[first] : undefined;
  return c ? { lat: c.lat, lng: c.lng } : { lat: 37.44749, lng: 126.4524 };
}
