import { RECEIPT_PUBLIC_ORIGIN } from './constants';
import type { ReservationSnapshot } from './types';

export function resolveReceiptLookupCode(
  reservation: Pick<ReservationSnapshot, 'id' | 'receiptToken' | 'receiptCode'>
): string {
  return (reservation.receiptToken || reservation.receiptCode || reservation.id || '').trim();
}

/**
 * 에어픽.kr(B2C Hosting) 접수증 URL.
 * B2C는 `/r/{reservationId}?t={receiptToken}` 형식만 정상 조회한다.
 */
export function buildReceiptUrl(
  reservation: Pick<ReservationSnapshot, 'id' | 'receiptToken' | 'receiptCode'>,
  origin: string = RECEIPT_PUBLIC_ORIGIN
): string {
  const base = origin.replace(/\/$/, '');
  const id = (reservation.id || '').trim();
  const token = (reservation.receiptToken || '').trim();

  if (id && token) {
    return `${base}/r/${encodeURIComponent(id)}?t=${encodeURIComponent(token)}`;
  }

  // 토큰 없는 구형/현장 건: B2B Hosting(`/r/{code}`)과 동일 폴백
  const code = resolveReceiptLookupCode(reservation);
  if (!code) return '';
  return `${base}/r/${encodeURIComponent(code)}`;
}
