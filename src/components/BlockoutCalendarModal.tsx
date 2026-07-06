import React, { useState, useEffect } from 'react';
import { X, ChevronLeft, ChevronRight, CalendarRange, Info, Check, Power } from 'lucide-react';

interface BlockoutCalendarModalProps {
  isOpen: boolean;
  onClose: () => void;
  blockedDates: string[];
  cancelCutoffHours?: number;
  sameDayBookingBlocked?: boolean;
  onSave: (settings: {
    blockedDates: string[];
    cancelCutoffHours: number;
    sameDayBookingBlocked: boolean;
  }) => Promise<void>;
  companyIsOpen: boolean;
  onToggleCompanyOpen: (isOpen: boolean) => Promise<void>;
  companyName: string;
}

export default function BlockoutCalendarModal({
  isOpen,
  onClose,
  blockedDates,
  cancelCutoffHours = 3,
  sameDayBookingBlocked = true,
  onSave,
  companyIsOpen,
  onToggleCompanyOpen,
  companyName,
}: BlockoutCalendarModalProps) {
  // Use current local time KST as calendar starting point dynamically
  const [currentYear, setCurrentYear] = useState<number>(() => {
    const kstDate = new Date(Date.now() + 9 * 60 * 60 * 1000);
    return kstDate.getUTCFullYear();
  });
  const [currentMonth, setCurrentMonth] = useState<number>(() => {
    const kstDate = new Date(Date.now() + 9 * 60 * 60 * 1000);
    return kstDate.getUTCMonth(); // 0-indexed
  });

  const [localBlocked, setLocalBlocked] = useState<string[]>(() => [...blockedDates]);
  const [localCancelCutoffHours, setLocalCancelCutoffHours] = useState<number>(cancelCutoffHours);
  const [localSameDayBlocked, setLocalSameDayBlocked] = useState<boolean>(sameDayBookingBlocked);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setLocalBlocked([...blockedDates]);
    setLocalCancelCutoffHours(cancelCutoffHours);
    setLocalSameDayBlocked(sameDayBookingBlocked);
  }, [isOpen, blockedDates, cancelCutoffHours, sameDayBookingBlocked]);

  if (!isOpen) return null;

  // Sync state when open state changed safely without side-effects 
  const handleReset = () => {
    setLocalBlocked([...blockedDates]);
    setLocalCancelCutoffHours(cancelCutoffHours);
    setLocalSameDayBlocked(sameDayBookingBlocked);
  };

  const monthsKR = [
    '1월', '2월', '3월', '4월', '5월', '6월',
    '7월', '8월', '9월', '10월', '11월', '12월'
  ];

  // Navigate months
  const handlePrevMonth = () => {
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear(currentYear - 1);
    } else {
      setCurrentMonth(currentMonth - 1);
    }
  };

  const handleNextMonth = () => {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear(currentYear + 1);
    } else {
      setCurrentMonth(currentMonth + 1);
    }
  };

  // Generate calendar dates
  const firstDayIndex = new Date(currentYear, currentMonth, 1).getDay();
  const totalDays = new Date(currentYear, currentMonth + 1, 0).getDate();

  // Create list of days (empty padding for starting offset)
  const calendarCells: { dateStr: string | null; dayNum: number | null }[] = [];

  for (let i = 0; i < firstDayIndex; i++) {
    calendarCells.push({ dateStr: null, dayNum: null });
  }

  for (let d = 1; d <= totalDays; d++) {
    // Zero-pad month and day for uniform YYYY-MM-DD keys
    const mm = String(currentMonth + 1).padStart(2, '0');
    const dd = String(d).padStart(2, '0');
    const dateStr = `${currentYear}-${mm}-${dd}`;
    calendarCells.push({ dateStr, dayNum: d });
  }

  // Toggle date
  const handleToggleDate = (dateStr: string) => {
    if (localBlocked.includes(dateStr)) {
      setLocalBlocked(localBlocked.filter((date) => date !== dateStr));
    } else {
      setLocalBlocked([...localBlocked, dateStr]);
    }
  };

  const handleSaveClick = async () => {
    setIsSaving(true);
    try {
      await onSave({
        blockedDates: localBlocked,
        cancelCutoffHours: Math.max(0, Math.min(72, localCancelCutoffHours || 0)),
        sameDayBookingBlocked: localSameDayBlocked,
      });
      alert('예약·취소 정책이 성공적으로 저장되었습니다.');
      onClose();
    } catch (err) {
      console.error(err);
      alert('설정 저장 중 연동오류가 발생했습니다.');
    } finally {
      setIsSaving(false);
    }
  };

  const weekdays = ['일', '월', '화', '수', '목', '금', '토'];

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-neutral-950/80 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-sm bg-[#121212] rounded-2xl border border-neutral-800/80 overflow-hidden shadow-2xl flex flex-col relative">
        
        {/* Modal Header */}
        <div className="p-4.5 border-b border-neutral-800/50 flex items-center justify-between bg-[#121212]">
          <div className="flex items-center gap-2">
            <CalendarRange size={16} className="text-amber-500 animate-pulse" />
            <div>
              <h3 className="text-sm font-black text-white">예약 및 영업 마감 종합 관리</h3>
              <p className="text-[12px] text-zinc-400 font-bold tracking-tight">RESERVATION CONTROL CENTER</p>
            </div>
          </div>
          <button 
            type="button"
            onClick={onClose}
            className="p-1.5 hover:bg-neutral-800 rounded-xl text-zinc-300 hover:text-white transition-all border border-neutral-800/40"
          >
            <X size={14} />
          </button>
        </div>

        {/* Modal Body with unified controls */}
        <div className="overflow-y-auto max-h-[75vh]">
          
          {/* 1층 (최상단): 우리 주차장 신규 예약 총괄 스위치 */}
          <div className="p-4.5 border-b border-neutral-800/30">
            <div className="p-3.5 bg-[#141416]/90 border border-neutral-800/85 rounded-2xl space-y-3">
              <div className="flex items-center justify-between gap-1.5">
                <div className="flex items-center gap-2.5">
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center border transition-all ${
                    companyIsOpen 
                      ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' 
                      : 'bg-red-500/10 border-red-500/20 text-red-500 animate-pulse'
                  }`}>
                    <Power size={13} className="stroke-[2.5]" />
                  </div>
                  <div>
                    <h4 className="text-[12.5px] font-black text-white">{companyName} 예약 총괄</h4>
                    <p className="text-[11px] text-zinc-400 font-bold tracking-tight">예약 마감 설정</p>
                  </div>
                </div>
                
                {/* Visual Toggle Switch Button */}
                <button
                  type="button"
                  onClick={async () => {
                    const nextState = !companyIsOpen;
                    await onToggleCompanyOpen(nextState);
                  }}
                  className={`px-3 py-1.5 rounded-xl transition-all text-[12px] font-black border flex items-center justify-center shadow-sm select-none shrink-0 ${
                    companyIsOpen 
                      ? "bg-emerald-500 hover:bg-emerald-400 text-neutral-950 border-emerald-600/20" 
                      : "bg-red-600 hover:bg-red-500 text-white border-red-500/25"
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full inline-block mr-1.5 ${companyIsOpen ? "bg-zinc-950 animate-ping" : "bg-white"}`} />
                  {companyIsOpen ? '🟢 예약 접수 허용중' : '🔴 예약 전체 마감 시킴'}
                </button>
              </div>
              <p className="text-[12px] text-zinc-300 leading-normal font-semibold">
                버튼 수정 시 즉시 {companyName}의 모든 신규 예약을 완전히 차단/허용합니다. (실시간 DB 반영)
              </p>
            </div>
          </div>

          {/* B2C 예약·취소 정책 (companies 문서 — 에어픽 앱에서 읽음) */}
          <div className="px-4.5 pb-4 border-b border-neutral-800/30 space-y-3">
            <h4 className="text-[12.5px] font-black text-white px-1">에어픽 앱 예약·취소 정책</h4>
            <div className="p-3.5 bg-[#141416]/90 border border-neutral-800/85 rounded-2xl space-y-3">
              <div>
                <label className="text-[12px] font-black text-zinc-300 block mb-1.5">
                  고객 셀프취소 마감 (입고 N시간 전)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={0}
                    max={72}
                    value={localCancelCutoffHours}
                    onChange={(e) => setLocalCancelCutoffHours(Number(e.target.value) || 0)}
                    className="w-20 px-3 py-2 bg-neutral-950 border border-neutral-800 rounded-xl text-white text-sm font-bold text-center"
                  />
                  <span className="text-[12px] text-zinc-400 font-bold">시간 전까지 취소 허용</span>
                </div>
                <p className="text-[11px] text-zinc-500 mt-1.5 leading-relaxed">
                  미설정 시 에어픽 앱 기본값(3시간)이 적용됩니다.
                </p>
              </div>
              <div className="flex items-center justify-between gap-3 pt-1 border-t border-neutral-800/60">
                <div>
                  <p className="text-[12px] font-black text-zinc-200">당일 예약 차단</p>
                  <p className="text-[11px] text-zinc-500 mt-0.5">입고일=오늘인 예약을 에어픽 앱에서 막습니다</p>
                </div>
                <button
                  type="button"
                  onClick={() => setLocalSameDayBlocked((v) => !v)}
                  className={`px-3 py-1.5 rounded-xl text-[12px] font-black border shrink-0 ${
                    localSameDayBlocked
                      ? 'bg-amber-500/15 text-amber-400 border-amber-500/30'
                      : 'bg-neutral-900 text-zinc-400 border-neutral-800'
                  }`}
                >
                  {localSameDayBlocked ? '차단 ON' : '허용'}
                </button>
              </div>
            </div>
          </div>

          {/* 2층: 📅 날짜별 영업마감 관리 달력 (특정 날짜만 콕 집어 차단하는 기능) */}
          {/* 2) DAILY BLOCKOUT CONFIGURATION (날짜별 마감 기능) */}
          <div className="p-4.5 space-y-4">
            
            <div className="flex items-center justify-between px-1">
              <button
                type="button"
                onClick={handlePrevMonth}
                className="p-2 bg-neutral-900/45 hover:bg-neutral-800 text-zinc-300 hover:text-white rounded-xl transition-all border border-neutral-800/20"
              >
                <ChevronLeft size={14} />
              </button>
              <div className="text-center">
                <h4 className="text-[13px] font-black tracking-tight text-zinc-400 uppercase">이달의 영업 마감</h4>
                <p className="text-xs font-black tracking-tight text-white font-mono mt-0.5">
                  {currentYear}년 {monthsKR[currentMonth]}
                </p>
              </div>
              <button
                type="button"
                onClick={handleNextMonth}
                className="p-2 bg-neutral-900/45 hover:bg-neutral-800 text-zinc-300 hover:text-white rounded-xl transition-all border border-neutral-800/20"
              >
                <ChevronRight size={14} />
              </button>
            </div>

            {/* Custom Explanation Card */}
            <div className="bg-amber-500/5 border border-amber-500/10 p-3 rounded-2xl flex items-start gap-2.5 text-[12px] text-zinc-350">
              <Info size={12} className="text-amber-500 shrink-0 mt-0.5" />
              <p className="leading-relaxed">
                <strong className="text-amber-400/90">날짜별 마감법</strong>: 터치하여 붉은색으로 설정된 개별 날짜에는 고객 접수 페이지 등에서 신규 예약 접수가 즉시 불가능합니다.
              </p>
            </div>

            {/* Calendar Grid */}
            <div>
              <div className="grid grid-cols-7 text-center text-[12px] font-black text-zinc-400 uppercase tracking-wider mb-2.5 font-mono">
                {weekdays.map((day, idx) => (
                  <div key={idx} className={idx === 0 ? 'text-red-500/90' : idx === 6 ? 'text-blue-400/90' : 'text-neutral-300'}>
                    {day}
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-7 gap-1">
                {calendarCells.map((cell, idx) => {
                  if (!cell.dayNum || !cell.dateStr) {
                    return <div key={`empty-${idx}`} className="h-9.5" />;
                  }

                  const isBlocked = localBlocked.includes(cell.dateStr);

                  return (
                    <button
                      key={cell.dateStr}
                      type="button"
                      onClick={() => handleToggleDate(cell.dateStr!)}
                      className={`h-9.5 text-xs font-bold rounded-xl flex items-center justify-center transition-all border font-mono ${
                        isBlocked
                          ? 'bg-red-650 bg-red-600 border-red-500 text-white font-black shadow-lg shadow-red-650/10 scale-103'
                          : 'bg-neutral-900/90 hover:bg-neutral-850 border-neutral-800/40 text-white font-bold'
                      }`}
                    >
                      {cell.dayNum}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

        </div>

        {/* Footer actions for saving date blockouts */}
        <div className="p-4 bg-[#141416]/50 border-t border-neutral-800/60 flex gap-2.5">
          <button
            type="button"
            onClick={handleReset}
            className="flex-1 py-3 text-xs bg-neutral-900 hover:bg-neutral-850 text-zinc-400 hover:text-white rounded-xl font-bold transition-all border border-neutral-800/50"
          >
            초기화
          </button>
          <button
            type="button"
            onClick={handleSaveClick}
            disabled={isSaving}
            className="flex-1 py-3 text-xs bg-[#F12B2B] hover:bg-[#D11F1F] text-white rounded-xl font-black transition-all flex items-center justify-center gap-1.5 shadow-lg shadow-red-600/10"
          >
            <Check size={13} className="stroke-[3]" />
            {isSaving ? '동기화 중...' : '저장하기'}
          </button>
        </div>

      </div>
    </div>
  );
}
