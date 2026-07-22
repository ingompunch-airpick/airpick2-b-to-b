import React, { useEffect, useRef, useState } from 'react';
import { defaultMapCenter, parseLatLng } from '../utils/airportDistance';
import {
  geocodeQuery,
  getNaverMapClientId,
  loadNaverMaps,
  reverseGeocodeLatLng,
} from '../lib/naverMaps';

type Props = {
  airportId?: string | null;
  lat: string;
  lng: string;
  /** address는 검색/역지오코딩 후 세 번째 인자로 전달 */
  onChange: (lat: string, lng: string, address?: string) => void;
  heightClass?: string;
};

export default function ParkingPinMap({
  airportId = 'ICN',
  lat,
  lng,
  onChange,
  heightClass = 'h-56',
}: Props) {
  const DEFAULT_CENTER = defaultMapCenter(airportId);
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<naver.maps.Map | null>(null);
  const markerRef = useRef<naver.maps.Marker | null>(null);
  const clickListenerRef = useRef<object | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const [status, setStatus] = useState<'loading' | 'ready' | 'missing_key' | 'error'>('loading');
  const [errorMsg, setErrorMsg] = useState('');
  const [address, setAddress] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);

  const applyPin = async (nextLat: number, nextLng: number, knownAddress?: string) => {
    const latStr = nextLat.toFixed(6);
    const lngStr = nextLng.toFixed(6);
    if (knownAddress) {
      setAddress(knownAddress);
      onChangeRef.current(latStr, lngStr, knownAddress);
      return;
    }
    // 좌표·거리는 즉시 반영, 주소는 역지오코딩 후 같은 좌표로 한 번 더 전달
    onChangeRef.current(latStr, lngStr);
    const resolved = await reverseGeocodeLatLng(nextLat, nextLng);
    if (resolved) {
      setAddress(resolved);
      onChangeRef.current(latStr, lngStr, resolved);
    }
  };

  useEffect(() => {
    let cancelled = false;

    if (!getNaverMapClientId()) {
      setStatus('missing_key');
      return;
    }

    (async () => {
      try {
        await loadNaverMaps();
        if (cancelled || !containerRef.current || !window.naver?.maps) return;

        const pin = parseLatLng(lat, lng);
        const center = pin ?? DEFAULT_CENTER;
        const map = new window.naver.maps.Map(containerRef.current, {
          center: new window.naver.maps.LatLng(center.lat, center.lng),
          zoom: pin ? 16 : 13,
          zoomControl: true,
          zoomControlOptions: {
            position: window.naver.maps.Position.TOP_RIGHT,
          },
          mapTypeControl: true,
          scaleControl: true,
        });
        mapRef.current = map;

        if (pin) {
          markerRef.current = new window.naver.maps.Marker({
            position: new window.naver.maps.LatLng(pin.lat, pin.lng),
            map,
          });
          void reverseGeocodeLatLng(pin.lat, pin.lng).then((resolved) => {
            if (!cancelled && resolved) setAddress(resolved);
          });
        }

        clickListenerRef.current = window.naver.maps.Event.addListener(
          map,
          'click',
          (e: naver.maps.MapMouseEvent) => {
            const coord = e.coord ?? e.latlng;
            if (!coord) return;
            const nextLat = coord.lat();
            const nextLng = coord.lng();
            if (!markerRef.current) {
              markerRef.current = new window.naver!.maps.Marker({
                position: coord,
                map,
              });
            } else {
              markerRef.current.setPosition(coord);
            }
            void applyPin(nextLat, nextLng);
          }
        );

        // 모달 안에서는 레이아웃 확정 후 리사이즈 필요
        window.setTimeout(() => map.autoResize(), 50);
        window.setTimeout(() => map.autoResize(), 300);
        setStatus('ready');
      } catch (err) {
        if (cancelled) return;
        const code = err instanceof Error ? err.message : 'UNKNOWN';
        setStatus(code === 'MISSING_NAVER_MAP_CLIENT_ID' ? 'missing_key' : 'error');
        setErrorMsg(
          code === 'NAVER_MAPS_AUTH_FAILURE'
            ? '네이버 지도 인증 실패. Client ID·웹 서비스 URL(localhost 포함)을 확인하세요.'
            : '네이버 지도를 불러오지 못했습니다.'
        );
      }
    })();

    return () => {
      cancelled = true;
      if (clickListenerRef.current && window.naver?.maps) {
        window.naver.maps.Event.removeListener(clickListenerRef.current);
        clickListenerRef.current = null;
      }
      if (markerRef.current) {
        markerRef.current.setMap(null);
        markerRef.current = null;
      }
      mapRef.current = null;
    };
    // 초기 마운트만 — lat/lng 동기화는 아래 effect
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !window.naver?.maps || status !== 'ready') return;

    const pin = parseLatLng(lat, lng);
    if (!pin) {
      if (markerRef.current) {
        markerRef.current.setMap(null);
        markerRef.current = null;
      }
      return;
    }

    const pos = new window.naver.maps.LatLng(pin.lat, pin.lng);
    if (!markerRef.current) {
      markerRef.current = new window.naver.maps.Marker({ position: pos, map });
    } else {
      markerRef.current.setPosition(pos);
    }
    map.setCenter(pos);
  }, [lat, lng, status]);

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    try {
      await loadNaverMaps();
      const hit = await geocodeQuery(searchQuery);
      if (!hit) {
        alert('주소를 찾지 못했습니다. 도로명·건물명으로 다시 검색해 주세요.');
        return;
      }
      const map = mapRef.current;
      if (map && window.naver?.maps) {
        const pos = new window.naver.maps.LatLng(hit.lat, hit.lng);
        map.setCenter(pos);
        map.setZoom(Math.max(map.getZoom(), 16));
        if (!markerRef.current) {
          markerRef.current = new window.naver.maps.Marker({ position: pos, map });
        } else {
          markerRef.current.setPosition(pos);
        }
      }
      await applyPin(hit.lat, hit.lng, hit.address);
      setSearchQuery(hit.address);
    } finally {
      setSearching(false);
    }
  };

  if (status === 'missing_key') {
    return (
      <div
        className={`${heightClass} w-full rounded-xl border border-amber-200 bg-amber-50 p-3 text-[11px] text-amber-900 space-y-2`}
      >
        <p className="font-black">네이버 지도 API 키가 필요합니다</p>
        <p className="leading-relaxed">
          네이버 클라우드 콘솔에서 Maps 애플리케이션을 만들고 Client ID를 발급한 뒤,
          프로젝트 루트 <code className="font-mono bg-white/70 px-1 rounded">.env</code>에
          아래를 넣으세요.
        </p>
        <pre className="bg-white/80 rounded-lg px-2 py-1.5 font-mono text-[10px] overflow-x-auto">
          VITE_NAVER_MAP_CLIENT_ID=발급받은_Client_ID
        </pre>
        <p className="leading-relaxed">
          Web 서비스 URL에 <code className="font-mono">http://localhost:3000</code> 과 배포
          도메인을 등록한 뒤 서버를 재시작하세요.
        </p>
        <a
          href="https://console.ncloud.com/naver-service/application"
          target="_blank"
          rel="noreferrer"
          className="inline-block font-bold text-indigo-700 underline"
        >
          네이버 클라우드 콘솔 열기 →
        </a>
      </div>
    );
  }

  return (
    <div className="relative z-0 isolate space-y-2">
      <div className="flex gap-1.5">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              void handleSearch();
            }
          }}
          placeholder="주소·건물명 검색"
          className="flex-1 min-w-0 px-3 py-2 border border-slate-200 bg-white text-slate-900 rounded-xl text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
        <button
          type="button"
          disabled={searching || status !== 'ready'}
          onClick={() => void handleSearch()}
          className="shrink-0 px-3 py-2 rounded-xl bg-slate-900 text-white text-[11px] font-black disabled:opacity-50"
        >
          {searching ? '…' : '검색'}
        </button>
      </div>

      <div className={`relative z-0 isolate overflow-hidden ${heightClass} w-full`}>
        {status === 'loading' && (
          <div className="absolute inset-0 z-10 flex items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-[11px] text-slate-500 font-bold">
            네이버 지도 불러오는 중…
          </div>
        )}
        {status === 'error' && (
          <div className="absolute inset-0 z-10 flex items-center justify-center rounded-xl border border-rose-200 bg-rose-50 px-3 text-center text-[11px] text-rose-800 font-bold">
            {errorMsg || '지도 로드 실패'}
          </div>
        )}
        <div
          ref={containerRef}
          className="h-full w-full overflow-hidden rounded-xl border border-slate-200 bg-slate-100"
        />
      </div>

      {address ? (
        <p className="text-[11px] text-slate-700 bg-slate-50 border border-slate-100 rounded-lg px-2.5 py-1.5 leading-snug">
          <span className="font-black text-indigo-600">주소 </span>
          {address}
        </p>
      ) : (
        <p className="text-[10px] text-slate-400">지도를 탭하거나 주소 검색으로 핀을 찍어 주세요.</p>
      )}
    </div>
  );
}
