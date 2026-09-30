import { getKSTDateOnlyString } from './kstDate';

/** 0 = 시간 제한 없음, 1–24 = 입고 N시간 전, 'closed' = 당일 입고 안 받음 */
export type SameDaySetting = number | 'closed';

export function normalizeBookingLeadHours(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(24, Math.floor(n)));
}

export function sameDaySettingFromCompany(company: {
  sameDayBookingBlocked?: boolean;
  bookingLeadHours?: number;
} | null | undefined): SameDaySetting {
  if (company?.sameDayBookingBlocked === true) return 'closed';
  return normalizeBookingLeadHours(company?.bookingLeadHours);
}

/** 입고 일시(KST) 기준 마감이 지났는지. 시각이 없으면 아직 판단하지 않음 */
export function intakeLeadClosed(args: {
  leadHours: number;
  departureDate: string;
  departureTime: string;
  now?: Date;
}): boolean {
  const lead = normalizeBookingLeadHours(args.leadHours);
  if (lead <= 0) return false;
  const date = String(args.departureDate || '').slice(0, 10);
  const time = String(args.departureTime || '').trim().slice(0, 5);
  const dateM = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const timeM = time.match(/^(\d{2}):(\d{2})$/);
  if (!dateM || !timeM) return false;
  const intakeMs = Date.UTC(
    Number(dateM[1]),
    Number(dateM[2]) - 1,
    Number(dateM[3]),
    Number(timeM[1]) - 9,
    Number(timeM[2]),
    0,
    0
  );
  const nowMs = (args.now ?? new Date()).getTime();
  return nowMs >= intakeMs - lead * 60 * 60 * 1000;
}

export function sameDayClosed(departureDate: string, now?: Date): boolean {
  const dep = String(departureDate || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dep)) return false;
  const today = now ? kstYmd(now) : getKSTDateOnlyString();
  return dep === today;
}

function kstYmd(now: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

export function sameDaySettingLabel(setting: SameDaySetting): string {
  if (setting === 'closed') return '당일은 받지 않음';
  if (setting <= 0) return '받음';
  return `${setting}시간 전 마감`;
}

export function sameDaySettingDetail(setting: SameDaySetting): string {
  if (setting === 'closed') return '오늘 날짜로는 받지 않습니다.';
  if (setting <= 0) return '당일 입고도 받습니다.';
  return `입고 ${setting}시간 전에 닫습니다.`;
}
