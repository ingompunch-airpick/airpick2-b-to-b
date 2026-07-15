import { RECEIPT_PUBLIC_ORIGIN, REVIEW_PUBLIC_ORIGIN } from './constants';
import type { ReservationSnapshot } from './types';

export function resolveReceiptLookupCode(
  reservation: Pick<ReservationSnapshot, 'id' | 'receiptToken' | 'receiptCode'>
): string {
  return String(
    reservation.receiptToken || reservation.receiptCode || reservation.id || ''
  ).trim();
}

/**
 * B2B Hosting(`airpick-reservation.web.app`) 접수증 URL.
 * VehicleReceiptPage: `/r/{token|id|code}`
 */
export function buildReceiptUrl(
  reservation: Pick<ReservationSnapshot, 'id' | 'receiptToken' | 'receiptCode'>,
  origin: string = RECEIPT_PUBLIC_ORIGIN
): string {
  const base = origin.replace(/\/$/, '');
  const token = String(reservation.receiptToken || '').trim();
  if (token) {
    return `${base}/r/${encodeURIComponent(token)}`;
  }

  const id = String(reservation.id || '').trim();
  const code = String(reservation.receiptCode || '').trim();
  const pathId = id || code;
  if (!pathId) return '';
  return `${base}/r/${encodeURIComponent(pathId)}`;
}

/** 출고 후기 — B2C 에어픽.kr `/my?review=` */
export function buildReviewUrl(
  reservation: Pick<ReservationSnapshot, 'id'>,
  origin: string = REVIEW_PUBLIC_ORIGIN
): string {
  const id = String(reservation.id || '').trim();
  if (!id) return '';
  const base = origin.replace(/\/$/, '');
  return `${base}/my?review=${encodeURIComponent(id)}`;
}
