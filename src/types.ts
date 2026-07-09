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
  image_url: string;
  terminals: string[];
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
  /** B2B 마스터 — 시설 유형 */
  facilityType?: 'indoor' | 'outdoor' | 'mixed';
  /** B2C 손님 MY · 실내 주차장 도로명 주소 */
  indoorParkingAddress?: string;
  /** B2C 손님 MY · 실외 주차장 도로명 주소 */
  outdoorParkingAddress?: string;
  parkingLots?: Array<{ type: 'indoor' | 'outdoor'; parkingAddress: string }>;
  insurance?: CompanyInsurance;
  hasInsurance?: boolean;
  insuranceProvider?: string;
  insuranceLimit?: number;
  sharesInsurance?: boolean;
  /** B2C 거리순 정렬 — 터미널별 주차장 거리 (companies/{id} 단일 소스) */
  parkingDistances?: ParkingDistances;
  /** 대표 업체 — B2B 통합 로그인·예약 통합 관리 */
  isOperatorPrimary?: boolean;
  /** 하위 업체 — B2C만, parentCompanyId로 대표에 연결 */
  parentCompanyId?: string;
}

/** 터미널(T1/T2)별 주차장 ↔ 공항 거리 */
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
  departureTerminal: 'T1' | 'T2';
  arrivalDate: string;
  arrivalTime: string;
  arrivalTerminal: 'T1' | 'T2';
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
