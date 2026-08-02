/**
 * 집 주소 → 공항(주차/터미널) 자동차 소요시간.
 * Env: NAVER_NCP_API_KEY_ID / NAVER_NCP_API_KEY (functions/.env 또는 Cloud Run 환경변수)
 */
import { defineString } from 'firebase-functions/params';
import { onRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';

const ncpKeyIdParam = defineString('NAVER_NCP_API_KEY_ID', { default: '' });
const ncpKeySecretParam = defineString('NAVER_NCP_API_KEY', { default: '' });

/** 신 Maps (maps.apigw) — 구 naveropenapi 호스트는 210 subscription 오류 */
const GEOCODE_URL = 'https://maps.apigw.ntruss.com/map-geocode/v2/geocode';
const DIRECTION_URL = 'https://maps.apigw.ntruss.com/map-direction/v1/driving';

function readSecrets(): { id: string; secret: string } {
  let id = '';
  let secret = '';
  try {
    id = ncpKeyIdParam.value()?.trim() ?? '';
  } catch {
    /* unset */
  }
  try {
    secret = ncpKeySecretParam.value()?.trim() ?? '';
  } catch {
    /* unset */
  }
  if (!id) id = String(process.env.NAVER_NCP_API_KEY_ID ?? '').trim();
  if (!secret) secret = String(process.env.NAVER_NCP_API_KEY ?? '').trim();
  return { id, secret };
}

function ncpHeaders(id: string, secret: string): HeadersInit {
  return {
    'X-NCP-APIGW-API-KEY-ID': id,
    'X-NCP-APIGW-API-KEY': secret,
  };
}

async function geocodeAddress(
  query: string,
  id: string,
  secret: string
): Promise<{ lng: number; lat: number; roadAddress: string } | null> {
  const u = new URL(GEOCODE_URL);
  u.searchParams.set('query', query);
  const res = await fetch(u.toString(), { headers: ncpHeaders(id, secret) });
  if (!res.ok) {
    throw new Error(`geocode_${res.status}`);
  }
  const json = (await res.json()) as {
    status?: string;
    addresses?: Array<{ x?: string; y?: string; roadAddress?: string; jibunAddress?: string }>;
  };
  const first = json.addresses?.[0];
  if (!first?.x || !first?.y) return null;
  const lng = Number(first.x);
  const lat = Number(first.y);
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
  return {
    lng,
    lat,
    roadAddress: String(first.roadAddress || first.jibunAddress || query),
  };
}

async function drivingDurationMs(
  startLng: number,
  startLat: number,
  goalLng: number,
  goalLat: number,
  id: string,
  secret: string
): Promise<{ durationMs: number; distanceM: number }> {
  const u = new URL(DIRECTION_URL);
  u.searchParams.set('start', `${startLng},${startLat}`);
  u.searchParams.set('goal', `${goalLng},${goalLat}`);
  u.searchParams.set('option', 'traoptimal');
  const res = await fetch(u.toString(), { headers: ncpHeaders(id, secret) });
  if (!res.ok) {
    throw new Error(`direction_${res.status}`);
  }
  const json = (await res.json()) as {
    code?: number;
    message?: string;
    route?: {
      traoptimal?: Array<{ summary?: { duration?: number; distance?: number } }>;
    };
  };
  if (json.code !== 0) {
    throw new Error(json.message || `direction_code_${json.code}`);
  }
  const summary = json.route?.traoptimal?.[0]?.summary;
  const durationMs = Number(summary?.duration);
  const distanceM = Number(summary?.distance);
  if (!Number.isFinite(durationMs) || durationMs <= 0) {
    throw new Error('direction_no_duration');
  }
  return {
    durationMs,
    distanceM: Number.isFinite(distanceM) ? distanceM : 0,
  };
}

/**
 * GET /api/drive-eta?address=서울시…&goalLng=126.45&goalLat=37.44
 */
export const getDriveEta = onRequest(
  {
    region: 'asia-northeast3',
    cors: true,
    timeoutSeconds: 30,
    memory: '256MiB',
  },
  async (req, res) => {
    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }
    if (req.method !== 'GET') {
      res.status(405).json({ error: 'method_not_allowed' });
      return;
    }

    const address = String(req.query.address ?? '').trim();
    const goalLng = Number(req.query.goalLng ?? req.query.goal_lng);
    const goalLat = Number(req.query.goalLat ?? req.query.goal_lat);

    if (address.length < 2) {
      res.status(400).json({ error: 'invalid_address' });
      return;
    }
    if (!Number.isFinite(goalLng) || !Number.isFinite(goalLat)) {
      res.status(400).json({ error: 'invalid_goal' });
      return;
    }

    const { id, secret } = readSecrets();
    if (!id || !secret) {
      res.status(500).json({
        error: 'missing_ncp_keys',
        message: '네이버 지도 API 키가 설정되지 않았습니다.',
      });
      return;
    }

    try {
      const start = await geocodeAddress(address, id, secret);
      if (!start) {
        res.status(404).json({
          error: 'geocode_not_found',
          message: '주소를 찾지 못했습니다. 도로명·지번을 확인해 주세요.',
        });
        return;
      }

      const route = await drivingDurationMs(
        start.lng,
        start.lat,
        goalLng,
        goalLat,
        id,
        secret
      );
      const durationMinutes = Math.max(1, Math.round(route.durationMs / 1000 / 60));

      res.set('Cache-Control', 'public, max-age=120');
      res.status(200).json({
        address: start.roadAddress,
        start: { lat: start.lat, lng: start.lng },
        goal: { lat: goalLat, lng: goalLng },
        durationMs: route.durationMs,
        durationMinutes,
        distanceM: route.distanceM,
        source: 'naver_map_direction_v1',
      });
    } catch (err) {
      logger.error('getDriveEta failed', err);
      res.status(502).json({
        error: 'upstream_failed',
        message: '길찾기 조회에 실패했습니다. 이동 시간을 직접 선택해 주세요.',
      });
    }
  }
);
