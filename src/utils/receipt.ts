import type { Reservation } from '../types';

/** 공개 접수증·보관증 링크 기본 도메인 (퓨니코드 — 알림톡·SMS에 안전) */
export const RECEIPT_PUBLIC_ORIGIN = 'https://xn--oh5b1bw17d.kr';

const RECEIPT_PATH_RE = /\/r\/([^/?#]+)/;

/** URL 경로에서 접수증 코드 추출 (`/r/{code}`) */
export function parseReceiptCodeFromPath(pathname: string): string | null {
  const match = pathname.match(RECEIPT_PATH_RE);
  if (!match?.[1]) return null;
  try {
    return decodeURIComponent(match[1]).trim();
  } catch {
    return match[1].trim();
  }
}

export function resolveReceiptLookupCode(
  reservation: Pick<Reservation, 'id' | 'receiptCode' | 'receiptToken'>
): string {
  return (reservation.receiptToken || reservation.receiptCode || reservation.id || '').trim();
}

/** B2B Hosting(`airpick-reservation`)용 — `/r/{token|code|id}` */
export function buildReceiptPath(
  reservation: Pick<Reservation, 'id' | 'receiptCode' | 'receiptToken'>
): string {
  const code = resolveReceiptLookupCode(reservation);
  return code ? `/r/${encodeURIComponent(code)}` : '';
}

/**
 * 공개 도메인(에어픽.kr = B2C Hosting)용.
 * B2C 접수증: `/r/{reservationId}?t={receiptToken}`
 */
export function buildReceiptUrl(
  reservation: Pick<Reservation, 'id' | 'receiptCode' | 'receiptToken'>,
  origin: string = RECEIPT_PUBLIC_ORIGIN
): string {
  const base = origin.replace(/\/$/, '');
  const id = (reservation.id || '').trim();
  const token = (reservation.receiptToken || '').trim();

  if (id && token) {
    return `${base}/r/${encodeURIComponent(id)}?t=${encodeURIComponent(token)}`;
  }

  const path = buildReceiptPath(reservation);
  return path ? `${base}${path}` : '';
}

/** `2026-07-08` + `11:30` → `2026년 07월 08일 11시 30분` */
export function formatKoreanDateTime(dateStr?: string, timeStr?: string): string {
  const date = (dateStr || '').trim();
  const time = (timeStr || '').trim();
  if (!date) return '-';

  const normalized = date.includes('T') ? date.split('T')[0] : date.split(' ')[0];
  const parts = normalized.replace(/[\.\/]/g, '-').split('-');
  if (parts.length !== 3) return date;

  const [y, m, d] = parts;
  let out = `${y}년 ${m.padStart(2, '0')}월 ${d.padStart(2, '0')}일`;

  if (time) {
    const [hh, mm] = time.split(':');
    if (hh && mm) {
      out += ` ${hh.padStart(2, '0')}시 ${mm.padStart(2, '0')}분`;
    }
  }
  return out;
}

/** ISO·날짜시간 문자열 → 한국어 표기 */
export function formatKoreanFromIso(iso?: string): string {
  if (!iso?.trim()) return '-';
  const raw = iso.trim();
  const datePart = raw.includes('T') ? raw.split('T')[0] : raw.split(' ')[0];
  const timePart = raw.includes('T')
    ? raw.split('T')[1]?.slice(0, 5)
    : raw.split(' ')[1]?.slice(0, 5);
  return formatKoreanDateTime(datePart, timePart);
}

export function maskPhoneForDisplay(phone?: string): string {
  const digits = (phone || '').replace(/\D/g, '');
  if (digits.length < 10) return phone || '-';
  if (digits.length === 11) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  }
  return phone || '-';
}
