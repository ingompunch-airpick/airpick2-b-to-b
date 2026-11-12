/**
 * 예약 Firestore 문서 자동 삭제 여부.
 * false = 앱에서 계속 조회 (용량 부담 작음). 사진만 아래 일수로 지운다.
 */
export const PURGE_RESERVATION_DOCUMENTS = false;

/** 문서 삭제를 다시 켤 때만 사용. 지금은 무기한 보관. */
export const RESERVATION_DATA_RETENTION_DAYS = 365;

/** 출차 후 Storage 차량·스크래치 사진 보관 일수. 서버가 이 날이 지나면 파일을 지운다. */
export const PHOTO_STORAGE_RETENTION_DAYS = 14;

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
