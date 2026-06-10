import type { Company } from '../types';

/** wawavalet.com 과 동일한 와와 요금 (실외·실내 기본 4만 / 초과일 실외 5천·실내 1만 / 야간 1만 20~04) */
export const WAWA_FEE_DEFAULTS: Partial<Company> = {
  outdoorBasePrice: 40000,
  outdoorBaseDays: 1,
  outdoorExtraPrice: 5000,
  indoorBasePrice: 40000,
  indoorBaseDays: 1,
  indoorExtraPrice: 10000,
  base_price: 40000,
  base_days: 1,
  extra_day_price: 5000,
  surchargePrice: 10000,
  surchargeStartTime: '20:00',
  surchargeEndTime: '04:00',
  t2Surcharge: 0,
};

export function isWawaCompany(companyId?: string, companyName?: string): boolean {
  const id = (companyId || '').trim().toLowerCase();
  const name = (companyName || '').trim().toLowerCase();
  return (
    id === 'wawa' ||
    id === 'wawa_valet' ||
    name.includes('wawa') ||
    companyName?.includes('와와') === true
  );
}

/** Firestore·로컬에 값이 없을 때 와와 기본 요금 채움 */
export function mergePartnerPricing<T extends Record<string, unknown>>(
  partner: T,
  companyId?: string
): T {
  if (!isWawaCompany(companyId, String(partner.name || ''))) {
    return partner;
  }
  const d = WAWA_FEE_DEFAULTS;
  return {
    ...partner,
    outdoorBasePrice: Number(partner.outdoorBasePrice) || d.outdoorBasePrice,
    outdoorBaseDays: Number(partner.outdoorBaseDays) || d.outdoorBaseDays,
    outdoorExtraPrice: Number(partner.outdoorExtraPrice) || d.outdoorExtraPrice,
    indoorBasePrice: Number(partner.indoorBasePrice) || d.indoorBasePrice,
    indoorBaseDays: Number(partner.indoorBaseDays) || d.indoorBaseDays,
    indoorExtraPrice: Number(partner.indoorExtraPrice) || d.indoorExtraPrice,
    base_price: Number(partner.base_price) || d.base_price,
    base_days: Number(partner.base_days) || d.base_days,
    extra_day_price: Number(partner.extra_day_price) || d.extra_day_price,
    surchargePrice: Number(partner.surchargePrice) || d.surchargePrice,
    surchargeStartTime: (partner.surchargeStartTime as string) || d.surchargeStartTime,
    surchargeEndTime: (partner.surchargeEndTime as string) || d.surchargeEndTime,
    t2Surcharge: Number(partner.t2Surcharge) ?? d.t2Surcharge,
  };
}

/** 입차일~출차일 **포함** 일수 (홈페이지·현장 정산과 맞춤) */
export function getParkingDayCount(start: string, end: string): number {
  const parseDay = (val: string): Date | null => {
    if (!val) return null;
    let clean = val.trim();
    if (clean.includes('T')) clean = clean.split('T')[0];
    else if (clean.includes(' ')) clean = clean.split(' ')[0];
    clean = clean.replace(/[\.\/]/g, '-');
    const parts = clean.split('-').map(Number);
    if (parts.length !== 3 || parts.some(isNaN)) return null;
    return new Date(parts[0], parts[1] - 1, parts[2]);
  };

  const s = parseDay(start);
  const e = parseDay(end);
  if (!s || !e) return 1;

  s.setHours(0, 0, 0, 0);
  e.setHours(0, 0, 0, 0);
  const diff = Math.round((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24));
  return Math.max(1, diff + 1);
}

/** 야간 할증 시간대 여부 (start/end 교차 자정 구간 지원) */
export function checkIsNightSurcharge(
  timeStr: string,
  startTime: string,
  endTime: string
): boolean {
  try {
    if (!timeStr || !startTime || !endTime) return false;

    let timePart = '';
    if (timeStr.includes('T')) {
      timePart = timeStr.split('T')[1];
    } else if (timeStr.includes(' ')) {
      timePart = timeStr.trim().split(/\s+/)[1] || '';
    } else if (timeStr.includes(':')) {
      timePart = timeStr;
    }

    if (!timePart) return false;

    const hourStr = timePart.substring(0, 5);
    const [h, m] = hourStr.split(':').map(Number);
    if (isNaN(h) || isNaN(m)) return false;
    const currentMinutes = h * 60 + m;

    const [sth, stm] = startTime.split(':').map(Number);
    const startTimeMinutes = sth * 60 + stm;

    const [eth, etm] = endTime.split(':').map(Number);
    const endTimeMinutes = eth * 60 + etm;

    if (isNaN(startTimeMinutes) || isNaN(endTimeMinutes)) return false;

    if (startTimeMinutes > endTimeMinutes) {
      return currentMinutes >= startTimeMinutes || currentMinutes < endTimeMinutes;
    }
    return currentMinutes >= startTimeMinutes && currentMinutes < endTimeMinutes;
  } catch (err) {
    console.warn('Time boundaries evaluation error:', err);
    return false;
  }
}

export function getCalculatePrice(
  company: Company,
  start: string,
  end: string,
  indoor = true,
  isT2 = false
): number {
  if (!company) return 0;
  const priced = mergePartnerPricing(company as Record<string, unknown>, company.id) as Company;
  const diffDays = getParkingDayCount(start, end);

  let basePrice = 0;
  let extraPrice = 0;
  let baseDays = 0;

  if (indoor) {
    basePrice = priced.indoorBasePrice ?? priced.base_price ?? 0;
    baseDays = priced.indoorBaseDays ?? priced.base_days ?? 0;
    extraPrice = priced.indoorExtraPrice ?? priced.extra_day_price ?? 0;
  } else {
    basePrice = priced.outdoorBasePrice ?? priced.base_price ?? 0;
    baseDays = priced.outdoorBaseDays ?? priced.base_days ?? 0;
    extraPrice = priced.outdoorExtraPrice ?? priced.extra_day_price ?? 0;
  }

  let calculated = Number(basePrice) || 0;
  const cleanBaseDays = Number(baseDays) || 0;
  const cleanExtraPrice = Number(extraPrice) || 0;

  if (diffDays > cleanBaseDays) {
    calculated += (diffDays - cleanBaseDays) * cleanExtraPrice;
  }

  if (isT2 && priced.t2Surcharge) {
    calculated += Number(priced.t2Surcharge) || 0;
  }

  if (priced.surchargePrice && priced.surchargeStartTime && priced.surchargeEndTime) {
    const charge = Number(priced.surchargePrice) || 0;
    const isStartNight = checkIsNightSurcharge(start, priced.surchargeStartTime, priced.surchargeEndTime);
    const isEndNight = checkIsNightSurcharge(end, priced.surchargeStartTime, priced.surchargeEndTime);
    if (isStartNight) calculated += charge;
    if (isEndNight) calculated += charge;
  }

  if (priced.peakSurcharge && priced.peakStartTime && priced.peakEndTime) {
    try {
      const checkInDateObj = new Date(start);
      const mm = String(checkInDateObj.getMonth() + 1).padStart(2, '0');
      const dd = String(checkInDateObj.getDate()).padStart(2, '0');
      const checkInMD = `${mm}-${dd}`;

      let isPeak = false;
      if (priced.peakStartTime > priced.peakEndTime) {
        if (checkInMD >= priced.peakStartTime || checkInMD <= priced.peakEndTime) {
          isPeak = true;
        }
      } else if (checkInMD >= priced.peakStartTime && checkInMD <= priced.peakEndTime) {
        isPeak = true;
      }

      if (isPeak) {
        calculated += Number(priced.peakSurcharge) || 0;
      }
    } catch (err) {
      console.warn('Peak surcharge calculation failed:', err);
    }
  }

  return calculated;
}
