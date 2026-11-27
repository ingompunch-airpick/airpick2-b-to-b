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

/** YYYY-MM-DD ± N일 (달력일 기준, UTC date math — KST 날짜 문자열에 안전) */
export function shiftYmd(ymd: string, deltaDays: number): string {
  const [y, m, d] = ymd.split('-').map((n) => parseInt(n, 10));
  if (!y || !m || !d) return ymd;
  const next = new Date(Date.UTC(y, m - 1, d + deltaDays));
  return next.toISOString().slice(0, 10);
}

/**
 * 본사 대시보드 「일별」 기본 날짜 — 새벽 5시 전에는 전날을 보여준다.
 * 야간 운영(19:00~04:55)이 자정을 넘기 때문에, 0시가 지나도 그날 장사 숫자가 사라지지 않게. (2026-11-28)
 */
export const HQ_DAY_CUTOFF_HOUR = 5;

export function kstBusinessDay(now: number = Date.now(), cutoffHour = HQ_DAY_CUTOFF_HOUR): string {
  return new Date(now + (9 - cutoffHour) * 60 * 60 * 1000).toISOString().slice(0, 10);
}
