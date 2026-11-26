import type { PaymentMethod, Reservation } from '../types';

/** 수납 완료로 간주하는 값 (미납 뱃지 미표시) */
const PAID_METHODS: PaymentMethod[] = ['cash', 'account', 'card', 'prepaid', 'paid', 'online', 'points'];

/** 에어픽에서 온라인으로 결제(또는 포인트 전액)한 예약 — 현장 수납 대상 아님 */
export function isOnlinePaid(res: Pick<Reservation, 'payment'>): boolean {
  const s = res.payment?.status;
  return s === 'paid' || s === 'partial_refunded' || s === 'refunded';
}

/** 선택 안 함·미납·unpaid → 카드에 「미납」 표시 */
export function isReservationUnpaid(
  res: Pick<Reservation, 'paymentMethod'> & Partial<Pick<Reservation, 'payment'>>
): boolean {
  if (isOnlinePaid(res)) return false;
  const m = res.paymentMethod;
  if (!m || m === 'unpaid') return true;
  return !PAID_METHODS.includes(m);
}

export function paymentChoiceToMethod(choice: 'unpaid' | 'paid'): PaymentMethod {
  return choice === 'paid' ? 'paid' : 'unpaid';
}

export function reservationToPaymentChoice(
  res: Pick<Reservation, 'paymentMethod'>
): 'unpaid' | 'paid' {
  return isReservationUnpaid(res) ? 'unpaid' : 'paid';
}
