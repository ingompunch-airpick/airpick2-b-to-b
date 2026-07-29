/**
 * 현장·배차표용 주차장 표기.
 * 실내/외 이분법 대신 `실내1`·`실외2` 같은 구역명을 우선한다.
 * 구역명이 없으면 레거시 isIndoor 로만 추정한다.
 */
export function formatParkingLotLabel(res: {
  parkingSpace?: string | null;
  isIndoor?: boolean | null;
}): string {
  const space = String(res.parkingSpace || '').trim();
  if (space) return space;
  if (res.isIndoor === false) return '실외';
  if (res.isIndoor === true) return '실내';
  return '미배정';
}

/** 구역명에서 요금/시설 타입 추정 (실내* → indoor) */
export function inferLotFacilityType(
  lotLabel: string
): 'indoor' | 'outdoor' | null {
  const s = lotLabel.trim();
  if (!s || s === '미배정') return null;
  if (/^실외|야외|outdoor/i.test(s)) return 'outdoor';
  if (/^실내|indoor/i.test(s)) return 'indoor';
  return null;
}
