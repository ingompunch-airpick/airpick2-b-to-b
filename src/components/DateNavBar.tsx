import React from 'react';
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
import { getKSTDateOnlyString, shiftYmd } from '../utils/kstDate';
import { normalizeDateString } from '../utils/reservationNormalize';

function cn(...classes: (string | boolean | undefined)[]) {
  return classes.filter(Boolean).join(' ');
}

interface DateNavBarProps {
  selectedDate: string;
  onChangeDate: (next: string) => void;
  onOpenCalendar: () => void;
  /** 관리자 타임라인 툴바용 작은 높이 */
  compact?: boolean;
  /** 가운데 버튼에 「조회일」 라벨 */
  showLabel?: boolean;
}

/**
 * 어제/내일 화살표 + 달력 + 오늘.
 * grid 고정 열로 가운데 버튼이 화살표를 덮지 않게 합니다.
 */
export default function DateNavBar({
  selectedDate,
  onChangeDate,
  onOpenCalendar,
  compact = false,
  showLabel = true,
}: DateNavBarProps) {
  const todayStr = getKSTDateOnlyString();
  const current = normalizeDateString(selectedDate) || todayStr;
  const isToday = current === todayStr;

  const go = (delta: number) => {
    onChangeDate(shiftYmd(current, delta));
  };

  const handleSide = (delta: number) => (e: React.MouseEvent | React.PointerEvent) => {
    if ('button' in e && e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    go(delta);
  };

  const sideBtn = cn(
    'relative z-10 flex items-center justify-center rounded-xl text-zinc-300',
    'hover:text-white active:bg-neutral-700/80',
    'touch-manipulation select-none cursor-pointer',
    compact ? 'h-9 w-9 min-h-[36px] min-w-[36px]' : 'h-11 w-11 min-h-[44px] min-w-[44px]'
  );

  return (
    <div
      className={cn(
        'relative z-20 grid w-full items-center gap-1 font-sans pointer-events-auto',
        'grid-cols-[auto_minmax(0,1fr)_auto_auto]',
        compact
          ? 'h-[42px] rounded-[16px] bg-[#2C2C2E] p-1'
          : 'rounded-[22px] border border-neutral-800/60 bg-[#1C1C1E] p-1.5'
      )}
      role="group"
      aria-label="조회일 이동"
    >
      <button
        type="button"
        aria-label="이전 날"
        onClick={handleSide(-1)}
        className={sideBtn}
      >
        <ChevronLeft size={compact ? 16 : 18} className="pointer-events-none" aria-hidden />
      </button>

      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onOpenCalendar();
        }}
        className={cn(
          'relative z-10 flex min-w-0 items-center justify-center gap-1.5 rounded-xl font-bold text-white',
          'hover:bg-neutral-800/50 active:bg-neutral-800 touch-manipulation select-none cursor-pointer',
          compact ? 'h-full text-sm' : 'py-2.5 text-[13px]'
        )}
      >
        <Calendar
          size={compact ? 13 : 14}
          className={cn('shrink-0 pointer-events-none', compact ? 'text-[#8E8E93]' : 'text-amber-500')}
          aria-hidden
        />
        {showLabel && !compact && (
          <span className="text-zinc-500 font-semibold">조회일</span>
        )}
        <span className="font-mono text-amber-400 tabular-nums">{current}</span>
        {!isToday && showLabel && !compact && (
          <span className="text-[10px] text-zinc-500 font-semibold">(오늘 아님)</span>
        )}
      </button>

      <button
        type="button"
        aria-label="다음 날"
        onClick={handleSide(1)}
        className={sideBtn}
      >
        <ChevronRight size={compact ? 16 : 18} className="pointer-events-none" aria-hidden />
      </button>

      <button
        type="button"
        disabled={isToday}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (!isToday) onChangeDate(todayStr);
        }}
        className={cn(
          'relative z-10 shrink-0 font-black touch-manipulation select-none',
          compact ? 'h-8 px-2 rounded-xl text-[10px]' : 'h-11 px-3 rounded-xl text-[12px]',
          isToday
            ? 'cursor-default text-zinc-600'
            : 'cursor-pointer text-amber-400 bg-amber-500/10 border border-amber-500/25 hover:bg-amber-500/20 active:bg-amber-500/30'
        )}
      >
        오늘
      </button>
    </div>
  );
}
