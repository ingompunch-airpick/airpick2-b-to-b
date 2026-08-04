export type IcnArrivalLookup = {
  flightId: string;
  airline: string | null;
  origin: string | null;
  originCode: string | null;
  date: string;
  scheduleTime: string | null;
  estimatedTime: string | null;
  remark: string | null;
  terminal: 'T1' | 'T2' | null;
  terminalLabel: string | null;
  source: 'live' | 'weekly';
  error?: string;
  message?: string;
};

const ARRIVAL_API =
  'https://asia-northeast3-airpick-reservation.cloudfunctions.net/getIcnArrival';

export function toFlightDateYmd(dateOrLocal: string): string {
  return String(dateOrLocal || '')
    .replace(/\D/g, '')
    .slice(0, 8);
}

export function normalizeArrivalFlightId(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/**
 * 입국 편명 + 출고일 → 공항 예정 도착 시각.
 * 오늘~+6일만 조회 가능.
 */
export async function fetchIcnArrival(
  flightId: string,
  dateYmd: string
): Promise<
  | { ok: true; data: IcnArrivalLookup }
  | { ok: false; status: number; data: IcnArrivalLookup | null }
> {
  const id = normalizeArrivalFlightId(flightId);
  const date = toFlightDateYmd(dateYmd);
  if (id.length < 3 || date.length !== 8) {
    return { ok: false, status: 400, data: null };
  }

  const qs = new URLSearchParams({ flightId: id, date });
  try {
    const res = await fetch(`${ARRIVAL_API}?${qs.toString()}`);
    const data = (await res.json().catch(() => null)) as IcnArrivalLookup | null;
    if (!res.ok) return { ok: false, status: res.status, data };
    return { ok: true, data: data! };
  } catch {
    return { ok: false, status: 0, data: null };
  }
}

/** datetime-local 값의 날짜는 유지하고 시각만 교체 */
export function applyTimeToDateTimeLocal(localValue: string, hhmm: string): string {
  const date = String(localValue || '').split('T')[0] || '';
  const time = hhmm.slice(0, 5);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return localValue;
  return `${date}T${time}`;
}
