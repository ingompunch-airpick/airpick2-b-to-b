/**
 * 에어픽 운영 점수 — 계산만 한다 (Firestore 없음).
 * 기준: 「에어픽 입점 업체 수수료·등급 정책 (안)」 2026-11-28
 *
 * ① 최소 기준 — 하나라도 못 넘으면 기준 미달(추천순 아래쪽)
 *    입고 사진·주차 위치 80%(판정월 2027-03부터 90%) · 출고 미처리 0건 · 업체 사정 취소 월 1건 이하(→ 0건)
 * ② 점수 100점 + 자체 예약 가산
 *    사진 25 · 주차 위치 15 · 입고 처리 속도 20 · 출고 처리 15 · 후기 15 · 업체 사정 취소 10
 * ③ 순위 — 에어픽 입고 5건 이상만. 1등 3 · 2등 2 (80점 이상일 때만) · 그 밖 1 · 미달 0
 */

export const SCORE_POLICY = {
  photoMin: 4,
  speedHours: 3,
  minIntakesForRank: 5,
  topWeightMinScore: 80,
  /** 이 판정월부터 90% · 업체 사정 취소 0건 (4월 적용분) */
  strictFromMonth: '2027-03',
  lenient: { ratio: 0.8, partnerCancels: 1 },
  strict: { ratio: 0.9, partnerCancels: 0 },
  points: { photo: 25, parking: 15, speed: 20, checkout: 15, review: 15, cancel: 10 },
  reviewPenalty: 5,
  lowReviewMax: 3,
  ownBonus: [
    { min: 50, points: 10 },
    { min: 20, points: 5 },
  ],
  missLimit: 80,
} as const;

const HOUR = 60 * 60 * 1000;
const KST = 9 * HOUR;

export type ScoreReservation = {
  id: string;
  /** 대표 업체 id (와와 별칭 합침) */
  companyId: string;
  /** 에어픽(B2C) 예약 */
  airpick: boolean;
  status: string;
  departureYmd: string;
  departureHm: string;
  arrivalYmd: string;
  /** 입고완료 누른 시각 (ms). 모르면 null */
  checkInMs: number | null;
  /** 출고완료 누른 시각 (ms). 모르면 null */
  checkOutMs: number | null;
  photoCount: number;
  hasParkingLot: boolean;
  cancelledBy: string;
  cancelledMs: number | null;
  /** 차량번호 끝 4자리 (업체가 예약을 찾게) */
  carTail: string;
};

export type ScoreReview = {
  id: string;
  companyId: string;
  rating: number;
  createdMs: number;
};

export type ScoreCompany = { id: string; name: string };

export type MissKind = 'photo' | 'parking' | 'speed' | 'checkout' | 'cancel' | 'review';

export type ScoreMiss = {
  kind: MissKind;
  reservationId: string;
  /** 관련 날짜 (맡기는 날·찾는 날·취소일·후기일) */
  ymd: string;
  carTail?: string;
  note: string;
  /** 최소 기준(출고 미처리)에 걸린 건 */
  blocking?: boolean;
};

export type RatioItem = { ok: number; total: number; points: number; max: number };

export type CompanyScore = {
  companyId: string;
  companyName: string;
  month: string;
  strict: boolean;
  /** 이달 에어픽 맡기는 예약 (취소 제외) */
  airpickIntakes: number;
  /** 그중 입고완료 */
  checkedIn: number;
  items: {
    photo: RatioItem;
    parking: RatioItem;
    speed: RatioItem;
    checkout: RatioItem;
    review: { low: number; points: number; max: number };
    cancel: { count: number; points: number; max: number };
    own: { count: number; points: number };
  };
  score: number;
  minimum: {
    ratio: number;
    photo: boolean;
    parking: boolean;
    checkoutOpen: number;
    checkout: boolean;
    cancelMax: number;
    cancel: boolean;
  };
  /** ranked: 순위 · few: 입고 5건 미만(순위 없음) · below: 기준 미달 */
  status: 'ranked' | 'few' | 'below';
  rank: number | null;
  rankedCount: number;
  weight: 0 | 1 | 2 | 3;
  badge: boolean;
  misses: ScoreMiss[];
  missTotal: number;
};

export type MonthScoreResult = {
  month: string;
  strict: boolean;
  companies: CompanyScore[];
};

export function kstMs(ymd: string, hm = '00:00'): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null;
  const time = /^\d{1,2}:\d{2}/.test(hm) ? hm.slice(0, 5).padStart(5, '0') : '00:00';
  const ms = Date.parse(`${ymd}T${time}:00+09:00`);
  return Number.isNaN(ms) ? null : ms;
}

export function kstYmd(ms: number): string {
  return new Date(ms + KST).toISOString().slice(0, 10);
}

function kstHm(ms: number): string {
  return new Date(ms + KST).toISOString().slice(11, 16);
}

export function addDaysYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1 + delta, 1)).toISOString().slice(0, 7);
}

export function isStrictMonth(month: string): boolean {
  return month >= SCORE_POLICY.strictFromMonth;
}

const CHECKED_IN = new Set(['completed_in', 'request_out', 'completed_out']);

function isCheckedIn(r: ScoreReservation): boolean {
  return CHECKED_IN.has(r.status) || r.checkInMs != null;
}

function ratioItem(ok: number, total: number, max: number): RatioItem {
  const points = total > 0 ? (ok / total) * max : max;
  return { ok, total, points: round1(points), max };
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function durationLabel(ms: number): string {
  const minutes = Math.max(0, Math.round(ms / 60000));
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h && m) return `${h}시간 ${m}분`;
  if (h) return `${h}시간`;
  return `${m}분`;
}

function shortDate(ymd: string): string {
  return ymd ? `${Number(ymd.slice(5, 7))}/${Number(ymd.slice(8, 10))}` : '';
}

function ownBonus(count: number): number {
  for (const tier of SCORE_POLICY.ownBonus) {
    if (count >= tier.min) return tier.points;
  }
  return 0;
}

function scoreCompany(
  company: ScoreCompany,
  month: string,
  nowMs: number,
  rows: ScoreReservation[],
  reviews: ScoreReview[]
): CompanyScore {
  const P = SCORE_POLICY;
  const strict = isStrictMonth(month);
  const rule = strict ? P.strict : P.lenient;
  const monthStart = kstMs(`${month}-01`)!;
  const nextStart = kstMs(`${shiftMonth(month, 1)}-01`)!;
  const misses: ScoreMiss[] = [];

  const intakes = rows.filter(
    (r) => r.airpick && r.status !== 'cancelled' && r.departureYmd.startsWith(month)
  );
  const checkedIn = intakes.filter(isCheckedIn);

  // 입고 사진 · 주차 위치
  let photoOk = 0;
  let parkingOk = 0;
  for (const r of checkedIn) {
    if (r.photoCount >= P.photoMin) photoOk += 1;
    else {
      misses.push({
        kind: 'photo',
        reservationId: r.id,
        ymd: r.departureYmd,
        carTail: r.carTail,
        note: r.photoCount > 0 ? `사진 ${r.photoCount}장` : '사진 없음',
      });
    }
    if (r.hasParkingLot) parkingOk += 1;
    else {
      misses.push({
        kind: 'parking',
        reservationId: r.id,
        ymd: r.departureYmd,
        carTail: r.carTail,
        note: '보관 주차장 선택 안 함',
      });
    }
  }

  // 입고 처리 속도 — 맡기는 시각 + 3시간 안에 입고완료
  let speedOk = 0;
  let speedTotal = 0;
  for (const r of intakes) {
    const start = kstMs(r.departureYmd, r.departureHm);
    if (start == null) continue;
    const deadline = start + P.speedHours * HOUR;
    if (r.checkInMs != null) {
      speedTotal += 1;
      if (r.checkInMs <= deadline) speedOk += 1;
      else {
        misses.push({
          kind: 'speed',
          reservationId: r.id,
          ymd: r.departureYmd,
          carTail: r.carTail,
          note: `맡기는 시각 ${durationLabel(r.checkInMs - start)} 뒤 입고완료`,
        });
      }
      continue;
    }
    // 입고완료인데 누른 시각이 없으면(예전 기록) 재지 않는다
    if (isCheckedIn(r)) continue;
    if (deadline > nowMs) continue;
    speedTotal += 1;
    misses.push({
      kind: 'speed',
      reservationId: r.id,
      ymd: r.departureYmd,
      carTail: r.carTail,
      note: '입고완료 안 누름',
    });
  }

  // 출고 처리 — 찾는 날 안에 출고완료 / 다음 날 정오 넘기면 미처리(최소 기준)
  let checkoutOk = 0;
  let checkoutTotal = 0;
  let checkoutOpen = 0;
  const outs = rows.filter(
    (r) => r.airpick && r.status !== 'cancelled' && r.arrivalYmd.startsWith(month)
  );
  for (const r of outs) {
    const dayEnd = kstMs(addDaysYmd(r.arrivalYmd, 1));
    const grace = kstMs(addDaysYmd(r.arrivalYmd, 1), '12:00');
    if (dayEnd == null || grace == null) continue;
    const done = r.status === 'completed_out';
    if (done) {
      if (r.checkOutMs == null) continue;
      checkoutTotal += 1;
      if (r.checkOutMs < dayEnd) {
        checkoutOk += 1;
        continue;
      }
      const blocking = r.checkOutMs > grace;
      if (blocking) checkoutOpen += 1;
      misses.push({
        kind: 'checkout',
        reservationId: r.id,
        ymd: r.arrivalYmd,
        carTail: r.carTail,
        note: `${shortDate(kstYmd(r.checkOutMs))} ${kstHm(r.checkOutMs)} 출고완료`,
        ...(blocking ? { blocking: true } : {}),
      });
      continue;
    }
    if (dayEnd > nowMs) continue;
    checkoutTotal += 1;
    const blocking = nowMs >= grace;
    if (blocking) checkoutOpen += 1;
    misses.push({
      kind: 'checkout',
      reservationId: r.id,
      ymd: r.arrivalYmd,
      carTail: r.carTail,
      note: '출고완료 안 누름',
      ...(blocking ? { blocking: true } : {}),
    });
  }

  // 업체 사정 취소
  const partnerCancels = rows.filter(
    (r) =>
      r.airpick &&
      r.status === 'cancelled' &&
      r.cancelledBy === 'partner' &&
      r.cancelledMs != null &&
      r.cancelledMs >= monthStart &&
      r.cancelledMs < nextStart
  );
  for (const r of partnerCancels) {
    misses.push({
      kind: 'cancel',
      reservationId: r.id,
      ymd: kstYmd(r.cancelledMs!),
      carTail: r.carTail,
      note: '업체 사정 취소',
    });
  }

  // 후기 1~3점
  const lowReviews = reviews.filter(
    (v) =>
      v.rating >= 1 &&
      v.rating <= P.lowReviewMax &&
      v.createdMs >= monthStart &&
      v.createdMs < nextStart
  );
  for (const v of lowReviews) {
    misses.push({
      kind: 'review',
      reservationId: v.id,
      ymd: kstYmd(v.createdMs),
      note: `후기 ${v.rating}점`,
    });
  }

  // 자체 예약 — 앱에 등록하고 입고까지 간 것
  const own = rows.filter(
    (r) => !r.airpick && r.status !== 'cancelled' && r.departureYmd.startsWith(month) && isCheckedIn(r)
  ).length;

  const items: CompanyScore['items'] = {
    photo: ratioItem(photoOk, checkedIn.length, P.points.photo),
    parking: ratioItem(parkingOk, checkedIn.length, P.points.parking),
    speed: ratioItem(speedOk, speedTotal, P.points.speed),
    checkout: ratioItem(checkoutOk, checkoutTotal, P.points.checkout),
    review: {
      low: lowReviews.length,
      points: Math.max(0, P.points.review - P.reviewPenalty * lowReviews.length),
      max: P.points.review,
    },
    cancel: {
      count: partnerCancels.length,
      points:
        partnerCancels.length === 0
          ? P.points.cancel
          : partnerCancels.length === 1
            ? P.points.cancel / 2
            : 0,
      max: P.points.cancel,
    },
    own: { count: own, points: ownBonus(own) },
  };

  const score = round1(
    items.photo.points +
      items.parking.points +
      items.speed.points +
      items.checkout.points +
      items.review.points +
      items.cancel.points +
      items.own.points
  );

  const enough = checkedIn.length >= P.minIntakesForRank;
  const ratioPass = (item: RatioItem) => item.total === 0 || item.ok / item.total >= rule.ratio;
  const minimum: CompanyScore['minimum'] = {
    ratio: rule.ratio,
    photo: ratioPass(items.photo),
    parking: ratioPass(items.parking),
    checkoutOpen,
    checkout: checkoutOpen === 0,
    cancelMax: rule.partnerCancels,
    cancel: partnerCancels.length <= rule.partnerCancels,
  };

  // 건수 기준(출고 미처리·업체 취소)은 표본이 적어도 본다. 비율 기준은 입고 5건부터.
  let status: CompanyScore['status'];
  if (!minimum.checkout || !minimum.cancel) status = 'below';
  else if (!enough) status = 'few';
  else if (!minimum.photo || !minimum.parking) status = 'below';
  else status = 'ranked';

  misses.sort((a, b) => b.ymd.localeCompare(a.ymd) || a.kind.localeCompare(b.kind));

  return {
    companyId: company.id,
    companyName: company.name,
    month,
    strict,
    airpickIntakes: intakes.length,
    checkedIn: checkedIn.length,
    items,
    score,
    minimum,
    status,
    rank: null,
    rankedCount: 0,
    weight: status === 'below' ? 0 : 1,
    badge: false,
    misses: misses.slice(0, P.missLimit),
    missTotal: misses.length,
  };
}

/** 정렬: 점수 → 입고 처리 속도 → 후기 → id */
function compareRanked(a: CompanyScore, b: CompanyScore): number {
  return (
    b.score - a.score ||
    b.items.speed.points - a.items.speed.points ||
    b.items.review.points - a.items.review.points ||
    a.companyId.localeCompare(b.companyId)
  );
}

export function computeMonthScores(input: {
  month: string;
  nowMs: number;
  companies: ScoreCompany[];
  reservations: ScoreReservation[];
  reviews: ScoreReview[];
}): MonthScoreResult {
  const { month, nowMs } = input;
  const byCompany = new Map<string, ScoreReservation[]>();
  for (const r of input.reservations) {
    const list = byCompany.get(r.companyId);
    if (list) list.push(r);
    else byCompany.set(r.companyId, [r]);
  }
  const reviewsByCompany = new Map<string, ScoreReview[]>();
  for (const v of input.reviews) {
    const list = reviewsByCompany.get(v.companyId);
    if (list) list.push(v);
    else reviewsByCompany.set(v.companyId, [v]);
  }

  const scores = input.companies.map((c) =>
    scoreCompany(c, month, nowMs, byCompany.get(c.id) || [], reviewsByCompany.get(c.id) || [])
  );

  const ranked = scores.filter((s) => s.status === 'ranked').sort(compareRanked);
  ranked.forEach((s, index) => {
    s.rank = index + 1;
    const top = s.score >= SCORE_POLICY.topWeightMinScore;
    s.weight = index === 0 && top ? 3 : index === 1 && top ? 2 : 1;
    s.badge = s.weight === 3;
  });
  for (const s of scores) s.rankedCount = ranked.length;

  const order = { ranked: 0, few: 1, below: 2 } as const;
  scores.sort(
    (a, b) =>
      order[a.status] - order[b.status] ||
      (a.rank ?? 99) - (b.rank ?? 99) ||
      b.score - a.score ||
      a.companyName.localeCompare(b.companyName, 'ko')
  );

  return { month, strict: isStrictMonth(month), companies: scores };
}
