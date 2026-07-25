/** KE094 / ke 94 / KE94 → KE94 */
export function normalizeFlightId(raw: string): string {
  const s = String(raw || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
  if (!s) return '';
  const m = s.match(/^([A-Z]{1,3})(\d+)$/);
  if (!m) return s;
  return `${m[1]}${parseInt(m[2], 10)}`;
}

/** HHMM → 분 단위 (당일 기준). 잘못된 값이면 null */
export function hhmmToMinutes(hhmm: string): number | null {
  const s = String(hhmm || '').replace(/\D/g, '');
  if (s.length !== 4) return null;
  const h = Number(s.slice(0, 2));
  const m = Number(s.slice(2, 4));
  if (!Number.isFinite(h) || !Number.isFinite(m) || h > 24 || m > 59) return null;
  if (h === 24 && m !== 0) return null;
  return h * 60 + m;
}

/** 0825 → 08:25 */
export function formatHhmm(hhmm: string): string {
  const s = String(hhmm || '').replace(/\D/g, '');
  if (s.length !== 4) return hhmm || '-';
  return `${s.slice(0, 2)}:${s.slice(2, 4)}`;
}

/**
 * 예정→변경 연착 분.
 * 자정 넘김(예: 2330→0015)은 +하루로 보정.
 */
export function delayMinutes(scheduleHhmm: string, estimatedHhmm: string): number | null {
  const sched = hhmmToMinutes(scheduleHhmm);
  const est = hhmmToMinutes(estimatedHhmm);
  if (sched == null || est == null) return null;
  let diff = est - sched;
  if (diff < -12 * 60) diff += 24 * 60;
  return diff;
}
