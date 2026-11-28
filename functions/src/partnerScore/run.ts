import * as admin from 'firebase-admin';
import { resolveBookingSource } from '../sheets/bookingSource';
import {
  addDaysYmd,
  computeMonthScores,
  kstMs,
  kstYmd,
  shiftMonth,
  type CompanyScore,
  type ScoreCompany,
  type ScoreReservation,
  type ScoreReview,
} from './compute';

/** 이 달부터 점수를 남긴다. 그 전 달은 자동 확정하지 않는다. */
export const SCORE_START_MONTH = '2026-11';
/** 이 판정월부터 손님 추천순 가중치(partnerExposure)를 낸다. 11월은 시험 계산. */
export const EXPOSURE_START_MONTH = '2026-12';

const HQ_ID = 'airpick';
const WAWA_IDS = new Set(['wawa', 'wawa_valet', '와와', '와와발렛']);

function db() {
  return admin.firestore();
}

/** 예약에 붙은 사진 URL 수 (images · scratchPhotos.urls · 예전 4면) — 겹치는 URL은 한 번 */
export function countReservationPhotos(data: Record<string, unknown>): number {
  const urls = new Set<string>();
  const add = (value: unknown) => {
    const url = typeof value === 'string' ? value.trim() : '';
    if (url) urls.add(url);
  };
  if (Array.isArray(data.images)) data.images.forEach(add);
  const scratch = data.scratchPhotos as Record<string, unknown> | undefined;
  if (scratch && typeof scratch === 'object') {
    if (Array.isArray(scratch.urls)) scratch.urls.forEach(add);
    for (const side of ['front', 'rear', 'left', 'right']) add(scratch[side]);
  }
  return urls.size;
}

function statusOf(value: unknown): string {
  const raw = String(value ?? '').trim();
  const aliases: Record<string, string> = {
    pending: 'pending',
    입고예정: 'pending',
    예약완료: 'pending',
    접수: 'pending',
    입고대기: 'pending',
    pending_in: 'pending_in',
    입고요청: 'pending_in',
    request_out: 'request_out',
    출고요청: 'request_out',
    completed_in: 'completed_in',
    주차완료: 'completed_in',
    출고예정: 'completed_in',
    completed_out: 'completed_out',
    인도완료: 'completed_out',
    출차완료: 'completed_out',
    cancelled: 'cancelled',
    취소: 'cancelled',
  };
  return aliases[raw] || aliases[raw.toLowerCase()] || 'pending';
}

function ymd(value: unknown): string {
  const match = String(value ?? '').trim().match(/(\d{4})\D*(\d{2})\D*(\d{2})/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : '';
}

function hm(value: unknown): string {
  const match = String(value ?? '').trim().match(/(\d{1,2}):(\d{2})/);
  return match ? `${match[1].padStart(2, '0')}:${match[2]}` : '00:00';
}

/** ISO(Z·오프셋 포함)는 그대로, 'YYYY-MM-DD HH:mm(:ss)'는 한국 시각으로 읽는다 */
function timeMs(value: unknown): number | null {
  const text = String(value ?? '').trim();
  if (!text) return null;
  if (/T.*(Z|[+-]\d{2}:?\d{2})$/.test(text)) {
    const ms = Date.parse(text);
    return Number.isNaN(ms) ? null : ms;
  }
  const match = text.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})/);
  return match ? kstMs(match[1], match[2]) : null;
}

function firstTime(...values: unknown[]): number | null {
  for (const value of values) {
    const ms = timeMs(value);
    if (ms != null) return ms;
  }
  return null;
}

type CompanyIndex = {
  list: ScoreCompany[];
  resolve: (rawId: unknown, rawName?: unknown) => string;
};

async function loadCompanies(): Promise<CompanyIndex> {
  const snap = await db().collection('companies').get();
  const list: ScoreCompany[] = [];
  let wawaId = '';
  for (const doc of snap.docs) {
    const data = doc.data();
    const id = doc.id;
    const name = String(data.name || '').trim();
    if (!name || id.toLowerCase() === HQ_ID) continue;
    if (data.status === 'suspended') continue;
    if (data.isAirpickPartner === false || data.listingApproved === false) continue;
    if (WAWA_IDS.has(id.toLowerCase())) {
      if (wawaId) continue;
      wawaId = id;
    }
    list.push({ id, name });
  }
  const known = new Set(list.map((c) => c.id));
  const resolve = (rawId: unknown, rawName?: unknown): string => {
    const id = String(rawId ?? '').trim();
    const name = String(rawName ?? '');
    if (
      WAWA_IDS.has(id.toLowerCase()) ||
      name.toLowerCase().includes('wawa') ||
      name.includes('와와')
    ) {
      return wawaId || 'wawa';
    }
    if (known.has(id)) return id;
    const lower = id.toLowerCase();
    return known.has(lower) ? lower : id;
  };
  return { list, resolve };
}

export function toScoreReservation(
  id: string,
  data: Record<string, unknown>,
  resolve: CompanyIndex['resolve']
): ScoreReservation {
  const source = resolveBookingSource(
    typeof data.createdBy === 'string' ? data.createdBy : null,
    data
  );
  const purged = Number(data.photoCountAtPurge) || 0;
  const carDigits = String(data.carNumber ?? '').replace(/\D/g, '');
  return {
    id,
    companyId: resolve(data.companyId, data.companyName),
    airpick: source === 'airpick-b2c',
    status: statusOf(data.status),
    departureYmd: ymd(data.departureDate),
    departureHm: hm(data.departureTime),
    arrivalYmd: ymd(data.arrivalDate),
    checkInMs: firstTime(data.checkedInAt, data.actualParkingTime),
    checkOutMs: firstTime(data.checkedOutAt, data.completedOutAt, data.actualExitTime),
    photoCount: Math.max(countReservationPhotos(data), purged),
    hasParkingLot: String(data.parkingLotId ?? '').trim() !== '',
    cancelledBy: String(data.cancelledBy ?? '').trim(),
    cancelledMs: timeMs(data.cancelledAt),
    carTail: carDigits.slice(-4),
  };
}

async function queryRange(
  field: string,
  start: string,
  end: string,
  into: Map<string, Record<string, unknown>>
): Promise<void> {
  const snap = await db()
    .collection('reservations')
    .where(field, '>=', start)
    .where(field, '<=', end)
    .get();
  for (const doc of snap.docs) into.set(doc.id, doc.data());
}

function monthEnd(month: string): string {
  return addDaysYmd(`${shiftMonth(month, 1)}-01`, -1);
}

async function loadReservations(
  month: string,
  resolve: CompanyIndex['resolve']
): Promise<ScoreReservation[]> {
  const start = `${month}-01`;
  const end = monthEnd(month);
  const rows = new Map<string, Record<string, unknown>>();
  await Promise.all([
    queryRange('departureDate', start, `${end}`, rows),
    queryRange('arrivalDate', start, `${end}`, rows),
    // cancelledAt 은 ISO(UTC). 한국 그달 1일 0시 = 전날 15시 Z
    queryRange('cancelledAt', `${addDaysYmd(start, -1)}T15`, `${end}T15`, rows),
  ]);
  return [...rows].map(([id, data]) => toScoreReservation(id, data, resolve));
}

async function loadReviews(month: string, resolve: CompanyIndex['resolve']): Promise<ScoreReview[]> {
  const startMs = kstMs(`${month}-01`)!;
  const endMs = kstMs(`${shiftMonth(month, 1)}-01`)!;
  const snap = await db()
    .collection('reviews')
    .where('createdAt', '>=', new Date(startMs).toISOString())
    .where('createdAt', '<', new Date(endMs).toISOString())
    .get();
  const out: ScoreReview[] = [];
  for (const doc of snap.docs) {
    const data = doc.data();
    if (data.status !== 'published') continue;
    const rating = Number(data.rating);
    const createdMs = Date.parse(String(data.createdAt || ''));
    if (!Number.isInteger(rating) || Number.isNaN(createdMs)) continue;
    out.push({ id: doc.id, companyId: resolve(data.companyId), rating, createdMs });
  }
  return out;
}

function summaryRow(s: CompanyScore) {
  return {
    companyId: s.companyId,
    companyName: s.companyName,
    score: s.score,
    status: s.status,
    rank: s.rank,
    weight: s.weight,
    badge: s.badge,
    airpickIntakes: s.airpickIntakes,
    checkedIn: s.checkedIn,
    missTotal: s.missTotal,
    points: {
      photo: s.items.photo.points,
      parking: s.items.parking.points,
      speed: s.items.speed.points,
      checkout: s.items.checkout.points,
      review: s.items.review.points,
      cancel: s.items.cancel.points,
      own: s.items.own.points,
    },
  };
}

export type ScoreRunResult = {
  month: string;
  final: boolean;
  companies: number;
  ranked: number;
  exposurePublished: boolean;
};

/**
 * 한 달 점수를 계산해 저장한다.
 * final=false: 이번 달 진행 중(매일 갱신) · final=true: 지난달 확정(순위·노출 가중치)
 */
export async function computeAndStoreMonth(
  month: string,
  options: { final: boolean; nowMs?: number; by?: string }
): Promise<ScoreRunResult> {
  const nowMs = options.nowMs ?? Date.now();
  const companies = await loadCompanies();
  const [reservations, reviews] = await Promise.all([
    loadReservations(month, companies.resolve),
    loadReviews(month, companies.resolve),
  ]);
  const result = computeMonthScores({
    month,
    nowMs,
    companies: companies.list,
    reservations,
    reviews,
  });

  const computedAt = new Date(nowMs).toISOString();
  const trial = month < EXPOSURE_START_MONTH;
  const meta = {
    final: options.final,
    trial,
    computedAt,
    ...(options.by ? { computedBy: options.by } : {}),
  };

  const batch = db().batch();
  for (const s of result.companies) {
    batch.set(db().collection('partnerScores').doc(s.companyId).collection('months').doc(month), {
      ...s,
      ...meta,
    });
  }
  batch.set(db().collection('partnerScoreMonths').doc(month), {
    month,
    strict: result.strict,
    ...meta,
    companies: result.companies.map(summaryRow),
  });

  let exposurePublished = false;
  if (options.final && !trial) {
    const appliesMonth = shiftMonth(month, 1);
    const weights: Record<string, number> = {};
    let badgeCompanyId: string | null = null;
    for (const s of result.companies) {
      weights[s.companyId] = s.weight;
      if (s.badge) badgeCompanyId = s.companyId;
    }
    const exposure = {
      judgedMonth: month,
      appliesMonth,
      weights,
      badgeCompanyId,
      confirmedAt: computedAt,
    };
    batch.set(db().collection('partnerExposure').doc(appliesMonth), exposure);
    batch.set(db().collection('partnerExposure').doc('current'), exposure);
    exposurePublished = true;
  }
  await batch.commit();

  return {
    month,
    final: options.final,
    companies: result.companies.length,
    ranked: result.companies.filter((s) => s.status === 'ranked').length,
    exposurePublished,
  };
}

/**
 * 매일: 이번 달 점수 갱신. 지난달이 아직 확정 전이면 확정한다
 * (1일 13시 이후 — 말일 찾는 예약의 「다음 날 정오」 마감이 지난 뒤).
 */
export async function runDailyPartnerScores(nowMs = Date.now()): Promise<ScoreRunResult[]> {
  const today = kstYmd(nowMs);
  const month = today.slice(0, 7);
  const out: ScoreRunResult[] = [];
  const prev = shiftMonth(month, -1);
  if (prev >= SCORE_START_MONTH) {
    const snap = await db().collection('partnerScoreMonths').doc(prev).get();
    const firstDayNoonPassed = nowMs >= (kstMs(`${month}-01`, '12:00') ?? 0);
    if (snap.data()?.final !== true && firstDayNoonPassed) {
      out.push(await computeAndStoreMonth(prev, { final: true, nowMs, by: 'schedule' }));
    }
  }
  if (month >= SCORE_START_MONTH) {
    out.push(await computeAndStoreMonth(month, { final: false, nowMs, by: 'schedule' }));
  }
  return out;
}
