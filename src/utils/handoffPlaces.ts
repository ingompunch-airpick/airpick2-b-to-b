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
const PLACES: Record<'drop' | 'curb', Record<'T1' | 'T2', HandoffPlace>> = {
  drop: {
    T1: {
      handoff: 'drop',
      terminal: 'T1',
      name: '인천공항 1터미널 지하2층 H26',
      address: '인천광역시 중구 공항로 272 제1여객터미널 지하2층 H26',
      lat: 37.4475,
      lng: 126.4524,
    },
    T2: {
      handoff: 'drop',
      terminal: 'T2',
      name: '인천공항 2터미널 2층 서편 146',
      address: '인천광역시 중구 공항로 272 제2여객터미널 2층 서편 146',
      lat: 37.4493,
      lng: 126.4583,
    },
  },
  curb: {
    T1: {
      handoff: 'curb',
      terminal: 'T1',
      name: '인천공항 1터미널 3층 출국장',
      address: '인천광역시 중구 공항로 272 제1여객터미널 3층 출국장',
      lat: 37.4485,
      lng: 126.4512,
    },
    T2: {
      handoff: 'curb',
      terminal: 'T2',
      name: '인천공항 2터미널 3층 출국장',
      address: '인천광역시 중구 공항로 272 제2여객터미널 3층 출국장',
      lat: 37.4504,
      lng: 126.4572,
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

export function naverDirectionsUrl(place: HandoffPlace): string {
  const name = encodeURIComponent(place.name);
  return `https://map.naver.com/v5/directions/-/-/${place.lng},${place.lat},${name}/car`;
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
