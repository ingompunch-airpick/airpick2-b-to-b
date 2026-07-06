import React, { useState } from 'react';
import { ArrowLeft, Car, MapPin, Calendar, Clock, User, Phone, Layers, Edit, Trash2, X, Check, AlertTriangle } from 'lucide-react';
import { Company, Reservation } from '../types';
import { mergePartnerPricing } from '../utils/pricing';

function splitDateTime(val?: string): { date: string; time: string } {
  if (!val) return { date: '', time: '' };
  const normalized = val.replace('T', ' ').trim();
  const [date, timePart] = normalized.split(/\s+/);
  const time = (timePart || '').substring(0, 5);
  return { date: date || '', time };
}

function joinDateTime(date: string, time: string): string {
  if (!date.trim()) return '';
  const t = (time || '00:00').trim();
  const withSec = t.length === 5 ? `${t}:00` : t;
  return `${date.trim()} ${withSec}`;
}
import { db } from '../firebase';
import { doc, updateDoc } from 'firebase/firestore';
import { ensureFirestoreAuth } from '../lib/reservationFirestore';
import {
  isReservationUnpaid,
  paymentChoiceToMethod,
  reservationToPaymentChoice,
} from '../utils/paymentStatus';

type CalculatePriceFn = (
  company: Company,
  start: string,
  end: string,
  indoor?: boolean,
  isT2?: boolean
) => number;

interface ParkingDepartureViewProps {
  onBack: () => void;
  reservations: Reservation[];
  companies?: Company[];
  getCalculatePrice?: CalculatePriceFn;
  onReservationPatch?: (id: string, patch: Partial<Reservation>) => void;
}

export default function ParkingDepartureView({
  onBack,
  reservations,
  companies = [],
  getCalculatePrice,
  onReservationPatch,
}: ParkingDepartureViewProps) {
  const [activeTab, setActiveTab] = useState<'indoor' | 'outdoor'>('indoor');

  // Modal States
  const [editingRes, setEditingRes] = useState<Reservation | null>(null);
  const [deletingRes, setDeletingRes] = useState<Reservation | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Form Fields for Editing
  const [editUserName, setEditUserName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editCarModel, setEditCarModel] = useState('');
  const [editCarNumber, setEditCarNumber] = useState('');
  const [editIsIndoor, setEditIsIndoor] = useState<boolean>(true);
  const [editParkingSpace, setEditParkingSpace] = useState('');
  const [editDepartureDate, setEditDepartureDate] = useState('');
  const [editDepartureTime, setEditDepartureTime] = useState('');
  const [editArrivalDate, setEditArrivalDate] = useState('');
  const [editArrivalTime, setEditArrivalTime] = useState('');
  const [editDepartureTerminal, setEditDepartureTerminal] = useState<'T1' | 'T2'>('T1');
  const [editArrivalTerminal, setEditArrivalTerminal] = useState<'T1' | 'T2'>('T1');
  const [editActualParkingDate, setEditActualParkingDate] = useState('');
  const [editActualParkingClock, setEditActualParkingClock] = useState('');
  const [editPaymentChoice, setEditPaymentChoice] = useState<'unpaid' | 'paid'>('unpaid');

  // Filter only 'completed_in' (주차완료) status
  const parkedReservations = reservations.filter(res => res.status === 'completed_in');

  // Classify by isIndoor (default to true/Indoor if undefined for safety)
  const indoorReservations = parkedReservations.filter(res => res.isIndoor !== false);
  const outdoorReservations = parkedReservations.filter(res => res.isIndoor === false);

  const displayedReservations = activeTab === 'indoor' ? indoorReservations : outdoorReservations;

  // Open Edit Modal with pre-populated values
  const handleOpenEditModal = (res: Reservation) => {
    setEditingRes(res);
    setEditUserName(res.userName || '');
    setEditPhone(res.phone || '');
    setEditCarModel(res.carModel || '');
    setEditCarNumber(res.carNumber || '');
    setEditIsIndoor(res.isIndoor !== false);
    setEditParkingSpace(res.parkingSpace || '');
    const normTime = (t?: string) => (t || '').trim().substring(0, 5);
    setEditDepartureDate(res.departureDate || '');
    setEditDepartureTime(normTime(res.departureTime));
    setEditArrivalDate(res.arrivalDate || '');
    setEditArrivalTime(normTime(res.arrivalTime));
    setEditDepartureTerminal(res.departureTerminal || 'T1');
    setEditArrivalTerminal(res.arrivalTerminal || 'T1');
    const actual = splitDateTime(res.actualParkingTime);
    setEditActualParkingDate(actual.date);
    setEditActualParkingClock(actual.time);
    setEditPaymentChoice(reservationToPaymentChoice(res));
  };

  const applyNowAsActualParking = () => {
    const now = new Date(Date.now() + 9 * 60 * 60 * 1000);
    const y = now.getUTCFullYear();
    const m = String(now.getUTCMonth() + 1).padStart(2, '0');
    const d = String(now.getUTCDate()).padStart(2, '0');
    const hh = String(now.getUTCHours()).padStart(2, '0');
    const mm = String(now.getUTCMinutes()).padStart(2, '0');
    setEditActualParkingDate(`${y}-${m}-${d}`);
    setEditActualParkingClock(`${hh}:${mm}`);
  };

  // Save modified vehicle data to Firestore
  const handleSaveEdit = async () => {
    if (!editingRes || !editingRes.id) return;
    setIsSaving(true);
    try {
      const paymentMethod = paymentChoiceToMethod(editPaymentChoice);
      const actualParkingTime = joinDateTime(editActualParkingDate, editActualParkingClock);
      const scheduleStart = joinDateTime(editDepartureDate, editDepartureTime);
      const scheduleEnd = joinDateTime(editArrivalDate, editArrivalTime);

      let totalPrice = editingRes.totalPrice;
      if (getCalculatePrice && editDepartureDate && editArrivalDate) {
        const rawCo =
          companies.find(c => c.id === editingRes.companyId) ||
          ({ id: editingRes.companyId, name: editingRes.companyName } as Company);
        const co = mergePartnerPricing(rawCo as Record<string, unknown>, editingRes.companyId) as Company;
        totalPrice = getCalculatePrice(
          co,
          scheduleStart || `${editDepartureDate} ${editDepartureTime || '00:00'}`,
          scheduleEnd || `${editArrivalDate} ${editArrivalTime || '00:00'}`,
          editIsIndoor,
          editDepartureTerminal === 'T2'
        );
      }

      const patch: Partial<Reservation> = {
        userName: editUserName,
        phone: editPhone,
        carModel: editCarModel,
        carNumber: editCarNumber,
        isIndoor: editIsIndoor,
        parkingSpace: editParkingSpace,
        departureDate: editDepartureDate,
        departureTime: editDepartureTime,
        arrivalDate: editArrivalDate,
        arrivalTime: editArrivalTime,
        departureTerminal: editDepartureTerminal,
        arrivalTerminal: editArrivalTerminal,
        actualParkingTime: actualParkingTime || undefined,
        startDate: scheduleStart || undefined,
        endDate: scheduleEnd || undefined,
        totalPrice,
        paymentMethod,
        updatedAt: new Date().toISOString(),
      };
      const docRef = doc(db, 'reservations', editingRes.id);
      await updateDoc(docRef, {
        ...patch,
        actualParkingTime: actualParkingTime || null,
      });
      onReservationPatch?.(editingRes.id, patch);
      setEditingRes(null);
    } catch (error) {
      console.error("Failed to update reservation in real-time:", error);
      alert("차량 정보 수정에 실패했습니다. 네트워크 연결을 확인해주세요.");
    } finally {
      setIsSaving(false);
    }
  };

  // Open cancel confirm modal (Firestore delete 금지 — status cancelled)
  const handleOpenDeleteConfirm = (res: Reservation) => {
    setDeletingRes(res);
  };

  const handleDeleteConfirm = async () => {
    if (!deletingRes || !deletingRes.id) return;
    const resId = deletingRes.id;
    const patch: Partial<Reservation> = {
      status: 'cancelled',
      cancelReason: '출차관리 화면 취소 처리',
      cancelledAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      updatedBy: 'B2B 출차관리',
    };
    setIsDeleting(true);
    onReservationPatch?.(resId, patch);
    setDeletingRes(null);
    try {
      await ensureFirestoreAuth();
      await updateDoc(doc(db, 'reservations', resId), patch);
    } catch (error) {
      console.error('Failed to cancel reservation:', error);
      const code = (error as { code?: string })?.code;
      if (code === 'permission-denied') {
        alert('취소 처리 권한이 없습니다. 페이지를 새로고침한 뒤 다시 시도해 주세요.');
      } else {
        alert('예약 취소 저장에 실패했습니다. 잠시 후 다시 시도해 주세요.');
      }
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-white p-5 pb-24 select-none">
      {/* Header */}
      <div className="flex items-center gap-3.5 mb-6">
        <button 
          onClick={onBack}
          className="p-2 hover:bg-neutral-900 rounded-2xl text-zinc-400 hover:text-white transition-all bg-neutral-900/60 border border-neutral-800 active:scale-[0.95]"
          id="btn-back-to-timeline"
        >
          <ArrowLeft size={16} />
        </button>
        <div>
          <h2 className="text-sm font-bold tracking-tight text-white">주차장별 실시간 현황</h2>
          <p className="text-[12px] text-zinc-500 font-bold">실시간 주차 구역 현황</p>
        </div>
      </div>

      {/* Segmented Control (Toss Premium Segment Selector Style) */}
      <div className="bg-neutral-900/40 p-1.5 border border-neutral-850 rounded-2xl mb-5">
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('indoor')}
            className={`py-3.5 px-4 text-xs font-bold rounded-xl transition-all duration-150 flex flex-col items-center justify-center gap-1 ${
              activeTab === 'indoor'
                ? 'bg-amber-500 text-neutral-950 shadow-md shadow-amber-500/10 scale-[1.01]'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-neutral-900/60'
            }`}
            id="tab-select-indoor"
          >
            <span className="text-[12.5px] font-black">실내 주차장</span>
            <span className={`text-[12px] font-mono font-bold ${activeTab === 'indoor' ? 'text-neutral-900/70' : 'text-zinc-500'}`}>
              현재 {indoorReservations.length}대 주차 중
            </span>
          </button>
          
          <button
            type="button"
            onClick={() => setActiveTab('outdoor')}
            className={`py-3.5 px-4 text-xs font-bold rounded-xl transition-all duration-150 flex flex-col items-center justify-center gap-1 ${
              activeTab === 'outdoor'
                ? 'bg-amber-500 text-neutral-950 shadow-md shadow-amber-500/10 scale-[1.01]'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-neutral-900/60'
            }`}
            id="tab-select-outdoor"
          >
            <span className="text-[12.5px] font-black">실외 주차장</span>
            <span className={`text-[12px] font-mono font-bold ${activeTab === 'outdoor' ? 'text-neutral-900/70' : 'text-zinc-500'}`}>
              현재 {outdoorReservations.length}대 주차 중
            </span>
          </button>
        </div>
      </div>

      {/* Dynamic Summary Card */}
      <div className="bg-neutral-900/80 border border-neutral-850 rounded-2xl p-4 mb-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
            <Car size={18} className="text-amber-500" />
          </div>
          <div>
            <h3 className="text-xs font-bold text-zinc-100">
              {activeTab === 'indoor' ? '실내 주차 구역' : '실외 주차 구역'}
            </h3>
            <p className="text-[12px] text-zinc-500 font-semibold uppercase font-mono mt-0.5">
              {activeTab === 'indoor' ? 'Indoor Parking Zone' : 'Outdoor Parking Zone'}
            </p>
          </div>
        </div>
        <div className="text-right">
          <span className="text-[13px] font-bold text-[#8E8E93] block">총 주차 대수</span>
          <span className="text-sm font-black text-amber-500 font-mono tracking-tight leading-none mt-1 block">
            {activeTab === 'indoor' ? `${indoorReservations.length}대` : `${outdoorReservations.length}대`}
          </span>
        </div>
      </div>

      {/* Vehicle List */}
      <div className="space-y-3">
        {displayedReservations.length > 0 ? (
          displayedReservations.map((res, idx) => (
            <div 
              key={`${res.id || ''}-${idx}`} 
              className="p-4 bg-neutral-900/40 border border-neutral-850 rounded-2xl space-y-3.5 hover:border-neutral-700 hover:bg-neutral-900/60 transition-all duration-150 relative overflow-hidden"
            >
              {/* Top Row: User & Agency info + Action Buttons */}
              <div className="flex justify-between items-center flex-wrap gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-bold text-white">{res.userName} 고객님</span>
                  <span className="text-[11.5px] font-mono bg-neutral-950 text-zinc-400 px-2 py-0.5 rounded border border-neutral-850 font-bold">
                    {res.phone || '010-0000-0000'}
                  </span>
                  {isReservationUnpaid(res) && (
                    <span className="text-[11px] font-black px-2 py-0.5 rounded-md bg-rose-500/15 text-rose-400 border border-rose-500/25">
                      미납
                    </span>
                  )}
                </div>
                
                <div className="flex items-center gap-1.5 ml-auto">
                  <button 
                    onClick={() => handleOpenEditModal(res)}
                    className="flex items-center gap-1 px-2.5 py-1 bg-neutral-950 border border-neutral-800 hover:border-amber-500 text-[12px] font-bold text-[#8E8E93] hover:text-amber-500 rounded-lg transition-all duration-100"
                  >
                    <Edit size={10} />
                    수정
                  </button>
                  <button 
                    onClick={() => handleOpenDeleteConfirm(res)}
                    className="flex items-center gap-1 px-2.5 py-1 bg-neutral-950 border border-neutral-800 hover:border-red-500 text-[12px] font-bold text-[#8E8E93] hover:text-red-500 rounded-lg transition-all duration-100"
                  >
                    <Trash2 size={10} />
                    취소
                  </button>
                  <span className="text-[11.5px] font-bold text-zinc-400 bg-neutral-950 border border-neutral-850 px-2.5 py-1 rounded-md">
                    대행: {res.companyName}
                  </span>
                </div>
              </div>

              {/* Middle Row: License Plate and Car Model Accent Box */}
              <div className="p-3 bg-neutral-950 border border-neutral-850 rounded-xl flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-5 h-5 rounded-md bg-zinc-900 border border-zinc-800 flex items-center justify-center">
                    <Car size={11} className="text-amber-500" />
                  </div>
                  <div>
                    <span className="text-[11px] text-zinc-500 block leading-none uppercase font-bold mb-0.5">모델 분류</span>
                    <span className="text-xs font-black text-zinc-200">{res.carModel}</span>
                  </div>
                </div>
                
                {/* Clean Virtualized License Plate representation */}
                <div className="px-3 py-1 bg-white text-neutral-950 rounded-lg text-xs font-black tracking-wide border border-zinc-300 shadow-sm font-mono uppercase select-all">
                  {res.carNumber}
                </div>
              </div>

              {/* Bottom Row: Entry Details */}
              <div className="flex flex-col gap-1 text-[12px] text-zinc-400 font-mono pt-1.5 border-t border-neutral-850/60">
                <div className="flex items-center gap-1.5">
                  <Calendar size={11} className="text-zinc-500 shrink-0" />
                  <span>
                    입고 예정: <span className="font-bold text-zinc-300">{res.departureDate} {res.departureTime}</span>
                    <span className="text-zinc-600 ml-1">({res.departureTerminal || 'T1'})</span>
                  </span>
                </div>
                {res.actualParkingTime && (
                  <div className="flex items-center gap-1.5 mt-0.5 text-amber-500/90">
                    <Clock size={11} className="shrink-0" />
                    <span>
                      실제 입고: <span className="font-bold">{res.actualParkingTime}</span>
                    </span>
                  </div>
                )}
                <div className="flex items-center gap-1.5 mt-0.5">
                  <Calendar size={11} className="text-zinc-500 shrink-0" />
                  <span>
                    출차 예정: <span className="font-bold text-zinc-300">{res.arrivalDate} {res.arrivalTime}</span>
                    <span className="text-zinc-600 ml-1">({res.arrivalTerminal || 'T1'})</span>
                  </span>
                </div>
                {typeof res.totalPrice === 'number' && (
                  <div className="text-[12px] text-zinc-500 mt-0.5">
                    요금: <span className="font-bold text-amber-500/90">{res.totalPrice.toLocaleString()}원</span>
                  </div>
                )}
                {res.parkingSpace && (
                  <div className="flex items-center gap-1.5 mt-0.5 text-emerald-400/90">
                    <MapPin size={11} className="shrink-0" />
                    <span>
                      주차 구역 번호: <span className="font-bold text-white bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded">{res.parkingSpace}</span>
                    </span>
                  </div>
                )}
              </div>
            </div>
          ))
        ) : (
          <div className="p-12 text-center bg-neutral-900/20 border border-dashed border-neutral-850 rounded-3xl">
            <Car className="mx-auto text-neutral-800 mb-2.5" size={24} />
            <p className="text-xs text-neutral-500 font-bold">
              현재 {activeTab === 'indoor' ? '실내' : '실외'} 주차장에 완료 상태의 차량이 없습니다
            </p>
            <p className="text-[11.5px] text-neutral-650 mt-1 font-medium">
              차량 상태가 '주차완료'인 차량들만 실시간으로 집계됩니다.
            </p>
          </div>
        )}
      </div>

      {/* ✏️ 정보 수정 모달 (정보 수정 모달) */}
      {editingRes && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-neutral-950/80 backdrop-blur-sm">
          <div className="w-full max-w-sm bg-[#121212] rounded-2xl border border-neutral-800 overflow-hidden shadow-2xl flex flex-col font-sans">
            {/* Modal Header */}
            <div className="p-4 border-b border-neutral-800/50 flex items-center justify-between bg-[#141416]/50">
              <div className="flex items-center gap-2">
                <Edit size={16} className="text-amber-500" />
                <div>
                  <h3 className="text-[14px] font-black text-white">차량 접수 정보 수정</h3>
                  <p className="text-[11px] text-[#8E8E93] font-bold tracking-wide">차량 정보 수정</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingRes(null)}
                className="p-1.5 hover:bg-neutral-800 rounded-xl text-zinc-400 hover:text-white transition-all border border-neutral-800/40"
              >
                <X size={14} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-4.5 space-y-3.5 max-h-[60vh] overflow-y-auto">
              {/* 고객명 & 연락처 */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11.5px] text-zinc-500 font-black block mb-1">고객명</label>
                  <input
                    type="text"
                    value={editUserName}
                    onChange={(e) => setEditUserName(e.target.value)}
                    className="w-full px-3 py-2 border border-neutral-800 bg-[#1C1C1E] text-white rounded-xl focus:outline-none focus:ring-1 focus:ring-amber-500 font-bold text-xs"
                  />
                </div>
                <div>
                  <label className="text-[11.5px] text-zinc-500 font-black block mb-1">연락처</label>
                  <input
                    type="text"
                    value={editPhone}
                    onChange={(e) => setEditPhone(e.target.value)}
                    className="w-full px-3 py-2 border border-neutral-800 bg-[#1C1C1E] text-white rounded-xl focus:outline-none focus:ring-1 focus:ring-amber-500 font-bold text-xs"
                  />
                </div>
              </div>

              {/* 차종 & 차량번호 */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11.5px] text-zinc-500 font-black block mb-1">차종</label>
                  <input
                    type="text"
                    value={editCarModel}
                    onChange={(e) => setEditCarModel(e.target.value)}
                    className="w-full px-3 py-2 border border-neutral-800 bg-[#1C1C1E] text-white rounded-xl focus:outline-none focus:ring-1 focus:ring-amber-500 font-bold text-xs"
                  />
                </div>
                <div>
                  <label className="text-[11.5px] text-zinc-500 font-black block mb-1">차량번호</label>
                  <input
                    type="text"
                    value={editCarNumber}
                    onChange={(e) => setEditCarNumber(e.target.value)}
                    className="w-full px-3 py-2 border border-neutral-800 bg-[#1C1C1E] text-white rounded-xl focus:outline-none focus:ring-1 focus:ring-amber-500 font-bold text-xs"
                  />
                </div>
              </div>

              {/* 주차 타입: 실내 / 실외 전환 */}
              <div>
                <label className="text-[11.5px] text-zinc-500 font-black block mb-1">주차장 구분</label>
                <div className="grid grid-cols-2 gap-2 bg-[#1C1C1E]/50 border border-neutral-850 p-1 rounded-xl">
                  <button
                    type="button"
                    onClick={() => setEditIsIndoor(true)}
                    className={`py-2 text-[13px] font-black rounded-lg transition-all ${
                      editIsIndoor
                        ? 'bg-amber-500 text-neutral-950 shadow-md'
                        : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    실내 주차장
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditIsIndoor(false)}
                    className={`py-2 text-[13px] font-black rounded-lg transition-all ${
                      !editIsIndoor
                        ? 'bg-amber-500 text-neutral-950 shadow-md'
                        : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    실외 주차장
                  </button>
                </div>
              </div>

              {/* 주차 구역 (parkingSpace) */}
              <div>
                <label className="text-[11.5px] text-zinc-500 font-black block mb-1">주차 구역 번호</label>
                <input
                  type="text"
                  placeholder="예: 실외-A구역, B-B03"
                  value={editParkingSpace}
                  onChange={(e) => setEditParkingSpace(e.target.value)}
                  className="w-full px-3 py-2 border border-neutral-800 bg-[#1C1C1E] text-white rounded-xl focus:outline-none focus:ring-1 focus:ring-amber-500 font-bold text-xs font-mono"
                />
              </div>

              {/* 일정: 입·출차 (빠른/늦은 도착 반영) */}
              <div className="pt-1 border-t border-neutral-850/80 space-y-3">
                <p className="text-[12px] font-black text-amber-500">일정 (입·출차)</p>
                <p className="text-[11px] text-zinc-500 -mt-2 leading-relaxed">
                  예약보다 일찍·늦게 온 경우 입고 예정·실제 입고·출차 예정을 맞춰 주세요. 저장 시 요금이 다시 계산됩니다.
                </p>

                <div>
                  <label className="text-[11.5px] text-zinc-500 font-black block mb-1">입고 터미널</label>
                  <div className="grid grid-cols-2 gap-2 bg-[#1C1C1E]/50 border border-neutral-850 p-1 rounded-xl">
                    {(['T1', 'T2'] as const).map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setEditDepartureTerminal(t)}
                        className={`py-2 text-[13px] font-black rounded-lg transition-all ${
                          editDepartureTerminal === t
                            ? 'bg-amber-500 text-neutral-950'
                            : 'text-zinc-400 hover:text-white'
                        }`}
                      >
                        {t === 'T1' ? '1터미널' : '2터미널'}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 font-mono">
                  <div>
                    <label className="text-[11.5px] text-zinc-500 font-black block mb-1">입고 예정일</label>
                    <input
                      type="date"
                      value={editDepartureDate}
                      onChange={(e) => setEditDepartureDate(e.target.value)}
                      className="w-full px-3 py-2 border border-neutral-800 bg-[#1C1C1E] text-white rounded-xl focus:outline-none focus:ring-1 focus:ring-amber-500 font-bold text-xs"
                    />
                  </div>
                  <div>
                    <label className="text-[11.5px] text-zinc-500 font-black block mb-1">입고 예정시간</label>
                    <input
                      type="time"
                      value={editDepartureTime}
                      onChange={(e) => setEditDepartureTime(e.target.value)}
                      className="w-full px-3 py-2 border border-neutral-800 bg-[#1C1C1E] text-white rounded-xl focus:outline-none focus:ring-1 focus:ring-amber-500 font-bold text-xs"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 font-mono">
                  <div>
                    <label className="text-[11.5px] text-zinc-500 font-black block mb-1">실제 입고일</label>
                    <input
                      type="date"
                      value={editActualParkingDate}
                      onChange={(e) => setEditActualParkingDate(e.target.value)}
                      className="w-full px-3 py-2 border border-neutral-800 bg-[#1C1C1E] text-white rounded-xl focus:outline-none focus:ring-1 focus:ring-amber-500 font-bold text-xs"
                    />
                  </div>
                  <div>
                    <label className="text-[11.5px] text-zinc-500 font-black block mb-1">실제 입고시간</label>
                    <input
                      type="time"
                      value={editActualParkingClock}
                      onChange={(e) => setEditActualParkingClock(e.target.value)}
                      className="w-full px-3 py-2 border border-neutral-800 bg-[#1C1C1E] text-white rounded-xl focus:outline-none focus:ring-1 focus:ring-amber-500 font-bold text-xs"
                    />
                  </div>
                </div>
                <button
                  type="button"
                  onClick={applyNowAsActualParking}
                  className="w-full py-2 text-[12px] font-black rounded-lg border border-neutral-800 bg-neutral-950 text-zinc-300 hover:text-white hover:border-amber-500/40 transition-all"
                >
                  실제 입고 → 지금 시각으로
                </button>

                <div>
                  <label className="text-[11.5px] text-zinc-500 font-black block mb-1">출차 터미널</label>
                  <div className="grid grid-cols-2 gap-2 bg-[#1C1C1E]/50 border border-neutral-850 p-1 rounded-xl">
                    {(['T1', 'T2'] as const).map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setEditArrivalTerminal(t)}
                        className={`py-2 text-[13px] font-black rounded-lg transition-all ${
                          editArrivalTerminal === t
                            ? 'bg-amber-500 text-neutral-950'
                            : 'text-zinc-400 hover:text-white'
                        }`}
                      >
                        {t === 'T1' ? '1터미널' : '2터미널'}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 font-mono">
                  <div>
                    <label className="text-[11.5px] text-zinc-500 font-black block mb-1">출차 예정일</label>
                    <input
                      type="date"
                      value={editArrivalDate}
                      onChange={(e) => setEditArrivalDate(e.target.value)}
                      className="w-full px-3 py-2 border border-neutral-800 bg-[#1C1C1E] text-white rounded-xl focus:outline-none focus:ring-1 focus:ring-amber-500 font-bold text-xs"
                    />
                  </div>
                  <div>
                    <label className="text-[11.5px] text-zinc-500 font-black block mb-1">출차 예정시간</label>
                    <input
                      type="time"
                      value={editArrivalTime}
                      onChange={(e) => setEditArrivalTime(e.target.value)}
                      className="w-full px-3 py-2 border border-neutral-800 bg-[#1C1C1E] text-white rounded-xl focus:outline-none focus:ring-1 focus:ring-amber-500 font-bold text-xs"
                    />
                  </div>
                </div>
              </div>

              {/* 수납 상태 (주차 후 계좌 입금 등) */}
              <div>
                <label className="text-[11.5px] text-zinc-500 font-black block mb-1.5">수납 상태</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setEditPaymentChoice('unpaid')}
                    className={`py-2.5 text-[13px] font-black rounded-xl border transition-all ${
                      editPaymentChoice === 'unpaid'
                        ? 'bg-rose-500/15 border-rose-500 text-rose-400'
                        : 'bg-[#1C1C1E] border-neutral-800 text-zinc-400 hover:text-white'
                    }`}
                  >
                    미납
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditPaymentChoice('paid')}
                    className={`py-2.5 text-[13px] font-black rounded-xl border transition-all ${
                      editPaymentChoice === 'paid'
                        ? 'bg-emerald-500/15 border-emerald-500 text-emerald-400'
                        : 'bg-[#1C1C1E] border-neutral-800 text-zinc-400 hover:text-white'
                    }`}
                  >
                    완납
                  </button>
                </div>
                <p className="text-[11px] text-zinc-500 mt-1.5 leading-relaxed">
                  주차 완료 후 계좌 입금·현장 수납 시 「완납」으로 변경하세요.
                </p>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-[#141416]/50 border-t border-neutral-800/50 flex gap-2">
              <button
                type="button"
                disabled={isSaving}
                onClick={() => setEditingRes(null)}
                className="flex-1 py-3 text-xs bg-[#2C2C2E] hover:bg-[#3C3C3E] text-zinc-200 hover:text-white rounded-xl font-bold transition-all border border-neutral-800"
              >
                취소
              </button>
              <button
                type="button"
                disabled={isSaving}
                onClick={handleSaveEdit}
                className="flex-[2] py-3 text-xs bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-zinc-950 rounded-xl font-black transition-all flex items-center justify-center gap-1.5 shadow-lg shadow-amber-500/10"
              >
                {isSaving ? '저장 중...' : (
                  <>
                    <Check size={14} className="stroke-[2.5]" />
                    변경내용 저장
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 🗑️ 삭제 확인 안내 모달 (Custom Deletion Confirmation Modal) */}
      {deletingRes && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-neutral-950/80 backdrop-blur-sm">
          <div className="w-full max-w-sm bg-[#121212] rounded-2xl border border-neutral-800 overflow-hidden shadow-2xl flex flex-col font-sans">
            {/* Modal Body */}
            <div className="p-6 text-center space-y-4">
              <div className="mx-auto w-12 h-12 bg-red-500/10 rounded-full border border-red-500/20 flex items-center justify-center">
                <AlertTriangle size={24} className="text-red-500" />
              </div>
              <div className="space-y-1.5">
                <h3 className="text-sm font-black text-white">예약 취소 처리</h3>
                <p className="text-xs text-zinc-400 font-semibold leading-relaxed">
                  이 차량 예약을 <strong className="text-amber-400">취소(cancelled)</strong> 상태로 변경합니다.<br />
                  문서는 삭제되지 않으며, 접수취소 내역에서 확인할 수 있습니다.
                </p>
              </div>

              {/* Target info box */}
              <div className="p-3.5 bg-neutral-950 border border-neutral-850 rounded-xl space-y-1 text-left font-mono text-[12.5px]">
                <div className="flex justify-between">
                  <span className="text-zinc-500">차 량</span>
                  <span className="text-zinc-200 font-bold">{deletingRes.carModel} ({deletingRes.carNumber})</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">고객명</span>
                  <span className="text-zinc-200 font-bold">{deletingRes.userName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">구 분</span>
                  <span className="text-amber-500 font-extrabold">{deletingRes.isIndoor !== false ? '실내' : '실외'}</span>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-[#141416]/50 border-t border-neutral-800/50 flex gap-2">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setDeletingRes(null)}
                className="flex-1 py-3 text-xs bg-[#2C2C2E] hover:bg-[#3C3C3E] text-[#8E8E93] hover:text-white rounded-xl font-bold transition-all border border-neutral-800"
              >
                취소
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={handleDeleteConfirm}
                className="flex-1 py-3 text-xs bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-xl font-black transition-all flex items-center justify-center gap-1.5 shadow-lg shadow-red-500/10"
              >
                {isDeleting ? '처리 중...' : '확인 (취소 처리)'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
