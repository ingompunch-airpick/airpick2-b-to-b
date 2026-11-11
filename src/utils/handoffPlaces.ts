import type { Company, HandoffType, Reservation } from '../types';
import { usesItchaPickupGuide } from './itchaPickupGuide';
import { readParkingProducts } from './parkingProducts';

export type HandoffPlace = {
  handoff: HandoffType;
  terminal: 'T1' | 'T2';
  /** 접수증·지도에 보이는 짧은 이름 */
  name: string;
  /** 검색·복사에 쓰는 주소성 문구 */
  address: string;
  lat: number;
  lng: number;
};

/**
 * 인천공항 고정 픽업 지점.
 * 좌표는 터미널 인근 대표점 — 앱 길찾기용. 밋앤그릿은 업체별로 나중에.
 */
/** 출국장(커브) — 터미널 대표점 */
const ICN_T1_CURB = { lat: 37.4485, lng: 126.4512 };
const ICN_T2_CURB = { lat: 37.46874, lng: 126.4334 };

/**
 * 드랍오프 내비 목적지 = 단기주차장 지하2층(네이버 POI).
 * H26·서편146은 주차 후 도보 만남 지점이라 차로 길찾기 목적지가 아님.
 */
const ICN_T1_DROP = { lat: 37.4485958, lng: 126.4556568 }; // 단기주차장 지하2층
const ICN_T2_DROP = { lat: 37.4683746, lng: 126.4304702 }; // 단기지하 M층(지하 주차)

const PLACES: Record<'drop' | 'curb', Record<'T1' | 'T2', HandoffPlace>> = {
  drop: {
    T1: {
      handoff: 'drop',
      terminal: 'T1',
      name: '인천공항 1터미널 단기주차장 지하2층',
      address: '인천광역시 영종구 공항로 272 제1여객터미널 단기주차장 지하2층 H26',
      ...ICN_T1_DROP,
    },
    T2: {
      handoff: 'drop',
      terminal: 'T2',
      name: '인천공항 2터미널 단기주차장 지하',
      address: '인천광역시 영종구 제2터미널대로 446 제2여객터미널 단기주차장 지하 서편 146',
      ...ICN_T2_DROP,
    },
  },
  curb: {
    T1: {
      handoff: 'curb',
      terminal: 'T1',
      name: '인천공항 1터미널 3층 출국장',
      address: '인천광역시 영종구 공항로 272 제1여객터미널 3층 출국장',
      ...ICN_T1_CURB,
    },
    T2: {
      handoff: 'curb',
      terminal: 'T2',
      name: '인천공항 2터미널 3층 출국장',
      address: '인천광역시 영종구 제2터미널대로 446 제2여객터미널 3층 출국장',
      ...ICN_T2_CURB,
    },
  },
};

function normalizeTerminal(raw?: string | null): 'T1' | 'T2' | null {
  const t = String(raw || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '');
  if (t === 'T1' || t === '1' || t.includes('제1') || t.includes('1터미널')) return 'T1';
  if (t === 'T2' || t === '2' || t.includes('제2') || t.includes('2터미널')) return 'T2';
  return null;
}

/** 예약·업체 상품으로 입고 방식 추정. 밋앤그릿 좌표는 아직 없음. */
export function resolveReceiptHandoffType(
  reservation: Pick<Reservation, 'companyId'>,
  company?: Company | null
): HandoffType | null {
  if (usesItchaPickupGuide(reservation.companyId || company?.id)) return 'drop';

  const products = readParkingProducts(company);
  const visible = products.filter((p) => !p.hidden);
  if (visible.length === 0) return null;

  const hasCurb = visible.some((p) => p.curb);
  const hasDrop = visible.some((p) => p.drop);
  const hasGreet = visible.some((p) => p.meetGreet);

  if (hasDrop && !hasCurb && !hasGreet) return 'drop';
  if (hasCurb && !hasDrop && !hasGreet) return 'curb';
  if (hasGreet && !hasDrop && !hasCurb) return 'meet_greet';
  // 여러 개면 드랍 우선(가유·시즌·안녕 계열 외 혼합 대비)
  if (hasDrop) return 'drop';
  if (hasCurb) return 'curb';
  if (hasGreet) return 'meet_greet';
  return null;
}

export function resolveHandoffPlace(
  handoff: HandoffType | null | undefined,
  terminalRaw?: string | null
): HandoffPlace | null {
  if (!handoff || handoff === 'meet_greet') return null;
  const terminal = normalizeTerminal(terminalRaw);
  if (!terminal) return null;
  return PLACES[handoff][terminal];
}

/** 웹 폴백 — elat/elng/etext 는 도착지 전용 파라미터 */
export function naverDirectionsWebUrl(place: HandoffPlace): string {
  const q = new URLSearchParams({
    menu: 'route',
    elat: String(place.lat),
    elng: String(place.lng),
    etext: place.name,
    pathType: '0',
  });
  return `https://map.naver.com/index.nhn?${q.toString()}`;
}

/**
 * 네이버 지도 앱 길찾기 (도착지 = dlat/dlng/dname).
 * `/p/directions` 경로형은 앱에서 경유지로 열리는 경우가 있어 앱 스킴을 우선한다.
 */
export function naverDirectionsAppUrl(place: HandoffPlace): string {
  const q = new URLSearchParams({
    dlat: String(place.lat),
    dlng: String(place.lng),
    dname: place.name,
    appname: 'airpick-reservation.web.app',
  });
  return `nmap://route/car?${q.toString()}`;
}

/** <a href> 용 — 웹 URL. 모바일은 openNaverDirections 권장 */
export function naverDirectionsUrl(place: HandoffPlace): string {
  return naverDirectionsWebUrl(place);
}

/** 모바일은 앱 스킴(도착지 명시) → 실패 시 웹 */
export function openNaverDirections(place: HandoffPlace): void {
  const web = naverDirectionsWebUrl(place);
  const isMobile = /iPhone|iPad|iPod|Android/i.test(
    typeof navigator !== 'undefined' ? navigator.userAgent : ''
  );
  if (!isMobile) {
    window.open(web, '_blank', 'noopener,noreferrer');
    return;
  }
  const started = Date.now();
  window.location.href = naverDirectionsAppUrl(place);
  window.setTimeout(() => {
    if (Date.now() - started < 1800) {
      window.location.href = web;
    }
  }, 900);
}

export function kakaoDirectionsUrl(place: HandoffPlace): string {
  return `https://map.kakao.com/link/to/${encodeURIComponent(place.name)},${place.lat},${place.lng}`;
}

export function tmapDirectionsUrl(place: HandoffPlace): string {
  const q = new URLSearchParams({
    name: place.name,
    lon: String(place.lng),
    lat: String(place.lat),
  });
  return `https://www.tmap.co.kr/tmap2/mobile/tmap.jsp?${q.toString()}`;
}
