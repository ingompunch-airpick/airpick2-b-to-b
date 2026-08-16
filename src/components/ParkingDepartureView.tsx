import React, { useState } from 'react';
import { ArrowLeft, Car, ChevronRight } from 'lucide-react';
import type { Reservation } from '../types';
import { isReservationUnpaid } from '../utils/paymentStatus';

interface ParkingDepartureViewProps {
  onBack: () => void;
  reservations: Reservation[];
  /** 목록 클릭 → App EditModal(작업대) */
  onOpenWorkbench?: (res: Reservation) => void;
}

export default function ParkingDepartureView({
  onBack,
  reservations,
  onOpenWorkbench,
}: ParkingDepartureViewProps) {
  const [activeTab, setActiveTab] = useState<'indoor' | 'outdoor'>('indoor');

  const parkedReservations = reservations.filter((res) => res.status === 'completed_in');
  const indoorReservations = parkedReservations.filter((res) => res.isIndoor !== false);
  const outdoorReservations = parkedReservations.filter((res) => res.isIndoor === false);
  const displayedReservations = activeTab === 'indoor' ? indoorReservations : outdoorReservations;

  return (
    <div className="min-h-screen bg-neutral-950 text-white p-5 pb-24 select-none">
      <div className="flex items-center gap-3.5 mb-6">
        <button
          type="button"
          onClick={onBack}
          className="p-2 hover:bg-neutral-900 rounded-2xl text-zinc-400 hover:text-white transition-all bg-neutral-900/60 border border-neutral-800 active:scale-[0.95]"
          id="btn-back-to-timeline"
        >
          <ArrowLeft size={16} />
        </button>
        <div>
          <h2 className="text-sm font-bold tracking-tight text-white">주차장별 실시간 현황</h2>
          <p className="text-[12px] text-zinc-500 font-bold">탭하면 예약 상세·수정으로 이동합니다</p>
        </div>
      </div>

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
            <span
              className={`text-[12px] font-mono font-bold ${
                activeTab === 'indoor' ? 'text-neutral-900/70' : 'text-zinc-500'
              }`}
            >
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
            <span
              className={`text-[12px] font-mono font-bold ${
                activeTab === 'outdoor' ? 'text-neutral-900/70' : 'text-zinc-500'
              }`}
            >
              현재 {outdoorReservations.length}대 주차 중
            </span>
          </button>
        </div>
      </div>

      <div className="bg-neutral-900/80 border border-neutral-850 rounded-2xl p-4 mb-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
            <Car size={18} className="text-amber-500" />
          </div>
          <div>
            <h3 className="text-xs font-bold text-zinc-100">
              {activeTab === 'indoor' ? '실내 주차 구역' : '실외 주차 구역'}
            </h3>
            <p className="text-[12px] text-zinc-500 font-semibold mt-0.5">
              차량번호 · 구역 · 출고만 표시
            </p>
          </div>
        </div>
        <div className="text-right">
          <span className="text-[13px] font-bold text-[#8E8E93] block">총 주차 대수</span>
          <span className="text-sm font-black text-amber-500 font-mono tracking-tight leading-none mt-1 block">
            {displayedReservations.length}대
          </span>
        </div>
      </div>

      <div className="space-y-2">
        {displayedReservations.length > 0 ? (
          displayedReservations.map((res, idx) => {
            const exitLabel = [res.arrivalDate?.slice(5), (res.arrivalTime || '').slice(0, 5)]
              .filter(Boolean)
              .join(' ');
            return (
              <button
                key={`${res.id || ''}-${idx}`}
                type="button"
                onClick={() => onOpenWorkbench?.(res)}
                className="w-full text-left p-3.5 bg-neutral-900/50 border border-neutral-850 rounded-2xl hover:border-neutral-700 hover:bg-neutral-900/80 transition-all active:scale-[0.99] flex items-center gap-3"
              >
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-black text-white font-mono tracking-wide">
                      {res.carNumber || '번호미상'}
                    </span>
                    {isReservationUnpaid(res) && (
                      <span className="text-[10px] font-black px-1.5 py-0.5 rounded-md bg-rose-500/15 text-rose-400 border border-rose-500/25">
                        미납
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-[11px] text-zinc-500 font-bold">
                    {res.parkingSpace ? (
                      <span className="text-emerald-400/90">{res.parkingSpace}</span>
                    ) : (
                      <span>구역 미지정</span>
                    )}
                    {exitLabel ? (
                      <>
                        <span className="text-zinc-700">·</span>
                        <span>출고 {exitLabel}</span>
                      </>
                    ) : null}
                  </div>
                </div>
                <ChevronRight size={16} className="text-zinc-600 shrink-0" />
              </button>
            );
          })
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
    </div>
  );
}
