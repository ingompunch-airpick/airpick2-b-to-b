export interface Company {
  id: string;
  name: string;
  is_indoor: boolean;
  supports_indoor: boolean;
  supports_outdoor: boolean;
  base_price: number;
  extra_day_price: number;
  base_days: number;
  rating: number;
  reviews_count: number;
  features: string[];
  /** B2C 목록·상세 대표 주차장 사진 */
  image_url: string;
  /** B2C 갤러리용 추가 사진 (첫 장은 image_url과 동일하게 유지) */
  image_urls?: string[];
  terminals: string[];
  /**
   * 운영 공항. 미설정 시 ICN으로 취급.
   * 1차: ICN만 활성. 업체당 공항 1개.
   */
  airport?: 'ICN' | 'GMP';
  booking_url?: string;
  distance_score?: number;
  is_recommended?: boolean;
  phone?: string;
  representative?: string;
  isOpen?: boolean;
  blockedDates?: string[];
  /** B2C 고객 셀프취소 — 입고 N시간 전까지 허용 (미설정 시 B2C 기본값) */
  cancelCutoffHours?: number;
  /** true면 당일(입고일=오늘) 예약 B2C에서 차단 */
  sameDayBookingBlocked?: boolean;
  /**
   * 시간당 입고 대수 한도 (기본 OFF).
   * 켜면 입고 시각(departureTime) 기준 같은 시간대에 maxCarsPerHour대까지만 접수.
   * 홈페이지·에어픽·현장 접수 모두 같은 reservations 카운트를 씀.
   */
  hourlyCapEnabled?: boolean;
  /** 시간당 최대 대수 (1–99). hourlyCapEnabled일 때만 적용 */
  maxCarsPerHour?: number;
  // Matrix pricing settings
  outdoorBasePrice?: number;
  outdoorBaseDays?: number;
  outdoorExtraPrice?: number;
  indoorBasePrice?: number;
  indoorBaseDays?: number;
  indoorExtraPrice?: number;
  surchargeStartTime?: string;
  surchargeEndTime?: string;
  surchargePrice?: number;
  t2Surcharge?: number;
  peakStartTime?: string;
  peakEndTime?: string;
  peakSurcharge?: number;
  /** 대면 입고 추가요금 (T1) — 0=무료 대면, 필드 없음=T1 대면 미제공 */
  valetFeeT1?: number;
  /** 대면 입고 추가요금 (T2) — 0=무료 대면, 필드 없음=T2 대면 미제공 */
  valetFeeT2?: number;
  /**
   * 고객 만남 픽업지 안내 (선택).
   * 예: T1 3번 출구, 실외 단기주차장 앞. 비우면 접수증에 연락 안내 표시.
   */
  pickupLocation?: string;
  /** B2B 마스터 — 시설 유형 */
  facilityType?: 'indoor' | 'outdoor' | 'mixed';
  /** B2C 손님 MY · 실내 주차장 도로명 주소 */
  indoorParkingAddress?: string;
  /** B2C 손님 MY · 실외 주차장 도로명 주소 */
  outdoorParkingAddress?: string;
  /** 실내 주차장 핀 좌표 */
  indoorParkingLat?: number;
  indoorParkingLng?: number;
  /** 야외 주차장 핀 좌표 */
  outdoorParkingLat?: number;
  outdoorParkingLng?: number;
  parkingLots?: Array<{ type: 'indoor' | 'outdoor'; parkingAddress: string }>;
  insurance?: CompanyInsurance;
  hasInsurance?: boolean;
  insuranceProvider?: string;
  insuranceLimit?: number;
  sharesInsurance?: boolean;
  /** B2C MY 주차 위치 노출 */
  sharesParkingLocation?: boolean;
  /** B2C MY 주차장 사진 노출 */
  sharesPhotos?: boolean;
  /** @deprecated 레거시 단일 거리 — parkingDistancesIndoor/Outdoor 우선 */
  parkingDistances?: ParkingDistances;
  /** 실내 대표 주차장 → 터미널별 거리 */
  parkingDistancesIndoor?: ParkingDistances;
  /** 야외 대표 주차장 → 터미널별 거리 */
  parkingDistancesOutdoor?: ParkingDistances;
  /** 대표 업체 — B2B 통합 로그인·예약 통합 관리 */
  isOperatorPrimary?: boolean;
  /** 하위 업체 — B2C만, parentCompanyId로 대표에 연결 */
  parentCompanyId?: string;
}

/** 터미널별 주차장 ↔ 공항 거리 (키: T1/T2 또는 DOM/INT 등) */
export interface ParkingDistanceEntry {
  distanceKm: number;
  driveMinutes?: number;
  parkingLotName?: string;
  parkingLotAddress?: string;
  effectiveFrom?: string;
  updatedAt?: string;
}

export interface ParkingDistances {
  T1?: ParkingDistanceEntry;
  T2?: ParkingDistanceEntry;
  [terminalCode: string]: ParkingDistanceEntry | undefined;
}

export interface CompanyInsurance {
  enrolled: boolean;
  provider?: string;
  productName?: string;
  coverageLimitWon?: number;
  updatedAt?: string;
}

export interface CompanyInfo {
  id: string;
  name: string;
  region: string;
  phone: string;
  logo: string;
  isIndoor?: boolean;
  facilityType?: 'indoor' | 'outdoor' | 'mixed';
  ratePolicy?: string;
}

export type FacilityType = 'indoor' | 'outdoor' | 'mixed';

export interface Employee {
  id: string;
  name: string;
  loginId: string;
  password?: string;
  role?: 'admin' | 'driver';
}

export interface PartnerCompany {
  companyId: string;
  password: string;
  name: string;
  representative: string;
  phone: string;
  settlementMemo: string;
  status: 'active' | 'suspended';
  employees?: Employee[];
}

export type ReservationStatus = 
  | 'pending'       // 입고예정 (Pending)
  | 'pending_in'    // 입고요청 (Pick requested at T1/T2)
  | 'request_out'   // 출고요청 (Release requested by client)
  | 'completed_in'  // 주차완료 (Currently in garage / Pending Release)
  | 'completed_out' // 출차완료 (Returned to client / Completed)
  | 'cancelled';    // 취소

export type PaymentMethod = 'cash' | 'account' | 'card' | 'prepaid' | 'unpaid' | 'paid';

export interface ScratchPhotoSet {
  /** 스크래치·손상 사진 URL 목록 (장수 제한 없음) */
  urls?: string[];
  /** 예전 4면 형식 (읽기 호환용) */
  front?: string;
  rear?: string;
  left?: string;
  right?: string;
  synced: boolean;
  updatedAt?: string;
}

export interface Reservation {
  id?: string;
  userId: string;
  companyId: string;
  companyName: string;
  userName: string;
  carModel: string;
  carNumber: string;
  phone: string;
  departureDate: string;
  departureTime: string;
  /** 터미널 코드 — ICN: T1/T2, GMP: DOM/INT. 미설정·레거시는 정규화에서 보정 */
  departureTerminal: string;
  arrivalDate: string;
  arrivalTime: string;
  arrivalTerminal: string;
  /** 예약 시점 공항 (업체 airport 스탬프). 미설정 시 ICN */
  airport?: 'ICN' | 'GMP';
  totalPrice: number;
  status: ReservationStatus;
  createdAt: string;
  updatedAt?: string;
  
  // Custom driver-focused fields
  paymentMethod?: PaymentMethod;
  paymentAmount?: number;
  paymentNotes?: string;
  scratchPhotos?: ScratchPhotoSet;
  parkingSpace?: string; // e.g. "LG-B2", "상주A"
  receiptCode?: string; // e.g. "1770207629_BEIAKF"
  /** 홈페이지 예약 공개 접수증 조회용 토큰 */
  receiptToken?: string;
  /**
   * 알림톡 버튼용 짧은 코드(≤14). 구형 32자 receiptToken 예약에만 부여.
   * 신규 예약은 receiptToken 자체가 12자라 불필요.
   */
  receiptLinkCode?: string;
  
  // Real completion tracking fields
  actualParkingTime?: string;
  actualExitTime?: string;
  /** 출차 확정 시각 (ISO) — 보관 기간 계산 기준 */
  completedOutAt?: string;
  /** Firestore 문서 자동 삭제 예정 시각 (ISO) */
  dataPurgeAt?: string;
  /** Storage 사진 자동 삭제 예정 시각 (ISO) */
  storagePurgeAt?: string;
  
  // Custom newly requested intake fields
  isIndoor?: boolean;
  startDate?: string;
  endDate?: string;
  images?: string[];
  
  // Custom admin editing fields
  basePrice?: number;
  valetPrice?: number;
  overtimePrice?: number;
  discountPrice?: number;
  adminMemo?: string;

  // Cancellation and restore tracking fields
  cancelReason?: string;
  cancelledAt?: string;

  // Process operator tracking
  createdBy?: string;
  updatedBy?: string;

  /** 홈페이지·B2C 예약 연동 필드 */
  departureAirline?: string;
  departureFlight?: string;
  arrivalAirline?: string;
  arrivalFlight?: string;
  /** 와와 홈페이지 레거시 — normalize 시 표준 필드로 매핑 */
  entryAirline?: string;
  entryFlight?: string;
  exitAirline?: string;
  exitFlight?: string;
  destination?: string;
  customerNotes?: string;
  userRequest?: string;
  reservationPassword?: string;
}

export type AppView = 
  | 'timeline' 
  | 'search_reception'
  | 'statistics'
  | 'payment_change'
  | 'scratch_images'
  | 'service_history'
  | 'parking_departure'
  | 'cancelled_list'
  | 'master_settings';
