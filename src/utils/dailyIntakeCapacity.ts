import { BOOKING_CLOSED_MESSAGE } from './bookingClosedMessage';

export type DailyIntakeCompany = {
  dailyIntakeCapEnabled?: boolean;
  maxCarsPerDay?: number;
};

export function normalizeMaxCarsPerDay(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(999, Math.floor(n)));
}

export function isDailyIntakeCapActive(
  company: DailyIntakeCompany | null | undefined
): boolean {
  if (!company || company.dailyIntakeCapEnabled !== true) return false;
  return normalizeMaxCarsPerDay(company.maxCarsPerDay) > 0;
}

export type DailyIntakeResult =
  | { ok: true; max: number; used: number; remaining: number }
  | { ok: false; max: number; used: number; remaining: 0; message: string };

export function dailyIntakeBlockedMessage(_max: number): string {
  return BOOKING_CLOSED_MESSAGE;
}

/** existingCount = 이번 예약 제외, 취소 제외, 입고일 기준 */
export function evaluateDailyIntake(args: {
  company: DailyIntakeCompany;
  existingCount: number;
}): DailyIntakeResult {
  if (!isDailyIntakeCapActive(args.company)) {
    return { ok: true, max: 0, used: 0, remaining: 0 };
  }
  const max = normalizeMaxCarsPerDay(args.company.maxCarsPerDay);
  const used = Math.max(0, args.existingCount);
  const remaining = Math.max(0, max - used);
  if (remaining <= 0) {
    return {
      ok: false,
      max,
      used,
      remaining: 0,
      message: dailyIntakeBlockedMessage(max),
    };
  }
  return { ok: true, max, used, remaining };
}
