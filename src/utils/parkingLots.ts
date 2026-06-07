import type { Company, ParkingLotSite } from '../types';

type LegacyLotFields = {
  parkingAddress?: string;
  customerAddress?: string;
  detailLocation?: string;
  parkingLotAddress?: string;
  buildingAddress?: string;
};

function resolveParkingAddress(lot: LegacyLotFields): string {
  if (lot.parkingAddress?.trim()) return lot.parkingAddress.trim();
  if (lot.customerAddress?.trim()) {
    return [lot.customerAddress.trim(), lot.detailLocation?.trim()].filter(Boolean).join(' · ');
  }
  return [lot.parkingLotAddress?.trim(), lot.buildingAddress?.trim()].filter(Boolean).join(' · ');
}

export function createEmptyParkingLot(type: 'indoor' | 'outdoor', index: number): ParkingLotSite {
  return {
    id: `${type}-${index}-${Date.now()}`,
    type,
    label: type === 'indoor' ? `실내 주차장 ${index + 1}` : `실외 주차장 ${index + 1}`,
    parkingAddress: '',
  };
}

export function normalizeParkingLotsFromCompany(company?: Partial<Company>): ParkingLotSite[] {
  if (company?.parkingLots?.length) {
    const indoor: ParkingLotSite[] = [];
    const outdoor: ParkingLotSite[] = [];
    company.parkingLots.forEach((lot, index) => {
      const normalized: ParkingLotSite = {
        id: lot.id || `${lot.type}-${index}`,
        type: lot.type,
        label:
          lot.label ||
          (lot.type === 'indoor' ? `실내 주차장 ${indoor.length + 1}` : `실외 주차장 ${outdoor.length + 1}`),
        parkingAddress: resolveParkingAddress(lot),
      };
      if (lot.type === 'indoor') indoor.push(normalized);
      else outdoor.push(normalized);
    });
    if (indoor.length + outdoor.length > 0) return [...indoor, ...outdoor];
  }

  const legacy: ParkingLotSite[] = [];
  if (company?.indoorParkingLotAddress || company?.indoorBuildingAddress || company?.indoorParkingAddress) {
    legacy.push({
      id: 'indoor-legacy-0',
      type: 'indoor',
      label: '실내 주차장 1',
      parkingAddress:
        company.indoorParkingAddress?.trim() ||
        [company.indoorParkingLotAddress, company.indoorBuildingAddress].filter(Boolean).join(' · ').trim(),
    });
  }
  if (company?.outdoorParkingLotAddress || company?.outdoorBuildingAddress || company?.outdoorParkingAddress) {
    legacy.push({
      id: 'outdoor-legacy-0',
      type: 'outdoor',
      label: '실외 주차장 1',
      parkingAddress:
        company.outdoorParkingAddress?.trim() ||
        [company.outdoorParkingLotAddress, company.outdoorBuildingAddress].filter(Boolean).join(' · ').trim(),
    });
  }
  if (legacy.length > 0) return legacy;
  return [createEmptyParkingLot('indoor', 0)];
}

export function countParkingLotsByType(lots: ParkingLotSite[], type: 'indoor' | 'outdoor'): number {
  return lots.filter((lot) => lot.type === type).length;
}

export function resizeParkingLotsByType(
  lots: ParkingLotSite[],
  type: 'indoor' | 'outdoor',
  count: number
): ParkingLotSite[] {
  const clamped = Math.max(0, Math.min(count, 10));
  const indoor = lots.filter((lot) => lot.type === 'indoor');
  const outdoor = lots.filter((lot) => lot.type === 'outdoor');
  const target = type === 'indoor' ? indoor : outdoor;
  const resized = Array.from({ length: clamped }, (_, index) => target[index] || createEmptyParkingLot(type, index));
  return type === 'indoor' ? [...resized, ...outdoor] : [...indoor, ...resized];
}

/** 주차장 주소 → 네이버 지도 검색 링크 (API 키 불필요) */
export function buildNaverMapSearchUrl(address: string): string {
  const trimmed = address.trim();
  if (!trimmed) return '';
  return `https://map.naver.com/v5/search/${encodeURIComponent(trimmed)}`;
}

export function validateParkingLots(lots: ParkingLotSite[]): string | null {
  if (lots.length === 0) return '주차장을 1곳 이상 등록해주세요.';
  for (const lot of lots) {
    const name = lot.label || (lot.type === 'indoor' ? '실내 주차장' : '실외 주차장');
    if (!lot.parkingAddress.trim()) return `${name}의 주차장 주소를 입력해주세요.`;
  }
  return null;
}

export function deriveLegacyParkingFields(lots: ParkingLotSite[]) {
  const parkingLots = lots.map((lot) => ({
    id: lot.id,
    type: lot.type,
    label: lot.label,
    parkingAddress: lot.parkingAddress.trim(),
  }));
  const firstIndoor = parkingLots.find((lot) => lot.type === 'indoor');
  const firstOutdoor = parkingLots.find((lot) => lot.type === 'outdoor');

  const indoorAddress = firstIndoor?.parkingAddress || '';
  const outdoorAddress = firstOutdoor?.parkingAddress || '';

  return {
    parkingLots,
    indoorParkingLotAddress: indoorAddress,
    indoorBuildingAddress: '',
    outdoorParkingLotAddress: outdoorAddress,
    outdoorBuildingAddress: '',
    indoorParkingAddress: indoorAddress,
    outdoorParkingAddress: outdoorAddress,
    indoorParkingMapUrl: buildNaverMapSearchUrl(indoorAddress),
    outdoorParkingMapUrl: buildNaverMapSearchUrl(outdoorAddress),
  };
}
