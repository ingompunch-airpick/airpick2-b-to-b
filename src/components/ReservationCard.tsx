import React from 'react';
import { PlusCircle, Bell, CheckCircle2 } from 'lucide-react';
import { Reservation, ReservationStatus } from '../types';
import { isReservationUnpaid } from '../utils/paymentStatus';
import { isPending, statusBadgeColorClass, statusToLabel } from '../utils/reservationStatus';
import {
  bookingSourceBadgeClass,
  bookingSourceCardClass,
  bookingSourceLabel,
  isAirpickB2CBooking,
  resolveBookingSourceFromReservation,
} from '../utils/bookingSource';
import type { DepartureAlertLevel } from '../utils/departureImminent';
import { formatDepartureCountdown, getMinutesUntilDeparture } from '../utils/departureImminent';

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
  /** 대표+하위 통합 관리 시 업체 구분 라벨 */
  showCompanyLabel?: boolean;
  setAdminEditingReservationId: (id: string) => void;
  setDriverDetailRes: (res: Reservation) => void;
  handleUpdateValetStatus: (id: string, status: ReservationStatus, extra?: any) => void;
  getKSTDateTimeString: () => string;
  setScratchModalTargetId: (id: string) => void;
  setSelectedParkingSpace: (space: string) => void;
}

export default function ReservationCard({
  res,
  idx,
  isAdminModeActive,
  activeCounterTab,
  departureAlert = null,
  showCompanyLabel = false,
  setAdminEditingReservationId,
  setDriverDetailRes,
  handleUpdateValetStatus,
  getKSTDateTimeString,
  setScratchModalTargetId,
  setSelectedParkingSpace,
}: ReservationCardProps) {
  // 실제 배정된 자리만 표시(없으면 미지정), 실내/야외는 접수 시 결정된 등급(res.isIndoor) 사용
  const computedSpace = res.parkingSpace || '미지정';
  const isOutOrCompletedIn = (res.status || '').includes('out') || res.status === 'completed_in';
  const isT1 = ((!res.status.includes('out') && res.status !== 'completed_in') ? res.departureTerminal : res.arrivalTerminal) === 'T1';
  const isIndoor = res.isIndoor !== false;
  const showUnpaidBadge = isReservationUnpaid(res);
  const bookingSource = resolveBookingSourceFromReservation(res);
  const showBookingSourceBadge = bookingSource !== 'unknown';
  // 기사 타임라인: 상단 탭이 이미 상태를 나타내므로 입고예정·입고요청 등 상태 뱃지 숨김
  const showStatusBadge = isAdminModeActive || activeCounterTab === undefined;

  const badgeColorClass = statusBadgeColorClass(res.status);
  const minutesUntilDeparture = departureAlert ? getMinutesUntilDeparture(res) : null;

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
        'transition-all p-4.5 rounded-[20px] flex flex-col md:flex-row md:items-center justify-between gap-3.5 border shadow-sm cursor-pointer select-none active:scale-[0.99]',
        departureAlert === 'overdue' && 'ring-2 ring-rose-500/50 border-rose-500/40',
        departureAlert === 'imminent' && 'ring-2 ring-amber-500/45 border-amber-500/35',
        !departureAlert && bookingSourceCardClass(bookingSource)
      )}
      id={`card-${res.id}`}
    >
      {/* Left Details Panel */}
      <div className="space-y-2">
        {/* 1st Row: Dynamic Soft Pills/Badges (Toss Aesthetic) */}
        <div className="flex flex-wrap items-center gap-1.5">
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

          {isT1 ? (
            <span className="text-[13px] px-2 py-0.5 rounded-[6px] font-semibold bg-[#00D2FF]/10 text-[#00D2FF] border border-[#00D2FF]/20 shrink-0">
              1터미널
            </span>
          ) : (
            <span className="text-[13px] px-2 py-0.5 rounded-[6px] font-semibold bg-[#FFB800]/10 text-[#FFB800] border border-[#FFB800]/20 shrink-0">
              2터미널
            </span>
          )}

          {isIndoor ? (
            <span className="text-[13px] px-2 py-0.5 rounded-[6px] font-semibold bg-[#A855F7] text-white shrink-0">
              실내
            </span>
          ) : (
            <span className="text-[13px] px-2 py-0.5 rounded-[6px] font-semibold bg-[#22C55E] text-white shrink-0">
              야외
            </span>
          )}

          {showUnpaidBadge && (
            <span className="text-[13px] px-2 py-0.5 rounded-[6px] font-semibold bg-rose-500/15 text-rose-400 border border-rose-500/25 shrink-0">
              미납
            </span>
          )}

          {departureAlert && minutesUntilDeparture != null && (
            <span
              className={cn(
                'text-[13px] px-2 py-0.5 rounded-[6px] font-black border shrink-0',
                departureAlert === 'overdue'
                  ? 'bg-rose-500/20 text-rose-300 border-rose-500/35'
                  : 'bg-amber-500/20 text-amber-300 border-amber-500/35'
              )}
            >
              {departureAlert === 'overdue' ? '출차지연' : '출차임박'}{' '}
              · {formatDepartureCountdown(minutesUntilDeparture)}
            </span>
          )}

          {showBookingSourceBadge && bookingSource !== 'airpick-b2c' && bookingSource !== 'homepage' && (
            <span
              className={cn(
                'text-[13px] px-2 py-0.5 rounded-[6px] font-semibold border shrink-0',
                bookingSourceBadgeClass(bookingSource)
              )}
            >
              {bookingSourceLabel(bookingSource)}
            </span>
          )}

          {showCompanyLabel && res.companyName && (
            <span className="text-[13px] px-2 py-0.5 rounded-[6px] font-semibold bg-indigo-500/15 text-indigo-300 border border-indigo-500/25 shrink-0">
              {res.companyName}
            </span>
          )}
        </div>

        {/* 2nd Row: Plate Number + Time + Model/Space */}
        <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
          <span className="text-toss-display tabular-nums leading-none">
            {res.carNumber || "미등록차량"}
          </span>
          
          <span className="text-toss-body leading-none shrink-0 tabular-nums">
            {isOutOrCompletedIn ? '출차예정' : '입고예정'}{' '}
            {isOutOrCompletedIn ? res.arrivalTime : res.departureTime}
          </span>

          <span className="text-toss-caption leading-none shrink-0">
            {res.userName || '미지정'} · {res.carModel} · {computedSpace}
          </span>
        </div>
      </div>

      {/* Right Operations & Price Panel */}
      <div className="flex flex-row md:flex-col justify-between md:justify-center items-center md:items-end gap-2 border-t border-neutral-900/10 md:border-t-0 pt-2.5 md:pt-0 shrink-0">
        {!isAdminModeActive && (
          <div className="flex items-center gap-1.5 shrink-0">
            {isPending(res.status) && (
              <button
                type="button"
                onClick={() => handleUpdateValetStatus(res.id!, 'pending_in')}
                className="px-4 py-2 bg-[#007AFF] hover:bg-[#0051FF] text-white rounded-[14px] text-sm font-semibold transition-all flex items-center justify-center gap-1 shadow-sm min-w-[100px] cursor-pointer"
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
                className="px-4 py-2 bg-[#007AFF] hover:bg-[#0051FF] text-white rounded-[14px] text-sm font-black transition-all flex items-center justify-center gap-1.5 shadow-sm min-w-[100px] cursor-pointer"
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
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-[14px] text-sm font-semibold transition-all flex items-center justify-center gap-1.5 shadow-sm min-w-[100px] cursor-pointer"
                id={`action-request-${res.id}`}
              >
                <Bell size={13} className="animate-bounce" />
                출고요청
              </button>
            )}

            {res.status === 'request_out' && (
              <button
                type="button"
                onClick={() => handleUpdateValetStatus(res.id!, 'completed_out', {
                  actualExitTime: getKSTDateTimeString()
                })}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-[14px] text-sm font-semibold transition-all flex items-center justify-center gap-1.5 shadow-sm min-w-[100px] cursor-pointer"
                id={`action-complete-${res.id}`}
              >
                <CheckCircle2 size={13} />
                반납완료
              </button>
            )}
          </div>
        )}

        {/* Quiet, small Price Label at bottom corner */}
        <span className="text-toss-label tabular-nums text-[var(--color-toss-fg-muted)]">
          {res.totalPrice?.toLocaleString()}원
        </span>
      </div>
    </div>
  );
}
