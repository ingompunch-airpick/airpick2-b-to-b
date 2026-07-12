/** 네이버 클라우드 Maps (JS API v3). OAuth용 NAVER_CLIENT_ID 와는 별개입니다. */
export function getNaverMapClientId(): string {
  return String(import.meta.env.VITE_NAVER_MAP_CLIENT_ID ?? '').trim();
}

let loadPromise: Promise<void> | null = null;

export function loadNaverMaps(): Promise<void> {
  if (typeof window !== 'undefined' && window.naver?.maps) {
    return Promise.resolve();
  }
  if (loadPromise) return loadPromise;

  const clientId = getNaverMapClientId();
  if (!clientId) {
    return Promise.reject(new Error('MISSING_NAVER_MAP_CLIENT_ID'));
  }

  loadPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-naver-maps="v3"]');
    if (existing) {
      const check = () => {
        if (window.naver?.maps) resolve();
        else reject(new Error('NAVER_MAPS_SCRIPT_LOADED_BUT_API_MISSING'));
      };
      if (window.naver?.maps) resolve();
      else existing.addEventListener('load', check, { once: true });
      existing.addEventListener('error', () => reject(new Error('NAVER_MAPS_SCRIPT_ERROR')), {
        once: true,
      });
      return;
    }

    window.navermap_authFailure = () => {
      loadPromise = null;
      reject(new Error('NAVER_MAPS_AUTH_FAILURE'));
    };

    const script = document.createElement('script');
    script.dataset.naverMaps = 'v3';
    script.async = true;
    script.src = `https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=${encodeURIComponent(clientId)}&submodules=geocoder`;
    script.onload = () => {
      if (window.naver?.maps) resolve();
      else {
        loadPromise = null;
        reject(new Error('NAVER_MAPS_API_MISSING'));
      }
    };
    script.onerror = () => {
      loadPromise = null;
      reject(new Error('NAVER_MAPS_SCRIPT_ERROR'));
    };
    document.head.appendChild(script);
  });

  return loadPromise;
}

export function formatNaverReverseAddress(
  response: naver.maps.ReverseGeocodeResponse | undefined
): string {
  const v2 = response?.v2;
  const road = v2?.address?.roadAddress?.trim();
  if (road) return road;
  const jibun = v2?.address?.jibunAddress?.trim();
  if (jibun) return jibun;

  const result = v2?.results?.[0];
  if (!result) return '';
  const r = result.region;
  const area = [r?.area1?.name, r?.area2?.name, r?.area3?.name, r?.area4?.name]
    .filter(Boolean)
    .join(' ');
  const land = result.land;
  const num =
    land?.number1 != null
      ? land.number2
        ? `${land.number1}-${land.number2}`
        : land.number1
      : '';
  const name = land?.name || land?.addition0?.value || '';
  return [area, name, num].filter(Boolean).join(' ').trim();
}

export function reverseGeocodeLatLng(
  lat: number,
  lng: number
): Promise<string> {
  return new Promise((resolve) => {
    if (!window.naver?.maps?.Service?.reverseGeocode) {
      resolve('');
      return;
    }
    const coords = new window.naver.maps.LatLng(lat, lng);
    window.naver.maps.Service.reverseGeocode(
      {
        coords,
        orders: [
          window.naver.maps.Service.OrderType.ROAD_ADDR,
          window.naver.maps.Service.OrderType.ADDR,
        ].join(','),
      },
      (status, response) => {
        if (status !== window.naver!.maps.Service.Status.OK) {
          resolve('');
          return;
        }
        resolve(formatNaverReverseAddress(response));
      }
    );
  });
}

export function geocodeQuery(
  query: string
): Promise<{ lat: number; lng: number; address: string } | null> {
  return new Promise((resolve) => {
    const q = query.trim();
    if (!q || !window.naver?.maps?.Service?.geocode) {
      resolve(null);
      return;
    }
    window.naver.maps.Service.geocode({ query: q }, (status, response) => {
      if (status !== window.naver!.maps.Service.Status.OK) {
        resolve(null);
        return;
      }
      const hit = response?.v2?.addresses?.[0];
      if (!hit?.x || !hit?.y) {
        resolve(null);
        return;
      }
      const lat = Number(hit.y);
      const lng = Number(hit.x);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        resolve(null);
        return;
      }
      resolve({
        lat,
        lng,
        address: (hit.roadAddress || hit.jibunAddress || q).trim(),
      });
    });
  });
}
