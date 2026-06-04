import React from 'react';
import { PlusCircle, Bell, CheckCircle2 } from 'lucide-react';
import { Reservation, ReservationStatus } from '../types';
import { isReservationUnpaid } from '../utils/paymentStatus';

function cn(...classes: (string | boolean | undefined | null)[]) {
  return classes.filter(Boolean).join(' ');
}

const getStepKorean = (st: ReservationStatus | string) => {
  if (['pending', '입고예정', '예약완료', '접수', '입고대기'].includes(st)) {
    return '입고예정';
  }
  switch (st) {
    case 'pending': return '입고예정';
    case 'pending_in': return '입고요청';
    case 'request_out': return '출고요청';
    case 'completed_in': return '출고예정';
    case 'completed_out': return '인도완료';
    default: return String(st);
  }
};

interface ReservationCardProps {
  res: Reservation;
  idx: number;
  isAdminModeActive: boolean;
  /** 타임라인 탭과 동일한 상태면 뱃지 생략 (기사 모드) */
  activeCounterTab?: ReservationStatus;
  setAdminEditingReservationId: (id: string) => void;
  setDriverDetailRes: (res: Reservation) => void;
  handleUpdateValetStatus: (id: string, status: ReservationStatus, extra?: any) => void;
  getKSTDateTimeString: () => string;
  setScratchModalTargetId: (id: string) => void;
  setUploadedSpots: (spots: any) => void;
  setSelectedParkingSpace: (space: string) => void;
}

export default function ReservationCard({
  res,
  idx,
  isAdminModeActive,
  activeCounterTab,
  setAdminEditingReservationId,
  setDriverDetailRes,
  handleUpdateValetStatus,
  getKSTDateTimeString,
  setScratchModalTargetId,
  setUploadedSpots,
  setSelectedParkingSpace,
}: ReservationCardProps) {
  // 실제 배정된 자리만 표시(없으면 미지정), 실내/야외는 접수 시 결정된 등급(res.isIndoor) 사용
  const computedSpace = res.parkingSpace || '미지정';
  const isOutOrCompletedIn = (res.status || '').includes('out') || res.status === 'completed_in';
  const isT1 = ((!res.status.includes('out') && res.status !== 'completed_in') ? res.departureTerminal : res.arrivalTerminal) === 'T1';
  const isIndoor = res.isIndoor !== false;
  const showUnpaidBadge = isReservationUnpaid(res);
  // 기사 타임라인: 상단 탭이 이미 상태를 나타내므로 입고예정·입고요청 등 상태 뱃지 숨김
  const showStatusBadge = isAdminModeActive || activeCounterTab === undefined;

  const badgeColorClass = ['pending', '입고예정', '예약완료', '접수', '입고대기'].includes(res.status) ? "bg-amber-500/10 text-amber-500" :
    res.status === 'pending_in' ? "bg-sky-500/10 text-sky-450" :
    res.status === 'request_out' ? "bg-rose-500/10 text-rose-450" :
    res.status === 'completed_in' ? "bg-emerald-500/10 text-emerald-450" :
    "bg-[#2C2C2E] text-neutral-400";

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
        "bg-[#1C1C1E] transition-all p-4.5 rounded-[20px] flex flex-col md:flex-row md:items-center justify-between gap-3.5 border border-neutral-900/5 shadow-sm cursor-pointer select-none active:scale-[0.99]"
      )}
      id={`card-${res.id}`}
    >
      {/* Left Details Panel */}
      <div className="space-y-2">
        {/* 1st Row: Dynamic Soft Pills/Badges (Toss Aesthetic) */}
        <div className="flex flex-wrap items-center gap-1.5">
          {showStatusBadge && (
            <span className={cn(
              "text-[12px] px-2 py-0.5 rounded-[6px] font-semibold shrink-0 text-center",
              badgeColorClass
            )}>
              {getStepKorean(res.status)}
            </span>
          )}

          {isT1 ? (
            <span className="text-[12px] px-2 py-0.5 rounded-[6px] font-semibold bg-[#00D2FF]/10 text-[#00D2FF] border border-[#00D2FF]/20 shrink-0">
              1터미널
            </span>
          ) : (
            <span className="text-[12px] px-2 py-0.5 rounded-[6px] font-semibold bg-[#FFB800]/10 text-[#FFB800] border border-[#FFB800]/20 shrink-0">
              2터미널
            </span>
          )}

          {isIndoor ? (
            <span className="text-[12px] px-2 py-0.5 rounded-[6px] font-semibold bg-[#A855F7] text-white shrink-0">
              실내
            </span>
          ) : (
            <span className="text-[12px] px-2 py-0.5 rounded-[6px] font-semibold bg-[#22C55E] text-white shrink-0">
              야외
            </span>
          )}

          {showUnpaidBadge && (
            <span className="text-[12px] px-2 py-0.5 rounded-[6px] font-semibold bg-rose-500/15 text-rose-400 border border-rose-500/25 shrink-0">
              미납
            </span>
          )}
        </div>

        {/* 2nd Row: Plate Number + Time + Model/Space */}
        <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
          <span className="text-toss-display tabular-nums leading-none">
            {res.carNumber || "미등록차량"}
          </span>
          
          <span className="text-toss-body leading-none shrink-0 tabular-nums">
            {isOutOrCompletedIn ? '출고예정' : '입고예정'}{' '}
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
            {['pending', '입고예정', '예약완료', '접수', '입고대기'].includes(res.status) && (
              <button
                type="button"
                onClick={() => handleUpdateValetStatus(res.id!, 'pending_in')}
                className="px-4 py-2 bg-[#007AFF] hover:bg-[#0051FF] text-white rounded-[14px] text-sm font-semibold transition-all flex items-center justify-center gap-1 shadow-sm min-w-[100px] cursor-pointer"
                id={`action-in-${res.id}`}
              >
                <PlusCircle size={11} />
                입고 시작
              </button>
            )}

            {res.status === 'pending_in' && (
              <button
                type="button"
                onClick={() => {
                  setScratchModalTargetId(res.id!);
                  setUploadedSpots({});
                  setSelectedParkingSpace(res.parkingSpace || '');
                }}
                className="px-4 py-2 bg-[#007AFF] hover:bg-[#0051FF] text-white rounded-[14px] text-xs font-black transition-all flex items-center justify-center gap-1.5 shadow-sm min-w-[100px] cursor-pointer"
                id={`action-confirm-${res.id}`}
              >
                <PlusCircle size={11} />
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
                <Bell size={11} className="animate-bounce" />
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
                <CheckCircle2 size={11} />
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
