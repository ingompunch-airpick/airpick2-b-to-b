import React, { useState } from 'react';
import { Reservation, ReservationStatus, PaymentMethod, type Company } from '../types';
import { isReservationUnpaid } from '../utils/paymentStatus';
import { isNotYetAdmitted, isPending, statusBadgeColorClass, statusToLabel } from '../utils/reservationStatus';
import {
  bookingSourceBadgeClass,
  bookingSourceCardClass,
  bookingSourceLabel,
  isAirpickB2CBooking,
  resolveBookingSourceFromReservation,
} from '../utils/bookingSource';
import { getFlightDelayBadge } from '../utils/flightDelayBadge';
import {
  getAirport,
  getDefaultTerminal,
  normalizeAirportId,
  terminalShortLabel,
} from '../utils/airport';
import {
  isGenericParkingSpaceLabel,
  parkingFacilityBadgeLabel,
  resolveCompanyLotsForReservation,
} from '../utils/parkingLot';
import MetaField from './MetaField';
import {
  resolveOperatorBrandLabel,
} from '../utils/operatorBrandLabel';

function cn(...classes: (string | boolean | undefined | null)[]) {
  return classes.filter(Boolean).join(' ');
}

/** 카드 뱃지 공통 틀. 색만 달라지고 크기·모서리는 같다. */
const CARD_CHIP =
  'text-[12px] px-1.5 py-0.5 rounded-md font-semibold border shrink-0';

/** 타임라인 상태 버튼. 탭 글자만 다르고 모양·색은 같다. */
const CARD_ACTION =
  'px-3.5 py-1.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-neutral-950 rounded-xl text-[13px] font-semibold whitespace-nowrap cursor-pointer';

interface ReservationCardProps {
  res: Reservation;
  idx: number;
  isAdminModeActive: boolean;
  /** 타임라인 탭과 동일한 상태면 뱃지 생략 (기사 모드) */
  activeCounterTab?: ReservationStatus;
  /**
   * 대표+하위 통합 그룹일 때 true — 모든 예약에 업체 메타 표시.
   */
  showCompanyLabel?: boolean;
  setAdminEditingReservationId: (id: string) => void;
  setDriverDetailRes: (res: Reservation) => void;
  handleUpdateValetStatus: (id: string, status: ReservationStatus, extra?: any) => void;
  getKSTDateTimeString: () => string;
  setScratchModalTargetId: (id: string) => void;
  setSelectedParkingSpace: (space: string) => void;
  /** 업체 parkingLots — 입고 후 lot 뱃지용 */
  companies?: Company[];
  /** 미납↔완납 토글 (타임라인에서 바로 수정) */
  onUpdatePayment?: (id: string, method: PaymentMethod) => void | Promise<void>;
}

export default function ReservationCard({
  res,
  idx,
  isAdminModeActive,
  activeCounterTab,
  showCompanyLabel = false,
  setAdminEditingReservationId,
  setDriverDetailRes,
  handleUpdateValetStatus,
  getKSTDateTimeString,
  setScratchModalTargetId,
  setSelectedParkingSpace,
  companies = [],
  onUpdatePayment,
}: ReservationCardProps) {
  const [actionBusy, setActionBusy] = useState(false);

  const runStatus = async (fn: () => void | Promise<void>) => {
    if (actionBusy) return;
    setActionBusy(true);
    try {
      await fn();
    } finally {
      setActionBusy(false);
    }
  };

  // 실제 배정된 자리만 표시(없으면 생략). 실내/야외·lot 이름은 뱃지로
  const spaceRaw = (res.parkingSpace || '').trim();
  const isGenericSpaceLabel = isGenericParkingSpaceLabel(spaceRaw) || spaceRaw === '미지정';
  const computedSpace = spaceRaw && !isGenericSpaceLabel ? spaceRaw : '';
  const companyLots = resolveCompanyLotsForReservation(companies, res.companyId);
  const facilityBadge = parkingFacilityBadgeLabel(res, companyLots);
  const isOutOrCompletedIn = (res.status || '').includes('out') || res.status === 'completed_in';
  /** 출고예정 탭에서 아직 미입고인 차 — 정보 유지 + 흐림 + 큰 「미입고」 */
  const isExitScheduleNotAdmitted =
    !isAdminModeActive &&
    activeCounterTab === 'completed_in' &&
    isNotYetAdmitted(res.status);
  const showAsExitSchedule = isOutOrCompletedIn || isExitScheduleNotAdmitted;
  const airportId = normalizeAirportId(res.airport);
  const activeTerminalCode =
    (!res.status.includes('out') && res.status !== 'completed_in' && !isExitScheduleNotAdmitted)
      ? res.departureTerminal
      : res.arrivalTerminal;
  const terminalCode = activeTerminalCode || getDefaultTerminal(airportId);
  const isSurchargeTerminal = getAirport(airportId).surchargeTerminalCodes.some(
    (c) => c.toUpperCase() === String(terminalCode).trim().toUpperCase()
  );
  const terminalBadgeText = terminalShortLabel(airportId, terminalCode);
  const showUnpaidBadge = isReservationUnpaid(res);
  const bookingSource = resolveBookingSourceFromReservation(res);
  const flightDelayBadge = getFlightDelayBadge(res);
  // 기사 타임라인: 상단 탭이 이미 상태를 나타내므로 입고예정·입고요청 등 상태 뱃지 숨김
  const showStatusBadge = isAdminModeActive || activeCounterTab === undefined;

  const badgeColorClass = statusBadgeColorClass(res.status);

  const operatorBrandLabel = resolveOperatorBrandLabel(res, companies, showCompanyLabel);

  return (
    <div 
      onClick={(e) => {
        // Only trigger action if the user did not click on a status button
        if ((e.target as HTMLElement).closest('button')) return;
        if (isAdminModeActive) {
          setAdminEditingReservationId(res.id!);
        } else {
          setDriverDetailRes(res);
        }
      }}
      className={cn(
        'transition-all px-3.5 py-3 sm:p-4.5 rounded-[20px] flex flex-row items-center justify-between gap-2.5 sm:gap-3.5 border shadow-sm cursor-pointer select-none active:scale-[0.99]',
        bookingSourceCardClass(bookingSource)
      )}
      id={`card-${res.id}`}
    >
      {/* Left Details Panel */}
      <div className={cn('space-y-1.5 sm:space-y-2 min-w-0 flex-1', isExitScheduleNotAdmitted && 'opacity-40')}>
        {/* 1st Row: Dynamic Soft Pills/Badges (Toss Aesthetic) */}
        <div className="flex flex-wrap items-center gap-1.5">
          {/* 에어픽(B2C) 유입만 표시 — 홈페이지·현장은 뱃지 없음 */}
          {isAirpickB2CBooking(res.createdBy) && (
            <span
              className={cn(CARD_CHIP, bookingSourceBadgeClass('airpick-b2c'))}
            >
              {bookingSourceLabel('airpick-b2c')}
            </span>
          )}

          {showStatusBadge && (
            <span className={cn(CARD_CHIP, 'text-center', badgeColorClass)}>
              {statusToLabel(res.status, 'driver')}
            </span>
          )}

          {isSurchargeTerminal ? (
            <span className={cn(CARD_CHIP, 'bg-[#FFB800]/14 text-[#FFB800] border-[#FFB800]/30')}>
              {terminalBadgeText}
            </span>
          ) : (
            <span className={cn(CARD_CHIP, 'bg-[#00D2FF]/12 text-[#00D2FF] border-[#00D2FF]/28')}>
              {terminalBadgeText}
            </span>
          )}

          {facilityBadge.isIndoor ? (
            <span className={cn(CARD_CHIP, 'bg-[#A855F7]/16 text-[#C084FC] border-[#A855F7]/35')}>
              {facilityBadge.text}
            </span>
          ) : (
            <span className={cn(CARD_CHIP, 'bg-[#22C55E]/14 text-[#4ADE80] border-[#22C55E]/32')}>
              {facilityBadge.text}
            </span>
          )}

          {onUpdatePayment && res.id ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                const next = showUnpaidBadge ? 'paid' : 'unpaid';
                const label = next === 'paid' ? '완납' : '미납';
                if (!window.confirm(`결제 상태를 「${label}」으로 바꿀까요?`)) return;
                void onUpdatePayment(res.id!, next);
              }}
              className={cn(
                CARD_CHIP,
                'cursor-pointer active:scale-95 transition-transform',
                showUnpaidBadge
                  ? 'bg-rose-500/14 text-rose-400 border-rose-500/30'
                  : 'bg-emerald-500/14 text-emerald-400 border-emerald-500/30'
              )}
              title={showUnpaidBadge ? '탭하면 완납으로 변경' : '탭하면 미납으로 변경'}
            >
              {showUnpaidBadge ? '미납' : '완납'}
            </button>
          ) : (
            showUnpaidBadge && (
              <span className={cn(CARD_CHIP, 'bg-rose-500/14 text-rose-400 border-rose-500/30')}>
                미납
              </span>
            )
          )}

        </div>

        {/* 2nd Row: Plate + model (always together). Time on its own line to avoid wrap on narrow phones. */}
        <div className="space-y-1 min-w-0">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 min-w-0">
            <span className="text-toss-display tabular-nums leading-none shrink-0">
              {res.carNumber || '미등록차량'}
            </span>
            {(res.carModel || computedSpace) && (
              <span className="text-toss-caption leading-none min-w-0 truncate">
                {[res.carModel, computedSpace].filter(Boolean).join(' · ')}
              </span>
            )}
          </div>
          <div className="flex items-baseline gap-2 min-w-0">
            <span className="text-toss-body leading-none tabular-nums text-[var(--color-toss-fg-muted)]">
              {showAsExitSchedule ? res.arrivalTime : res.departureTime}
            </span>
            {flightDelayBadge && (
              <span className="text-[13px] font-semibold leading-none text-orange-400 tabular-nums">
                {flightDelayBadge.label === '결항'
                  ? '결항'
                  : flightDelayBadge.delayMinutes > 0
                    ? `${flightDelayBadge.delayMinutes}분 연착`
                    : '연착'}
              </span>
            )}
          </div>
          {operatorBrandLabel ? (
            <MetaField label="업체" value={operatorBrandLabel} className="text-[12px]" />
          ) : null}
        </div>
      </div>

      {/* Right: action + price — always beside details so the list stays shorter */}
      <div className="flex flex-col justify-center items-end gap-1.5 shrink-0 self-stretch">
        {!isAdminModeActive && (
          isExitScheduleNotAdmitted ? (
            <span className="text-sm font-semibold text-zinc-400 tracking-tight leading-none select-none px-1">
              미입고
            </span>
          ) : (
          <div className="flex items-center shrink-0">
            {isPending(res.status) && (
              <button
                type="button"
                disabled={actionBusy}
                onClick={() =>
                  void runStatus(() => handleUpdateValetStatus(res.id!, 'pending_in'))
                }
                className={CARD_ACTION}
                id={`action-in-${res.id}`}
              >
                입고 시작
              </button>
            )}

            {res.status === 'pending_in' && (
              <button
                type="button"
                disabled={actionBusy}
                onClick={() => {
                  setScratchModalTargetId(res.id!);
                  setSelectedParkingSpace(res.parkingSpace || '');
                }}
                className={CARD_ACTION}
                id={`action-confirm-${res.id}`}
              >
                사진 등록
              </button>
            )}

            {res.status === 'completed_in' && (
              <button
                type="button"
                disabled={actionBusy}
                onClick={() =>
                  void runStatus(() => handleUpdateValetStatus(res.id!, 'request_out'))
                }
                className={CARD_ACTION}
                id={`action-request-${res.id}`}
              >
                출고요청
              </button>
            )}

            {res.status === 'request_out' && (
              <button
                type="button"
                disabled={actionBusy}
                onClick={() => {
                  if (
                    !window.confirm(
                      '반납완료 처리할까요?\n출차 후 앱 보관 기간(90일)이 시작됩니다.'
                    )
                  ) {
                    return;
                  }
                  void runStatus(() =>
                    handleUpdateValetStatus(res.id!, 'completed_out', {
                      actualExitTime: getKSTDateTimeString(),
                    })
                  );
                }}
                className={CARD_ACTION}
                id={`action-complete-${res.id}`}
              >
                반납완료
              </button>
            )}
          </div>
          )
        )}

        {/* Quiet price — 하위 업체명은 뱃지 대신 가격 왼쪽 텍스트 */}
        <div className={cn(
          'flex items-baseline justify-end gap-1.5 min-w-0',
          isExitScheduleNotAdmitted && 'opacity-40'
        )}>
          <span className="text-[11px] sm:text-toss-label tabular-nums text-[var(--color-toss-fg-muted)] shrink-0">
            {res.totalPrice?.toLocaleString()}원
          </span>
        </div>
      </div>
    </div>
  );
}
