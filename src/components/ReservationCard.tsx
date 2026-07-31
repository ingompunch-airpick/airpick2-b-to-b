import React from 'react';
import { PlusCircle, Bell, CheckCircle2 } from 'lucide-react';
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
import type { DepartureAlertLevel } from '../utils/departureImminent';
import { formatDepartureCountdown, getMinutesUntilDeparture } from '../utils/departureImminent';
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

function cn(...classes: (string | boolean | undefined | null)[]) {
  return classes.filter(Boolean).join(' ');
}

interface ReservationCardProps {
  res: Reservation;
  idx: number;
  isAdminModeActive: boolean;
  /** 타임라인 탭과 동일한 상태면 뱃지 생략 (기사 모드) */
  activeCounterTab?: ReservationStatus;
  /** 출차 임박·지연 강조 */
  departureAlert?: DepartureAlertLevel | null;
  /**
   * 대표+하위 통합 그룹일 때 true.
   * 하위(대표 id와 다른 companyId) 예약만 가격 왼쪽에 업체명 텍스트 표시.
   */
  showCompanyLabel?: boolean;
  /** 로그인 대표 업체 id — 하위 여부 판별용 */
  primaryCompanyId?: string;
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
  departureAlert = null,
  showCompanyLabel = false,
  primaryCompanyId = '',
  setAdminEditingReservationId,
  setDriverDetailRes,
  handleUpdateValetStatus,
  getKSTDateTimeString,
  setScratchModalTargetId,
  setSelectedParkingSpace,
  companies = [],
  onUpdatePayment,
}: ReservationCardProps) {
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
  // 기사 타임라인: 상단 탭이 이미 상태를 나타내므로 입고예정·입고요청 등 상태 뱃지 숨김
  const showStatusBadge = isAdminModeActive || activeCounterTab === undefined;

  const badgeColorClass = statusBadgeColorClass(res.status);
  const minutesUntilDeparture = departureAlert ? getMinutesUntilDeparture(res) : null;

  const resCompanyId = (res.companyId || '').trim().toLowerCase();
  const primaryId = (primaryCompanyId || '').trim().toLowerCase();
  const subCompanyName =
    showCompanyLabel &&
    resCompanyId &&
    primaryId &&
    resCompanyId !== primaryId
      ? (res.companyName || '').trim() || resCompanyId
      : '';

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
        departureAlert === 'overdue' && 'border-rose-500/35',
        departureAlert === 'imminent' && 'border-amber-500/30',
        !departureAlert && bookingSourceCardClass(bookingSource)
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
              className={cn(
                'text-[13px] px-2.5 py-0.5 rounded-[6px] border shrink-0',
                bookingSourceBadgeClass('airpick-b2c')
              )}
            >
              {bookingSourceLabel('airpick-b2c')}
            </span>
          )}

          {showStatusBadge && (
            <span className={cn(
              "text-[13px] px-2 py-0.5 rounded-[6px] font-semibold shrink-0 text-center",
              badgeColorClass
            )}>
              {statusToLabel(res.status, 'driver')}
            </span>
          )}

          {isSurchargeTerminal ? (
            <span className="text-[13px] px-2 py-0.5 rounded-[6px] font-semibold bg-[#FFB800]/10 text-[#FFB800] border border-[#FFB800]/20 shrink-0">
              {terminalBadgeText}
            </span>
          ) : (
            <span className="text-[13px] px-2 py-0.5 rounded-[6px] font-semibold bg-[#00D2FF]/10 text-[#00D2FF] border border-[#00D2FF]/20 shrink-0">
              {terminalBadgeText}
            </span>
          )}

          {facilityBadge.isIndoor ? (
            <span className="text-[13px] px-2 py-0.5 rounded-[6px] font-semibold bg-[#A855F7] text-white shrink-0">
              {facilityBadge.text}
            </span>
          ) : (
            <span className="text-[13px] px-2 py-0.5 rounded-[6px] font-semibold bg-[#22C55E] text-white shrink-0">
              {facilityBadge.text}
            </span>
          )}

          {onUpdatePayment && res.id ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                void onUpdatePayment(res.id!, showUnpaidBadge ? 'paid' : 'unpaid');
              }}
              className={cn(
                'text-[13px] px-2 py-0.5 rounded-[6px] font-semibold border shrink-0 cursor-pointer active:scale-95 transition-transform',
                showUnpaidBadge
                  ? 'bg-rose-500/12 text-rose-400 border-rose-500/20'
                  : 'bg-emerald-500/12 text-emerald-400 border-emerald-500/20'
              )}
              title={showUnpaidBadge ? '탭하면 완납으로 변경' : '탭하면 미납으로 변경'}
            >
              {showUnpaidBadge ? '미납' : '완납'}
            </button>
          ) : (
            showUnpaidBadge && (
              <span className="text-[13px] px-2 py-0.5 rounded-[6px] font-semibold bg-rose-500/12 text-rose-400 border border-rose-500/20 shrink-0">
                미납
              </span>
            )
          )}

          {departureAlert && minutesUntilDeparture != null && (
            <span
              className={cn(
                'text-[13px] px-2 py-0.5 rounded-[6px] font-semibold border shrink-0',
                departureAlert === 'overdue'
                  ? 'bg-rose-500/15 text-rose-300 border-rose-500/25'
                  : 'bg-amber-500/12 text-amber-300 border-amber-500/25'
              )}
            >
              {departureAlert === 'overdue' ? '출차지연' : '출차임박'}{' '}
              · {formatDepartureCountdown(minutesUntilDeparture)}
            </span>
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
          <div className="text-toss-body leading-none tabular-nums text-[var(--color-toss-fg-muted)]">
            {showAsExitSchedule ? res.arrivalTime : res.departureTime}
          </div>
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
                onClick={() => handleUpdateValetStatus(res.id!, 'pending_in')}
                className="px-3 py-2 sm:px-4 bg-[#007AFF] hover:bg-[#0051FF] text-white rounded-[12px] sm:rounded-[14px] text-[13px] sm:text-sm font-semibold transition-all flex items-center justify-center gap-1 shadow-sm whitespace-nowrap cursor-pointer"
                id={`action-in-${res.id}`}
              >
                <PlusCircle size={13} />
                입고 시작
              </button>
            )}

            {res.status === 'pending_in' && (
              <button
                type="button"
                onClick={() => {
                  setScratchModalTargetId(res.id!);
                  setSelectedParkingSpace(res.parkingSpace || '');
                }}
                className="px-3 py-2 sm:px-4 bg-[#007AFF] hover:bg-[#0051FF] text-white rounded-[12px] sm:rounded-[14px] text-[13px] sm:text-sm font-semibold transition-all flex items-center justify-center gap-1.5 shadow-sm whitespace-nowrap cursor-pointer"
                id={`action-confirm-${res.id}`}
              >
                <PlusCircle size={13} />
                사진 등록
              </button>
            )}

            {res.status === 'completed_in' && (
              <button
                type="button"
                onClick={() => handleUpdateValetStatus(res.id!, 'request_out')}
                className="px-3 py-2 sm:px-4 bg-rose-600 hover:bg-rose-500 text-white rounded-[12px] sm:rounded-[14px] text-[13px] sm:text-sm font-semibold transition-all flex items-center justify-center gap-1.5 shadow-sm whitespace-nowrap cursor-pointer"
                id={`action-request-${res.id}`}
              >
                <Bell size={13} />
                출고요청
              </button>
            )}

            {res.status === 'request_out' && (
              <button
                type="button"
                onClick={() => handleUpdateValetStatus(res.id!, 'completed_out', {
                  actualExitTime: getKSTDateTimeString()
                })}
                className="px-3 py-2 sm:px-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-[12px] sm:rounded-[14px] text-[13px] sm:text-sm font-semibold transition-all flex items-center justify-center gap-1.5 shadow-sm whitespace-nowrap cursor-pointer"
                id={`action-complete-${res.id}`}
              >
                <CheckCircle2 size={13} />
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
          {subCompanyName ? (
            <span className="text-toss-label text-[var(--color-toss-fg-muted)] truncate max-w-[5.5rem] sm:max-w-[7.5rem]">
              {subCompanyName}
            </span>
          ) : null}
          <span className="text-[11px] sm:text-toss-label tabular-nums text-[var(--color-toss-fg-muted)] shrink-0">
            {res.totalPrice?.toLocaleString()}원
          </span>
        </div>
      </div>
    </div>
  );
}
