import React, { useState, useEffect } from 'react';
import { X, ChevronLeft, ChevronRight, Calendar, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface CustomDatePickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialValue: string; // "YYYY-MM-DD"
  onSelect: (dateStr: string) => void;
  title?: string;
  blockedDates?: string[];
}

export default function CustomDatePickerModal({
  isOpen,
  onClose,
  initialValue,
  onSelect,
  title = "날짜 정밀 선택",
  blockedDates = []
}: CustomDatePickerModalProps) {
  // Parse year, month, day from initial value
  const [currentYear, setCurrentYear] = useState<number>(() => {
    const kstDate = new Date(Date.now() + 9 * 60 * 60 * 1000);
    return kstDate.getUTCFullYear();
  });
  const [currentMonth, setCurrentMonth] = useState<number>(() => {
    const kstDate = new Date(Date.now() + 9 * 60 * 60 * 1000);
    return kstDate.getUTCMonth(); // 0-indexed
  });
  const [selectedDateStr, setSelectedDateStr] = useState<string>('');

  useEffect(() => {
    if (isOpen) {
      const targetDateStr = initialValue || new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().split('T')[0];
      setSelectedDateStr(targetDateStr);
      if (targetDateStr && targetDateStr.includes('-')) {
        const [y, mStr] = targetDateStr.split('-');
        setCurrentYear(parseInt(y, 10));
        setCurrentMonth(parseInt(mStr, 10) - 1);
      }
    }
  }, [isOpen, initialValue]);

  if (!isOpen) return null;

  const monthsKR = [
    '1월', '2월', '3월', '4월', '5월', '6월',
    '7월', '8월', '9월', '10월', '11월', '12월'
  ];

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

  // Generate calendar days
  const firstDayIndex = new Date(currentYear, currentMonth, 1).getDay();
  const totalDays = new Date(currentYear, currentMonth + 1, 0).getDate();

  const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
  const calendarCells: { dateStr: string | null; dayNum: number | null }[] = [];

  // Padding offset cells
  for (let i = 0; i < firstDayIndex; i++) {
    calendarCells.push({ dateStr: null, dayNum: null });
  }

  // Day cells
  for (let d = 1; d <= totalDays; d++) {
    const mm = String(currentMonth + 1).padStart(2, '0');
    const dd = String(d).padStart(2, '0');
    const dateStr = `${currentYear}-${mm}-${dd}`;
    calendarCells.push({ dateStr, dayNum: d });
  }

  const handleDateSelect = (dateStr: string) => {
    setSelectedDateStr(dateStr);
  };

  const handleConfirm = () => {
    if (selectedDateStr) {
      onSelect(selectedDateStr);
      onClose();
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-neutral-950/80 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className="w-full max-w-sm bg-[#121212] rounded-2xl border border-neutral-800/80 overflow-hidden shadow-2xl flex flex-col relative font-sans"
        >
          {/* Header */}
          <div className="p-4 border-b border-neutral-800/50 flex items-center justify-between bg-[#141416]/50">
            <div className="flex items-center gap-2">
              <Calendar size={16} className="text-amber-500" />
              <div>
                <h3 className="text-[14px] font-black text-white">{title}</h3>
                <p className="text-[11px] text-zinc-400 font-bold tracking-tight uppercase">DATE SELECTION CENTER</p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 hover:bg-neutral-800 rounded-xl text-zinc-400 hover:text-white transition-all border border-neutral-800/40"
            >
              <X size={14} />
            </button>
          </div>

          {/* Body */}
          <div className="p-4.5 space-y-4">
            
            {/* Month Control */}
            <div className="flex items-center justify-between px-1">
              <button
                type="button"
                onClick={handlePrevMonth}
                className="p-1.5 bg-neutral-900 hover:bg-neutral-800 text-white rounded-xl transition-all border border-neutral-800"
              >
                <ChevronLeft size={14} />
              </button>
              <div className="text-center">
                <span className="text-[15px] font-black tracking-tight text-white">
                  {currentYear}년 {monthsKR[currentMonth]}
                </span>
              </div>
              <button
                type="button"
                onClick={handleNextMonth}
                className="p-1.5 bg-neutral-900 hover:bg-neutral-800 text-white rounded-xl transition-all border border-neutral-800"
              >
                <ChevronRight size={14} />
              </button>
            </div>

            {/* Calendar Grid */}
            <div className="space-y-2">
              {/* Day Names */}
              <div className="grid grid-cols-7 text-center text-[12px] font-black text-zinc-400 uppercase tracking-wider font-mono">
                {weekdays.map((day, idx) => (
                  <div key={idx} className={idx === 0 ? 'text-red-500' : idx === 6 ? 'text-blue-400' : 'text-neutral-300'}>
                    {day}
                  </div>
                ))}
              </div>

              {/* Day Numbers */}
              <div className="grid grid-cols-7 gap-1">
                {calendarCells.map((cell, idx) => {
                  if (!cell.dayNum || !cell.dateStr) {
                    return <div key={`empty-${idx}`} className="h-9" />;
                  }

                  const isSelected = selectedDateStr === cell.dateStr;
                  const isBlocked = blockedDates.includes(cell.dateStr);

                  return (
                    <button
                      key={cell.dateStr}
                      type="button"
                      disabled={isBlocked}
                      onClick={() => handleDateSelect(cell.dateStr!)}
                      className={`h-9 text-xs font-bold transition-all flex items-center justify-center font-mono select-none relative ${
                        isBlocked
                          ? 'text-zinc-650 cursor-not-allowed opacity-30 line-through'
                          : isSelected
                          ? 'bg-amber-500 text-zinc-950 font-black rounded-full scale-103 shadow-md shadow-amber-500/20'
                          : 'text-white hover:bg-neutral-800 rounded-full'
                      }`}
                    >
                      {cell.dayNum}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Currently Selected Preview block */}
            <div className="p-3 bg-[#141416] border border-neutral-850 rounded-xl flex items-center justify-between">
              <span className="text-[12px] text-zinc-400 font-black">선택한 날짜</span>
              <span className="text-sm text-white font-black font-mono">
                {selectedDateStr || '-'}
              </span>
            </div>

          </div>

          {/* Footer */}
          <div className="p-4 bg-[#141416]/50 border-t border-neutral-800/50 flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 text-xs bg-[#2C2C2E] hover:bg-[#3C3C3E] text-zinc-200 hover:text-white rounded-xl font-bold transition-all border border-neutral-800"
            >
              취소
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              className="flex-[2] py-3 text-xs bg-amber-500 hover:bg-amber-600 text-zinc-950 rounded-xl font-black transition-all flex items-center justify-center gap-1.5 shadow-lg shadow-amber-500/10"
            >
              <Check size={14} className="stroke-[2.5]" />
              선택 완료
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
