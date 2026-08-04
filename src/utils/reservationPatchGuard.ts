import { deleteField } from 'firebase/firestore';
import type { Company, Reservation, ReservationStatus } from '../types';
import { recalculateReservationPrice } from './pricing';
import { normalizeReservationStatus } from './reservationStatus';

/** 요금·일정 연동에 영향을 주는 필드 */
const PRICE_AFFECTING_KEYS = [
  'departureDate',
  'departureTime',
  'arrivalDate',
  'arrivalTime',
  'isIndoor',
  'departureTerminal',
  'arrivalTerminal',
] as const;

type PriceKey = (typeof PRICE_AFFECTING_KEYS)[number];

function hasPriceAffectingChange(patch: Partial<Reservation>): boolean {
  return PRICE_AFFECTING_KEYS.some((k) => patch[k] !== undefined);
}

function joinSchedule(date?: string, time?: string, preferSpace = false): string {
  const d = (date || '').trim();
  if (!d) return '';
  const t = (time || '00:00').trim() || '00:00';
  return preferSpace ? `${d} ${t}` : `${d}T${t}`;
}

/** 기존 startDate/endDate 구분자가 공백이면 공백 유지 */
function prefersSpaceSeparator(existing?: string): boolean {
  const s = String(existing || '');
  return s.includes(' ') && !s.includes('T');
}

/**
 * 예약 partial 저장 시 빠져 나가기 쉬운 연동 필드를 채운다.
 * - 일정/실내외/터미널 변경 → totalPrice 재계산 (patch에 totalPrice가 명시되면 존중)
 * - departure/arrival → startDate/endDate
 * - arrivalFlight → inboundFlight
 */
export function enrichReservationWritePatch(
  current: Reservation,
  patch: Partial<Reservation>,
  company?: Company | null
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...patch };

  if (patch.arrivalFlight !== undefined && patch.inboundFlight === undefined) {
    out.inboundFlight = patch.arrivalFlight;
  }

  const nextDepDate =
    patch.departureDate !== undefined ? patch.departureDate : current.departureDate;
  const nextDepTime =
    patch.departureTime !== undefined ? patch.departureTime : current.departureTime;
  const nextArrDate =
    patch.arrivalDate !== undefined ? patch.arrivalDate : current.arrivalDate;
  const nextArrTime =
    patch.arrivalTime !== undefined ? patch.arrivalTime : current.arrivalTime;

  const scheduleTouched =
    patch.departureDate !== undefined ||
    patch.departureTime !== undefined ||
    patch.arrivalDate !== undefined ||
    patch.arrivalTime !== undefined;

  if (scheduleTouched) {
    if (patch.startDate === undefined) {
      out.startDate = joinSchedule(
        nextDepDate,
        nextDepTime,
        prefersSpaceSeparator(current.startDate)
      );
    }
    if (patch.endDate === undefined) {
      out.endDate = joinSchedule(
        nextArrDate,
        nextArrTime,
        prefersSpaceSeparator(current.endDate)
      );
    }
  }

  // 보호 필드 — 클라이언트 partial 업데이트에서 비밀번호 변경 시도 제거 (rules 거부·부분 실패 방지)
  if ('reservationPassword' in out) {
    delete out.reservationPassword;
  }

  const priceExplicit = patch.totalPrice !== undefined;
  const nextStatus = normalizeReservationStatus(
    (patch.status !== undefined ? patch.status : current.status) as ReservationStatus | string
  );
  const ensurePriceOnCheckInOut =
    nextStatus === 'completed_in' || nextStatus === 'completed_out';
  const currentPrice = Number(current.totalPrice) || 0;
  const needsRecalc =
    hasPriceAffectingChange(patch) || (ensurePriceOnCheckInOut && currentPrice <= 0);

  if (!priceExplicit && needsRecalc) {
    const mergedForPrice = { ...current, ...patch } as Reservation;
    const price = recalculateReservationPrice(mergedForPrice, company);
    /**
     * 업체 요금이 비어 있거나(실내 요금 미설정 등) 일정이 불완전하면 0이 나온다.
     * 이미 받아둔 금액을 0으로 덮으면 확인증·알림톡·정산이 전부 0원이 되므로 유지한다.
     * 금액을 0으로 만들어야 하면 patch.totalPrice 로 명시한다.
     */
    if (price > 0) out.totalPrice = price;
  }

  return out;
}

/** 상태 되돌릴 때 남겨두면 안 되는 실제시각·보관 만료 필드 */
export function statusRevertCleanupPatch(
  fromStatus: ReservationStatus | string,
  toStatus: ReservationStatus | string
): Record<string, unknown> {
  const from = normalizeReservationStatus(fromStatus);
  const to = normalizeReservationStatus(toStatus);
  const out: Record<string, unknown> = {};

  // 출차완료 → 출고: 실제 출차·보관 만료·출고 담당 제거
  if (from === 'completed_out' && to === 'request_out') {
    out.actualExitTime = deleteField();
    out.completedOutAt = deleteField();
    out.dataPurgeAt = deleteField();
    out.storagePurgeAt = deleteField();
    out.checkedOutBy = deleteField();
    out.checkedOutAt = deleteField();
  }

  // 입고완료(주차) → 입고: 실제 입고 시각·입고 담당 제거
  if (from === 'completed_in' && to === 'pending_in') {
    out.actualParkingTime = deleteField();
    out.checkedInBy = deleteField();
    out.checkedInAt = deleteField();
  }

  // 취소 → 예약완료 복구: 취소 메타 제거
  if (from === 'cancelled' && to === 'pending') {
    out.cancelReason = deleteField();
    out.cancelNote = deleteField();
    out.cancelledAt = deleteField();
  }

  return out;
}

export function patchTouchesPriceFields(patch: Partial<Reservation>): boolean {
  return hasPriceAffectingChange(patch);
}

export type { PriceKey };
