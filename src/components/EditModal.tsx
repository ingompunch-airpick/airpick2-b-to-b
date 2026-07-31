import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { ArrowLeft, Phone, ChevronDown, MoreHorizontal } from 'lucide-react';
import { Reservation, Company } from '../types';
import {
  isPending,
  isNotYetAdmitted,
  isCompletedOut,
  isCancelled,
  isAdmitted,
  statusToLabel,
} from '../utils/reservationStatus';
import {
  paymentChoiceToMethod,
  reservationToPaymentChoice,
} from '../utils/paymentStatus';
import {
  bookingSourceBadgeClass,
  bookingSourceLabel,
  resolveBookingSourceFromReservation,
  isExternalCustomerBooking,
} from '../utils/bookingSource';
import AirlinePicker from './AirlinePicker';
import { normalizeAirportId, terminalLabel } from '../utils/airport';
import {
  buildParkingAssignmentFields,
  defaultParkingLotId,
  isGenericParkingSpaceLabel,
  resolveCompanyLotsForReservation,
} from '../utils/parkingLot';
import { buildReceiptUrl } from '../utils/receipt';

function cn(...classes: (string | boolean | undefined | null)[]) {
  return classes.filter(Boolean).join(' ');
}

interface EditModalProps {
  driverDetailRes: Reservation | null;
  onClose: () => void;
  isEmployee: boolean;
  employeeName: string;
  isSuperAdmin: boolean;
  /** 업체 마스터·부관리자 — 입고완료/출고완료 되돌리기 */
  canManageDeepRevert?: boolean;
  onSave: (updateData: any) => Promise<void>;
  onStatusAction: () => Promise<void>;
  /** 상태를 한 칸 전으로 되돌리기 */
  onRevertStatus?: () => Promise<void>;
  onCancelReservation?: () => Promise<void>;
  companies?: Company[];
}

export default function EditModal({
  driverDetailRes,
  onClose,
  isEmployee,
  employeeName,
  isSuperAdmin,
  canManageDeepRevert = false,
  onSave,
  onStatusAction,
  onRevertStatus,
  onCancelReservation,
  companies = [],
}: EditModalProps) {
  const [driverEditPhone, setDriverEditPhone] = useState('');
  const [driverEditUserName, setDriverEditUserName] = useState('');
  const [driverEditUserRequest, setDriverEditUserRequest] = useState('');
  const [driverEditAdminMemo, setDriverEditAdminMemo] = useState('');
  const [driverEditLinkerMemo, setDriverEditLinkerMemo] = useState('');
  const [driverEditLotId, setDriverEditLotId] = useState('');
  const [driverEditDestination, setDriverEditDestination] = useState('');
  const [driverEditDeptAirline, setDriverEditDeptAirline] = useState('');
  const [driverEditDeptFlight, setDriverEditDeptFlight] = useState('');
  const [driverEditArrAirline, setDriverEditArrAirline] = useState('');
  const [driverEditArrFlight, setDriverEditArrFlight] = useState('');
  const [driverEditReservationPassword, setDriverEditReservationPassword] = useState('');
  const [driverEditCarNumber, setDriverEditCarNumber] = useState('');
  const [driverEditCarModel, setDriverEditCarModel] = useState('');
  const [driverEditDepartureDate, setDriverEditDepartureDate] = useState('');
  const [driverEditDepartureTime, setDriverEditDepartureTime] = useState('');
  const [driverEditArrivalDate, setDriverEditArrivalDate] = useState('');
  const [driverEditArrivalTime, setDriverEditArrivalTime] = useState('');
  const [paymentChoice, setPaymentChoice] = useState<'unpaid' | 'paid'>('unpaid');
  /** 요청·특이사항: 내용 있으면 펼침, 없으면 접힘 */
  const [notesOpen, setNotesOpen] = useState(false);
  /** 헤더 ⋯ — 되돌리기·취소 */
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => {
    if (driverDetailRes) {
      setDriverEditPhone(driverDetailRes.phone || '');
      setDriverEditUserName(driverDetailRes.userName || '');
      const requestText =
        (driverDetailRes as any).userRequest ||
        (driverDetailRes as any).customerNotes ||
        driverDetailRes.paymentNotes ||
        '';
      const memoText = driverDetailRes.adminMemo || '';
      setDriverEditUserRequest(requestText);
      setDriverEditAdminMemo(memoText);
      setNotesOpen(!!(String(requestText).trim() || String(memoText).trim()));
      setMoreOpen(false);
      const space = (driverDetailRes.parkingSpace || (driverDetailRes as any).linkerMemo || '').trim();
      setDriverEditLinkerMemo(isGenericParkingSpaceLabel(space) ? '' : space);
      const lots = resolveCompanyLotsForReservation(companies, driverDetailRes.companyId);
      setDriverEditLotId(
        defaultParkingLotId(lots, driverDetailRes.isIndoor !== false, driverDetailRes.parkingLotId)
      );
      setDriverEditDestination(driverDetailRes.destination || '');
      setDriverEditDeptAirline(driverDetailRes.departureAirline || '');
      setDriverEditDeptFlight(driverDetailRes.departureFlight || '');
      setDriverEditArrAirline(driverDetailRes.arrivalAirline || '');
      setDriverEditArrFlight(
        driverDetailRes.arrivalFlight || (driverDetailRes as { inboundFlight?: string }).inboundFlight || ''
      );
      setDriverEditReservationPassword(driverDetailRes.reservationPassword || '');
      setDriverEditCarNumber(driverDetailRes.carNumber || '');
      setDriverEditCarModel(driverDetailRes.carModel || '');
      
      setDriverEditDepartureDate(driverDetailRes.departureDate || '');
      setDriverEditDepartureTime(driverDetailRes.departureTime || '');
      setDriverEditArrivalDate(driverDetailRes.arrivalDate || '');
      setDriverEditArrivalTime(driverDetailRes.arrivalTime || '');
      setPaymentChoice(reservationToPaymentChoice(driverDetailRes));
    }
  }, [driverDetailRes, companies]);

  if (!driverDetailRes) return null;

  const isPendingBeforeIntake = isPending(driverDetailRes.status);
  const doneOut = isCompletedOut(driverDetailRes.status);
  const cancelled = isCancelled(driverDetailRes.status);
  /** 취소·무효: 이미 취소된 건 제외, 입고 후·반납완료 포함 */
  const canCancel = !cancelled && !!onCancelReservation;
  const canAdvanceStatus =
    !cancelled &&
    !doneOut &&
    (isPendingBeforeIntake ||
      driverDetailRes.status === 'pending_in' ||
      driverDetailRes.status === 'completed_in' ||
      driverDetailRes.status === 'request_out');
  /** 기사: 입고→입고예정, 출고→출고예정 / 담당자: 입고완료·출고완료 되돌리기 */
  const revertLabel = (() => {
    if (!onRevertStatus || cancelled) return null;
    const st = driverDetailRes.status;
    if (st === 'pending_in') return '입고예정으로 되돌리기';
    if (st === 'request_out') return '출고예정으로 되돌리기';
    if (st === 'completed_in' && canManageDeepRevert) return '입고로 되돌리기';
    if (st === 'completed_out' && canManageDeepRevert) return '출고로 되돌리기';
    return null;
  })();
  const canRevertStatus = !!revertLabel;
  const advanceStatusLabel = isPendingBeforeIntake
    ? '입고 시작'
    : driverDetailRes.status === 'pending_in'
      ? '주차 완료'
      : driverDetailRes.status === 'completed_in'
        ? '출고요청'
        : driverDetailRes.status === 'request_out'
          ? '반납완료'
          : '상태 전환';
  const hasNotesContent = !!(driverEditUserRequest.trim() || driverEditAdminMemo.trim());
  const receiptUrl = buildReceiptUrl(driverDetailRes, window.location.origin);
  /** 같은 /r 페이지 — 상태에 따라 접수증·입고증·출차확인증 제목 */
  const receiptViewLabel = cancelled
    ? '접수증 보기'
    : doneOut
      ? '출차확인증 보기'
      : isAdmitted(driverDetailRes.status)
        ? '입고증 보기'
        : '접수증 보기';
  const showMoreMenu = canCancel || canRevertStatus || !!receiptUrl;
  const hideReservationPassword = isExternalCustomerBooking(driverDetailRes);
  const showLotPicker = !isNotYetAdmitted(driverDetailRes.status);
  const companyLots = resolveCompanyLotsForReservation(companies, driverDetailRes.companyId);

  const handleSave = () => {
    const operatorName = isEmployee ? employeeName : (isSuperAdmin ? '본사 마스터(최고관리자)' : '업체 마스터');
    const updateData: Record<string, unknown> = {
      phone: driverEditPhone,
      userName: driverEditUserName.trim(),
      userRequest: driverEditUserRequest,
      customerNotes: driverEditUserRequest,
      adminMemo: driverEditAdminMemo,
      linkerMemo: driverEditLinkerMemo,
      // 빈 문자열로 저장해 필드 비우기 가능 (undefined는 Firestore 거부·strip 시 무시됨)
      destination: driverEditDestination.trim(),
      departureAirline: driverEditDeptAirline.trim(),
      departureFlight: driverEditDeptFlight.trim(),
      arrivalAirline: driverEditArrAirline.trim(),
      arrivalFlight: driverEditArrFlight.trim(),
      inboundFlight: driverEditArrFlight.trim(),
      carNumber: driverEditCarNumber,
      carModel: driverEditCarModel,
      departureDate: driverEditDepartureDate,
      departureTime: driverEditDepartureTime,
      arrivalDate: driverEditArrivalDate,
      arrivalTime: driverEditArrivalTime,
      paymentMethod: paymentChoiceToMethod(paymentChoice),
      updatedBy: operatorName,
      updatedAt: new Date().toISOString(),
    };
    if (showLotPicker && driverEditLotId) {
      Object.assign(
        updateData,
        buildParkingAssignmentFields({
          parkingLotId: driverEditLotId,
          parkingSpace: driverEditLinkerMemo,
          lots: companyLots,
          fallbackIsIndoor: driverDetailRes.isIndoor !== false,
        })
      );
    } else {
      updateData.parkingSpace = driverEditLinkerMemo;
    }
    if (!hideReservationPassword) {
      updateData.reservationPassword = driverEditReservationPassword.trim();
    }
    onSave(updateData);
  };

  return (
    <div className="fixed inset-0 z-[145] flex items-center justify-center p-0 sm:p-4">
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-neutral-950/80 backdrop-blur-xs"
      />
      
      <motion.div 
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", damping: 25, stiffness: 220 }}
        className="relative bg-[#1C1C1E] text-white w-full sm:max-w-lg h-full sm:h-auto sm:max-h-[92vh] sm:rounded-[30px] flex flex-col overflow-hidden shadow-2xl font-sans z-10"
      >
        {/* Header: Back · Status · ⋯ */}
        <div className="px-5 py-4 border-b border-neutral-800 flex items-center bg-[#1C1C1E] justify-between gap-2 relative z-20">
          <button 
            type="button"
            onClick={onClose}
            className="flex items-center gap-2 text-zinc-350 hover:text-white transition-colors py-1 cursor-pointer min-w-0"
          >
            <ArrowLeft size={18} className="shrink-0" />
            <span className="text-[15px] font-bold text-white truncate">
              {driverDetailRes.userName || '고객'} · 상세
            </span>
          </button>
          <div className="flex items-center gap-1.5 shrink-0">
            <span className={cn(
              "text-[12.5px] px-2.5 py-1 rounded-full font-black tracking-wide uppercase",
              cancelled
                ? "bg-zinc-700/40 text-zinc-400"
                : doneOut
                  ? "bg-zinc-700/40 text-zinc-300"
                  : isPending(driverDetailRes.status)
                    ? "bg-amber-500/10 text-amber-500"
                    : "bg-rose-500/10 text-[#FF453A]"
            )}>
              {cancelled
                ? '취소됨'
                : doneOut
                  ? '반납완료'
                  : isPending(driverDetailRes.status)
                    ? '인계 전'
                    : statusToLabel(driverDetailRes.status, 'driver')}
            </span>
            {showMoreMenu && (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setMoreOpen((o) => !o)}
                  aria-label="더보기"
                  className={cn(
                    'p-1.5 rounded-lg transition-colors cursor-pointer',
                    moreOpen ? 'bg-neutral-800 text-white' : 'text-zinc-400 hover:text-white hover:bg-neutral-800/80'
                  )}
                >
                  <MoreHorizontal size={20} />
                </button>
                {moreOpen && (
                  <>
                    <button
                      type="button"
                      aria-label="메뉴 닫기"
                      className="fixed inset-0 z-30 cursor-default"
                      onClick={() => setMoreOpen(false)}
                    />
                    <div className="absolute right-0 top-full mt-1.5 z-40 min-w-[200px] rounded-xl border border-neutral-700 bg-[#2C2C2E] shadow-xl overflow-hidden py-1">
                      {!!receiptUrl && (
                        <button
                          type="button"
                          onClick={() => {
                            setMoreOpen(false);
                            window.open(receiptUrl, '_blank', 'noopener,noreferrer');
                          }}
                          className="w-full text-left px-4 py-3 text-[13.5px] font-bold text-sky-400 hover:bg-neutral-700/60 cursor-pointer"
                        >
                          {receiptViewLabel}
                        </button>
                      )}
                      {canRevertStatus && (
                        <button
                          type="button"
                          onClick={() => {
                            setMoreOpen(false);
                            onRevertStatus?.();
                          }}
                          className="w-full text-left px-4 py-3 text-[13.5px] font-bold text-amber-400 hover:bg-neutral-700/60 cursor-pointer"
                        >
                          {revertLabel}
                        </button>
                      )}
                      {canCancel && (
                        <button
                          type="button"
                          onClick={() => {
                            setMoreOpen(false);
                            onCancelReservation?.();
                          }}
                          className="w-full text-left px-4 py-3 text-[13.5px] font-bold text-rose-400 hover:bg-neutral-700/60 cursor-pointer"
                        >
                          {isPendingBeforeIntake ? '예약 취소' : '취소·무효'}
                        </button>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Scrollable Form Body */}
        <div className="flex-1 overflow-y-auto px-5 py-6 space-y-6">

          {/* 1. VEHICLE */}
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="relative group">
                <label className="text-[12px] font-black text-zinc-500 block mb-1">차량 번호</label>
                <input
                  type="text"
                  value={driverEditCarNumber}
                  onChange={(e) => setDriverEditCarNumber(e.target.value)}
                  className="w-full bg-[#1C1C1E] border-b border-[#2C2C2E] py-1.5 text-[13.5px] text-white font-extrabold outline-none focus:border-[#FF9F0A] transition-colors"
                  placeholder="차량번호"
                />
              </div>

              <div className="relative group">
                <label className="text-[12px] font-black text-zinc-500 block mb-1">차종 명칭</label>
                <input
                  type="text"
                  value={driverEditCarModel}
                  onChange={(e) => setDriverEditCarModel(e.target.value)}
                  className="w-full bg-[#1C1C1E] border-b border-[#2C2C2E] py-1.5 text-[13.5px] text-white font-bold outline-none focus:border-[#FF9F0A] transition-colors"
                  placeholder="그랜저 등"
                />
              </div>
            </div>
          </div>

          {/* 2. CUSTOMER */}
          <div className="space-y-4">
            <div className="relative group">
              <label className="text-[12px] font-black text-zinc-500 block mb-1">고객명</label>
              <input
                type="text"
                value={driverEditUserName}
                onChange={(e) => setDriverEditUserName(e.target.value)}
                className="w-full bg-[#1C1C1E] border-b border-[#2C2C2E] py-1.5 text-[14px] text-white font-bold outline-none focus:border-amber-500 transition-colors"
                placeholder="고객 이름"
              />
            </div>

            <div className="relative group">
              <label className="text-[12px] font-black text-zinc-500 block mb-1">전화번호</label>
              <div className="relative">
                <input
                  type="text"
                  value={driverEditPhone}
                  onChange={(e) => setDriverEditPhone(e.target.value)}
                  className="w-full bg-[#1C1C1E] border-b border-[#2C2C2E] py-1.5 pr-8 text-[13.5px] text-white font-bold outline-none focus:border-amber-500 transition-colors font-mono"
                  placeholder="전화번호를 입력해주세요"
                />
                <Phone size={14} className="absolute right-1 top-2.5 text-zinc-500" />
              </div>
            </div>
          </div>

          {/* 3. 일정 · 주차 · 수납 */}
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-[12px] font-black text-[#8E8E93] block mb-1">입고 날짜 (입차일자)</label>
                <input
                  type="date"
                  value={driverEditDepartureDate}
                  onChange={(e) => setDriverEditDepartureDate(e.target.value)}
                  className="w-full bg-[#1C1C1E] border-b border-[#2C2C2E] py-1 text-xs text-white font-bold outline-none focus:border-amber-500 transition-colors"
                />
              </div>
              <div>
                <label className="text-[12px] font-black text-[#8E8E93] block mb-1">입고 시각 (입차시간)</label>
                <input
                  type="text"
                  value={driverEditDepartureTime}
                  onChange={(e) => setDriverEditDepartureTime(e.target.value)}
                  placeholder="예: 08:30"
                  className="w-full bg-[#1C1C1E] border-b border-[#2C2C2E] py-1.5 text-xs text-white font-bold outline-none focus:border-amber-500 transition-colors font-mono"
                />
              </div>

              <div>
                <label className="text-[12px] font-black text-[#8E8E93] block mb-1">출고 날짜 (반납일자)</label>
                <input
                  type="date"
                  value={driverEditArrivalDate}
                  onChange={(e) => setDriverEditArrivalDate(e.target.value)}
                  className="w-full bg-[#1C1C1E] border-b border-[#2C2C2E] py-1 text-xs text-white font-bold outline-none focus:border-amber-500 transition-colors"
                />
              </div>
              <div>
                <label className="text-[12px] font-black text-[#8E8E93] block mb-1">출고 시각 (반납시간)</label>
                <input
                  type="text"
                  value={driverEditArrivalTime}
                  onChange={(e) => setDriverEditArrivalTime(e.target.value)}
                  placeholder="예: 21:15"
                  className="w-full bg-[#1C1C1E] border-b border-[#2C2C2E] py-1.5 text-xs text-white font-bold outline-none focus:border-amber-500 transition-colors font-mono"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <span className="text-[12px] font-black text-[#8E8E93]">출국 터미널</span>
              <span className="text-xs font-bold text-white bg-[#2C2C2E] px-2 py-1 rounded-md">
                {terminalLabel(
                  normalizeAirportId(driverDetailRes.airport),
                  driverDetailRes.departureTerminal
                )}
              </span>
              <span className="text-[12px] font-black text-[#8E8E93] ml-2">입국 터미널</span>
              <span className="text-xs font-bold text-white bg-[#2C2C2E] px-2 py-1 rounded-md">
                {terminalLabel(
                  normalizeAirportId(driverDetailRes.airport),
                  driverDetailRes.arrivalTerminal
                )}
              </span>
              {(() => {
                const source = resolveBookingSourceFromReservation(driverDetailRes);
                if (source !== 'airpick-b2c') return null;
                return (
                  <span
                    className={cn(
                      'text-[11px] font-black border px-2 py-0.5 rounded-md ml-auto',
                      bookingSourceBadgeClass(source)
                    )}
                  >
                    {bookingSourceLabel(source)} 예약
                  </span>
                );
              })()}
            </div>

            <div className="space-y-2">
              <label className="text-[12px] font-black text-zinc-500 block">수납 상태</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setPaymentChoice('unpaid')}
                  className={cn(
                    'py-2.5 rounded-xl text-xs font-black border transition-all cursor-pointer',
                    paymentChoice === 'unpaid'
                      ? 'bg-rose-500/15 border-rose-500 text-rose-400'
                      : 'bg-neutral-950 border-neutral-800 text-zinc-400 hover:border-neutral-700'
                  )}
                >
                  미납
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentChoice('paid')}
                  className={cn(
                    'py-2.5 rounded-xl text-xs font-black border transition-all cursor-pointer',
                    paymentChoice === 'paid'
                      ? 'bg-emerald-500/15 border-emerald-500 text-emerald-400'
                      : 'bg-neutral-950 border-neutral-800 text-zinc-400 hover:border-neutral-700'
                  )}
                >
                  완납
                </button>
              </div>
            </div>

            <div className="relative group">
              {showLotPicker && companyLots.length > 0 && (
                <div className="mb-4">
                  <label className="text-[12px] font-black text-zinc-500 block mb-1">
                    주차 위치 (B2C 노출)
                  </label>
                  <div className="grid grid-cols-2 gap-2 mt-1">
                    {companyLots.map((lot) => {
                      const active = driverEditLotId === lot.id;
                      return (
                        <button
                          key={lot.id}
                          type="button"
                          onClick={() => setDriverEditLotId(lot.id)}
                          className={cn(
                            'py-2 px-3 text-xs font-black rounded-xl transition-all border cursor-pointer',
                            active
                              ? lot.type === 'outdoor'
                                ? 'bg-[#22C55E] text-white border-transparent'
                                : 'bg-[#A855F7] text-white border-transparent'
                              : 'bg-[#1C1C1E] text-zinc-500 border-neutral-800 hover:text-zinc-350'
                          )}
                        >
                          {lot.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              <label className="text-[12px] font-black text-zinc-500 block mb-1">
                {showLotPicker ? '구역·자리 (선택)' : '링커메모 (주차구역 상세)'}
              </label>
              <input
                type="text"
                value={driverEditLinkerMemo}
                onChange={(e) => setDriverEditLinkerMemo(e.target.value)}
                className="w-full bg-[#1C1C1E] border-b border-[#2C2C2E] py-1.5 text-[14px] text-zinc-300 font-medium outline-none focus:border-amber-500 transition-colors"
                placeholder="예시: 지하3층 B구역"
              />
            </div>
          </div>

          {/* 4. FLIGHT */}
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-x-4 gap-y-4">
              <div className="relative group col-span-2">
                <label className="text-[12px] font-black text-[#8E8E93] block mb-1">여행지</label>
                <input
                  type="text"
                  value={driverEditDestination}
                  onChange={(e) => setDriverEditDestination(e.target.value)}
                  className="w-full bg-[#1C1C1E] border-b border-[#2C2C2E] py-1.5 text-[14px] text-white font-bold outline-none focus:border-[#FF9F0A] transition-colors"
                  placeholder="예: 오사카, 싱가포르"
                />
              </div>

              <div className="relative group">
                <label className="text-[12px] font-black text-[#8E8E93] block mb-1">출국 항공사</label>
                <AirlinePicker
                  value={driverEditDeptAirline}
                  onChange={setDriverEditDeptAirline}
                  tone="dark"
                />
              </div>

              <div className="relative group">
                <label className="text-[12px] font-black text-[#8E8E93] block mb-1">출국 항공편</label>
                <input
                  type="text"
                  value={driverEditDeptFlight}
                  onChange={(e) => setDriverEditDeptFlight(e.target.value)}
                  className="w-full bg-[#1C1C1E] border-b border-[#2C2C2E] py-1.5 text-[14px] text-white font-bold outline-none focus:border-[#FF9F0A] transition-colors font-mono"
                  placeholder="예: KE101"
                />
              </div>

              <div className="relative group">
                <label className="text-[12px] font-black text-[#8E8E93] block mb-1">입국 항공사</label>
                <AirlinePicker
                  value={driverEditArrAirline}
                  onChange={setDriverEditArrAirline}
                  tone="dark"
                />
              </div>

              <div className="relative group">
                <label className="text-[12px] font-black text-[#8E8E93] block mb-1">입국 항공편</label>
                <input
                  type="text"
                  value={driverEditArrFlight}
                  onChange={(e) => setDriverEditArrFlight(e.target.value)}
                  className="w-full bg-[#1C1C1E] border-b border-[#2C2C2E] py-1.5 text-[14px] text-white font-bold outline-none focus:border-[#FF9F0A] transition-colors font-mono"
                  placeholder="예: KE102"
                />
              </div>

              {!hideReservationPassword && (
              <div className="relative group">
                <label className="text-[12px] font-black text-[#8E8E93] block mb-1">예약 비밀번호</label>
                <input
                  type="text"
                  value={driverEditReservationPassword}
                  onChange={(e) => setDriverEditReservationPassword(e.target.value)}
                  className="w-full bg-[#1C1C1E] border-b border-[#2C2C2E] py-1.5 text-[14px] text-white font-bold outline-none focus:border-[#FF9F0A] transition-colors font-mono"
                  placeholder="취소 확인용"
                />
              </div>
              )}
            </div>
          </div>

          {/* 요청·특이사항: 내용 있으면 펼침, 없으면 접힘 */}
          <div className="pt-1">
            <button
              type="button"
              onClick={() => setNotesOpen((o) => !o)}
              className="w-full flex items-center justify-between gap-2 py-2.5 border-b border-neutral-800/80 cursor-pointer"
            >
              <span className="text-[12.5px] font-black text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
                요청 · 특이사항
                {hasNotesContent && (
                  <span className="normal-case tracking-normal text-[10px] font-black px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 border border-amber-500/25">
                    있음
                  </span>
                )}
              </span>
              <ChevronDown
                size={16}
                className={cn('text-zinc-500 transition-transform', notesOpen && 'rotate-180')}
              />
            </button>
            {notesOpen && (
              <div className="space-y-4 pt-3">
                <div className="relative group">
                  <label className="text-[12px] font-black text-zinc-500 block mb-1">고객요청사항</label>
                  <input
                    type="text"
                    value={driverEditUserRequest}
                    onChange={(e) => setDriverEditUserRequest(e.target.value)}
                    className="w-full bg-[#1C1C1E] border-b border-[#2C2C2E] py-1.5 text-[14px] text-zinc-300 font-medium outline-none focus:border-amber-500 transition-colors"
                    placeholder="요청사항을 기재하세요"
                  />
                </div>
                <div className="relative group">
                  <label className="text-[12px] font-black text-zinc-500 block mb-1">관리자메모 (특이사항)</label>
                  <input
                    type="text"
                    value={driverEditAdminMemo}
                    onChange={(e) => setDriverEditAdminMemo(e.target.value)}
                    className="w-full bg-[#1C1C1E] border-b border-[#2C2C2E] py-1.5 text-[14px] text-zinc-300 font-medium outline-none focus:border-amber-500 transition-colors"
                    placeholder="특이사항을 입력해주세요"
                  />
                </div>
              </div>
            )}
          </div>

        </div>

        {/* Bottom: 저장 · 다음 상태만 */}
        <div className="border-t border-neutral-800 flex items-stretch shrink-0 bg-[#1C1C1E]">
          <button
            type="button"
            onClick={handleSave}
            className="flex-1 py-5 bg-[#E5E5EA] hover:bg-zinc-200 text-[#1C1C1E] font-black text-[16px] transition-colors text-center cursor-pointer"
          >
            저장
          </button>
          {canAdvanceStatus && (
            <button
              type="button"
              onClick={onStatusAction}
              className="flex-1 py-5 bg-[#007AFF] hover:bg-[#0051FF] text-white font-black text-[16px] transition-colors text-center cursor-pointer"
            >
              {advanceStatusLabel}
            </button>
          )}
        </div>

      </motion.div>
    </div>
  );
}
