import type { Company, Reservation } from '../types';
import { isAirpickHeadquarters } from '../constants/platform';
import { isAirpickB2CBooking } from './bookingSource';
import { normalizeDateString } from './reservationNormalize';
import { exitDateYmd } from './hqAnalytics';
import { isWawaCompany } from './pricing';

/** 에어픽 B2C 수수료 시작 (KST 달력일) — 지금부터 집계·확인 */
export const B2C_COMMISSION_START_YMD = '2026-11-01';
/** 기본 요율 — 부가세 별도 15%. 업체 commissionRate 없으면 이것 */
export const B2C_COMMISSION_RATE = 0.15;

export function reservationListPrice(r: Reservation): number {
  const total = Math.max(0, Math.round(Number(r.totalPrice) || 0));
  const coupon = Math.max(0, Math.round(Number(r.signupCouponWon) || 0));
  const listed = Math.max(0, Math.round(Number(r.listPrice) || 0));
  if (listed > 0) return Math.max(listed, total);
  return total + coupon;
}

/** 가입 쿠폰 최대 (B2C SIGNUP_COUPON_WON 과 같게) */
export const SIGNUP_COUPON_MAX_WON = 5000;

/**
 * 수수료 기준 정가 — 서버 금액 검사(priceCheck)가 기본 요금이 더 높다고 했으면 기본 요금.
 * 손님 화면이 보낸 정가가 낮게 들어와도 수수료가 줄지 않게 (2026-11-14 대표 결정: 직접 확인 없이 자동 적용)
 */
export function reservationCommissionBase(r: Reservation): number {
  const list = reservationListPrice(r);
  const expected = Math.max(0, Math.round(Number(r.priceCheck?.expectedCoreWon) || 0));
  return r.priceCheck?.ok === false ? Math.max(list, expected) : list;
}

/** 수수료에서 빼 주는 가입 쿠폰 — 규칙 안 금액만 (카카오 첫 예약 · 최대 5,000원) */
export function reservationSignupCouponWon(r: Reservation): number {
  const coupon = Math.max(0, Math.round(Number(r.signupCouponWon) || 0));
  const capped = Math.min(coupon, SIGNUP_COUPON_MAX_WON);
  const allowed = r.priceCheck?.couponAllowedWon;
  if (r.priceCheck?.ok === false && typeof allowed === 'number') {
    return Math.max(0, Math.min(capped, Math.round(allowed)));
  }
  return capped;
}

/** 서버 기준으로 바꿔 계산했는지 (정산표 「기본 요금 기준」 꼬리표) */
export function commissionAdjusted(r: Reservation): boolean {
  if (r.priceCheck?.ok !== false) return false;
  const rawCoupon = Math.max(0, Math.round(Number(r.signupCouponWon) || 0));
  return (
    reservationCommissionBase(r) !== reservationListPrice(r) ||
    reservationSignupCouponWon(r) !== rawCoupon
  );
}

/** 0~1로 정규화. 15 입력 시 0.15. 범위 밖·NaN이면 기본 15% */
export function resolveCommissionRate(raw?: number | null): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return B2C_COMMISSION_RATE;
  if (n === 0) return 0;
  if (n > 0 && n <= 1) return n;
  if (n > 1 && n <= 100) return n / 100;
  return B2C_COMMISSION_RATE;
}

export function companyCommissionRate(company?: Company | null): number {
  return resolveCommissionRate(company?.commissionRate);
}

export function rateLabelPercent(rate: number): string {
  const pct = Math.round(resolveCommissionRate(rate) * 1000) / 10;
  return Number.isInteger(pct) ? String(pct) : String(pct);
}

/** 기준 정가×요율 − 인정 가입쿠폰(최소 0). 홈·현장은 호출하지 말 것 */
export function airpickCommissionWon(
  r: Reservation,
  rate: number = B2C_COMMISSION_RATE
): number {
  const gross = Math.floor(reservationCommissionBase(r) * resolveCommissionRate(rate));
  return Math.max(0, gross - reservationSignupCouponWon(r));
}

export function partnerPayoutWon(
  r: Reservation,
  rate: number = B2C_COMMISSION_RATE
): number {
  return Math.max(
    0,
    reservationCommissionBase(r) - airpickCommissionWon(r, rate) - reservationSignupCouponWon(r)
  );
}

export function companyIdAndName(r: Reservation): { id: string; name: string } {
  const rawId = String(r.companyId || '').trim();
  const rawName = String(r.companyName || '').trim();
  if (isWawaCompany(rawId, rawName)) {
    return { id: 'wawa', name: '와와발렛' };
  }
  const id = (rawId || rawName || 'unknown').toLowerCase().trim();
  const name = rawName || rawId || '미지정';
  return { id, name };
}

function rateByCompanyId(companies: Company[] | undefined, companyId: string): number {
  if (!companies?.length) return B2C_COMMISSION_RATE;
  const want = companyId.trim().toLowerCase();
  const found = companies.find((c) => String(c.id || '').trim().toLowerCase() === want);
  return companyCommissionRate(found);
}

/** B2C · 해당 월 출고완료 · 수수료 시작일 이후 입고 */
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
  rate: number;
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
      rate: companyCommissionRate(c),
      count: 0,
      listRevenue: 0,
      couponWon: 0,
      commissionWon: 0,
      partnerPayoutWon: 0,
    });
  }

  for (const r of eligible) {
    const { id, name } = companyIdAndName(r);
    const rate = rateByCompanyId(companies, id);
    let row = map.get(id);
    if (!row) {
      row = {
        id,
        name,
        rate,
        count: 0,
        listRevenue: 0,
        couponWon: 0,
        commissionWon: 0,
        partnerPayoutWon: 0,
      };
      map.set(id, row);
    }
    const list = reservationCommissionBase(r);
    const coupon = reservationSignupCouponWon(r);
    const commission = airpickCommissionWon(r, rate);
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
  'id' | 'name' | 'rate'
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
  rate: number;
  /** signupCouponWon / listPrice 필드가 예약에 없음 */
  estimatedPricing: boolean;
  /** 서버 기본 요금·인정 쿠폰 기준으로 바꿔 계산함 */
  adjusted: boolean;
};

/** 월간 수수료 건별 — companyId 없으면 전체 */
export function listB2cCommissionBookings(
  reservations: Reservation[],
  monthPrefix: string,
  companyId?: string,
  companies?: Company[]
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
      const rate = rateByCompanyId(companies, id);
      const list = reservationCommissionBase(r);
      const coupon = reservationSignupCouponWon(r);
      const commission = airpickCommissionWon(r, rate);
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
        rate,
        estimatedPricing: !hasList && !hasCouponField,
        adjusted: commissionAdjusted(r),
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

/** 정산 명세 CSV (UTF-8 BOM) */
export function buildCommissionCsv(
  bookings: B2cCommissionBookingRow[],
  monthPrefix: string
): string {
  const header = [
    '월',
    '업체ID',
    '업체명',
    '예약ID',
    '차량번호',
    '출고일',
    '요율',
    '정가',
    '가입쿠폰',
    '수수료',
    '업체몫',
  ];
  const lines = [header.join(',')];
  for (const b of bookings) {
    lines.push(
      [
        monthPrefix,
        b.companyId,
        csvEscape(b.companyName),
        b.id,
        csvEscape(b.carNumber),
        b.exitYmd,
        rateLabelPercent(b.rate) + '%',
        b.listPrice,
        b.couponWon,
        b.commissionWon,
        b.partnerPayoutWon,
      ].join(',')
    );
  }
  return `\uFEFF${lines.join('\n')}`;
}

function csvEscape(value: string): string {
  const s = String(value || '');
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function downloadCommissionCsv(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
