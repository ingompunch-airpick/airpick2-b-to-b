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

/**
 * 출고 완료 후기 작성 딥링크 — MY에서 해당 예약 후기 모달 오픈
 * https://www.에어픽.kr/my?review={예약ID}
 */
export function buildReviewUrl(
  reservation: Pick<ReservationSnapshot, 'id'>,
  origin: string = RECEIPT_PUBLIC_ORIGIN
): string {
  const id = (reservation.id || '').trim();
  if (!id) return '';
  const base = origin.replace(/\/$/, '');
  // www 서브도메인 유지 (도메인 정책·카카오 버튼 URL)
  const withWww = base.includes('://www.')
    ? base
    : base.replace('://', '://www.');
  return `${withWww}/my?review=${encodeURIComponent(id)}`;
}
