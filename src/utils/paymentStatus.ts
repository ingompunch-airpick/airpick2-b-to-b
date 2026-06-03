import type { PaymentMethod, Reservation } from '../types';

/** 수납 완료로 간주하는 값 (미납 뱃지 미표시) */
const PAID_METHODS: PaymentMethod[] = ['cash', 'account', 'card', 'prepaid', 'paid'];

/** 선택 안 함·미납·unpaid → 카드에 「미납」 표시 */
export function isReservationUnpaid(res: Pick<Reservation, 'paymentMethod'>): boolean {
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
