import { createContext, useContext, useEffect } from 'react';

/**
 * 실시간 창(-3~+14일) 밖의 예약이 필요한 화면용.
 * 화면이 열려 있는 동안 그 기간(입고일 기준)만 구독하고, 닫히면 해제한다.
 * docs/work/reservation-load-plan.md
 */
type RequestRange = (from: string, to: string) => () => void;

const noop: RequestRange = () => () => {};

export const ReservationRangeContext = createContext<RequestRange>(noop);

/** from·to: YYYY-MM-DD (입고일 기준). 빈 값이면 아무것도 안 함 */
export function useReservationRange(from: string | undefined, to: string | undefined): void {
  const request = useContext(ReservationRangeContext);
  useEffect(() => {
    if (!from || !to) return;
    return request(from.slice(0, 10), to.slice(0, 10));
  }, [request, from, to]);
}

function shift(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  t.setUTCDate(t.getUTCDate() + days);
  return t.toISOString().slice(0, 10);
}

/** 오늘(KST) 기준 back 일 전 ~ fwd 일 후 */
export function rangeAroundToday(today: string, back: number, fwd = 0): [string, string] {
  return [shift(today, -back), shift(today, fwd)];
}

/**
 * 월(YYYY-MM) 통계용 입고일 범위. 장기 주차·월말 출차·취소일 차이를 위해 앞뒤 padDays 여유.
 */
export function monthRange(monthPrefix: string, padDays = 31): [string, string] {
  if (!/^\d{4}-\d{2}$/.test(monthPrefix)) return ['', ''];
  const [y, m] = monthPrefix.split('-').map(Number);
  const first = `${monthPrefix}-01`;
  const last = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  return [shift(first, -padDays), shift(last, padDays)];
}
