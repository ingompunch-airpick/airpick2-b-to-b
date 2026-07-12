import React, { useState, useEffect, useMemo } from 'react';
import { 
  Settings, 
  ShieldCheck, 
  AlertCircle, 
  CheckCircle2, 
  X 
} from 'lucide-react';
import { db } from '../firebase';
import { doc, updateDoc } from 'firebase/firestore';
import { persistReservationStores } from '../utils/reservationScope';
import { Reservation } from '../types';

function cn(...classes: (string | boolean | undefined)[]) {
  return classes.filter(Boolean).join(' ');
}

interface AdminReservationEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  reservationId: string | null;
  reservations: Reservation[];
  onUpdateReservations: React.Dispatch<React.SetStateAction<Reservation[]>>;
  isEmployee: boolean;
  employeeName: string;
  isSuperAdmin: boolean;
  currentCompanyId: string;
  handleUpdateValetStatus: (resId: string, nextStatus: any, additionalPayload?: any) => Promise<void>;
  getKSTDateTimeString: () => string;
}

export default function AdminReservationEditModal({
  isOpen,
  onClose,
  reservationId,
  reservations,
  onUpdateReservations,
  isEmployee,
  employeeName,
  isSuperAdmin,
  currentCompanyId,
  handleUpdateValetStatus,
  getKSTDateTimeString
}: AdminReservationEditModalProps) {
  const targetReservationForEdit = useMemo(() => {
    return reservations.find(r => r.id === reservationId) || null;
  }, [reservations, reservationId]);

  // Form Fields states holding current editing details
  const [editBasePrice, setEditBasePrice] = useState<number>(0);
  const [editValetPrice, setEditValetPrice] = useState<number>(0);
  const [editOvertimePrice, setEditOvertimePrice] = useState<number>(0);
  const [editDiscountPrice, setEditDiscountPrice] = useState<number>(0);
  const [editParkingSpace, setEditParkingSpace] = useState<string>('');
  const [editCarNumber, setEditCarNumber] = useState<string>('');
  const [editCarModel, setEditCarModel] = useState<string>('');
  const [editAdminMemo, setEditAdminMemo] = useState<string>('');

  useEffect(() => {
    if (isOpen && targetReservationForEdit) {
      setEditBasePrice(targetReservationForEdit.basePrice || 0);
      setEditValetPrice(targetReservationForEdit.valetPrice || 0);
      setEditOvertimePrice(targetReservationForEdit.overtimePrice || 0);
      setEditDiscountPrice(targetReservationForEdit.discountPrice || 0);
      setEditParkingSpace(targetReservationForEdit.parkingSpace || '');
      setEditCarNumber(targetReservationForEdit.carNumber || '');
      setEditCarModel(targetReservationForEdit.carModel || '');
      setEditAdminMemo(targetReservationForEdit.adminMemo || '');
    }
  }, [isOpen, targetReservationForEdit]);

  const calculatedNetTotal = useMemo(() => {
    if (!targetReservationForEdit) return 0;
    const bp = Number(editBasePrice) || 0;
    const vp = Number(editValetPrice) || 0;
    const op = Number(editOvertimePrice) || 0;
    const dp = Number(editDiscountPrice) || 0;
    return bp + vp + op - dp;
  }, [targetReservationForEdit, editBasePrice, editValetPrice, editOvertimePrice, editDiscountPrice]);

  const calculatedVatIncludedTotal = useMemo(() => {
    return Math.round(calculatedNetTotal * 1.1);
  }, [calculatedNetTotal]);

  if (!isOpen || !targetReservationForEdit) return null;

  const handleSaveAdminReservationEdit = async () => {
    const updatePayload = {
      basePrice: Number(editBasePrice) || 0,
      valetPrice: Number(editValetPrice) || 0,
      overtimePrice: Number(editOvertimePrice) || 0,
      discountPrice: Number(editDiscountPrice) || 0,
      totalPrice: calculatedVatIncludedTotal,
      parkingSpace: editParkingSpace.trim(),
      carNumber: editCarNumber.trim(),
      carModel: editCarModel.trim(),
      adminMemo: editAdminMemo.trim(),
      updatedAt: new Date().toISOString(),
      updatedBy: isEmployee ? employeeName : (isSuperAdmin ? '본사 마스터(최고관리자)' : '업체 마스터')
    };

    try {
      const docRef = doc(db, 'reservations', targetReservationForEdit.id || '');
      await updateDoc(docRef, updatePayload);
      alert("관리자 권한의 정밀 수납 예약 데이터 수동 제어가 완료되었습니다.");
    } catch (_) {
      onUpdateReservations(prev => {
        const updated = prev.map(r => r.id === targetReservationForEdit.id ? { ...r, ...updatePayload } : r);
        persistReservationStores(window.localStorage, updated, currentCompanyId, { cacheFirestore: true });
        return updated;
      });
      alert("강제 오프라인 임시 저장으로 예약 데이터가 갱신되었습니다.");
    } finally {
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-neutral-950/80 backdrop-blur-xs z-[150]">
      <div 
        onClick={onClose}
        className="absolute inset-x-0 inset-y-0 cursor-pointer"
      />
      <div className="relative bg-neutral-900 border border-neutral-800 w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[95vh]">
        <div className="p-4 border-b border-neutral-850 flex items-center justify-between bg-[#1C1C1E]">
          <div className="flex items-center gap-2">
            <Settings className="text-amber-500 animate-spin" size={16} />
            <div>
              <span className="text-xs font-black text-white block">관리자 초정밀 예약 정보 수동 조정 (Master Override)</span>
              <span className="text-[10.5px] text-zinc-500 font-mono font-bold uppercase">DATABASE OVERRIDE WORKSTATION</span>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 bg-neutral-950 hover:bg-neutral-850 text-zinc-400 rounded-xl text-[12px] font-black cursor-pointer border border-neutral-850"
          >
            <X size={12} />
          </button>
        </div>

        <div className="overflow-y-auto p-5 flex-1 space-y-4 max-h-[70vh]">
          {/* Reservation Header */}
          <div className="p-3.5 bg-neutral-950 border border-neutral-850 rounded-2xl flex items-center justify-between">
            <div className="space-y-0.5">
              <span className="text-[11px] text-zinc-500 font-semibold uppercase block">고유 수납 코드 (Receipt ID)</span>
              <span className="text-xs font-black text-white font-mono">{targetReservationForEdit.receiptCode || targetReservationForEdit.id}</span>
            </div>
            <span className="text-[12px] text-amber-500 bg-amber-500/10 px-3 py-1 rounded-xl border border-amber-500/20 font-black">
              {targetReservationForEdit.companyName}
            </span>
          </div>

          {/* 1st Section: Vehicles/Model space */}
          <div className="grid grid-cols-3 gap-3 text-xs font-sans">
            <div>
              <label className="text-[11.5px] font-bold text-zinc-500 block mb-1">차량 모델</label>
              <input 
                type="text" 
                value={editCarModel}
                onChange={e => setEditCarModel(e.target.value)}
                className="w-full px-3 py-2 bg-neutral-950 border border-neutral-800 rounded-xl text-zinc-200 font-black focus:border-amber-500 outline-none"
              />
            </div>
            <div>
              <label className="text-[11.5px] font-bold text-zinc-500 block mb-1">차량 번호</label>
              <input 
                type="text" 
                value={editCarNumber}
                onChange={e => setEditCarNumber(e.target.value)}
                className="w-full px-3 py-2 bg-neutral-950 border border-neutral-800 rounded-xl text-zinc-200 font-black focus:border-amber-500 outline-none"
              />
            </div>
            <div>
              <label className="text-[11.5px] font-bold text-zinc-500 block mb-1">주차공간 배정구획</label>
              <input 
                type="text" 
                value={editParkingSpace}
                onChange={e => setEditParkingSpace(e.target.value.toUpperCase())}
                placeholder="예: B-02 / 옥외"
                className="w-full px-3 py-2 bg-neutral-950 border border-[#A855F7]/30 rounded-xl text-purple-400 font-black focus:border-amber-500 outline-none text-center font-mono placeholder-purple-900/30"
              />
            </div>
          </div>

          {/* 2nd Section: Pricing Details manually defined (with VAT) */}
          <div className="p-4 bg-neutral-955 border border-neutral-850 rounded-2xl space-y-3 font-sans text-xs">
            <span className="text-[12px] font-extrabold text-amber-500 uppercase tracking-wider block">정형 정밀 금융 수납 수동 조율</span>
            
            <div className="grid grid-cols-2 gap-3.5">
              <div>
                <label className="text-[11.5px] font-bold text-zinc-500 block mb-1">기본보관료 (공급가액)</label>
                <input 
                  type="number" 
                  value={editBasePrice || ''}
                  onChange={e => setEditBasePrice(Math.max(0, Number(e.target.value)))}
                  className="w-full px-3 py-2 bg-neutral-900 border border-neutral-800 rounded-xl text-zinc-200 font-mono focus:border-amber-500 outline-none text-right font-black"
                />
              </div>
              <div>
                <label className="text-[11.5px] font-bold text-zinc-500 block mb-1">종합 발렛비 (대행 가산금)</label>
                <input 
                  type="number" 
                  value={editValetPrice || ''}
                  onChange={e => setEditValetPrice(Math.max(0, Number(e.target.value)))}
                  className="w-full px-3 py-2 bg-neutral-900 border border-neutral-800 rounded-xl text-zinc-200 font-mono focus:border-amber-500 outline-none text-right font-black"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3.5 pt-1">
              <div>
                <label className="text-[11.5px] font-bold text-zinc-500 block mb-1">초과요금 (연장일차 추가분)</label>
                <input 
                  type="number" 
                  value={editOvertimePrice || ''}
                  onChange={e => setEditOvertimePrice(Math.max(0, Number(e.target.value)))}
                  className="w-full px-3 py-2 bg-neutral-900 border border-neutral-800 rounded-xl text-zinc-200 font-mono focus:border-amber-500 outline-none text-right font-black"
                />
              </div>
              <div>
                <label className="text-[11.5px] font-bold text-zinc-500 block mb-1">할인요금 (차감액)</label>
                <input 
                  type="number" 
                  value={editDiscountPrice || ''}
                  onChange={e => setEditDiscountPrice(Math.max(0, Number(e.target.value)))}
                  className="w-full px-3 py-2 bg-neutral-900 border border-rose-900/30 rounded-xl text-rose-450 font-mono focus:border-amber-500 outline-none text-right font-black"
                />
              </div>
            </div>

            {/* Price summaries with VAT */}
            <div className="bg-[#1C1C1E] border border-neutral-800/40 p-3 rounded-xl space-y-1.5 mt-2.5">
              <div className="flex justify-between items-center text-[12px] text-zinc-400">
                <span>공급합계 (순액)</span>
                <span className="font-mono font-bold text-white">{calculatedNetTotal.toLocaleString()}원</span>
              </div>
              <div className="flex justify-between items-center text-[12px] text-zinc-400 border-b border-neutral-800 pb-1.5 mb-1">
                <span>부가가치세 (10%)</span>
                <span className="font-mono text-zinc-450">{Math.round(calculatedNetTotal * 0.1).toLocaleString()}원</span>
              </div>
              <div className="flex justify-between items-center text-xs font-black">
                <span className="text-amber-500 flex items-center gap-1">
                  최종 합계 금액 <span className="text-[11px] text-zinc-500 font-normal">(VAT 포함)</span>
                </span>
                <span className="text-amber-400 font-mono text-sm tracking-tight text-right">
                  {calculatedVatIncludedTotal.toLocaleString()}원
                </span>
              </div>
            </div>
          </div>

          {/* 3rd Section: Admin notes */}
          <div className="bg-neutral-950 border border-neutral-850 p-4 rounded-xl space-y-1.5 font-sans text-xs">
            <label className="text-[11.5px] font-bold text-zinc-500 block mb-1 uppercase tracking-wider font-semibold">가외 주유/차량 보관 정보 관리자 메모창</label>
            <textarea 
              value={editAdminMemo}
              onChange={e => setEditAdminMemo(e.target.value)}
              placeholder="고객 요청사안 및 주차 위치 상세사항을 추가적으로 정밀 기재하십시오."
              className="w-full h-16 px-3 py-2 bg-neutral-900 border border-neutral-800 rounded-xl text-zinc-300 font-semibold placeholder-zinc-750 outline-none focus:border-amber-500 text-[12.5px] leading-relaxed resize-none"
            />
          </div>

          {/* 4th Section: Master Override Status Buttons */}
          <div className="bg-neutral-955 border border-red-955/40 p-4 rounded-xl space-y-3 font-sans text-xs">
            <div className="flex items-center gap-1.5 text-zinc-400 font-bold uppercase tracking-wider text-[12px]">
              <ShieldCheck size={13} className="text-red-500 animate-pulse" />
              <span>관리자 마스터 권한 (Master Override)</span>
            </div>
            <p className="text-[11.5px] text-zinc-500 leading-normal">
              본 제어 기능은 손가락 오작동을 최소화하면서도 마스터 권한을 행사할 수 있게 특별 구성되었습니다. 상태 변경 시 즉시 Firestore 실시간 서버 데이터와 동기화됩니다.
            </p>

            <div className="pt-1.5">
              {targetReservationForEdit.status !== 'request_out' && targetReservationForEdit.status !== 'completed_out' && targetReservationForEdit.status !== 'cancelled' ? (
                <button
                  type="button"
                  onClick={async () => {
                    if (window.confirm("정말 강제로 차량 상태를 변경하시겠습니까? 현장 데이터가 즉시 동기화됩니다.")) {
                      await handleUpdateValetStatus(targetReservationForEdit.id || '', 'request_out');
                    }
                  }}
                  className="w-full py-2.5 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-black transition-colors flex items-center justify-center gap-2 shadow-md cursor-pointer"
                >
                  <AlertCircle size={13} />
                  강제 출고요청 전환
                </button>
              ) : targetReservationForEdit.status === 'request_out' ? (
                <button
                  type="button"
                  onClick={async () => {
                    if (window.confirm("정말 강제로 차량 상태를 변경하시겠습니까? 현장 데이터가 즉시 동기화됩니다.")) {
                      await handleUpdateValetStatus(targetReservationForEdit.id || '', 'completed_out', {
                        actualExitTime: getKSTDateTimeString()
                      });
                    }
                  }}
                  className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-black transition-colors flex items-center justify-center gap-2 shadow-md cursor-pointer"
                >
                  <CheckCircle2 size={13} />
                  강제 반납완료 처리
                </button>
              ) : (
                <div className="text-center py-2.5 bg-neutral-900 border border-neutral-850 rounded-lg text-zinc-500 text-[12px] font-bold">
                  이미 출고완료(반납 완료) 되었거나 취소된 예약입니다.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-neutral-850 flex gap-2 bg-neutral-900/60 shadow-lg">
          <button 
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 bg-[#1C1C1E] hover:bg-neutral-800 text-zinc-400 rounded-lg text-xs font-bold border border-neutral-850 transition-colors cursor-pointer"
          >
            닫기
          </button>
          <button 
            type="button"
            onClick={() => {
              const reason = window.prompt("취소 사유를 기술하십시오 (예: 고객 취소 요청):", "관리자에 의한 정밀 수동 취소 처리");
              if (reason !== null) {
                handleUpdateValetStatus(targetReservationForEdit.id || '', 'cancelled', {
                  cancelReason: reason || "관리자에 의한 정밀 수동 취소 처리",
                  cancelledAt: new Date().toISOString().replace('T', ' ').substring(0, 19)
                });
                onClose();
              }
            }}
            className="px-4 py-2.5 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-bold transition-colors whitespace-nowrap cursor-pointer hover:scale-[1.02]"
          >
            예약 취소
          </button>
          <button 
            type="button"
            onClick={handleSaveAdminReservationEdit}
            className="flex-1 py-2.5 bg-amber-500 hover:bg-amber-440 text-neutral-950 rounded-lg text-xs font-bold shadow-md shadow-amber-500/15 transition-all flex items-center justify-center gap-1.5 cursor-pointer hover:scale-[1.01]"
          >
            <CheckCircle2 size={13} />
            정보 변경 완료
          </button>
        </div>
      </div>
    </div>
  );
}
