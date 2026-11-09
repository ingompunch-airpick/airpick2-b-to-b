/** 입고·출고 시각을 터미널·시간으로 막는 규칙 */
export interface ScheduleBlockRule {
  id: string;
  leg: 'intake' | 'exit';
  /** 'all' 또는 터미널 코드 */
  terminal: string;
  date: string;
  startTime?: string;
  endTime?: string;
  memo?: string;
}

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
  /**
   * 본사가 손님 앱 노출을 승인했는지.
   * 없음·true = 노출(기존 업체 호환). false = 숨김.
   */
  listingApproved?: boolean;
  isOpen?: boolean;
  /** 하루 전체 마감. 실내·야외를 나눈 뒤에는 양쪽이 모두 막힌 날만 남긴다. */
  blockedDates?: string[];
  /** 실내만 마감인 날. 없으면 blockedDates가 양쪽 마감이다. */
  blockedDatesIndoor?: string[];
  /** 야외만 마감인 날. 없으면 blockedDates가 양쪽 마감이다. */
  blockedDatesOutdoor?: string[];
  /** B2C 고객 셀프취소 — 입고 N시간 전까지 허용 (미설정 시 B2C 기본값) */
  cancelCutoffHours?: number;
  /** true면 당일(입고일=오늘) 예약은 받지 않음. bookingLeadHours와 같이 켜지 않음 */
  sameDayBookingBlocked?: boolean;
  /**
   * 입고 시각 기준 N시간 전 마감 (0–24). 0이면 직전에도 받음.
   * sameDayBookingBlocked가 켜져 있으면 이 값은 쓰지 않음.
   */
  bookingLeadHours?: number;
  /**
   * 시간당 입고 대수 한도 (기본 OFF).
   * 켜면 입고 시각(departureTime) 기준 같은 시간대에 maxCarsPerHour대까지만 접수.
   * 홈페이지·에어픽·현장 접수 모두 같은 reservations 카운트를 씀.
   */
  hourlyCapEnabled?: boolean;
  /** 시간당 최대 대수 (1–99). hourlyCapEnabled일 때만 적용 */
  maxCarsPerHour?: number;
  /**
   * 동시 주차 대수 한도 (기본 OFF).
   * 켜면 입고일~출고일 구간에 maxParkedCars대를 넘지 못하게 함 (만차).
   * 출고완료·취소는 점유에서 제외 → 출고 후 자동으로 슬롯 회복.
   */
  parkingCapEnabled?: boolean;
  /** 동시 최대 주차 대수 (1–999). 실내·야외를 나누기 전에는 합산 한도다. */
  maxParkedCars?: number;
  /** 실내 동시 주차 대수. 0이면 이 칸은 한도 없음. */
  maxParkedCarsIndoor?: number;
  /** 야외 동시 주차 대수. 0이면 이 칸은 한도 없음. */
  maxParkedCarsOutdoor?: number;
  /**
   * 입고일 하루 대수 한도 (기본 OFF).
   * 시간당·동시 주차와 별개. 취소는 제외하고, 아직 들어오지 않은 예약도 센다.
   */
  dailyIntakeCapEnabled?: boolean;
  /** 입고일 기준 하루 최대 대수 (1–999) */
  maxCarsPerDay?: number;
  /** 입고·출고, 터미널, 시간 구간별 예약 거절 */
  scheduleBlocks?: ScheduleBlockRule[];
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
  /** 커브사이드 추가요금 (T1) — 0=무료, 필드 없음=T1 커브 미제공. 레거시 키명 valetFee */
  valetFeeT1?: number;
  /** 커브사이드 추가요금 (T2) */
  valetFeeT2?: number;
  /** 드랍오프 추가요금 (T1) — 필드 없음=0원 */
  dropFeeT1?: number;
  /** 드랍오프 추가요금 (T2) */
  dropFeeT2?: number;
  /** 밋앤그릿 추가요금 (T1) — 필드 없음=미제공 */
  meetGreetFeeT1?: number;
  /** 밋앤그릿 추가요금 (T2) */
  meetGreetFeeT2?: number;
  /** 손님 앱 비교 단위. 없으면 위 요금·시설 필드로 valet 상품을 만들어 쓴다 */
  parkingProducts?: ParkingProduct[];
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
  parkingLots?: CompanyParkingLot[];
  /** 사업자등록증·주차장 계약서 등 내부 심사용 서류 */
  verificationDocuments?: CompanyVerificationDocuments;
  insurance?: CompanyInsurance;
  hasInsurance?: boolean;
  insuranceProvider?: string;
  insuranceLimit?: number;
  sharesInsurance?: boolean;
  /** B2C MY 주차 위치 노출 */
  sharesParkingLocation?: boolean;
  /** B2C MY 주차장 사진 노출 */
  sharesPhotos?: boolean;
  /** @deprecated 레거시 단일 거리 — 거리순 제거 후 미사용 */
  parkingDistances?: ParkingDistances;
  /** @deprecated 실내 대표 거리 — 미사용 */
  parkingDistancesIndoor?: ParkingDistances;
  /** @deprecated 야외 대표 거리 — 미사용 */
  parkingDistancesOutdoor?: ParkingDistances;
  /** 대표 업체 — B2B 통합 로그인·예약 통합 관리 */
  isOperatorPrimary?: boolean;
  /** 하위 업체 — B2C만, parentCompanyId로 대표에 연결 */
  parentCompanyId?: string;
  /** 본사 계정 가동 상태 (정지 시 파트너 로그인 차단) */
  status?: 'active' | 'suspended';
  /** 본사 업체 선택·가맹 목록 표시 순서 (작을수록 위) */
  hqListOrder?: number;
  /**
   * 입점업체 마케팅 홈 (airpick-partner-homepage).
   * 요금·예약제한은 companies 루트 필드가 정본 — 여기는 소개/FAQ 등.
   */
  partnerHomepage?: {
    enabled: boolean;
    updatedAt: string;
    updatedBy?: string;
    config: Record<string, unknown>;
  };
  /** 홈 방문 측정. 업체마다 쓰는 광고·플레이스만 둔다. */
  homepageVisitChannels?: { key: string; label: string }[];
  /**
   * 업체 알림톡 (NCP). 홈페이지·현장 예약용.
   * 에어픽 B2C 공용 템플릿과 별개 — channel·templates.reserve.code 필요.
   */
  alimtalk?: {
    enabled?: boolean;
    channel?: { plusFriendId?: string; senderKey?: string };
    sources?: string[];
    events?: string[];
    templates?: Record<
      string,
      { code?: string; body?: string; buttonName?: string; title?: string }
    >;
  };
}

export type ParkingProductType = 'valet' | 'walk' | 'shuttle' | 'official';

/** 입고(인도) 방식 — 상품·가는 길·추가요금 분기 */
export type HandoffType = 'curb' | 'meet_greet' | 'drop';

/**
 * companies/{id}.parkingProducts[] — 손님 앱 비교 단위.
 * 모르는 값은 필드를 비운다. 손님 화면은 필드가 있을 때만 그 줄을 보여 준다.
 * 요금은 업체 필드(lot별 기본요금·야간·valetFee·dropFee·meetGreetFee)를 쓴다.
 * Firestore 저장 시 curb ↔ 레거시 meet 도 같이 써서 B2C 구버전과 호환한다.
 */
export interface ParkingProduct {
  id: string;
  type: ParkingProductType;
  lot: 'indoor' | 'outdoor';
  terminal: 'T1' | 'T2' | 'both';
  /** 커브사이드 — 출국장 대면 인계 */
  curb: boolean;
  /** 밋앤그릿 — 합동청사역 등 지정 픽업 */
  meetGreet: boolean;
  /** 드랍오프 — 단기주차장 비대면 */
  drop: boolean;
  hidden?: true;
  transferNote?: string;
  transferMinutes?: number;
  /** leave=키 맡김, keep=손님이 키 보관 */
  keyHandover?: 'leave' | 'keep';
  evCharging?: 'yes' | 'no';
  hours?: { allDay: true } | { open: string; close: string };
  /** 커브사이드 인계 가능 시간. 없으면 손님 앱은 24시간으로 본다 */
  curbHours?: { allDay: true } | { open: string; close: string };
  updatedAt?: string;
}

/** 업체 주차장 (실내1·실외2 … 여러 개) */
export interface CompanyParkingLot {
  id: string;
  type: 'indoor' | 'outdoor';
  /** 표시 이름 — 예: 실내1, 실외2 */
  name: string;
  parkingAddress: string;
  lat?: number;
  lng?: number;
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
  /** 마스터가 적은 상품명 그대로 */
  productName?: string;
  /**
   * 보상 한도 안내 한 줄 (내부용). 예: 대인 1억 · 대물 1억 · 자차 5천만
   * 예전 단일 숫자 필드는 coverageLimitWon 으로 남을 수 있음.
   */
  coverageLimitText?: string;
  /** @deprecated coverageLimitText 사용. 예전 단일 숫자 한도(지울 때 null) */
  coverageLimitWon?: number | null;
  /** 보험증권 이미지 URL (B2C 손님 상세에서 확인) */
  certificateUrl?: string;
  updatedAt?: string;
}

/** 입점 심사·내부 확인용 증명서류 (사업자등록증·주차장 계약서) */
export interface CompanyVerificationDocuments {
  businessRegistrationUrl?: string;
  parkingContractUrl?: string;
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
  /** 카카오 회원 예약. 포인트는 이 값이 kakao일 때만 쌓인다 */
  memberProvider?: 'kakao';
  /** 한번 붙인 주인은 전화번호가 바뀌어도 옮기지 않는다 */
  userIdLocked?: boolean;
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
  /** B2C 정가(가입 할인·포인트 전). 수수료 기준. 없으면 totalPrice(+쿠폰)로 추정 */
  listPrice?: number;
  /** 카카오 가입 첫 예약 할인(원). 에어픽 수수료에서 차감 */
  signupCouponWon?: number;
  /** 접수 때 사용한 포인트. totalPrice 는 이 금액이 빠진 현장 받을 돈 */
  pointSpentWon?: number;
  /**
   * true면 업체가 최종 금액을 수동 확정한 상태.
   * 일정·실내외 변경 시 자동 요금 재계산으로 덮어쓰지 않음.
   */
  priceManual?: boolean;
  status: ReservationStatus;
  createdAt: string;
  updatedAt?: string;
  
  // Custom driver-focused fields
  paymentMethod?: PaymentMethod;
  paymentAmount?: number;
  paymentNotes?: string;
  scratchPhotos?: ScratchPhotoSet;
  parkingSpace?: string; // e.g. "LG-B2", "상주A" — 구역/자리 (선택)
  /** 입고 완료 후 배정된 companies.parkingLots[].id — B2C MY 위치 연동 */
  parkingLotId?: string;
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
  /** Firestore 문서 자동 삭제 예정 시각 (ISO) — 출차 후 40일, 해당 달 합계 스냅샷 이후 */
  dataPurgeAt?: string;
  /** Storage 사진 자동 삭제 예정 시각 (ISO) — 출차 후 30일 */
  storagePurgeAt?: string;

  /** 인천공항 입국편 연착·도착 추적 (Functions checkIncheonFlightDelays) */
  flightTracking?: {
    arrivalFlight?: string;
    scheduleHhmm?: string;
    estimatedHhmm?: string;
    remark?: string;
    delayMinutes?: number;
    lastCheckedAt?: string;
    landedAt?: string;
    autoRequestOutAt?: string;
    lastNotifiedAt?: string;
    lastNotifiedFingerprint?: string;
  };

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
  /** 입고완료(completed_in) 처리 담당 — 손님 앱 「내 예약」 표시용 */
  checkedInBy?: string;
  checkedInAt?: string;
  /** 출고완료(completed_out) 처리 담당 — 손님 앱 「내 예약」 표시용 */
  checkedOutBy?: string;
  checkedOutAt?: string;

  /** 홈페이지·B2C 예약 연동 필드 */
  departureAirline?: string;
  departureFlight?: string;
  arrivalAirline?: string;
  arrivalFlight?: string;
  /** @deprecated arrivalFlight 레거시 별칭 — 저장 시 함께 기록 */
  inboundFlight?: string;
  /** 와와 홈페이지 레거시 — normalize 시 표준 필드로 매핑 */
  entryAirline?: string;
  entryFlight?: string;
  exitAirline?: string;
  exitFlight?: string;
  destination?: string;
  customerNotes?: string;
  userRequest?: string;
  reservationPassword?: string;

  /**
   * 영업 유입(명함 QR 등). createdBy(채널)와 별개.
   * 일반 홈/현장/B2C 예약에는 두지 않음.
   */
  acquisitionSource?: string;
  acquisitionMedium?: string;
  acquisitionCampaign?: string;
  acquisitionClickId?: string;

  /**
   * B2C(에어픽.kr) 제휴·추천 코드.
   * affiliates/{code} 와 대응. 업체 홈 명함 QR(acquisition*) 과 별개.
   */
  affiliateCode?: string;
  /** 예약 시점 스냅샷 — 이후 제휴 금액이 바뀌어도 이 건 할인·페이백은 유지 */
  affiliateCustomerDiscountWon?: number;
  affiliateReferrerCreditWon?: number;

  /**
   * 현장 관리자가 막힌 출고일·시간·터미널을 확인하고 넣은 건.
   * 홈페이지·에어픽 예약에서는 서버가 무시한다.
   */
  scheduleBlockOverride?: boolean;
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
  | 'master_settings'
  /** 관리자 · 입출차 배차표 (인쇄/CSV) */
  | 'dispatch_board'
  /** 관리자 · 예약 목록 (필터 표) */
  | 'reservation_ledger'
  /** @deprecated 「② 주차 업체」로 통합 — master_settings 로 리다이렉트 */
  | 'hq_partner_board'
  /** 본사 · 후기 숨김/삭제 */
  | 'hq_reviews'
  /** 본사 · 고객 전화 조회 */
  | 'hq_customers'
  /** 본사 전용 · 명함 QR 유입 성과 */
  | 'acquisition_funnel'
  /** 본사 전용 · B2C 제휴(어필리에이트) */
  | 'affiliate_admin';
