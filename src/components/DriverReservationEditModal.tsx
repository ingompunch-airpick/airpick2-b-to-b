import React, { useState, useEffect } from 'react';
import { Settings, CheckCircle2, X, Calendar, Clock } from 'lucide-react';
import { db } from '../firebase';
import { doc, updateDoc } from 'firebase/firestore';
import { Reservation, Company } from '../types';

function cn(...classes: (string | boolean | undefined)[]) {
  return classes.filter(Boolean).join(' ');
}

interface DriverReservationEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  reservation: Reservation | null;
  companies: Company[];
  currentCompanyId: string;
  isEmployee: boolean;
  employeeName: string;
  isSuperAdmin: boolean;
  getCalculatePrice: (
    partner: Company,
    intakeStartDateStr: string,
    intakeEndDateStr: string,
    isIndoor: boolean,
    isT2: boolean
  ) => number;
  onUpdateReservations: React.Dispatch<React.SetStateAction<Reservation[]>>;
}

export default function DriverReservationEditModal({
  isOpen,
  onClose,
  reservation,
  companies,
  currentCompanyId,
  isEmployee,
  employeeName,
  isSuperAdmin,
  getCalculatePrice,
  onUpdateReservations,
}: DriverReservationEditModalProps) {
  
  if (!isOpen || !reservation) return null;

  const [editUserName, setEditUserName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editCarModel, setEditCarModel] = useState('');
  const [editCarNumber, setEditCarNumber] = useState('');
  const [editDepartureDate, setEditDepartureDate] = useState('');
  const [editDepartureTime, setEditDepartureTime] = useState('');
  const [editDepartureTerminal, setEditDepartureTerminal] = useState<'T1' | 'T2'>('T1');
  const [editArrivalDate, setEditArrivalDate] = useState('');
  const [editArrivalTime, setEditArrivalTime] = useState('');
  const [editArrivalTerminal, setEditArrivalTerminal] = useState<'T1' | 'T2'>('T2');
  const [editIsIndoor, setEditIsIndoor] = useState(true);

  useEffect(() => {
    if (reservation) {
      setEditUserName(reservation.userName || '');
      setEditPhone(reservation.phone || '');
      setEditCarModel(reservation.carModel || '');
      setEditCarNumber(reservation.carNumber || '');
      setEditDepartureDate(reservation.departureDate || '');
      setEditDepartureTime(reservation.departureTime || '');
      setEditDepartureTerminal(reservation.departureTerminal || 'T1');
      setEditArrivalDate(reservation.arrivalDate || '');
      setEditArrivalTime(reservation.arrivalTime || '');
      setEditArrivalTerminal(reservation.arrivalTerminal || 'T2');
      setEditIsIndoor(reservation.isIndoor !== undefined ? reservation.isIndoor : true);
    }
  }, [reservation]);

  const handleSave = async () => {
    // Find the company entity associated with the reservation
    const partner = companies.find(c => c.name === reservation.companyName || c.name === currentCompanyId);
    let calculatedPrice = reservation.totalPrice || 0;
    if (partner) {
      calculatedPrice = getCalculatePrice(
        partner,
        `${editDepartureDate}T${editDepartureTime}`,
        `${editArrivalDate}T${editArrivalTime}`,
        editIsIndoor,
        editDepartureTerminal === 'T2' || editArrivalTerminal === 'T2'
      );
    }

    const operatorName = isEmployee ? employeeName : (isSuperAdmin ? '본사 마스터(최고관리자)' : '업체 마스터');
    const updatedPayload: Partial<Reservation> = {
      userName: editUserName,
      phone: editPhone,
      carModel: editCarModel,
      carNumber: editCarNumber,
      departureDate: editDepartureDate,
      departureTime: editDepartureTime,
      departureTerminal: editDepartureTerminal,
      arrivalDate: editArrivalDate,
      arrivalTime: editArrivalTime,
      arrivalTerminal: editArrivalTerminal,
      isIndoor: editIsIndoor,
      totalPrice: calculatedPrice,
      updatedBy: operatorName,
      updatedAt: new Date().toISOString()
    };

    // Optimistically update React state and localStorage
    onUpdateReservations(prev => {
      const updated = prev.map(r => r.id === reservation.id ? { 
        ...r, 
        ...updatedPayload 
      } : r);
      localStorage.setItem(`${currentCompanyId}_reservations`, JSON.stringify(updated));
      return updated;
    });

    try {
      const docRef = doc(db, 'reservations', reservation.id || '');
      await updateDoc(docRef, updatedPayload);
    } catch (err) {
      console.warn("Firestore update of reservation failed or running locally:", err);
    }

    alert(`[수정 완료] ${editCarNumber} 예약 차량 정보가 성공적으로 변경되었습니다.`);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-neutral-950/80 backdrop-blur-xs z-[150]">
      <div 
        onClick={onClose}
        className="absolute inset-x-0 inset-y-0 cursor-pointer"
      />
      <div className="relative bg-neutral-900 border border-neutral-800 w-full max-w-md rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="p-4 border-b border-neutral-800 flex items-center justify-between bg-neutral-900/50">
          <div className="flex items-center gap-2">
            <Settings className="text-amber-500" size={16} />
            <span className="text-xs font-black text-white">현장/전화 수납 정보 수정</span>
          </div>
          <button 
            onClick={onClose}
            className="p-1 px-2.5 bg-neutral-950 hover:bg-zinc-800 text-zinc-500 rounded-lg text-[10px] font-black cursor-pointer"
          >
            닫기
          </button>
        </div>

        <div className="overflow-y-auto p-5 flex-1 space-y-4 text-xs font-sans">
          <div className="p-3 bg-neutral-950 border border-neutral-850/60 rounded-2xl flex items-center justify-between">
            <div>
              <span className="text-[9px] text-zinc-500 block">고객 고유 예약 코드</span>
              <span className="text-xs font-black text-white font-mono">{reservation.receiptCode || reservation.id}</span>
            </div>
            <span className="text-[10px] text-zinc-400 bg-neutral-900 px-2.5 py-1 rounded-lg border border-neutral-800 font-bold">
              {reservation.companyName}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[9.5px] font-bold text-zinc-500 block mb-1">인계 고객명</label>
              <input 
                type="text" 
                value={editUserName}
                onChange={e => setEditUserName(e.target.value)}
                className="w-full px-3 py-2 bg-neutral-950 border border-neutral-800 rounded-xl text-zinc-200 font-bold focus:border-amber-500 outline-none"
              />
            </div>
            <div>
              <label className="text-[9.5px] font-bold text-zinc-500 block mb-1">고객 연락처</label>
              <input 
                type="text" 
                value={editPhone}
                onChange={e => setEditPhone(e.target.value)}
                className="w-full px-3 py-2 bg-neutral-950 border border-neutral-800 rounded-xl text-zinc-200 font-bold focus:border-amber-500 outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[9.5px] font-bold text-zinc-500 block mb-1">차량 번호</label>
              <input 
                type="text" 
                value={editCarNumber}
                onChange={e => setEditCarNumber(e.target.value)}
                className="w-full px-3 py-2 bg-neutral-950 border border-neutral-800 rounded-xl text-zinc-200 font-bold focus:border-amber-500 outline-none"
              />
            </div>
            <div>
              <label className="text-[9.5px] font-bold text-zinc-500 block mb-1">차량 모델</label>
              <input 
                type="text" 
                value={editCarModel}
                onChange={e => setEditCarModel(e.target.value)}
                className="w-full px-3 py-2 bg-neutral-950 border border-neutral-800 rounded-xl text-zinc-200 font-bold focus:border-amber-500 outline-none"
              />
            </div>
          </div>

          <div className="space-y-1.5 p-3.5 bg-[#141416] border border-neutral-850 rounded-2xl">
            <span className="text-[9.5px] font-black text-amber-500 block">✈️ 입/출항 여정 동선 지정</span>
            <div className="grid grid-cols-2 gap-2 text-xs pt-1">
              <div>
                <span className="text-[9px] text-zinc-500 block mb-1 font-bold">입고일 (출발일)</span>
                <input 
                  type="date"
                  value={editDepartureDate}
                  onChange={e => setEditDepartureDate(e.target.value)}
                  className="w-full px-3 py-2 bg-neutral-950 border border-neutral-800 rounded-xl text-zinc-200 font-bold focus:border-amber-500 outline-none"
                />
              </div>
              <div>
                <span className="text-[9px] text-zinc-500 block mb-1 font-bold">입고 시각</span>
                <input 
                  type="time"
                  value={editDepartureTime}
                  onChange={e => setEditDepartureTime(e.target.value)}
                  className="w-full px-3 py-2 bg-neutral-950 border border-neutral-800 rounded-xl text-zinc-200 font-bold focus:border-amber-500 outline-none"
                />
              </div>
            </div>

            <div className="flex gap-2.5 pt-1 text-[10px]">
              <span className="text-zinc-500 font-bold my-auto">입고 터미널:</span>
              <button 
                type="button" 
                onClick={() => setEditDepartureTerminal('T1')} 
                className={cn("px-2.5 py-1 rounded-md transition-all font-black", editDepartureTerminal === 'T1' ? "bg-[#00D2FF] text-neutral-950" : "bg-[#2C2C2E] text-zinc-400")}
              >1터미널</button>
              <button 
                type="button" 
                onClick={() => setEditDepartureTerminal('T2')} 
                className={cn("px-2.5 py-1 rounded-md transition-all font-black", editDepartureTerminal === 'T2' ? "bg-[#FFB800] text-neutral-950" : "bg-[#2C2C2E] text-zinc-400")}
              >2터미널</button>
            </div>
          </div>

          <div className="space-y-1.5 p-3.5 bg-[#141416] border border-neutral-850 rounded-2xl">
            <span className="text-[9.5px] font-black text-emerald-500 block">✨ 고객 반납일</span>
            <div className="grid grid-cols-2 gap-2 text-xs pt-1">
              <div>
                <span className="text-[9px] text-zinc-500 block mb-1 font-bold">출고일 (반납일)</span>
                <input 
                  type="date"
                  value={editArrivalDate}
                  onChange={e => setEditArrivalDate(e.target.value)}
                  className="w-full px-3 py-2 bg-neutral-950 border border-neutral-800 rounded-xl text-zinc-200 font-bold focus:border-amber-500 outline-none"
                />
              </div>
              <div>
                <span className="text-[9px] text-zinc-500 block mb-1 font-bold">출고 시각</span>
                <input 
                  type="time"
                  value={editArrivalTime}
                  onChange={e => setEditArrivalTime(e.target.value)}
                  className="w-full px-3 py-2 bg-neutral-950 border border-neutral-800 rounded-xl text-zinc-200 font-bold focus:border-amber-500 outline-none"
                />
              </div>
            </div>

            <div className="flex gap-2.5 pt-1 text-[10px]">
              <span className="text-zinc-500 font-bold my-auto">반납 터미널:</span>
              <button 
                type="button" 
                onClick={() => setEditArrivalTerminal('T1')} 
                className={cn("px-2.5 py-1 rounded-md transition-all font-black", editArrivalTerminal === 'T1' ? "bg-[#00D2FF] text-neutral-950" : "bg-[#2C2C2E] text-zinc-400")}
              >1터미널</button>
              <button 
                type="button" 
                onClick={() => setEditArrivalTerminal('T2')} 
                className={cn("px-2.5 py-1 rounded-md transition-all font-black", editArrivalTerminal === 'T2' ? "bg-[#FFB800] text-neutral-950" : "bg-[#2C2C2E] text-zinc-400")}
              >2터미널</button>
            </div>
          </div>

          <div className="col-span-2">
            <label className="text-[9.5px] font-bold text-zinc-500 block mb-1">주차 보관 구역</label>
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => setEditIsIndoor(true)}
                className={cn(
                  "py-2.5 rounded-xl border font-black flex items-center justify-center gap-1.5 transition-all text-xs cursor-pointer",
                  editIsIndoor ? "bg-purple-650/15 border-[#A855F7] text-purple-400" : "bg-neutral-950 border-neutral-850 hover:border-neutral-800 text-zinc-400"
                )}
              >
                <span>실내 주차 보관 권장</span>
              </button>
              <button
                type="button"
                onClick={() => setEditIsIndoor(false)}
                className={cn(
                  "py-2.5 rounded-xl border font-black flex items-center justify-center gap-1.5 transition-all text-xs cursor-pointer",
                  !editIsIndoor ? "bg-[#22C55E]/10 border-[#22C55E] text-[#22C55E]" : "bg-neutral-950 border-neutral-850 hover:border-neutral-800 text-zinc-400"
                )}
              >
                <span>야외 안전 주차 권장</span>
              </button>
            </div>
          </div>
        </div>

        <div className="p-4 border-t border-neutral-800 flex gap-2 bg-neutral-900/60 shadow-lg">
          <button 
            type="button"
            onClick={onClose}
            className="px-4 py-3 bg-neutral-950 hover:bg-zinc-800 text-zinc-400 rounded-xl text-xs font-bold transition-all border border-neutral-800 cursor-pointer"
          >
            변경 취소
          </button>
          <button 
            type="button"
            onClick={handleSave}
            className="flex-1 py-3 bg-amber-500 hover:bg-amber-450 text-neutral-950 rounded-xl text-xs font-black shadow-lg shadow-amber-500/10 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <CheckCircle2 size={13} />
            정보 수정 완료 및 갱신
          </button>
        </div>
      </div>
    </div>
  );
}
