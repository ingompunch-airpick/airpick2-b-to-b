import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { ArrowLeft, Users, Phone, Calendar, Bell, Car } from 'lucide-react';
import { Reservation } from '../types';
import AirlineField from './AirlineField';
import { isPending, statusToLabel } from '../utils/reservationStatus';

function cn(...classes: (string | boolean | undefined | null)[]) {
  return classes.filter(Boolean).join(' ');
}

interface EditModalProps {
  driverDetailRes: Reservation | null;
  onClose: () => void;
  isEmployee: boolean;
  employeeName: string;
  isSuperAdmin: boolean;
  onSave: (updateData: any) => Promise<void>;
  onStatusAction: () => Promise<void>;
  onCancelReservation?: () => Promise<void>;
}

export default function EditModal({
  driverDetailRes,
  onClose,
  isEmployee,
  employeeName,
  isSuperAdmin,
  onSave,
  onStatusAction,
  onCancelReservation
}: EditModalProps) {
  const [driverEditName, setDriverEditName] = useState('');
  const [driverEditPhone, setDriverEditPhone] = useState('');
  const [driverEditUserRequest, setDriverEditUserRequest] = useState('');
  const [driverEditAdminMemo, setDriverEditAdminMemo] = useState('');
  const [driverEditLinkerMemo, setDriverEditLinkerMemo] = useState('');
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
  const [driverEditIsIndoor, setDriverEditIsIndoor] = useState(true);

  useEffect(() => {
    if (driverDetailRes) {
      setDriverEditName(driverDetailRes.userName || '');
      setDriverEditPhone(driverDetailRes.phone || '');
      setDriverEditUserRequest((driverDetailRes as any).userRequest || (driverDetailRes as any).customerNotes || driverDetailRes.paymentNotes || '');
      setDriverEditAdminMemo(driverDetailRes.adminMemo || '');
      setDriverEditLinkerMemo(driverDetailRes.parkingSpace || (driverDetailRes as any).linkerMemo || '');
      setDriverEditDestination(driverDetailRes.destination || '');
      setDriverEditDeptAirline(driverDetailRes.departureAirline || '');
      setDriverEditDeptFlight(driverDetailRes.departureFlight || '');
      setDriverEditArrAirline(driverDetailRes.arrivalAirline || '');
      setDriverEditArrFlight(driverDetailRes.arrivalFlight || '');
      setDriverEditReservationPassword(driverDetailRes.reservationPassword || '');
      setDriverEditCarNumber(driverDetailRes.carNumber || '');
      setDriverEditCarModel(driverDetailRes.carModel || '');
      
      setDriverEditDepartureDate(driverDetailRes.departureDate || '');
      setDriverEditDepartureTime(driverDetailRes.departureTime || '');
      setDriverEditArrivalDate(driverDetailRes.arrivalDate || '');
      setDriverEditArrivalTime(driverDetailRes.arrivalTime || '');
      
      if (typeof driverDetailRes.isIndoor === 'boolean') {
        setDriverEditIsIndoor(driverDetailRes.isIndoor);
      } else {
        const space = (driverDetailRes.parkingSpace || '').toLowerCase();
        const hasIndoor = space.includes('실내') || space.includes('상주');
        setDriverEditIsIndoor(hasIndoor);
      }
    }
  }, [driverDetailRes]);

  if (!driverDetailRes) return null;

  const isPendingBeforeIntake = isPending(driverDetailRes.status);
  const canCancel = isPendingBeforeIntake && !!onCancelReservation;

  const handleSave = () => {
    const operatorName = isEmployee ? employeeName : (isSuperAdmin ? '본사 마스터(최고관리자)' : '업체 마스터');
    const updateData = {
      userName: driverEditName,
      phone: driverEditPhone,
      userRequest: driverEditUserRequest,
      customerNotes: driverEditUserRequest,
      adminMemo: driverEditAdminMemo,
      parkingSpace: driverEditLinkerMemo,
      linkerMemo: driverEditLinkerMemo,
      destination: driverEditDestination.trim() || undefined,
      departureAirline: driverEditDeptAirline.trim() || undefined,
      departureFlight: driverEditDeptFlight.trim() || undefined,
      arrivalAirline: driverEditArrAirline.trim() || undefined,
      arrivalFlight: driverEditArrFlight.trim() || undefined,
      inboundFlight: driverEditArrFlight.trim() || undefined,
      carNumber: driverEditCarNumber,
      carModel: driverEditCarModel,
      departureDate: driverEditDepartureDate,
      departureTime: driverEditDepartureTime,
      arrivalDate: driverEditArrivalDate,
      arrivalTime: driverEditArrivalTime,
      isIndoor: driverEditIsIndoor,
      updatedBy: operatorName,
      updatedAt: new Date().toISOString()
    };
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
        {/* Header: Back arrow & Status info */}
        <div className="px-5 py-4 border-b border-neutral-800 flex items-center bg-[#1C1C1E] justify-between">
          <button 
            type="button"
            onClick={onClose}
            className="flex items-center gap-2 text-zinc-350 hover:text-white transition-colors py-1 cursor-pointer"
          >
            <ArrowLeft size={18} />
            <span className="text-[15px] font-bold text-white">
              {isPending(driverDetailRes.status) ? statusToLabel('pending') : statusToLabel('request_out')} 상세 정보
            </span>
          </button>
          <span className={cn(
            "text-[12.5px] px-2.5 py-1 rounded-full font-black tracking-wide uppercase",
            isPending(driverDetailRes.status) ? "bg-amber-500/10 text-amber-500" : "bg-rose-500/10 text-[#FF453A]"
          )}>
            {isPending(driverDetailRes.status) ? '인계 전' : '출차 요청됨'}
          </span>
        </div>

        {/* Scrollable Form Body */}
        <div className="flex-1 overflow-y-auto px-5 py-6 space-y-6">
          
          {/* 1. CUSTOMER INFO SECTION */}
          <div className="space-y-4">
            <div className="text-[12.5px] font-black text-zinc-400 uppercase tracking-wider border-b border-neutral-800/80 pb-1.5 flex items-center gap-1.5">
              <Users size={13} className="text-zinc-400" />
              <span>고객 정보</span>
            </div>

            {/* Name field */}
            <div className="relative group">
              <label className="text-[12px] font-black text-zinc-500 block mb-1">이름</label>
              <input 
                type="text"
                value={driverEditName}
                onChange={(e) => setDriverEditName(e.target.value)}
                className="w-full bg-[#1C1C1E] border-b border-neutral-800 py-1.5 text-[13.5px] text-white font-bold outline-none focus:border-amber-500 transition-colors"
                placeholder="이름을 입력해주세요"
              />
            </div>

            {/* Phone field */}
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

            {/* User Request field */}
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

            {/* Admin Memo field */}
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

            {/* 주차 유형구분 (실내 / 실외) 수정 */}
            <div className="relative group">
              <label className="text-[12px] font-black text-zinc-500 block mb-1">주차 유형구분 (실내 / 실외)</label>
              <div className="grid grid-cols-2 gap-2 mt-1">
                <button
                  type="button"
                  onClick={() => setDriverEditIsIndoor(true)}
                  className={cn(
                    "py-2 px-3 text-xs font-black rounded-xl transition-all border cursor-pointer",
                    driverEditIsIndoor 
                      ? "bg-[#A855F7] text-white border-transparent" 
                      : "bg-[#1C1C1E] text-zinc-500 border-neutral-800 hover:text-zinc-350"
                  )}
                >
                  실내 주차
                </button>
                <button
                  type="button"
                  onClick={() => setDriverEditIsIndoor(false)}
                  className={cn(
                    "py-2 px-3 text-xs font-black rounded-xl transition-all border cursor-pointer",
                    !driverEditIsIndoor 
                      ? "bg-[#22C55E] text-white border-transparent" 
                      : "bg-[#1C1C1E] text-zinc-500 border-neutral-800 hover:text-zinc-350"
                  )}
                >
                  실외 주차
                </button>
              </div>
            </div>

            {/* Linker Memo field */}
            <div className="relative group">
              <label className="text-[12px] font-black text-zinc-500 block mb-1">링커메모 (주차구역 상세)</label>
              <input 
                type="text"
                value={driverEditLinkerMemo}
                onChange={(e) => setDriverEditLinkerMemo(e.target.value)}
                className="w-full bg-[#1C1C1E] border-b border-[#2C2C2E] py-1.5 text-[14px] text-zinc-300 font-medium outline-none focus:border-amber-500 transition-colors"
                placeholder="예시: 지하3층 B구역, 상주 주차장 등"
              />
            </div>
          </div>

          {/* 입출고 일정 및 예약 시간 수정 */}
          <div className="space-y-4 pt-1">
            <div className="text-[12.5px] font-black text-zinc-400 uppercase tracking-wider border-b border-neutral-800/80 pb-1.5 flex items-center gap-1.5">
              <Calendar size={13} className="text-[#FF9F0A]" />
              <span>입출고 일정 (예약 날짜/시간)</span>
            </div>
            
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
                {driverDetailRes.departureTerminal === 'T2' ? '제2터미널 (T2)' : '제1터미널 (T1)'}
              </span>
              <span className="text-[12px] font-black text-[#8E8E93] ml-2">입국 터미널</span>
              <span className="text-xs font-bold text-white bg-[#2C2C2E] px-2 py-1 rounded-md">
                {driverDetailRes.arrivalTerminal === 'T2' ? '제2터미널 (T2)' : '제1터미널 (T1)'}
              </span>
              {driverDetailRes.createdBy === 'homepage' && (
                <span className="text-[11px] font-black text-sky-400 bg-sky-500/10 border border-sky-500/20 px-2 py-0.5 rounded-md ml-auto">
                  홈페이지 예약
                </span>
              )}
            </div>
          </div>

          {/* 2. FLIGHT / TRAVEL INFO */}
          <div className="space-y-4 pt-1">
            <div className="text-[12.5px] font-black text-zinc-400 uppercase tracking-wider border-b border-neutral-800/80 pb-1.5 flex items-center gap-1.5">
              <Bell size={13} className="text-[#FF9F0A]" />
              <span>항공편 · 여행 정보</span>
            </div>

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
                <AirlineField
                  value={driverEditDeptAirline}
                  onChange={setDriverEditDeptAirline}
                  selectClassName="w-full bg-[#1C1C1E] border-b border-[#2C2C2E] py-1.5 text-[14px] text-white font-bold outline-none focus:border-[#FF9F0A] transition-colors"
                  inputClassName="w-full bg-[#1C1C1E] border-b border-[#2C2C2E] py-1.5 text-[14px] text-white font-bold outline-none focus:border-[#FF9F0A] transition-colors"
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
                <AirlineField
                  value={driverEditArrAirline}
                  onChange={setDriverEditArrAirline}
                  selectClassName="w-full bg-[#1C1C1E] border-b border-[#2C2C2E] py-1.5 text-[14px] text-white font-bold outline-none focus:border-[#FF9F0A] transition-colors"
                  inputClassName="w-full bg-[#1C1C1E] border-b border-[#2C2C2E] py-1.5 text-[14px] text-white font-bold outline-none focus:border-[#FF9F0A] transition-colors"
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

              {driverDetailRes.createdBy === 'homepage' && driverEditReservationPassword && (
                <div className="relative group col-span-2">
                  <label className="text-[12px] font-black text-[#8E8E93] block mb-1">예약 비밀번호 (홈페이지)</label>
                  <span className="block py-1.5 text-[14px] text-zinc-300 font-bold font-mono select-none">
                    {driverEditReservationPassword}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* 3. VEHICLE INFO SECTION */}
          <div className="space-y-4 pt-1">
            <div className="text-[12.5px] font-black text-zinc-400 uppercase tracking-wider border-b border-neutral-800/80 pb-1.5 flex items-center gap-1.5">
              <Car size={13} className="text-zinc-400" />
              <span>차량 정보</span>
            </div>

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

        </div>

        {/* Bottom action panel */}
        <div className="border-t border-neutral-850 flex items-stretch">
          <button 
            type="button"
            onClick={handleSave}
            className="flex-1 py-4.5 bg-[#E5E5EA] hover:bg-zinc-200 text-[#1C1C1E] font-black text-[15px] transition-colors text-center cursor-pointer"
          >
            예약정보 변경
          </button>
          {canCancel && (
            <button 
              type="button"
              onClick={() => onCancelReservation?.()}
              className="flex-1 py-4.5 bg-rose-600 hover:bg-rose-500 text-white font-black text-[15px] transition-colors text-center cursor-pointer border-x border-rose-700/40"
            >
              예약 취소
            </button>
          )}
          <button 
            type="button"
            onClick={onStatusAction}
            className="flex-1 py-4.5 bg-[#007AFF] hover:bg-[#0051FF] text-white font-black text-[15px] transition-colors text-center cursor-pointer"
          >
            {isPendingBeforeIntake ? '입고 시작' : 
             driverDetailRes.status === 'pending_in' ? '주차 완료' :
             driverDetailRes.status === 'completed_in' ? '출고요청 발송' :
             driverDetailRes.status === 'request_out' ? '출차 배차 / 반납완료' : '상태 전환 완료'}
          </button>
        </div>

      </motion.div>
    </div>
  );
}
