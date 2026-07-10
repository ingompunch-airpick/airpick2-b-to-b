import { RECEIPT_PUBLIC_ORIGIN } from './constants';
import type { ReservationSnapshot } from './types';

export function resolveReceiptLookupCode(
  reservation: Pick<ReservationSnapshot, 'id' | 'receiptToken' | 'receiptCode'>
): string {
  return (reservation.receiptToken || reservation.receiptCode || reservation.id || '').trim();
}

export function buildReceiptUrl(
  reservation: Pick<ReservationSnapshot, 'id' | 'receiptToken' | 'receiptCode'>,
  origin: string = RECEIPT_PUBLIC_ORIGIN
): string {
  const code = resolveReceiptLookupCode(reservation);
  if (!code) return '';
  return `${origin.replace(/\/$/, '')}/r/${encodeURIComponent(code)}`;
}
