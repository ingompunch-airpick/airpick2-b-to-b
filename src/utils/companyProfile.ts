import type { Company, CompanyInsurance, FacilityType } from '../types';
import {
  buildLotParkingDistancesPayload,
  EMPTY_LOT_PARKING_DISTANCES_FORM,
  EMPTY_TERMINAL_PARKING_FORM,
  readLotParkingDistancesFormFromCompany,
  validateLotParkingDistancesForm,
  type LotParkingDistancesFormInput,
  type ParkingDistancesFormInput,
} from './parkingDistances';

export type {
  LotParkingDistancesFormInput,
  ParkingDistancesFormInput,
  TerminalParkingDistanceForm,
} from './parkingDistances';
export {
  EMPTY_LOT_PARKING_DISTANCES_FORM,
  EMPTY_PARKING_DISTANCES_FORM,
  validateLotParkingDistancesForm,
  validateParkingDistancesForm,
} from './parkingDistances';

export interface PartnerProfileInput {
  facilityType: FacilityType;
  indoorParkingAddress: string;
  outdoorParkingAddress: string;
  indoorParkingLat: string;
  indoorParkingLng: string;
  outdoorParkingLat: string;
  outdoorParkingLng: string;
  /** 대표 주차장 사진 URL (B2C image_url) */
  imageUrl: string;
  /** 주차장 사진 목록 (최대 5장, 첫 장 = 대표) */
  imageUrls: string[];
  insuranceEnrolled: boolean;
  insuranceProvider: string;
  insuranceProductName: string;
  insuranceCoverageLimitWon: string;
  parkingDistancesByLot: LotParkingDistancesFormInput;
}

export const DEFAULT_PARTNER_PROFILE: PartnerProfileInput = {
  facilityType: 'mixed',
  indoorParkingAddress: '',
  outdoorParkingAddress: '',
  indoorParkingLat: '',
  indoorParkingLng: '',
  outdoorParkingLat: '',
  outdoorParkingLng: '',
  imageUrl: '',
  imageUrls: [],
  insuranceEnrolled: false,
  insuranceProvider: '',
  insuranceProductName: '',
  insuranceCoverageLimitWon: '',
  parkingDistancesByLot: {
    indoor: {
      T1: { ...EMPTY_TERMINAL_PARKING_FORM },
      T2: { ...EMPTY_TERMINAL_PARKING_FORM },
    },
    outdoor: {
      T1: { ...EMPTY_TERMINAL_PARKING_FORM },
      T2: { ...EMPTY_TERMINAL_PARKING_FORM },
    },
  },
};

export function inferFacilityType(company?: Partial<Company>): FacilityType {
  if (company?.facilityType) return company.facilityType;
  if (company?.supports_indoor && company?.supports_outdoor) return 'mixed';
  if (company?.supports_outdoor && !company?.supports_indoor) return 'outdoor';
  if (company?.supports_indoor) return 'indoor';
  return company?.is_indoor === false ? 'outdoor' : 'indoor';
}

function readAddressFromParkingLots(
  company: Record<string, unknown>,
  type: 'indoor' | 'outdoor'
): string {
  const lots = Array.isArray(company.parkingLots) ? company.parkingLots : [];
  for (const lot of lots) {
    if (!lot || typeof lot !== 'object') continue;
    const row = lot as Record<string, unknown>;
    if (row.type !== type) continue;
    const addr =
      String(row.parkingAddress || row.customerAddress || row.parkingLotAddress || '').trim();
    if (addr) return addr;
  }
  return '';
}

export function readPartnerProfileFromCompany(company?: Company): PartnerProfileInput {
  if (!company) return { ...DEFAULT_PARTNER_PROFILE };

  const raw = company as Company & Record<string, unknown>;
  const facilityType = inferFacilityType(company);

  const indoorParkingAddress =
    String(raw.indoorParkingAddress || '').trim() ||
    readAddressFromParkingLots(raw, 'indoor');
  const outdoorParkingAddress =
    String(raw.outdoorParkingAddress || '').trim() ||
    readAddressFromParkingLots(raw, 'outdoor');

  let insuranceEnrolled = false;
  let insuranceProvider = '';
  let insuranceProductName = '';
  let insuranceCoverageLimitWon = '';

  if (raw.insurance && typeof raw.insurance === 'object') {
    const ins = raw.insurance as CompanyInsurance;
    insuranceEnrolled = !!ins.enrolled;
    insuranceProvider = ins.provider || '';
    insuranceProductName = ins.productName || '';
    insuranceCoverageLimitWon =
      ins.coverageLimitWon !== undefined && ins.coverageLimitWon !== null
        ? String(ins.coverageLimitWon)
        : '';
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
    galleryRaw.length > 0
      ? galleryRaw
      : primaryImage
        ? [primaryImage]
        : [];

  return {
    facilityType,
    indoorParkingAddress,
    outdoorParkingAddress,
    indoorParkingLat: coordToFormString(raw.indoorParkingLat),
    indoorParkingLng: coordToFormString(raw.indoorParkingLng),
    outdoorParkingLat: coordToFormString(raw.outdoorParkingLat),
    outdoorParkingLng: coordToFormString(raw.outdoorParkingLng),
    imageUrl: imageUrls[0] || primaryImage || '',
    imageUrls,
    insuranceEnrolled,
    insuranceProvider,
    insuranceProductName,
    insuranceCoverageLimitWon,
    parkingDistancesByLot: readLotParkingDistancesFormFromCompany(company),
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
  const productName = input.insuranceProductName.trim();
  const limitRaw = input.insuranceCoverageLimitWon.replace(/,/g, '').trim();
  const coverageLimitWon = limitRaw ? Number(limitRaw) : undefined;

  const insurance: CompanyInsurance = {
    enrolled: true,
    provider: provider || undefined,
    productName: productName || undefined,
    coverageLimitWon:
      coverageLimitWon !== undefined && !Number.isNaN(coverageLimitWon)
        ? coverageLimitWon
        : undefined,
    updatedAt: new Date().toISOString(),
  };

  return {
    insurance,
    hasInsurance: true,
    insuranceProvider: provider || undefined,
    insuranceLimit: insurance.coverageLimitWon,
  };
}


function coordToFormString(raw: unknown): string {
  if (raw == null || raw === '') return '';
  return String(raw);
}

function parseOptionalCoord(raw: string): number | undefined {
  const n = Number(String(raw || '').trim());
  if (!Number.isFinite(n)) return undefined;
  return n;
}

function buildParkingLots(input: PartnerProfileInput) {
  const lots: Array<{ type: 'indoor' | 'outdoor'; parkingAddress: string }> = [];
  const indoor = input.indoorParkingAddress.trim();
  const outdoor = input.outdoorParkingAddress.trim();

  if ((input.facilityType === 'indoor' || input.facilityType === 'mixed') && indoor) {
    lots.push({ type: 'indoor', parkingAddress: indoor });
  }
  if ((input.facilityType === 'outdoor' || input.facilityType === 'mixed') && outdoor) {
    lots.push({ type: 'outdoor', parkingAddress: outdoor });
  }
  return lots;
}

/** 시설 유형·주소·보험 — B2C companies 문서와 동일 필드 */
export function applyPartnerProfileToCompany(
  company: Company,
  input: PartnerProfileInput
): Company {
  const facilityType = input.facilityType;
  const featureLabel =
    facilityType === 'indoor' ? '실내 정식' : facilityType === 'outdoor' ? '실외 야외' : '실내+실외';

  const indoor = input.indoorParkingAddress.trim();
  const outdoor = input.outdoorParkingAddress.trim();
  const insuranceFields = buildInsurancePayload(input);
  const parkingLots = buildParkingLots(input);
  const lotDistances = buildLotParkingDistancesPayload(input.parkingDistancesByLot);
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
    facilityType,
    is_indoor: facilityType === 'indoor' || facilityType === 'mixed',
    supports_indoor: facilityType === 'indoor' || facilityType === 'mixed',
    supports_outdoor: facilityType === 'outdoor' || facilityType === 'mixed',
    features: [featureLabel],
    image_url,
    image_urls: imageUrls,
    indoorParkingAddress: indoor || undefined,
    outdoorParkingAddress: outdoor || undefined,
    indoorParkingLat: parseOptionalCoord(input.indoorParkingLat),
    indoorParkingLng: parseOptionalCoord(input.indoorParkingLng),
    outdoorParkingLat: parseOptionalCoord(input.outdoorParkingLat),
    outdoorParkingLng: parseOptionalCoord(input.outdoorParkingLng),
    parkingLots: parkingLots.length > 0 ? parkingLots : undefined,
    insurance: insuranceFields.insurance,
    hasInsurance: insuranceFields.hasInsurance,
    insuranceProvider: insuranceFields.insuranceProvider,
    insuranceLimit: insuranceFields.insuranceLimit,
    sharesInsurance: true,
    sharesParkingLocation: Boolean(
      indoor || outdoor || lotDistances.parkingDistancesIndoor || lotDistances.parkingDistancesOutdoor
      || parseOptionalCoord(input.indoorParkingLat) != null
      || parseOptionalCoord(input.outdoorParkingLat) != null
    ),
    sharesPhotos: imageUrls.length > 0,
    parkingDistances: lotDistances.parkingDistances ?? undefined,
    parkingDistancesIndoor: lotDistances.parkingDistancesIndoor ?? undefined,
    parkingDistancesOutdoor: lotDistances.parkingDistancesOutdoor ?? undefined,
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

  const lotDistances = buildLotParkingDistancesPayload(input.parkingDistancesByLot);
  const hasAddress = Boolean(
    (company.indoorParkingAddress || '').trim() || (company.outdoorParkingAddress || '').trim()
  );
  const hasPin = company.indoorParkingLat != null || company.outdoorParkingLat != null;
  const hasPhotos = (company.image_urls?.length || 0) > 0 || Boolean((company.image_url || '').trim());
  const hasDistances = Boolean(lotDistances.parkingDistancesIndoor || lotDistances.parkingDistancesOutdoor);

  return {
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
    // B2C MY · 비교 화면 연동 플래그
    sharesInsurance: true,
    sharesParkingLocation: hasAddress || hasPin || hasDistances,
    sharesPhotos: hasPhotos,
    ...lotDistances,
  };
}
