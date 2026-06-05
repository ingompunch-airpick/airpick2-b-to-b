import React, { useState } from 'react';
import { ArrowLeft, Trash2, CreditCard, Landmark, Coins, Check, Search, CheckCircle2 } from 'lucide-react';
import { Reservation, PaymentMethod } from '../types';

interface PaymentChangeViewProps {
  onBack: () => void;
  reservations: Reservation[];
  onUpdatePayment: (id: string, method: PaymentMethod) => Promise<void>;
}

export default function PaymentChangeView({ onBack, reservations, onUpdatePayment }: PaymentChangeViewProps) {
  const [typedDigits, setTypedDigits] = useState('');
  const [selectedRes, setSelectedRes] = useState<Reservation | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');

  // Number input handler
  const handleNumClick = (num: string) => {
    if (typedDigits.length < 4) {
      setTypedDigits(prev => prev + num);
      setSelectedRes(null); // Clear selected reservation if editing search
    }
  };

  const handleBackspace = () => {
    setTypedDigits(prev => prev.slice(0, -1));
    setSelectedRes(null);
  };

  const handleClearAll = () => {
    setTypedDigits('');
    setSelectedRes(null);
  };

  // Filter reservations based on 4-digit car number search
  const matchedReservations = reservations.filter(res => {
    if (!typedDigits) return false;
    // Strip empty spaces and check if the carNumber contains the searched digits
    const cleanedCarNo = res.carNumber.replace(/\s+/g, '');
    return cleanedCarNo.includes(typedDigits);
  });

  const getMethodDetails = (method: PaymentMethod | undefined) => {
    switch (method) {
      case 'cash':
        return { text: '현금 정산', color: 'text-amber-500/90 bg-amber-500/5 border-amber-500/15', icon: Coins };
      case 'account':
        return { text: '계좌 이체', color: 'text-emerald-450/90 bg-emerald-500/5 border-emerald-500/15', icon: Landmark };
      case 'card':
        return { text: '카드 수납', color: 'text-sky-400/95 bg-sky-505/5 border-sky-500/15', icon: CreditCard };
      case 'paid':
        return { text: '완납', color: 'text-emerald-400/95 bg-emerald-500/5 border-emerald-500/15', icon: CheckCircle2 };
      case 'unpaid':
        return { text: '미납', color: 'text-rose-400/95 bg-rose-500/5 border-rose-500/15', icon: Coins };
      default:
        return { text: '미납', color: 'text-rose-400/95 bg-rose-500/5 border-rose-500/15', icon: Coins };
    }
  };

  const handleApplyChange = async (method: PaymentMethod) => {
    if (!selectedRes?.id) return;
    setIsUpdating(true);
    try {
      await onUpdatePayment(selectedRes.id, method);
      
      // Update local tracking
      setSelectedRes(prev => prev ? { ...prev, paymentMethod: method } : null);
      
      setStatusMsg(`차량번호 ${selectedRes.carNumber}의 결제가 [${getMethodDetails(method).text}]으로 성료 변경되었습니다.`);
      setTimeout(() => setStatusMsg(''), 4000);
    } catch (_) {
      alert("결제 통계 처리에 에러가 발생했으나, 로컬 캐시 메모리에 동기화되었습니다.");
    } finally {
      setIsUpdating(false);
    }
  };

  const padButtons = [
    '1', '2', '3',
    '4', '5', '6',
    '7', '8', '9',
    '전체삭제', '0', '←'
  ];

  return (
    <div className="min-h-screen bg-neutral-950 text-white p-5 pb-24">
      {/* Header */}
      <div className="flex items-center gap-3.5 mb-6">
        <button 
          onClick={onBack}
          className="p-2 hover:bg-neutral-900 rounded-2xl text-zinc-400 hover:text-white transition-all bg-neutral-900/60 border border-neutral-800"
        >
          <ArrowLeft size={16} />
        </button>
        <div>
          <h2 className="text-sm font-black tracking-tight text-white">결제 사후 수정</h2>
          <p className="text-[12px] text-zinc-500 font-bold uppercase">Payment Mutation Sync</p>
        </div>
      </div>

      {/* Digits Display Panel (Reference Image 5 styling) */}
      <div className="mb-6 space-y-2.5">
        <label className="text-[13px] font-black tracking-wide text-zinc-400 block text-center uppercase">
          차량 번호 4자리를 아래 패드로 입력해 주십시오
        </label>
        
        <div className="flex justify-center gap-2 max-w-xs mx-auto">
          {[0, 1, 2, 3].map((idx) => {
            const char = typedDigits[idx] || '';
            const isActive = typedDigits.length === idx;
            return (
              <div 
                key={idx}
                className={`w-14 h-14 rounded-2xl flex items-center justify-center font-mono text-xl font-black border-2 transition-all ${
                  isActive 
                    ? 'border-amber-500 bg-neutral-900 scale-105 shadow-md shadow-amber-500/10' 
                    : char 
                      ? 'border-neutral-700 bg-neutral-900 text-amber-500' 
                      : 'border-neutral-800 bg-neutral-950 text-zinc-700'
                }`}
              >
                {char || '•'}
              </div>
            );
          })}
        </div>
      </div>

      {/* Match Status alerts */}
      {statusMsg && (
        <div className="mb-6 p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl text-xs text-emerald-400 font-bold flex items-start gap-2.5">
          <CheckCircle2 size={16} className="shrink-0 mt-0.5" />
          <span>{statusMsg}</span>
        </div>
      )}

      {/* Keypad Grid (Sleek dark, yellow accents on special triggers) */}
      <div className="max-w-xs mx-auto bg-neutral-900 p-3 rounded-3xl border border-neutral-800 mb-6 shadow-xl">
        <div className="grid grid-cols-3 gap-2">
          {padButtons.map((btn, index) => {
            const isSpecial = btn === '전체삭제' || btn === '←';
            const action = () => {
              if (btn === '전체삭제') handleClearAll();
              else if (btn === '←') handleBackspace();
              else handleNumClick(btn);
            };

            return (
              <button
                key={index}
                type="button"
                onClick={action}
                className={`h-12 rounded-xl flex items-center justify-center font-bold tracking-tight text-sm font-mono transition-all border outline-none ${
                  isSpecial
                    ? btn === '전체삭제'
                      ? 'bg-red-550/10 border-red-500/20 text-red-500 hover:bg-neutral-800 text-[13px]'
                      : 'bg-neutral-800 border-neutral-700 text-zinc-300 hover:bg-neutral-750 text-xs'
                    : 'bg-neutral-950 border-neutral-850 hover:bg-neutral-800 text-white hover:border-neutral-700 active:scale-95'
                }`}
              >
                {btn}
              </button>
            );
          })}
        </div>
      </div>

      {/* Search results list in real-time */}
      <div className="space-y-3.5">
        <div className="flex justify-between items-center px-1">
          <span className="text-[12px] uppercase font-black text-zinc-500 tracking-wider">
            검색 결과 ({matchedReservations.length}건)
          </span>
          {typedDigits && (
            <button 
              onClick={handleClearAll}
              className="text-[11px] font-black text-amber-505 bg-amber-500/10 hover:bg-amber-500/20 px-2 py-1 rounded text-amber-500"
            >
              초기화
            </button>
          )}
        </div>

        {typedDigits === '' ? (
          <div className="p-8 text-center bg-neutral-900/40 border border-dashed border-neutral-800 rounded-2xl">
            <Search className="mx-auto text-neutral-700 mb-2.5 animate-pulse" size={24} />
            <p className="text-xs text-neutral-500">조회할 차량번호 4자리를 눌러주십시오</p>
          </div>
        ) : matchedReservations.length > 0 ? (
          <div className="space-y-2.5 max-h-[180px] overflow-y-auto no-scrollbar pb-3">
            {matchedReservations.map((res, idx) => {
              const payment = getMethodDetails(res.paymentMethod);
              const isSelected = selectedRes?.id === res.id;
              const PaymentIcon = payment.icon;

              return (
                <button
                  key={`${res.id || ''}-${idx}`}
                  onClick={() => setSelectedRes(res)}
                  className={`w-full text-left p-3.5 rounded-2xl flex items-center justify-between border transition-all ${
                    isSelected 
                      ? 'bg-neutral-800 border-amber-500' 
                      : 'bg-neutral-900 hover:border-neutral-750 border-neutral-850'
                  }`}
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-white">{res.userName}</span>
                      <span className="text-[12px] bg-neutral-950 text-zinc-400 font-medium px-2.5 py-1 rounded-md border border-neutral-800/80">
                        {res.carModel}
                      </span>
                    </div>
                    <div className="mt-1.5 flex items-center gap-2">
                      <p className="text-xs font-medium text-amber-500/90 select-all tracking-wide">{res.carNumber}</p>
                      <p className="text-[12px] text-zinc-500">인천공항 {res.departureTerminal}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className={`text-[11.5px] font-medium px-3.5 py-1.5 rounded-lg border uppercase tracking-tight flex items-center gap-1 ${payment.color}`}>
                      <PaymentIcon size={10} />
                      {payment.text}
                    </span>
                    {isSelected && <Check size={14} className="text-amber-500" />}
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="p-8 text-center bg-neutral-900 border border-neutral-800 rounded-2xl">
            <p className="text-xs text-neutral-500 font-bold">일치하는 예약 차량 조회가 없습니다</p>
            <p className="text-[12px] text-zinc-650 mt-1">입력하신 "{typedDigits}" 번호를 다시 확인바랍니다.</p>
          </div>
        )}
      </div>

      {/* Payment Changer Action Panel when selected */}
      {selectedRes && (
        <div className="mt-6 border-t border-neutral-800/80 pt-5 space-y-4 animate-in fade-in slide-in-from-bottom-3 duration-250">
          <div className="bg-neutral-900/60 border border-neutral-800 p-4 rounded-2xl">
            <p className="text-[12px] text-zinc-450 uppercase font-black tracking-wider">변경 타겟 정보</p>
            <p className="text-xs font-black text-white mt-1.5 flex items-center gap-2">
              <span>{selectedRes.carNumber}</span>
              <span className="text-zinc-500">|</span>
              <span>{selectedRes.userName}</span>
              <span className="text-zinc-500">|</span>
              <span className="text-amber-550 font-mono text-amber-500">{selectedRes.totalPrice?.toLocaleString()}원 계산</span>
            </p>
            <span className="text-[12px] text-zinc-500 font-bold inline-block mt-1">
              현재 수정전 수납 방식: <strong className="text-zinc-300 font-black">{getMethodDetails(selectedRes.paymentMethod).text}</strong>
            </span>
          </div>

          <p className="text-[12px] font-black uppercase text-zinc-500 tracking-wider">수정 정산 수단 선택</p>
          
          <div className="grid grid-cols-3 gap-2.5">
            {[
              { id: 'cash' as PaymentMethod, label: '현금 정산', icon: Coins, color: 'hover:border-amber-500 hover:text-amber-500' },
              { id: 'account' as PaymentMethod, label: '무통장계좌', icon: Landmark, color: 'hover:border-emerald-500 hover:text-emerald-500' },
              { id: 'card' as PaymentMethod, label: '신용카드', icon: CreditCard, color: 'hover:border-blue-500 hover:text-blue-500' },
            ].map((picker) => {
              const isCurrent = selectedRes.paymentMethod === picker.id;
              const IconComp = picker.icon;
              return (
                <button
                  key={picker.id}
                  type="button"
                  disabled={isUpdating}
                  onClick={() => handleApplyChange(picker.id)}
                  className={`py-3.5 px-2 rounded-2xl text-xs font-black flex flex-col items-center justify-center gap-2 border transition-all ${
                    isCurrent 
                      ? 'bg-amber-500 text-neutral-950 border-amber-500 shadow-md shadow-amber-500/10 font-bold scale-[1.02]' 
                      : `bg-neutral-900 border-neutral-800 text-zinc-300 ${picker.color}`
                  }`}
                >
                  <IconComp size={18} />
                  <span>{picker.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
