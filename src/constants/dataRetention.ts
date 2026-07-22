/** 출차(completed_out) 후 Firestore 예약 문서 보관 일수 */
export const RESERVATION_DATA_RETENTION_DAYS = 90;

/**
 * 출차 후 Storage 차량 사진 — 운영 지시로 자동 삭제 금지.
 * 스케줄 필드만 기록될 수 있으나 cleanup은 Storage/images를 건드리지 않음.
 */
export const PHOTO_STORAGE_RETENTION_DAYS = 30;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function addDaysToIso(base: Date | string, days: number): string {
  const ms = typeof base === 'string' ? new Date(base).getTime() : base.getTime();
  return new Date(ms + days * MS_PER_DAY).toISOString();
}

/** `YYYY-MM-DD HH:mm:ss` (KST) → Date */
export function parseKstDateTimeString(kst: string): Date {
  const trimmed = kst.trim();
  const isoLike = trimmed.includes('T') ? trimmed : trimmed.replace(' ', 'T');
  return new Date(`${isoLike}+09:00`);
}
