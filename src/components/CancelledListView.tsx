import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Search, Undo2, Ban, ShieldAlert, Calendar, Car, Coins, FileText, ChevronRight } from 'lucide-react';
import { Reservation, AppView } from '../types';

interface CancelledListViewProps {
  reservations: Reservation[];
  onUpdateStatus: (resId: string, nextStatus: 'pending' | 'pending_in' | 'request_out' | 'completed_in' | 'completed_out' | 'cancelled') => void;
  onBack: () => void;
}

export default function CancelledListView({ reservations, onUpdateStatus, onBack }: CancelledListViewProps) {
  const [searchTerm, setSearchTerm] = useState('');

  // Extract cancelled reservations
  const cancelledReservations = reservations.filter(r => r.status === 'cancelled');

  // Filter based on search term
  const filtered = cancelledReservations.filter(r => {
    const term = searchTerm.toLowerCase();
    return (
      r.userName.toLowerCase().includes(term) ||
      r.carNumber.toLowerCase().includes(term) ||
      (r.carModel && r.carModel.toLowerCase().includes(term)) ||
      (r.phone && r.phone.includes(term))
    );
  });

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="space-y-4"
    >
      {/* Header Panel */}
      <div className="bg-neutral-900 border border-neutral-850 p-5 rounded-2xl">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <div className="bg-rose-500/10 text-rose-400 p-2 rounded-xl">
              <Ban size={18} />
            </div>
            <div>
              <h2 className="text-[14px] font-black tracking-tight text-white uppercase font-sans">
                접수취소 내역 장부
              </h2>
              <p className="text-[12px] text-zinc-400 mt-0.5">
                예약이 취소된 모바일 상세 내역 요약 ({filtered.length}건)
              </p>
            </div>
          </div>
          <button
            onClick={onBack}
            className="text-[12px] bg-neutral-950 hover:bg-neutral-800 text-zinc-300 font-bold px-3 py-1.5 rounded-xl border border-neutral-800 transition-colors cursor-pointer"
          >
            메인으로
          </button>
        </div>

        {/* Toss-style Custom Interactive Search bar */}
        <div className="relative mt-4">
          <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none text-zinc-500">
            <Search size={14} />
          </span>
          <input
            type="text"
            placeholder="고객명, 차량번호, 휴대폰번호 검색..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-neutral-950 border border-neutral-800 rounded-xl text-xs font-semibold text-white placeholder-zinc-650 outline-none focus:border-rose-500/60 transition-all font-sans"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="absolute inset-y-0 right-0 flex items-center pr-3 text-zinc-500 hover:text-white text-[12px]"
            >
              지우기
            </button>
          )}
        </div>
      </div>

      {/* Card List of Cancelled Reservations */}
      <div className="space-y-3">
        <AnimatePresence mode="popLayout">
          {filtered.length > 0 ? (
            filtered.map((res, idx) => (
              <motion.div
                key={`${res.id || ''}-${idx}`}
                layout
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-[#151517] border border-neutral-850/60 hover:border-neutral-800 rounded-2xl overflow-hidden shadow-lg transition-colors p-4.5 space-y-3 relative group"
              >
                {/* Header info (Client / Car) */}
                <div className="flex justify-between items-start">
                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[12.5px] font-black text-rose-450 bg-rose-500/10 px-2 py-0.5 rounded-lg border border-rose-500/10 uppercase tracking-wider font-mono">
                        CANCELED
                      </span>
                      <span className="text-xs font-black text-zinc-100">{res.userName}</span>
                      <span className="text-[12px] text-zinc-500 font-mono font-semibold">({res.phone})</span>
                    </div>
                    <div className="flex items-center gap-2 pt-0.5">
                      <span className="text-[14px] font-extrabold text-amber-500 tracking-tight font-mono">
                        {res.carNumber}
                      </span>
                      <span className="text-[13px] font-bold text-zinc-400">{res.carModel || '일반 차종'}</span>
                    </div>
                  </div>

                  {/* Restore Action */}
                  <button
                    onClick={() => {
                      if (window.confirm(`${res.userName}님의 취소 건을 다시 '입고 예정(active)' 상태로 복구하시겠습니까?`)) {
                        onUpdateStatus(res.id || '', 'pending');
                      }
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-neutral-900 hover:bg-zinc-800 text-zinc-350 hover:text-amber-400 border border-neutral-800 rounded-xl text-[12.5px] font-black transition-all shadow-sm cursor-pointer"
                    title="접수 상태 복구"
                  >
                    <Undo2 size={11} />
                    <span>접수 복구</span>
                  </button>
                </div>

                {/* Subdetails Panel */}
                <div className="grid grid-cols-2 gap-2 text-[12px] bg-neutral-950/40 p-3 rounded-xl border border-neutral-900">
                  <div className="space-y-1">
                    <div className="flex items-center gap-1 text-zinc-500 mb-1">
                      <Calendar size={11} />
                      <span className="font-semibold">기기로그 입출차일</span>
                    </div>
                    <div className="text-zinc-300 font-medium leading-normal space-y-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-mono">{res.departureDate} ({res.departureTime})</span>
                        {res.departureTerminal === 'T1' ? (
                          <span className="text-[10.5px] px-1 rounded bg-[#00D2FF]/10 text-[#00D2FF] border border-[#00D2FF]/20 font-black">1터</span>
                        ) : (
                          <span className="text-[10.5px] px-1 rounded bg-[#FFB800]/10 text-[#FFB800] border border-[#FFB800]/20 font-black">2터</span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-mono">~ {res.arrivalDate} ({res.arrivalTime})</span>
                        {res.arrivalTerminal === 'T1' ? (
                          <span className="text-[10.5px] px-1 rounded bg-[#00D2FF]/10 text-[#00D2FF] border border-[#00D2FF]/20 font-black">1터</span>
                        ) : (
                          <span className="text-[10.5px] px-1 rounded bg-[#FFB800]/10 text-[#FFB800] border border-[#FFB800]/20 font-black">2터</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-1 text-zinc-500">
                      <Coins size={11} />
                      <span className="font-semibold">환불 대상 결제수단</span>
                    </div>
                    <p className="text-zinc-300 font-black">
                      {res.paymentMethod === 'card' ? '신용카드' : 
                       res.paymentMethod === 'cash' ? '현장현금' : 
                       res.paymentMethod === 'account' ? '계좌이체' : '선불쿠폰'}
                      <span className="text-zinc-400 font-mono font-medium block">
                        {(res.totalPrice || 0).toLocaleString()}원
                      </span>
                    </p>
                  </div>
                </div>

                {/* Cancellation Details */}
                <div className="bg-rose-500/5 border border-rose-500/10 p-3 rounded-xl text-[12px] space-y-1">
                  <div className="flex items-center gap-1 text-rose-400/90 font-bold">
                    <ShieldAlert size={11} className="shrink-0" />
                    <span>취소 사유 및 일자</span>
                    {res.cancelledAt && (
                      <span className="text-[11px] font-mono font-medium text-rose-450/70 ml-auto">
                        ({res.cancelledAt})
                      </span>
                    )}
                  </div>
                  <p className="text-zinc-300 font-semibold leading-relaxed">
                    {res.cancelReason || '유선 및 웹사이트를 통한 접수 전면 취소 접수완료'}
                  </p>
                </div>

                {/* Receipt and Host affiliation */}
                <div className="flex items-center justify-between text-[11.5px] text-zinc-500 font-mono border-t border-neutral-900/60 pt-2.5">
                  <span>접수 번호: {res.receiptCode || 'RE_MOCK'}</span>
                  <span className="text-zinc-405 font-sans font-bold">{res.companyName}</span>
                </div>
              </motion.div>
            ))
          ) : (
            <motion.div
              layout
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="py-12 text-center text-zinc-500 bg-neutral-950 rounded-2xl border border-neutral-900 flex flex-col items-center justify-center space-y-2"
            >
              <Ban size={28} className="text-zinc-650" />
              <p className="text-[13px] font-bold">취소된 예약 내역이 존재하지 않습니다.</p>
              <p className="text-[11px] text-zinc-600">검색어를 지우거나 active 상태를 확인하십시오.</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
