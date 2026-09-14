export type ReservationStatus =
  | 'pending'
  | 'pending_in'
  | 'request_out'
  | 'completed_in'
  | 'completed_out'
  | 'cancelled';

export interface AlimtalkSentRecord {
  sentAt: string;
  templateCode: string;
  recipientNo: string;
  requestId?: string;
  error?: string;
}

export interface ReservationSnapshot {
  id: string;
  companyId?: string;
  companyName?: string;
  userName?: string;
  carModel?: string;
  carNumber?: string;
  phone?: string;
  totalPrice?: number;
  paymentAmount?: number;
  status?: ReservationStatus;
  createdBy?: string;
  receiptToken?: string;
  receiptCode?: string;
  /** 알림톡 경로용 짧 은 코드 (구형 긴 receiptToken 대비) */
  receiptLinkCode?: string;
  alimtalkSent?: Partial<Record<'reserve' | 'checkin' | 'checkout', AlimtalkSentRecord>>;

  /** 업체 상세 템플릿용 — 일정·항공편·주차 위치 */
  departureDate?: string;
  departureTime?: string;
  departureTerminal?: string;
  arrivalDate?: string;
  arrivalTime?: string;
  arrivalTerminal?: string;
  departureAirline?: string;
  departureFlight?: string;
  arrivalAirline?: string;
  arrivalFlight?: string;
  /** 와와 홈페이지 레거시 별칭 */
  entryAirline?: string;
  entryFlight?: string;
  exitAirline?: string;
  exitFlight?: string;
  destination?: string;
  isIndoor?: boolean;
}

/**
 * 인덱스 시그니처를 둔 이유: 업체별 템플릿은 본문이 Firestore 에 있어
 * 어떤 변수명을 쓸지 코드가 미리 알 수 없다. 공통 변수만 이름을 고정한다.
 */
export interface AlimtalkTemplateParams {
  [key: string]: string | undefined;
  고객명: string;
  차량번호: string;
  /** NHN 템플릿 버튼 URL `.../r/#{토큰}` 치환 */
  토큰?: string;
  접수증링크?: string;
  결제금액?: string;
  업체연락처?: string;
  /** 출고 후기 버튼 `.../my?review=#{예약ID}` */
  예약ID?: string;
}
