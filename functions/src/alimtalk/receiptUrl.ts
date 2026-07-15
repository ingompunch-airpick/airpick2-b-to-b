import { RECEIPT_PUBLIC_ORIGIN, REVIEW_PUBLIC_ORIGIN } from './constants';
import type { ReservationSnapshot } from './types';

/** 알림톡 #{토큰} · `/r/{code}` 경로에 넣을 짧은 코드 (≤14) */
export function resolveReceiptPathCode(
  reservation: Pick<ReservationSnapshot, 'id' | 'receiptToken' | 'receiptCode' | 'receiptLinkCode'>
): string {
  const link = String(reservation.receiptLinkCode || '').trim();
  if (link && link.length <= 14) return link;

  const token = String(reservation.receiptToken || '').trim();
  if (token && token.length <= 14) return token;

  const code = String(reservation.receiptCode || '').trim();
  if (code && code.length <= 14) return code;

  // 구형 긴 토큰 — 호출측에서 receiptLinkCode 부여 후 재호출
  return '';
}

export function resolveReceiptLookupCode(
  reservation: Pick<ReservationSnapshot, 'id' | 'receiptToken' | 'receiptCode' | 'receiptLinkCode'>
): string {
  return (
    resolveReceiptPathCode(reservation) ||
    String(reservation.receiptToken || reservation.receiptCode || reservation.id || '').trim()
  );
}

/**
 * B2B Hosting(`airpick-reservation.web.app`) 접수증 URL.
 * VehicleReceiptPage: `/r/{token|linkCode|id|code}`
 */
export function buildReceiptUrl(
  reservation: Pick<ReservationSnapshot, 'id' | 'receiptToken' | 'receiptCode' | 'receiptLinkCode'>,
  origin: string = RECEIPT_PUBLIC_ORIGIN
): string {
  const base = origin.replace(/\/$/, '');
  const pathCode = resolveReceiptPathCode(reservation);
  if (pathCode) {
    return `${base}/r/${encodeURIComponent(pathCode)}`;
  }

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
