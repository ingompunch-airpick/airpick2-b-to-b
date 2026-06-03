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
  | 'parkingRegister'
  | 'master_settings';
