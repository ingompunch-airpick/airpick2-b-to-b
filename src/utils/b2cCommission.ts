import type { Company, Reservation } from '../types';
import { isAirpickHeadquarters } from '../constants/platform';
import { isAirpickB2CBooking } from './bookingSource';
import { normalizeDateString } from './reservationNormalize';
import { exitDateYmd } from './hqAnalytics';
import { isWawaCompany } from './pricing';

/** 에어픽 B2C 수수료 시작 (KST 달력일) — 지금부터 집계·확인 */
export const B2C_COMMISSION_START_YMD = '2026-11-01';
export const B2C_COMMISSION_RATE = 0.15;

export function reservationListPrice(r: Reservation): number {
  const total = Math.max(0, Math.round(Number(r.totalPrice) || 0));
  const coupon = Math.max(0, Math.round(Number(r.signupCouponWon) || 0));
  const listed = Math.max(0, Math.round(Number(r.listPrice) || 0));
  if (listed > 0) return Math.max(listed, total);
  return total + coupon;
}

export function reservationSignupCouponWon(r: Reservation): number {
  return Math.max(0, Math.round(Number(r.signupCouponWon) || 0));
}

/** 정가×15% − 가입쿠폰(최소 0) */
export function airpickCommissionWon(r: Reservation): number {
  const gross = Math.floor(reservationListPrice(r) * B2C_COMMISSION_RATE);
  return Math.max(0, gross - reservationSignupCouponWon(r));
}

export function partnerPayoutWon(r: Reservation): number {
  return Math.max(0, reservationListPrice(r) - airpickCommissionWon(r) - reservationSignupCouponWon(r));
}

function companyIdAndName(r: Reservation): { id: string; name: string } {
  const rawId = String(r.companyId || '').trim();
  const rawName = String(r.companyName || '').trim();
  if (isWawaCompany(rawId, rawName)) {
    return { id: 'wawa', name: '와와발렛' };
  }
  const id = (rawId || rawName || 'unknown').toLowerCase().trim();
  const name = rawName || rawId || '미지정';
  return { id, name };
}

/** 12월부터 · B2C · 해당 월 출고완료 */
export function filterB2cCommissionEligible(
  reservations: Reservation[],
  monthPrefix: string
): Reservation[] {
  return reservations.filter((r) => {
    if (r.status !== 'completed_out') return false;
    if (!isAirpickB2CBooking(r.createdBy)) return false;
    if (!exitDateYmd(r).startsWith(monthPrefix)) return false;
    const dep = normalizeDateString(r.departureDate);
    if (dep && dep < B2C_COMMISSION_START_YMD) return false;
    return true;
  });
}

export type B2cCommissionCompanyRow = {
  id: string;
  name: string;
  count: number;
  listRevenue: number;
  couponWon: number;
  commissionWon: number;
  partnerPayoutWon: number;
};

export function buildB2cCommissionRows(
  reservations: Reservation[],
  monthPrefix: string,
  companies?: Company[]
): B2cCommissionCompanyRow[] {
  const eligible = filterB2cCommissionEligible(reservations, monthPrefix);
  const map = new Map<string, B2cCommissionCompanyRow>();

  for (const c of companies || []) {
    if (!c.id || isAirpickHeadquarters(c.id)) continue;
    const id = String(c.id).toLowerCase().trim();
    map.set(id, {
      id,
      name: String(c.name || c.id).trim() || c.id,
      count: 0,
      listRevenue: 0,
      couponWon: 0,
      commissionWon: 0,
      partnerPayoutWon: 0,
    });
  }

  for (const r of eligible) {
    const { id, name } = companyIdAndName(r);
    let row = map.get(id);
    if (!row) {
      row = {
        id,
        name,
        count: 0,
        listRevenue: 0,
        couponWon: 0,
        commissionWon: 0,
        partnerPayoutWon: 0,
      };
      map.set(id, row);
    }
    const list = reservationListPrice(r);
    const coupon = reservationSignupCouponWon(r);
    const commission = airpickCommissionWon(r);
    row.count += 1;
    row.listRevenue += list;
    row.couponWon += coupon;
    row.commissionWon += commission;
    row.partnerPayoutWon += Math.max(0, list - commission - coupon);
  }

  return [...map.values()]
    .filter((r) => r.count > 0)
    .sort(
      (a, b) =>
        b.commissionWon - a.commissionWon ||
        b.count - a.count ||
        a.name.localeCompare(b.name, 'ko')
    );
}

export function sumB2cCommissionRows(rows: B2cCommissionCompanyRow[]): Omit<
  B2cCommissionCompanyRow,
  'id' | 'name'
> {
  return rows.reduce(
    (acc, r) => ({
      count: acc.count + r.count,
      listRevenue: acc.listRevenue + r.listRevenue,
      couponWon: acc.couponWon + r.couponWon,
      commissionWon: acc.commissionWon + r.commissionWon,
      partnerPayoutWon: acc.partnerPayoutWon + r.partnerPayoutWon,
    }),
    { count: 0, listRevenue: 0, couponWon: 0, commissionWon: 0, partnerPayoutWon: 0 }
  );
}

export type B2cCommissionBookingRow = {
  id: string;
  companyId: string;
  companyName: string;
  exitYmd: string;
  carNumber: string;
  listPrice: number;
  couponWon: number;
  commissionWon: number;
  partnerPayoutWon: number;
  /** signupCouponWon / listPrice 필드가 예약에 없음 */
  estimatedPricing: boolean;
};

/** 월간 수수료 건별 — companyId 없으면 전체 */
export function listB2cCommissionBookings(
  reservations: Reservation[],
  monthPrefix: string,
  companyId?: string
): B2cCommissionBookingRow[] {
  const want = String(companyId || '')
    .trim()
    .toLowerCase();
  return filterB2cCommissionEligible(reservations, monthPrefix)
    .filter((r) => {
      if (!want) return true;
      return companyIdAndName(r).id === want;
    })
    .map((r) => {
      const { id, name } = companyIdAndName(r);
      const list = reservationListPrice(r);
      const coupon = reservationSignupCouponWon(r);
      const commission = airpickCommissionWon(r);
      const hasList = Number(r.listPrice) > 0;
      const hasCouponField =
        r.signupCouponWon !== undefined && r.signupCouponWon !== null;
      return {
        id: String(r.id || ''),
        companyId: id,
        companyName: name,
        exitYmd: exitDateYmd(r),
        carNumber: String(r.carNumber || '').trim() || '—',
        listPrice: list,
        couponWon: coupon,
        commissionWon: commission,
        partnerPayoutWon: Math.max(0, list - commission - coupon),
        estimatedPricing: !hasList && !hasCouponField,
      };
    })
    .sort(
      (a, b) =>
        b.exitYmd.localeCompare(a.exitYmd) || a.carNumber.localeCompare(b.carNumber, 'ko')
    );
}

/** 월간 제휴(어필리에이트) 고객 할인 합 — B2C 출고완료 */
export function sumAffiliateCustomerDiscountInMonth(
  reservations: Reservation[],
  monthPrefix: string
): number {
  return filterB2cCommissionEligible(reservations, monthPrefix).reduce((sum, r) => {
    const n = Math.max(0, Math.round(Number(r.affiliateCustomerDiscountWon) || 0));
    return sum + n;
  }, 0);
}
