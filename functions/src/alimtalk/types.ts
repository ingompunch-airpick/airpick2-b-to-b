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
  userName?: string;
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
}

export interface AlimtalkTemplateParams {
  고객명: string;
  차량번호: string;
  /** NHN 템플릿 버튼 URL `.../r/#{토큰}` 치환 */
  토큰?: string;
  접수증링크?: string;
  결제금액?: string;
  업체연락처?: string;
}
