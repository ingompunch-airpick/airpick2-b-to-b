import type { Company, CompanyInsurance, CompanyParkingLot, FacilityType } from '../types';
import { airportTerminalCodes, normalizeAirportId } from './airport';
import { resolveInsuranceProductNameForStorage, normalizeInsuranceProductName } from './insurance';

export type { FacilityType };

export interface PartnerParkingLotForm {
  id: string;
  type: 'indoor' | 'outdoor';
  name: string;
  parkingAddress: string;
  lat: string;
  lng: string;
}

export interface PartnerProfileInput {
  facilityType: FacilityType;
  /** 운영 공항 — HQ만 설정. 기본 ICN */
  airport: 'ICN' | 'GMP';
  /** 실내·야외 주차장 (여러 개) */
  parkingLots: PartnerParkingLotForm[];
  /** 대표 주차장 사진 URL (B2C image_url) */
  imageUrl: string;
  /** 주차장 사진 목록 (최대 5장, 첫 장 = 대표) */
  imageUrls: string[];
  insuranceEnrolled: boolean;
  insuranceProvider: string;
  insuranceProductName: string;
  insuranceCoverageLimitWon: string;
  /** 보험증권 이미지 — http(s) 또는 data URL(저장 시 업로드) */
  insuranceCertificateUrl: string;
}

function newLotId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `lot_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function createEmptyParkingLotForm(
  type: 'indoor' | 'outdoor',
  name = ''
): PartnerParkingLotForm {
  return {
    id: newLotId(),
    type,
    name,
    parkingAddress: '',
    lat: '',
    lng: '',
  };
}

export function nextParkingLotName(
  lots: PartnerParkingLotForm[],
  type: 'indoor' | 'outdoor'
): string {
  const prefix = type === 'indoor' ? '실내' : '실외';
  const used = new Set(
    lots
      .filter((l) => l.type === type)
      .map((l) => l.name.trim())
      .filter(Boolean)
  );
  let n = 1;
  while (used.has(`${prefix}${n}`)) n += 1;
  return `${prefix}${n}`;
}

export const DEFAULT_PARTNER_PROFILE: PartnerProfileInput = {
  facilityType: 'mixed',
  airport: 'ICN',
  parkingLots: [],
  imageUrl: '',
  imageUrls: [],
  insuranceEnrolled: false,
  insuranceProvider: '',
  insuranceProductName: '',
  insuranceCoverageLimitWon: '',
  insuranceCertificateUrl: '',
};

export function inferFacilityType(company?: Partial<Company>): FacilityType {
  if (company?.facilityType) return company.facilityType;
  if (company?.supports_indoor && company?.supports_outdoor) return 'mixed';
  if (company?.supports_outdoor && !company?.supports_indoor) return 'outdoor';
  if (company?.supports_indoor) return 'indoor';
  return company?.is_indoor === false ? 'outdoor' : 'indoor';
}

/** 실내/야외 요금이 실제로 설정돼 있는지 — 0이면 계산 결과가 0원이 된다 */
function resolvedBasePrice(company: Partial<Company> | null | undefined, indoor: boolean): number {
  if (!company) return 0;
  const specific = indoor ? company.indoorBasePrice : company.outdoorBasePrice;
  const value = specific ?? company.base_price;
  return Number(value) || 0;
}

/**
 * 업체가 실내/야외 주차를 실제로 받을 수 있는지.
 * 업체 설정(supports_*·facilityType)과 요금 설정을 함께 본다.
 * 둘 다 불가로 나오면 화면이 잠기므로 기존 동작(둘 다 허용)을 유지한다.
 */
export function companyParkingTypeAvailability(
  company?: Partial<Company> | null
): { indoor: boolean; outdoor: boolean } {
  if (!company) return { indoor: true, outdoor: true };

  const facility = inferFacilityType(company);
  const indoor =
    facility !== 'outdoor' &&
    company.supports_indoor !== false &&
    resolvedBasePrice(company, true) > 0;
  const outdoor =
    facility !== 'indoor' &&
    company.supports_outdoor !== false &&
    resolvedBasePrice(company, false) > 0;

  if (!indoor && !outdoor) return { indoor: true, outdoor: true };
  return { indoor, outdoor };
}

function coordToFormString(raw: unknown): string {
  if (raw == null || raw === '') return '';
  return String(raw);
}

function parseOptionalCoord(raw: string): number | undefined {
  const s = String(raw || '').trim();
  if (!s) return undefined;
  const n = Number(s);
  if (!Number.isFinite(n)) return undefined;
  if (n === 0 && !/[1-9]/.test(s)) return undefined;
  return n;
}

function readLotsFromCompany(company: Company): PartnerParkingLotForm[] {
  const raw = company as Company & Record<string, unknown>;
  const lots: PartnerParkingLotForm[] = [];

  if (Array.isArray(raw.parkingLots)) {
    for (const row of raw.parkingLots) {
      if (!row || typeof row !== 'object') continue;
      const lot = row as unknown as Record<string, unknown>;
      const type = lot.type === 'outdoor' ? 'outdoor' : lot.type === 'indoor' ? 'indoor' : null;
      if (!type) continue;
      const name = String(lot.name || lot.parkingLotName || '').trim();
      const parkingAddress = String(
        lot.parkingAddress || lot.customerAddress || lot.parkingLotAddress || ''
      ).trim();
      const lat = coordToFormString(lot.lat ?? lot.latitude);
      const lng = coordToFormString(lot.lng ?? lot.longitude);
      if (!name && !parkingAddress && !lat && !lng) continue;
      lots.push({
        id: String(lot.id || '').trim() || newLotId(),
        type,
        name:
          name ||
          (type === 'indoor'
            ? nextParkingLotName(lots, 'indoor')
            : nextParkingLotName(lots, 'outdoor')),
        parkingAddress,
        lat,
        lng,
      });
    }
  }

  if (lots.length > 0) return lots;

  // 레거시 단일 실내/야외 필드 → 각 1개 롯으로 시드
  const indoorAddr = String(raw.indoorParkingAddress || '').trim();
  const outdoorAddr = String(raw.outdoorParkingAddress || '').trim();
  const indoorLat = coordToFormString(raw.indoorParkingLat);
  const indoorLng = coordToFormString(raw.indoorParkingLng);
  const outdoorLat = coordToFormString(raw.outdoorParkingLat);
  const outdoorLng = coordToFormString(raw.outdoorParkingLng);

  if (indoorAddr || indoorLat || indoorLng) {
    lots.push({
      id: newLotId(),
      type: 'indoor',
      name: '실내1',
      parkingAddress: indoorAddr,
      lat: indoorLat,
      lng: indoorLng,
    });
  }
  if (outdoorAddr || outdoorLat || outdoorLng) {
    lots.push({
      id: newLotId(),
      type: 'outdoor',
      name: '실외1',
      parkingAddress: outdoorAddr,
      lat: outdoorLat,
      lng: outdoorLng,
    });
  }
  return lots;
}

export function readPartnerProfileFromCompany(company?: Company): PartnerProfileInput {
  if (!company) return { ...DEFAULT_PARTNER_PROFILE, parkingLots: [] };

  const raw = company as Company & Record<string, unknown>;
  const facilityType = inferFacilityType(company);

  let insuranceEnrolled = false;
  let insuranceProvider = '';
  let insuranceProductName = '';
  let insuranceCoverageLimitWon = '';
  let insuranceCertificateUrl = '';

  if (raw.insurance && typeof raw.insurance === 'object') {
    const ins = raw.insurance as CompanyInsurance;
    insuranceEnrolled = !!ins.enrolled;
    insuranceProvider = ins.provider || '';
    insuranceProductName = normalizeInsuranceProductName(ins.productName) || ins.productName || '';
    insuranceCoverageLimitWon =
      ins.coverageLimitWon !== undefined && ins.coverageLimitWon !== null
        ? String(ins.coverageLimitWon)
        : '';
    insuranceCertificateUrl = ins.certificateUrl?.trim() || '';
  } else if (raw.hasInsurance === false) {
    insuranceEnrolled = false;
  } else if (raw.insuranceProvider || raw.insuranceLimit) {
    insuranceEnrolled = true;
    insuranceProvider = String(raw.insuranceProvider || '');
    insuranceCoverageLimitWon = raw.insuranceLimit ? String(raw.insuranceLimit) : '';
  }

  const primaryImage = String(raw.image_url || '').trim();
  const galleryRaw = Array.isArray(raw.image_urls)
    ? raw.image_urls.map((u) => String(u || '').trim()).filter(Boolean)
    : [];
  const imageUrls =
    galleryRaw.length > 0 ? galleryRaw : primaryImage ? [primaryImage] : [];

  return {
    facilityType,
    airport: normalizeAirportId(company.airport),
    parkingLots: readLotsFromCompany(company),
    imageUrl: imageUrls[0] || primaryImage || '',
    imageUrls,
    insuranceEnrolled,
    insuranceProvider,
    insuranceProductName,
    insuranceCoverageLimitWon,
    insuranceCertificateUrl,
  };
}

export function buildInsurancePayload(input: PartnerProfileInput): {
  insurance: CompanyInsurance;
  hasInsurance: boolean;
  insuranceProvider?: string;
  insuranceLimit?: number;
} {
  if (!input.insuranceEnrolled) {
    return {
      insurance: { enrolled: false, updatedAt: new Date().toISOString() },
      hasInsurance: false,
    };
  }

  const provider = input.insuranceProvider.trim();
  const productName = resolveInsuranceProductNameForStorage(input.insuranceProductName, true);
  const limitRaw = input.insuranceCoverageLimitWon.replace(/,/g, '').trim();
  const coverageLimitWon = limitRaw ? Number(limitRaw) : undefined;
  const certificateUrl = input.insuranceCertificateUrl.trim() || undefined;

  const insurance: CompanyInsurance = {
    enrolled: true,
    provider: provider || undefined,
    productName: productName || undefined,
    coverageLimitWon:
      coverageLimitWon !== undefined && !Number.isNaN(coverageLimitWon)
        ? coverageLimitWon
        : undefined,
    certificateUrl,
    updatedAt: new Date().toISOString(),
  };

  return {
    insurance,
    hasInsurance: true,
    insuranceProvider: provider || undefined,
    insuranceLimit: insurance.coverageLimitWon,
  };
}

/** 시설 유형에 맞는 롯만 남기고 저장용으로 정규화 */
export function normalizeParkingLotsForFacility(
  lots: PartnerParkingLotForm[],
  facilityType: FacilityType
): PartnerParkingLotForm[] {
  return lots
    .filter((l) => {
      if (facilityType === 'indoor') return l.type === 'indoor';
      if (facilityType === 'outdoor') return l.type === 'outdoor';
      return true;
    })
    .map((l) => ({
      ...l,
      name: l.name.trim(),
      parkingAddress: l.parkingAddress.trim(),
      lat: l.lat.trim(),
      lng: l.lng.trim(),
    }))
    .filter((l) => l.name || l.parkingAddress || l.lat || l.lng);
}

export function validatePartnerParkingLots(input: PartnerProfileInput): string | null {
  const lots = normalizeParkingLotsForFacility(input.parkingLots, input.facilityType);
  const needIndoor = input.facilityType === 'indoor' || input.facilityType === 'mixed';
  const needOutdoor = input.facilityType === 'outdoor' || input.facilityType === 'mixed';

  if (needIndoor && !lots.some((l) => l.type === 'indoor')) {
    return '실내 주차장을 1곳 이상 등록해 주세요.';
  }
  if (needOutdoor && !lots.some((l) => l.type === 'outdoor')) {
    return '야외 주차장을 1곳 이상 등록해 주세요.';
  }

  for (const lot of lots) {
    const label = lot.name || (lot.type === 'indoor' ? '실내 주차장' : '야외 주차장');
    if (!lot.name) return `${label}: 주차장 이름을 입력해 주세요. (예: 실내1)`;
    if (!lot.lat || !lot.lng) return `${lot.name}: 지도에서 핀을 찍어 주세요.`;
  }

  const names = lots.map((l) => l.name);
  if (new Set(names).size !== names.length) {
    return '주차장 이름이 중복됩니다. 실내1·실외2처럼 서로 다르게 지어 주세요.';
  }

  return null;
}

function toCompanyParkingLots(lots: PartnerParkingLotForm[]): CompanyParkingLot[] {
  return lots.map((l) => {
    const lat = parseOptionalCoord(l.lat);
    const lng = parseOptionalCoord(l.lng);
    return {
      id: l.id || newLotId(),
      type: l.type,
      name: l.name.trim(),
      parkingAddress: l.parkingAddress.trim(),
      ...(lat != null ? { lat } : {}),
      ...(lng != null ? { lng } : {}),
    };
  });
}

/** B2B·입고 배정용 — 업체에 등록된 주차장 목록 (레거시 주소 필드 포함) */
export function listCompanyParkingLots(company?: Company | null): CompanyParkingLot[] {
  if (!company) return [];
  return toCompanyParkingLots(readLotsFromCompany(company));
}

/** 시설 유형·주소·보험 — B2C companies 문서와 동일 필드 */
export function applyPartnerProfileToCompany(
  company: Company,
  input: PartnerProfileInput
): Company {
  const facilityType = input.facilityType;
  const featureLabel =
    facilityType === 'indoor' ? '실내 정식' : facilityType === 'outdoor' ? '실외 야외' : '실내+실외';

  const formLots = normalizeParkingLotsForFacility(input.parkingLots, facilityType);
  const parkingLots = toCompanyParkingLots(formLots);
  const firstIndoor = parkingLots.find((l) => l.type === 'indoor');
  const firstOutdoor = parkingLots.find((l) => l.type === 'outdoor');
  const insuranceFields = buildInsurancePayload(input);

  const imageUrls = (input.imageUrls.length > 0
    ? input.imageUrls
    : input.imageUrl
      ? [input.imageUrl]
      : []
  )
    .map((u) => u.trim())
    .filter(Boolean);
  const image_url = imageUrls[0] || '';

  return {
    ...company,
    airport: normalizeAirportId(input.airport),
    terminals: airportTerminalCodes(input.airport),
    facilityType,
    is_indoor: facilityType === 'indoor' || facilityType === 'mixed',
    supports_indoor: facilityType === 'indoor' || facilityType === 'mixed',
    supports_outdoor: facilityType === 'outdoor' || facilityType === 'mixed',
    features: [featureLabel],
    image_url,
    image_urls: imageUrls,
    // 레거시 단일 필드 = 각 타입 첫 번째 롯 (B2C 하위호환)
    indoorParkingAddress: firstIndoor?.parkingAddress || undefined,
    outdoorParkingAddress: firstOutdoor?.parkingAddress || undefined,
    indoorParkingLat: firstIndoor?.lat,
    indoorParkingLng: firstIndoor?.lng,
    outdoorParkingLat: firstOutdoor?.lat,
    outdoorParkingLng: firstOutdoor?.lng,
    parkingLots: parkingLots.length > 0 ? parkingLots : undefined,
    insurance: insuranceFields.insurance,
    hasInsurance: insuranceFields.hasInsurance,
    insuranceProvider: insuranceFields.insuranceProvider,
    insuranceLimit: insuranceFields.insuranceLimit,
    sharesInsurance: true,
    sharesParkingLocation: parkingLots.length > 0,
    sharesPhotos: imageUrls.length > 0,
  };
}

export function profileExtrasForFirestore(input: PartnerProfileInput): Record<string, unknown> {
  const company = applyPartnerProfileToCompany(
    {
      id: '_',
      name: '',
      is_indoor: true,
      supports_indoor: true,
      supports_outdoor: true,
      base_price: 0,
      extra_day_price: 0,
      base_days: 1,
      rating: 0,
      reviews_count: 0,
      features: [],
      image_url: '',
      terminals: [],
    },
    input
  );

  return {
    airport: company.airport ?? 'ICN',
    terminals: company.terminals ?? [],
    facilityType: company.facilityType,
    is_indoor: company.is_indoor,
    supports_indoor: company.supports_indoor,
    supports_outdoor: company.supports_outdoor,
    features: company.features,
    image_url: company.image_url ?? '',
    image_urls: company.image_urls ?? [],
    indoorParkingAddress: company.indoorParkingAddress ?? '',
    outdoorParkingAddress: company.outdoorParkingAddress ?? '',
    indoorParkingLat: company.indoorParkingLat ?? null,
    indoorParkingLng: company.indoorParkingLng ?? null,
    outdoorParkingLat: company.outdoorParkingLat ?? null,
    outdoorParkingLng: company.outdoorParkingLng ?? null,
    parkingLots: company.parkingLots ?? [],
    insurance: company.insurance,
    hasInsurance: company.hasInsurance,
    insuranceProvider: company.insuranceProvider ?? '',
    insuranceLimit: company.insuranceLimit ?? null,
    sharesInsurance: true,
    sharesParkingLocation: (company.parkingLots?.length || 0) > 0,
    sharesPhotos:
      (company.image_urls?.length || 0) > 0 || Boolean(String(company.image_url || '').trim()),
  };
}
