/** KST(UTC+9) 날짜·시간 헬퍼 */

export function getKSTDateOnlyString(): string {
  const kstDate = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return kstDate.toISOString().split('T')[0];
}

/** ISO 타임스탬프·Date → KST 날짜(YYYY-MM-DD) */
export function toKSTDateOnlyString(isoOrMs: string | number | Date | undefined | null): string {
  if (isoOrMs == null || isoOrMs === '') return '';
  const ms = typeof isoOrMs === 'number' ? isoOrMs : new Date(isoOrMs).getTime();
  if (Number.isNaN(ms)) return '';
  return new Date(ms + 9 * 60 * 60 * 1000).toISOString().split('T')[0];
}

export function getKSTDateTimeString(): string {
  const kstDate = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return kstDate.toISOString().replace('T', ' ').substring(0, 19);
}

/** `<input type="datetime-local">` 값 (YYYY-MM-DDTHH:mm), KST 기준 */
export function getKSTDateTimeLocalString(addedMs = 0): string {
  const kstDate = new Date(Date.now() + 9 * 60 * 60 * 1000 + addedMs);
  return kstDate.toISOString().slice(0, 16);
}
