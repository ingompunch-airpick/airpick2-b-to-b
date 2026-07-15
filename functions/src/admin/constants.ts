/** firestore.rules `isPlatformAdmin()` · 프론트 PLATFORM_ADMIN_EMAILS 와 동일 유지 */
export const PLATFORM_ADMIN_EMAILS = [
  'drive5746@gmail.com',
  'ingompunch@gmail.com',
] as const;

export const COMPANY_ID_RE = /^[a-z0-9_]{1,64}$/;

/** 삭제 금지 — 플랫폼 본사 문서 */
export const PROTECTED_COMPANY_IDS = ['airpick'] as const;

/** 클라이언트가 Callable update로 보낼 수 있는 companies 필드 */
export const ALLOWED_COMPANY_PATCH_KEYS = [
  'name',
  'phone',
  'representative',
  'password',
  'settlementMemo',
  'status',
  'isOperatorPrimary',
  'parentCompanyId',
  'airport',
  'facilityType',
  'is_indoor',
  'supports_indoor',
  'supports_outdoor',
  'features',
  'image_url',
  'image_urls',
  'indoorParkingAddress',
  'outdoorParkingAddress',
  'indoorParkingLat',
  'indoorParkingLng',
  'outdoorParkingLat',
  'outdoorParkingLng',
  'parkingLots',
  'insurance',
  'hasInsurance',
  'insuranceProvider',
  'insuranceLimit',
  'sharesInsurance',
  'sharesParkingLocation',
  'sharesPhotos',
  'parkingDistances',
  'parkingDistancesIndoor',
  'parkingDistancesOutdoor',
  'pickupLocation',
] as const;

/** 신규 생성 시 추가로 허용 (요금·운영 기본값 등) */
export const ALLOWED_COMPANY_CREATE_EXTRA_KEYS = [
  'id',
  'base_price',
  'extra_day_price',
  'base_days',
  'rating',
  'reviews_count',
  'terminals',
  'isOpen',
  'outdoorBasePrice',
  'outdoorBaseDays',
  'outdoorExtraPrice',
  'indoorBasePrice',
  'indoorBaseDays',
  'indoorExtraPrice',
  'surchargeStartTime',
  'surchargeEndTime',
  'surchargePrice',
  't2Surcharge',
  'peakStartTime',
  'peakEndTime',
  'peakSurcharge',
  'blockedDates',
] as const;
