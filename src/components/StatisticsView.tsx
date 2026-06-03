import React, { useState, useEffect } from 'react';
import { 
  TrendingUp, 
  Coins, 
  Power, 
  ChevronLeft, 
  ChevronRight, 
  Info, 
  Check, 
  Building2, 
  ArrowRight, 
  Calendar, 
  Car, 
  ClipboardList,
  ShieldCheck,
  CheckCircle2,
  CalendarRange
} from 'lucide-react';
import { motion } from 'motion/react';
import { Reservation, Company, PartnerCompany, AppView } from '../types';
import { AIRPICK_HQ_ID, isAirpickHeadquarters } from '../constants/platform';

interface StatisticsViewProps {
  reservations: Reservation[]; // Active company filtered reservations
  allReservations?: Reservation[]; // Absolute all reservations in firestore
  companyName?: string;
  isSuperAdmin?: boolean;
  companies?: Company[];
  partners?: PartnerCompany[];
  onCompanySwitch?: (id: string) => void;
  currentCompanyId?: string;
  blockedDates?: string[];
  onSaveBlockedDates?: (dates: string[]) => void;
  setCurrentView?: (view: AppView) => void;
}

export default function StatisticsView({ 
  reservations = [], 
  allReservations = [],
  companyName = '와와주차장',
  isSuperAdmin = false,
  companies = [],
  partners = [],
  onCompanySwitch,
  currentCompanyId = AIRPICK_HQ_ID,
  blockedDates = [],
  onSaveBlockedDates,
  setCurrentView
}: StatisticsViewProps) {
  
  const [filterType, setFilterType] = useState<'this_month' | 'last_month'>('this_month');
  
  // Year/Month for the integrated Day Closing Calendar in Partner view
  const [currentYear, setCurrentYear] = useState<number>(() => {
    const kstDate = new Date(Date.now() + 9 * 60 * 60 * 1000);
    return kstDate.getUTCFullYear();
  });
  const [currentMonth, setCurrentMonth] = useState<number>(() => {
    const kstDate = new Date(Date.now() + 9 * 60 * 60 * 1000);
    return kstDate.getUTCMonth(); // 0-indexed
  });

  const monthsKR = [
    '1월', '2월', '3월', '4월', '5월', '6월',
    '7월', '8월', '9월', '10월', '11월', '12월'
  ];

  // KST Date string helper
  const getKSTDateString = () => {
    return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().split('T')[0];
  };

  const [todayStr, setTodayStr] = useState(() => getKSTDateString());
  const currentMonthPrefix = todayStr.substring(0, 7); // "2026-05"

  // Automatically refresh date-related views when midnight KST rolls over
  useEffect(() => {
    const checkDateRollOver = () => {
      const currentTodayKST = getKSTDateString();
      setTodayStr((prevDate) => {
        if (prevDate !== currentTodayKST) {
          console.log(`[Statistics Rollover] Midnight passed! Updating todayStr from ${prevDate} to ${currentTodayKST}`);
          const prevYear = parseInt(prevDate.substring(0, 4), 10);
          const prevMonth = parseInt(prevDate.substring(5, 7), 10) - 1; // 0-indexed
          const curYear = parseInt(currentTodayKST.substring(0, 4), 10);
          const curMonth = parseInt(currentTodayKST.substring(5, 7), 10) - 1;

          setCurrentYear((cy) => cy === prevYear ? curYear : cy);
          setCurrentMonth((cm) => cm === prevMonth ? curMonth : cm);
          return currentTodayKST;
        }
        return prevDate;
      });
    };

    const intervalId = setInterval(checkDateRollOver, 10000);
    return () => clearInterval(intervalId);
  }, []);

  // Helper matching reservation list dynamically to each major node
  const getCompanyReservations = (allResList: Reservation[], compId: string) => {
    const list = allResList || [];
    return list.filter(r => {
      const rCompId = (r.companyId || '').toLowerCase().trim();
      const rCompName = (r.companyName || '').toLowerCase().replace(/\s+/g, '').trim();
      const targetId = compId.toLowerCase().trim();
      
      if (targetId === 'gayu' || targetId === 'gayu_partner') {
        return rCompId === 'gayu' || rCompId === 'gayu_partner' || rCompName.includes('가유');
      }
      return rCompId === targetId || rCompName.includes(targetId);
    });
  };

  // --- Rendering Path A: Master Headquarters Integrated Control Dashboard (isSuperAdmin === true and focusing on HQ) ---
  if (isSuperAdmin && (!currentCompanyId || isAirpickHeadquarters(currentCompanyId))) {
    // 1. Calculate Aggregated Master Stats across ALL companies (Real-time summed values)
    const localMergedRes: Reservation[] = [];
    const seenIds = new Set<string>();
    
    // Grab all reservations from the passed allReservations prop (which is Firestore reservations in App)
    (allReservations || []).forEach(r => {
      if (r && r.id) {
        seenIds.add(r.id);
        localMergedRes.push(r);
      }
    });

    // Also parse and merge from company-isolated local storages to ensure 100% correct, bulletproof summation of offline/local partner entries
    try {
      const keys = Object.keys(localStorage);
      keys.forEach((key) => {
        if (key && key.endsWith('_reservations')) {
          try {
            const items = JSON.parse(localStorage.getItem(key) || '[]');
            if (Array.isArray(items)) {
              items.forEach((r: Reservation) => {
                if (r && r.id && !seenIds.has(r.id)) {
                  seenIds.add(r.id);
                  localMergedRes.push(r);
                }
              });
            }
          } catch (_) {}
        }
      });
    } catch (_) {}

    const masterActiveRes = localMergedRes.filter(r => r.status !== 'cancelled');

    // Sum today's total revenue
    const masterTodaySales = masterActiveRes
      .filter(r => r.departureDate === todayStr)
      .reduce((sum, r) => sum + (r.totalPrice || 0), 0);

    // Sum today's total reservations
    const masterTodayReservations = masterActiveRes.filter(r => 
      r.departureDate === todayStr
    ).length;

    // Sum today's total check-in count
    const masterTodayAdmitted = masterActiveRes.filter(r => 
      r.departureDate === todayStr && 
      ['completed_in', 'request_out', 'completed_out'].includes(r.status)
    ).length;

    // Sum today's total check-out count
    const masterTodayExited = masterActiveRes.filter(r => 
      r.arrivalDate === todayStr && 
      r.status === 'completed_out'
    ).length;

    // Determine registered companies for the Multi-Lot Grid
    const displayCompanies = (companies || []).filter((c) => c && c.id && !isAirpickHeadquarters(c.id));

    // Switching company focus handler & jumping straight to reservations view
    const handleGoToPartnerLedger = (id: string) => {
      if (onCompanySwitch) {
        onCompanySwitch(id);
      }
      if (setCurrentView) {
        setCurrentView('parkingRegister');
      }
    };

    return (
      <div className="min-h-screen bg-neutral-950 text-white p-4 pb-24 font-sans space-y-6 animate-fade-in">
        
        {/* HQ Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 select-none bg-neutral-900/40 p-5 rounded-[22px] border border-neutral-900/60 shadow-md">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-gradient-to-br from-amber-500 to-amber-600 rounded-[18px] text-zinc-950 shadow-lg shadow-amber-500/10">
              <Building2 size={24} className="stroke-[2.5]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-black tracking-tight text-white">에어픽 (airpick)</h2>
                <span className="text-[10px] bg-amber-500/10 text-amber-500 border border-amber-500/20 px-2 py-0.5 rounded-lg font-black animate-pulse">본사 플랫폼 통합 관제</span>
              </div>
              <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest mt-0.5">AIRPICK HEADQUARTERS INTEGRATED CONTROL CENTER</p>
            </div>
          </div>
          
          <div className="text-[10.5px] text-zinc-400 font-mono font-bold bg-[#1C1C1E] px-3.5 py-1.5 rounded-xl border border-neutral-800 text-center md:text-right">
            <span>오늘 기준일: {todayStr} • </span>
            <span className="text-amber-500">LIVE SYNCED</span>
          </div>
        </div>

        {/* 1. 업체들 총 현황 (Scoreboard Bento Boards) */}
        <div>
          <h3 className="text-xs font-black text-zinc-400 uppercase tracking-widest px-1 mb-3">
            📊 플랫폼 입출차 총 현황 (Today's Total Platform Activity)
          </h3>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            
            {/* TOTAL RESERVATIONS */}
            <div className="bg-[#121214] border border-neutral-800/80 rounded-[22px] p-4 sm:p-5 relative overflow-hidden flex flex-col justify-between h-28 sm:h-32 shadow-xl hover:border-amber-500/30 transition-all group">
              <div className="absolute right-3.5 top-3.5 bg-amber-500/10 p-1.5 rounded-lg text-amber-500">
                <CalendarRange size={14} />
              </div>
              <span className="text-[9.5px] text-zinc-500 font-bold tracking-widest uppercase">오늘 총 예약 접수</span>
              <div className="space-y-0.5">
                <div className="text-xl sm:text-2xl font-black text-amber-500 tracking-tight font-mono">
                  {masterTodayReservations}건
                </div>
                <p className="text-[9px] text-zinc-600 font-medium">당일 예약 접수 완료건 총합</p>
              </div>
            </div>

            {/* TOTAL ADMISSION */}
            <div className="bg-[#121214] border border-neutral-800/80 rounded-[22px] p-4 sm:p-5 relative overflow-hidden flex flex-col justify-between h-28 sm:h-32 shadow-xl hover:border-amber-500/30 transition-all group">
              <div className="absolute right-3.5 top-3.5 bg-amber-500/10 p-1.5 rounded-lg text-amber-500">
                <Car size={14} />
              </div>
              <span className="text-[9.5px] text-zinc-500 font-bold tracking-widest uppercase">오늘 총 입차 완료</span>
              <div className="space-y-0.5">
                <div className="text-xl sm:text-2xl font-black text-amber-500 tracking-tight font-mono">
                  {masterTodayAdmitted}대
                </div>
                <p className="text-[9px] text-zinc-600 font-medium">입고 처리 완료 누적 집계</p>
              </div>
            </div>

            {/* TOTAL DEPARTURE */}
            <div className="bg-[#121214] border border-neutral-800/80 rounded-[22px] p-4 sm:p-5 relative overflow-hidden flex flex-col justify-between h-28 sm:h-32 shadow-xl hover:border-amber-500/30 transition-all group">
              <div className="absolute right-3.5 top-3.5 bg-amber-500/10 p-1.5 rounded-lg text-amber-500">
                <ArrowRight size={14} />
              </div>
              <span className="text-[9.5px] text-zinc-500 font-bold tracking-widest uppercase">오늘 총 출차 완료</span>
              <div className="space-y-0.5">
                <div className="text-xl sm:text-2xl font-black text-amber-500 tracking-tight font-mono">
                  {masterTodayExited}대
                </div>
                <p className="text-[9px] text-zinc-600 font-medium">출고 반납 완료 누적 집계</p>
              </div>
            </div>

            {/* TODAY REVENUE */}
            <div className="bg-[#121214] border border-neutral-800/80 rounded-[22px] p-4 sm:p-5 relative overflow-hidden flex flex-col justify-between h-28 sm:h-32 shadow-xl hover:border-amber-500/30 transition-all group">
              <div className="absolute right-3.5 top-3.5 bg-amber-500/10 p-1.5 rounded-lg text-amber-500">
                <Coins size={14} />
              </div>
              <span className="text-[9.5px] text-zinc-500 font-bold tracking-widest uppercase">오늘 총 결제 금액</span>
              <div className="space-y-0.5">
                <div className="text-xl sm:text-2xl font-black text-amber-500 tracking-tight font-mono">
                  {masterTodaySales.toLocaleString()}원
                </div>
                <p className="text-[9px] text-zinc-600 font-medium font-sans">제휴사 매출 포함 플랫폼 총 거래</p>
              </div>
            </div>

          </div>
        </div>

        {/* Clean Center HUB Heartbeat indicator */}
        <div className="pt-8 pb-4 flex flex-col items-center justify-center text-center space-y-2 select-none">
          <div className="flex items-center gap-2 px-4 py-2 bg-neutral-900/60 border border-neutral-850 rounded-full shadow-lg">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
            </span>
            <span className="text-[10px] text-zinc-300 font-bold uppercase tracking-widest font-mono">에어픽 플랫폼 통합 관제 엔진 실시간 클라우드 연동중</span>
          </div>
          <p className="text-[9.5px] text-neutral-600 font-bold font-mono uppercase tracking-wider">ALL SYSTEMS NOMINAL • SECURE FIREBASE CONNECTION ACTIVE</p>
        </div>

      </div>
    );
  }

  // --- Rendering Path B: B2B Partner Owner Dashboard (isSuperAdmin === false) ---
  const activeReservations = reservations.filter(r => r.status !== 'cancelled');

  // Real-time calculated statistics from active reservations
  const realTodaySales = activeReservations
    .filter(r => r.departureDate === todayStr)
    .reduce((sum, r) => sum + (r.totalPrice || 0), 0);

  const realMonthSales = activeReservations
    .filter(r => r.departureDate?.startsWith(currentMonthPrefix))
    .reduce((sum, r) => sum + (r.totalPrice || 0), 0);

  const todaySales = realTodaySales;
  const monthSales = realMonthSales;

  const datesRange = (() => {
    const list: string[] = [];
    const [yearStr, monthStr, dayStrPart] = todayStr.split('-');
    const currentYearNum = parseInt(yearStr, 10);
    const currentMonthNum = parseInt(monthStr, 10);

    if (filterType === 'this_month') {
      const day = parseInt(dayStrPart, 10);
      for (let dNum = day; dNum >= 1; dNum--) {
        const dd = String(dNum).padStart(2, '0');
        list.push(`${yearStr}-${monthStr}-${dd}`);
      }
    } else {
      let lastYearNum = currentYearNum;
      let lastMonthNum = currentMonthNum - 1;
      if (lastMonthNum === 0) {
        lastMonthNum = 12;
        lastYearNum = currentYearNum - 1;
      }
      const lastYearStr = String(lastYearNum);
      const lastMonthStr = String(lastMonthNum).padStart(2, '0');
      const lastMonthDaysCount = new Date(lastYearNum, lastMonthNum, 0).getDate();
      for (let dNum = lastMonthDaysCount; dNum >= 1; dNum--) {
        const dd = String(dNum).padStart(2, '0');
        list.push(`${lastYearStr}-${lastMonthStr}-${dd}`);
      }
    }
    return list;
  })();

  // Calendar dates generator for integrated blockout control
  const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
  const firstDayIndex = new Date(currentYear, currentMonth, 1).getDay();
  const totalDays = new Date(currentYear, currentMonth + 1, 0).getDate();
  const calendarCells: { dateStr: string | null; dayNum: number | null }[] = [];

  for (let i = 0; i < firstDayIndex; i++) {
    calendarCells.push({ dateStr: null, dayNum: null });
  }

  for (let d = 1; d <= totalDays; d++) {
    const mm = String(currentMonth + 1).padStart(2, '0');
    const dd = String(d).padStart(2, '0');
    const dateStr = `${currentYear}-${mm}-${dd}`;
    calendarCells.push({ dateStr, dayNum: d });
  }

  // Month navigation
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

  const handleToggleBlockedDate = (cellDate: string) => {
    if (!onSaveBlockedDates) return;
    const isBlocked = blockedDates.includes(cellDate);
    let nextBlocked: string[];
    
    if (isBlocked) {
      nextBlocked = blockedDates.filter(d => d !== cellDate);
    } else {
      nextBlocked = [...blockedDates, cellDate];
    }
    
    onSaveBlockedDates(nextBlocked);
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-white p-4 pb-24 font-sans space-y-5 animate-fade-in">
      
      {/* Header */}
      <div className="flex items-center gap-3 px-1 select-none">
        <div className="p-2.5 bg-[#1C1C1E] border border-neutral-800 rounded-xl text-amber-500">
          <ShieldCheck size={20} />
        </div>
        <div>
          <h2 className="text-sm font-black tracking-tight text-white">{companyName} 매장 대시보드</h2>
          <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">Store Statistics & Closed Calendar</p>
        </div>
      </div>

      {/* 💳 Sales Statistics Card */}
      <div className="bg-gradient-to-br from-[#121214] via-[#121214] to-[#1C1C1F] p-4.5 rounded-[22px] border border-neutral-800/80 shadow-lg space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-[10.5px] font-black text-zinc-400 tracking-wider flex items-center gap-1.5 uppercase">
            <Coins size={14} className="text-amber-500 animate-pulse animate-duration-1000" />
            매출 통계
          </span>
          <span className="text-[9.5px] px-2.5 py-0.5 rounded-lg font-bold bg-[#1C1C1E]/90 border border-neutral-800 text-zinc-400 font-mono">
            SECURE LIVE
          </span>
        </div>

        <div className="pt-1.5 space-y-4">
          <div>
            <span className="text-[10px] text-[#8E8E93] font-bold block mb-0.5">오늘 총 매출액</span>
            <div className="text-2xl font-black text-amber-400 tracking-tight font-mono">
              {todaySales.toLocaleString()}원
            </div>
          </div>

          <div className="h-px bg-neutral-800/40" />

          <div className="flex justify-between items-center text-xs font-mono">
            <div>
              <span className="text-[10px] text-[#8E8E93] font-bold block mb-0.5">이번 달 누적 매출</span>
              <span className="text-base font-black text-white tracking-tight">
                {monthSales.toLocaleString()}원
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 📊 Date Filter & Flow stats */}
      <div className="space-y-3 pt-1">
        <div className="flex p-1 bg-[#1C1C1E] rounded-xl border border-neutral-800/40 select-none">
          {(['this_month', 'last_month'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setFilterType(t)}
              className={`flex-1 py-1.5 rounded-lg text-[10px] md:text-xs font-bold transition-all ${filterType === t ? 'bg-amber-500 text-neutral-950 shadow-sm' : 'text-zinc-500 hover:text-white'}`}
            >
              {t === 'this_month' ? '이번 달' : '지난 달'}
            </button>
          ))}
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between px-1 select-none">
            <h3 className="text-[10.5px] text-zinc-400 font-extrabold tracking-wider uppercase">
              일별 입·출차 흐름 ({filterType === 'this_month' ? '이번 달' : '지난 달'})
            </h3>
            <span className="text-[9px] font-mono text-zinc-500 font-semibold uppercase">Lot Flow Daily</span>
          </div>

          <div className="bg-[#1C1C1E] border border-neutral-800/40 rounded-2xl overflow-hidden divide-y divide-[#1D1D20] max-h-56 overflow-y-auto font-mono">
            {datesRange.map((date) => {
              const realAdmitted = reservations.filter(r => 
                r.departureDate === date && 
                ['completed_in', 'request_out', 'completed_out'].includes(r.status)
              ).length;

              const realExited = reservations.filter(r => 
                r.arrivalDate === date && 
                r.status === 'completed_out'
              ).length;

              const admittedCount = realAdmitted;
              const exitedCount = realExited;

              const dateObj = new Date(date);
              const daysArr = ['일', '월', '화', '수', '목', '금', '토'];
              const dayOfWeek = daysArr[dateObj.getDay()];

              return (
                <div key={date} className="p-3.5 flex items-center justify-between hover:bg-neutral-900/30 transition-all font-mono">
                  <div className="space-y-0.5">
                    <div className="text-xs font-bold text-zinc-200">
                      {date} ({dayOfWeek})
                    </div>
                    <div className="text-[8.5px] text-zinc-500 font-bold uppercase tracking-wider">
                      {date === todayStr ? '오늘 실적' : '당일 마감완료'}
                    </div>
                  </div>

                  <div className="flex gap-4">
                    <div className="text-right">
                      <span className="text-[9px] text-zinc-500 block leading-tight font-bold">입고대수</span>
                      <span className="text-[11px] font-black text-amber-500">
                        {admittedCount}대
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-[9px] text-zinc-500 block leading-tight font-bold">출고대수</span>
                      <span className="text-[11px] font-black text-emerald-400">
                        {exitedCount}대
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

    </div>
  );
}
