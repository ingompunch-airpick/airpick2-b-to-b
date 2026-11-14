/**
 * 손님(B2C) 예약 금액 검증 — 손님 화면이 보낸 금액·할인을 서버에서 다시 계산해 비교한다.
 *
 * 하는 일: 문제가 있으면 예약 문서에 `priceCheck`(기본 요금·인정 쿠폰)를 남긴다.
 *          수수료 정산(src/utils/b2cCommission.ts)이 이 값으로 자동 계산 — 본사가 따로 확인하지 않는다.
 * 하지 않는 일: 예약을 취소하거나 금액을 고치지 않는다 (요금 계산 차이로 정상 예약이 막히지 않게).
 *
 * 요금 계산은 B2C `src/utils/pricing.ts`·`pricingProfiles.ts`·`lib/companies.ts`(요금 필드 매핑)를
 * 그대로 옮긴 것. 저기 요금 규칙을 바꾸면 여기도 같이 바꾼다.
 * 비교는 「손님이 보낸 정가(listPrice)가 서버 기본 요금보다 낮은가」만 본다.
 * 발렛·비대면 추가요금·카드 할증은 손님 쪽이 더 높게만 만들므로 서버 계산에서 뺀다 → 오탐 방지.
 */
import * as admin from 'firebase-admin';

const B2C_SOURCE = 'airpick-b2c';
/** B2C memberSession.MEMBER_DISCOUNT_WON */
const SIGNUP_COUPON_WON = 5000;
/** 반올림 등 1원 단위 차이 허용 */
const TOLERANCE_WON = 10;

type Num = number | undefined;

interface PricingCompany {
  id: string;
  name: string;
  pricingProfile?: string;
  base_price: number;
  extra_day_price: number;
  base_days: number;
  outdoorBasePrice?: Num;
  outdoorBaseDays?: Num;
  outdoorExtraPrice?: Num;
  indoorBasePrice?: Num;
  indoorBaseDays?: Num;
  indoorExtraPrice?: Num;
  surchargeStartTime?: string;
  surchargeEndTime?: string;
  surchargePrice?: Num;
  t2Surcharge?: Num;
  peakStartTime?: string;
  peakEndTime?: string;
  peakSurcharge?: Num;
}

/** B2C lib/companies.ts 의 요금 필드 매핑과 같게 */
function mapPricingCompany(id: string, data: Record<string, unknown>): PricingCompany {
  const n = (v: unknown) => Number(v) || undefined;
  const s = (v: unknown) => (v ? String(v) : undefined);
  return {
    id,
    name: String(data.name || ''),
    pricingProfile: s(data.pricingProfile),
    base_price: Number(data.base_price) || 15000,
    extra_day_price: Number(data.extra_day_price) || 5000,
    base_days: Number(data.base_days) || 1,
    outdoorBasePrice: n(data.outdoorBasePrice),
    outdoorBaseDays: n(data.outdoorBaseDays),
    outdoorExtraPrice: n(data.outdoorExtraPrice),
    indoorBasePrice: n(data.indoorBasePrice),
    indoorBaseDays: n(data.indoorBaseDays),
    indoorExtraPrice: n(data.indoorExtraPrice),
    surchargeStartTime: s(data.surchargeStartTime),
    surchargeEndTime: s(data.surchargeEndTime),
    surchargePrice: n(data.surchargePrice),
    t2Surcharge: n(data.t2Surcharge),
    peakStartTime: s(data.peakStartTime),
    peakEndTime: s(data.peakEndTime),
    peakSurcharge: n(data.peakSurcharge),
  };
}

// ── B2C pricing.ts 복사 (요금 계산 부분만) ───────────────────────────
/** B2C·B2B WAWA_FEE_DEFAULTS 와 같게 (companies/wawa 실제 설정 기준) */
const WAWA_DEFAULTS = {
  outdoorBasePrice: 40000,
  outdoorBaseDays: 2,
  outdoorExtraPrice: 5000,
  indoorBasePrice: 40000,
  indoorBaseDays: 2,
  indoorExtraPrice: 10000,
  base_price: 40000,
  base_days: 2,
  extra_day_price: 5000,
  surchargePrice: 20000,
  surchargeStartTime: '19:00',
  surchargeEndTime: '04:55',
  t2Surcharge: 0,
};

function isWawaCompany(id: string, name: string): boolean {
  const i = id.trim().toLowerCase();
  const nm = name.trim().toLowerCase();
  return i === 'wawa' || i === 'wawa_valet' || nm.includes('wawa') || name.includes('와와');
}

function isGayuCompany(id: string, name: string): boolean {
  const i = id.trim().toLowerCase();
  const nm = name.trim().toLowerCase();
  return (
    i === 'gayu' || i === 'gayu_valet' || i === 'gy' || nm.includes('gayu') || name.includes('가유')
  );
}

function mergePartnerPricing(p: PricingCompany): PricingCompany {
  if (isGayuCompany(p.id, p.name)) {
    return {
      ...p,
      pricingProfile: 'gayu-pricing',
      surchargePrice: Number(p.surchargePrice) || 10000,
      surchargeStartTime: p.surchargeStartTime || '19:00',
      surchargeEndTime: p.surchargeEndTime || '05:00',
    };
  }
  if (!isWawaCompany(p.id, p.name)) return p;
  const d = WAWA_DEFAULTS;
  return {
    ...p,
    outdoorBasePrice: Number(p.outdoorBasePrice) || d.outdoorBasePrice,
    outdoorBaseDays: Number(p.outdoorBaseDays) || d.outdoorBaseDays,
    outdoorExtraPrice: Number(p.outdoorExtraPrice) || d.outdoorExtraPrice,
    indoorBasePrice: Number(p.indoorBasePrice) || d.indoorBasePrice,
    indoorBaseDays: Number(p.indoorBaseDays) || d.indoorBaseDays,
    indoorExtraPrice: Number(p.indoorExtraPrice) || d.indoorExtraPrice,
    base_price: Number(p.base_price) || d.base_price,
    base_days: Number(p.base_days) || d.base_days,
    extra_day_price: Number(p.extra_day_price) || d.extra_day_price,
    surchargePrice: Number(p.surchargePrice) || d.surchargePrice,
    surchargeStartTime: p.surchargeStartTime || d.surchargeStartTime,
    surchargeEndTime: p.surchargeEndTime || d.surchargeEndTime,
    t2Surcharge: Number(p.t2Surcharge) ?? d.t2Surcharge,
  };
}

export function getParkingDayCount(start: string, end: string): number {
  const parseDay = (val: string): number | null => {
    if (!val) return null;
    let clean = val.trim();
    if (clean.includes('T')) clean = clean.split('T')[0];
    else if (clean.includes(' ')) clean = clean.split(' ')[0];
    clean = clean.replace(/[./]/g, '-');
    const parts = clean.split('-').map(Number);
    if (parts.length !== 3 || parts.some(isNaN)) return null;
    return Date.UTC(parts[0], parts[1] - 1, parts[2]);
  };
  const s = parseDay(start);
  const e = parseDay(end);
  if (s == null || e == null) return 1;
  return Math.max(1, Math.round((e - s) / 86400000) + 1);
}

function checkIsNightSurcharge(timeStr: string, startTime: string, endTime: string): boolean {
  try {
    if (!timeStr || !startTime || !endTime) return false;
    let timePart = '';
    if (timeStr.includes('T')) timePart = timeStr.split('T')[1];
    else if (timeStr.includes(' ')) timePart = timeStr.trim().split(/\s+/)[1] || '';
    else if (timeStr.includes(':')) timePart = timeStr;
    if (!timePart) return false;
    const [h, m] = timePart.substring(0, 5).split(':').map(Number);
    if (isNaN(h) || isNaN(m)) return false;
    const cur = h * 60 + m;
    const [sth, stm] = startTime.split(':').map(Number);
    const [eth, etm] = endTime.split(':').map(Number);
    const st = sth * 60 + stm;
    const et = eth * 60 + etm;
    if (st > et) return cur >= st || cur < et;
    return cur >= st && cur < et;
  } catch {
    return false;
  }
}

function calculateGayuBasePrice(totalDays: number, terminal: '1T' | '2T'): number {
  if (totalDays <= 0) return 0;
  if (terminal === '2T') {
    if (totalDays <= 4) return 50000;
    return 60000 + (totalDays - 5) * 5000;
  }
  if (totalDays <= 3) return 40000;
  return 40000 + (totalDays - 3) * 5000;
}

/** 발렛·비대면 추가요금·카드 할증을 뺀 기본 주차 요금 (B2C getPriceBreakdown 의 해당 부분) */
export function expectedCorePrice(
  company: PricingCompany,
  start: string,
  end: string,
  indoor: boolean,
  isT2: boolean,
  departureTime = '10:00',
  arrivalTime = '10:00'
): number {
  const priced = mergePartnerPricing(company);
  const days = getParkingDayCount(start, end);

  if (isGayuCompany(company.id, company.name) || priced.pricingProfile === 'gayu-pricing') {
    const base = calculateGayuBasePrice(days, isT2 ? '2T' : '1T');
    const ns = priced.surchargeStartTime || '19:00';
    const ne = priced.surchargeEndTime || '05:00';
    const fee = Number(priced.surchargePrice) || 10000;
    let night = 0;
    if (checkIsNightSurcharge(`${start} ${departureTime}`, ns, ne)) night += fee;
    if (checkIsNightSurcharge(`${end} ${arrivalTime}`, ns, ne)) night += fee;
    return base + night;
  }

  const basePrice = indoor
    ? priced.indoorBasePrice ?? priced.base_price ?? 0
    : priced.outdoorBasePrice ?? priced.base_price ?? 0;
  const baseDays = indoor
    ? priced.indoorBaseDays ?? priced.base_days ?? 0
    : priced.outdoorBaseDays ?? priced.base_days ?? 0;
  const extraUnit = indoor
    ? priced.indoorExtraPrice ?? priced.extra_day_price ?? 0
    : priced.outdoorExtraPrice ?? priced.extra_day_price ?? 0;
  const extraAmount = Math.max(0, days - (Number(baseDays) || 0)) * (Number(extraUnit) || 0);

  let night = 0;
  if (priced.surchargePrice && priced.surchargeStartTime && priced.surchargeEndTime) {
    const charge = Number(priced.surchargePrice) || 0;
    if (checkIsNightSurcharge(`${start} ${departureTime}`, priced.surchargeStartTime, priced.surchargeEndTime)) night += charge;
    if (checkIsNightSurcharge(`${end} ${arrivalTime}`, priced.surchargeStartTime, priced.surchargeEndTime)) night += charge;
  }

  const t2 = isT2 && priced.t2Surcharge ? Number(priced.t2Surcharge) || 0 : 0;

  let peak = 0;
  if (priced.peakSurcharge && priced.peakStartTime && priced.peakEndTime) {
    const md = String(start || '').slice(5, 10); // YYYY-MM-DD → MM-DD
    if (/^\d{2}-\d{2}$/.test(md)) {
      const inPeak =
        priced.peakStartTime > priced.peakEndTime
          ? md >= priced.peakStartTime || md <= priced.peakEndTime
          : md >= priced.peakStartTime && md <= priced.peakEndTime;
      if (inPeak) peak = Number(priced.peakSurcharge) || 0;
    }
  }

  return (Number(basePrice) || 0) + extraAmount + night + t2 + peak;
}

// ── 검증 ──────────────────────────────────────────────────────────────
export interface PriceCheckResult {
  ok: boolean;
  issues: string[];
  expectedCoreWon: number;
  submittedListWon: number;
  submittedTotalWon: number;
  /** 수수료에서 빼 줄 가입 쿠폰 (규칙 안: 카카오 첫 예약 · 최대 5,000원) */
  couponAllowedWon: number;
}

const won = (v: unknown) => Math.max(0, Math.round(Number(v) || 0));

export async function checkB2cReservationPrice(
  reservationId: string,
  data: FirebaseFirestore.DocumentData
): Promise<PriceCheckResult | null> {
  if (String(data.createdBy || '') !== B2C_SOURCE) return null;

  const companyId = String(data.companyId || '').trim();
  if (!companyId) return null;
  const db = admin.firestore();
  const companySnap = await db.collection('companies').doc(companyId).get();
  if (!companySnap.exists) return null;

  const company = mapPricingCompany(companyId, companySnap.data() || {});
  const isT2 =
    String(data.departureTerminal || '') === 'T2' || String(data.arrivalTerminal || '') === 'T2';
  const expectedCoreWon = expectedCorePrice(
    company,
    String(data.departureDate || ''),
    String(data.arrivalDate || ''),
    data.isIndoor === true,
    isT2,
    String(data.departureTime || '10:00'),
    String(data.arrivalTime || '10:00')
  );

  const total = won(data.totalPrice);
  const list = Math.max(won(data.listPrice), total);
  const coupon = won(data.signupCouponWon);
  const affiliate = won(data.affiliateCustomerDiscountWon);
  const issues: string[] = [];
  let couponAllowedWon = 0;

  if (expectedCoreWon > 0 && list + TOLERANCE_WON < expectedCoreWon) {
    issues.push(`정가가 기본 요금보다 낮음 (받은 ${list.toLocaleString()}원 · 기본 ${expectedCoreWon.toLocaleString()}원)`);
  }

  if (coupon > 0) {
    if (coupon > SIGNUP_COUPON_WON) issues.push(`가입 쿠폰이 ${SIGNUP_COUPON_WON.toLocaleString()}원보다 큼 (${coupon.toLocaleString()}원)`);
    if (data.memberProvider !== 'kakao') {
      issues.push('카카오 회원이 아닌데 가입 쿠폰 적용');
    } else {
      const uid = String(data.userId || '').trim();
      const prev = await db.collection('reservations').where('userId', '==', uid).limit(50).get();
      const used = prev.docs.some(
        (d) =>
          d.id !== reservationId &&
          won(d.data().signupCouponWon) > 0 &&
          !/cancel/i.test(String(d.data().status || ''))
      );
      if (used) issues.push('가입 쿠폰을 이미 쓴 회원의 재사용');
      else couponAllowedWon = Math.min(coupon, SIGNUP_COUPON_WON);
    }
  }

  if (affiliate > 0) {
    const code = String(data.affiliateCode || '').trim();
    const aff = code ? await db.doc(`affiliates/${code}`).get() : null;
    const allowed = aff?.exists && String(aff.data()?.status || '') !== 'suspended'
      ? won(aff.data()?.customerDiscountWon)
      : 0;
    if (affiliate > allowed) {
      issues.push(`제휴 할인이 허용 금액보다 큼 (${affiliate.toLocaleString()}원 · 허용 ${allowed.toLocaleString()}원)`);
    }
  }

  // 포인트는 생성 직후 서버가 따로 빼므로 여기서는 쿠폰·제휴 할인만 본다
  if (total + TOLERANCE_WON < list - coupon - affiliate) {
    issues.push(`결제 금액이 정가−할인보다 낮음 (받은 ${total.toLocaleString()}원)`);
  }

  return {
    ok: issues.length === 0,
    issues,
    expectedCoreWon,
    submittedListWon: list,
    submittedTotalWon: total,
    couponAllowedWon,
  };
}

/**
 * 문제 있을 때만 예약에 표시한다. 본사가 따로 확인하지 않는다 (2026-11-14 대표 결정):
 * 수수료 정산이 expectedCoreWon(기본 요금)·couponAllowedWon 기준으로 자동 계산한다.
 */
export async function recordPriceCheckIssue(
  reservationId: string,
  _data: FirebaseFirestore.DocumentData,
  result: PriceCheckResult
): Promise<void> {
  if (result.ok) return;
  await admin.firestore().doc(`reservations/${reservationId}`).update({
    priceCheck: {
      ok: false,
      issues: result.issues,
      expectedCoreWon: result.expectedCoreWon,
      submittedListWon: result.submittedListWon,
      submittedTotalWon: result.submittedTotalWon,
      couponAllowedWon: result.couponAllowedWon,
      checkedAt: new Date().toISOString(),
    },
  });
}
