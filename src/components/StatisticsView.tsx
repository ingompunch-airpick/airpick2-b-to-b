import React, { useState, useEffect, useMemo } from 'react';
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
  CalendarRange,
  Search,
  CreditCard,
  ShieldAlert,
  X,
  PhoneCall,
  PlaneTakeoff,
  PlaneLanding,
  Award
} from 'lucide-react';
import { motion } from 'motion/react';
import { Reservation, Company, PartnerCompany, AppView } from '../types';
import { AIRPICK_HQ_ID, isAirpickHeadquarters } from '../constants/platform';

interface StatisticsViewProps {
  reservations: Reservation[];
  allReservations?: Reservation[];
  companyName?: string;
  isSuperAdmin?: boolean;
  companies?: Company[];
  partners?: PartnerCompany[];
  onCompanySwitch?: (id: string) => void;
  currentCompanyId?: string;
  blockedDates?: string[];
  onSaveBlockedDates?: (dates: string[]) => void;
  setCurrentView?: (view: AppView) => void;
  onUpdateValetStatus?: (resId: string, nextStatus: any, extraFields?: any) => Promise<void> | void;
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
  setCurrentView,
  onUpdateValetStatus,
}: StatisticsViewProps) {
  // ── 접수내역 CRM 상태 (합친 섹션) ──────────────────────────
  const [crmSearch, setCrmSearch] = useState('');
  const [crmTab, setCrmTab] = useState<'today_reserve' | 'today_parked' | 'today_released'>('today_reserve');
  const [crmSelected, setCrmSelected] = useState<Reservation | null>(null);
  
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
                <span className="text-[11px] bg-amber-500/10 text-amber-500 border border-amber-500/20 px-2 py-0.5 rounded-lg font-black animate-pulse">본사 플랫폼 통합 관제</span>
              </div>
              <p className="text-[11px] text-zinc-500 font-bold uppercase tracking-widest mt-0.5">AIRPICK HEADQUARTERS INTEGRATED CONTROL CENTER</p>
            </div>
          </div>
          
          <div className="text-[11.5px] text-zinc-400 font-mono font-bold bg-[#1C1C1E] px-3.5 py-1.5 rounded-xl border border-neutral-800 text-center md:text-right">
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
              <span className="text-[10.5px] text-zinc-500 font-bold tracking-widest uppercase">오늘 총 예약 접수</span>
              <div className="space-y-0.5">
                <div className="text-xl sm:text-2xl font-black text-amber-500 tracking-tight font-mono">
                  {masterTodayReservations}건
                </div>
                <p className="text-[10px] text-zinc-600 font-medium">당일 예약 접수 완료건 총합</p>
              </div>
            </div>

            {/* TOTAL ADMISSION */}
            <div className="bg-[#121214] border border-neutral-800/80 rounded-[22px] p-4 sm:p-5 relative overflow-hidden flex flex-col justify-between h-28 sm:h-32 shadow-xl hover:border-amber-500/30 transition-all group">
              <div className="absolute right-3.5 top-3.5 bg-amber-500/10 p-1.5 rounded-lg text-amber-500">
                <Car size={14} />
              </div>
              <span className="text-[10.5px] text-zinc-500 font-bold tracking-widest uppercase">오늘 총 입차 완료</span>
              <div className="space-y-0.5">
                <div className="text-xl sm:text-2xl font-black text-amber-500 tracking-tight font-mono">
                  {masterTodayAdmitted}대
                </div>
                <p className="text-[10px] text-zinc-600 font-medium">입고 처리 완료 누적 집계</p>
              </div>
            </div>

            {/* TOTAL DEPARTURE */}
            <div className="bg-[#121214] border border-neutral-800/80 rounded-[22px] p-4 sm:p-5 relative overflow-hidden flex flex-col justify-between h-28 sm:h-32 shadow-xl hover:border-amber-500/30 transition-all group">
              <div className="absolute right-3.5 top-3.5 bg-amber-500/10 p-1.5 rounded-lg text-amber-500">
                <ArrowRight size={14} />
              </div>
              <span className="text-[10.5px] text-zinc-500 font-bold tracking-widest uppercase">오늘 총 출차 완료</span>
              <div className="space-y-0.5">
                <div className="text-xl sm:text-2xl font-black text-amber-500 tracking-tight font-mono">
                  {masterTodayExited}대
                </div>
                <p className="text-[10px] text-zinc-600 font-medium">출고 반납 완료 누적 집계</p>
              </div>
            </div>

            {/* TODAY REVENUE */}
            <div className="bg-[#121214] border border-neutral-800/80 rounded-[22px] p-4 sm:p-5 relative overflow-hidden flex flex-col justify-between h-28 sm:h-32 shadow-xl hover:border-amber-500/30 transition-all group">
              <div className="absolute right-3.5 top-3.5 bg-amber-500/10 p-1.5 rounded-lg text-amber-500">
                <Coins size={14} />
              </div>
              <span className="text-[10.5px] text-zinc-500 font-bold tracking-widest uppercase">오늘 총 결제 금액</span>
              <div className="space-y-0.5">
                <div className="text-xl sm:text-2xl font-black text-amber-500 tracking-tight font-mono">
                  {masterTodaySales.toLocaleString()}원
                </div>
                <p className="text-[10px] text-zinc-600 font-medium font-sans">제휴사 매출 포함 플랫폼 총 거래</p>
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
            <span className="text-[11px] text-zinc-300 font-bold uppercase tracking-widest font-mono">에어픽 플랫폼 통합 관제 엔진 실시간 클라우드 연동중</span>
          </div>
          <p className="text-[10.5px] text-neutral-600 font-bold font-mono uppercase tracking-wider">ALL SYSTEMS NOMINAL • SECURE FIREBASE CONNECTION ACTIVE</p>
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

  // --- Daily flow data (A+C: 월 요약 + 미니 막대 + 현재 재차) ---
  const dailyFlow = datesRange.map((date) => {
    const admittedCount = activeReservations.filter(r =>
      r.departureDate === date &&
      ['completed_in', 'request_out', 'completed_out'].includes(r.status)
    ).length;
    const exitedCount = activeReservations.filter(r => {
      const exitDate = r.actualExitTime ? r.actualExitTime.slice(0, 10) : r.arrivalDate;
      return r.status === 'completed_out' && exitDate === date;
    }).length;
    return { date, admittedCount, exitedCount };
  });

  // Scaling base for the mini bars (avoid divide-by-zero)
  const flowMax = Math.max(1, ...dailyFlow.map(d => Math.max(d.admittedCount, d.exitedCount)));

  const totalAdmitted = dailyFlow.reduce((s, d) => s + d.admittedCount, 0);
  const totalExited = dailyFlow.reduce((s, d) => s + d.exitedCount, 0);
  const activeDays = dailyFlow.filter(d => d.admittedCount > 0 || d.exitedCount > 0).length;
  const avgAdmitted = activeDays > 0 ? Math.round((totalAdmitted / activeDays) * 10) / 10 : 0;
  const busiestDay = dailyFlow.reduce<{ date: string; admittedCount: number; exitedCount: number } | null>(
    (best, d) => (d.admittedCount > (best?.admittedCount ?? -1) ? d : best),
    null
  );

  // 현재 주차 중(재차) 대수 — 입고 완료했지만 아직 출차하지 않은 차량
  const parkedNow = activeReservations.filter(r =>
    ['completed_in', 'request_out'].includes(r.status)
  ).length;

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
          <p className="text-[11px] text-zinc-500 font-bold uppercase tracking-wider">Store Statistics & Closed Calendar</p>
        </div>
      </div>

      {/* 💳 Sales Statistics Card */}
      <div className="bg-gradient-to-br from-[#121214] via-[#121214] to-[#1C1C1F] p-4.5 rounded-[22px] border border-neutral-800/80 shadow-lg space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-[11.5px] font-black text-zinc-400 tracking-wider flex items-center gap-1.5 uppercase">
            <Coins size={14} className="text-amber-500 animate-pulse animate-duration-1000" />
            매출 통계
          </span>
          <span className="text-[10.5px] px-2.5 py-0.5 rounded-lg font-bold bg-[#1C1C1E]/90 border border-neutral-800 text-zinc-400 font-mono">
            SECURE LIVE
          </span>
        </div>

        <div className="pt-1.5 space-y-4">
          <div>
            <span className="text-[11px] text-[#8E8E93] font-bold block mb-0.5">오늘 총 매출액</span>
            <div className="text-2xl font-black text-amber-400 tracking-tight font-mono">
              {todaySales.toLocaleString()}원
            </div>
          </div>

          <div className="h-px bg-neutral-800/40" />

          <div className="flex justify-between items-center text-xs font-mono">
            <div>
              <span className="text-[11px] text-[#8E8E93] font-bold block mb-0.5">이번 달 누적 매출</span>
              <span className="text-base font-black text-white tracking-tight">
                {monthSales.toLocaleString()}원
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ── 접수내역 CRM (합친 섹션) ────────────────────────── */}
      {(() => {
        const activeRes = reservations.filter(r => r.status !== 'cancelled');
        const crmCounts = {
          today_reserve: activeRes.filter(r => r.departureDate === todayStr && (r.status === 'pending' || r.status === 'pending_in')).length,
          today_parked:  activeRes.filter(r => r.departureDate === todayStr && r.status === 'completed_in').length,
          today_released: activeRes.filter(r => {
            if (r.status !== 'completed_out') return false;
            const exitDate = r.actualExitTime ? r.actualExitTime.slice(0, 10) : r.arrivalDate;
            return exitDate === todayStr;
          }).length,
        };
        const todayTotal = activeRes.filter(r => {
          const isReserve = r.departureDate === todayStr && (r.status === 'pending' || r.status === 'pending_in');
          const isParked  = r.departureDate === todayStr && r.status === 'completed_in';
          const exitDate  = r.actualExitTime ? r.actualExitTime.slice(0, 10) : r.arrivalDate;
          const isOut     = r.status === 'completed_out' && exitDate === todayStr;
          return isReserve || isParked || isOut;
        });
        const todayRevenue = todayTotal.reduce((s, r) => s + (r.totalPrice || 0), 0);

        const crmFiltered = (() => {
          const q = crmSearch.trim().toLowerCase().replace(/[ㄱ-ㅎㅏ-ㅣ\s]+$/, '');
          if (q) {
            return activeRes.filter(r =>
              (r.carNumber || '').toLowerCase().includes(q) ||
              (r.userName || '').toLowerCase().includes(q)
            );
          }
          return activeRes.filter(r => {
            if (crmTab === 'today_reserve') return r.departureDate === todayStr && (r.status === 'pending' || r.status === 'pending_in');
            if (crmTab === 'today_parked')  return r.departureDate === todayStr && r.status === 'completed_in';
            if (crmTab === 'today_released') {
              const exitDate = r.actualExitTime ? r.actualExitTime.slice(0, 10) : r.arrivalDate;
              return r.status === 'completed_out' && exitDate === todayStr;
            }
            return false;
          });
        })();

        const getStatusBadge = (status: string) => {
          const map: Record<string, string> = {
            pending:       'bg-[#1C1C1E] text-amber-500 border-amber-500/20',
            pending_in:    'bg-amber-500/10 text-amber-400 border-amber-500/20',
            completed_in:  'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
            request_out:   'bg-rose-500/10 text-rose-400 border-rose-500/20',
            completed_out: 'bg-zinc-800 text-zinc-400 border-zinc-700',
          };
          const label: Record<string, string> = {
            pending: '접수대기', pending_in: '입고대기', completed_in: '입고완료',
            request_out: '출고요청', completed_out: '출고완료',
          };
          return <span className={`text-[10px] font-bold px-2 py-0.5 rounded-lg border ${map[status] ?? 'bg-neutral-800 text-neutral-400'}`}>{label[status] ?? status}</span>;
        };

        return (
          <div className="space-y-3 pt-1 border-t border-neutral-800/60">
            <div className="flex items-center justify-between px-0.5">
              <h3 className="text-[11.5px] text-zinc-400 font-black tracking-wider uppercase flex items-center gap-1.5">
                <ClipboardList size={13} className="text-amber-500" />
                주차접수 현황 (CRM)
              </h3>
              <div className="flex items-center gap-2 text-[11px] font-mono text-zinc-500">
                <span className="text-amber-500 font-bold">{todayTotal.length}건</span>
                <span>·</span>
                <span>{todayRevenue.toLocaleString()}원</span>
              </div>
            </div>

            {/* 검색 */}
            <div className="relative">
              <Search size={13} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500" />
              <input
                type="text"
                placeholder="차량번호 또는 고객명 검색…"
                value={crmSearch}
                onChange={(e) => setCrmSearch(e.target.value)}
                className="w-full bg-[#1C1C1E] border border-neutral-800/60 text-xs rounded-xl pl-9 pr-4 py-2.5 text-white placeholder-zinc-500 outline-none focus:border-amber-500/80 transition-all font-semibold"
              />
            </div>

            {/* 탭 */}
            <div className="grid grid-cols-3 gap-1.5 p-1 bg-neutral-900 rounded-xl border border-neutral-800/50 select-none text-center">
              {([
                { key: 'today_reserve', label: '당일 예약', color: 'bg-amber-500 text-neutral-950', count: crmCounts.today_reserve },
                { key: 'today_parked',  label: '주차 완료', color: 'bg-[#A855F7] text-white',      count: crmCounts.today_parked },
                { key: 'today_released',label: '출차 완료', color: 'bg-[#22C55E] text-white',      count: crmCounts.today_released },
              ] as const).map(({ key, label, color, count }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => { setCrmTab(key); setCrmSearch(''); }}
                  className={`py-2 rounded-lg text-[11px] font-bold transition-all flex flex-col items-center gap-0.5 leading-tight ${
                    crmTab === key && !crmSearch ? color + ' shadow-sm' : 'text-zinc-400 hover:text-white hover:bg-neutral-800/40'
                  }`}
                >
                  <span>{label}</span>
                  <span className="text-[9.5px] font-mono font-extrabold">{count}건</span>
                </button>
              ))}
            </div>

            {/* 리스트 */}
            {crmFiltered.length === 0 ? (
              <div className="text-center py-8 bg-[#1C1C1E] rounded-2xl border border-neutral-850">
                <ShieldAlert size={24} className="mx-auto text-zinc-600 mb-2" />
                <p className="text-xs text-zinc-500 font-bold">해당 조건의 접수 내역이 없습니다.</p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {crmFiltered.map((res, idx) => {
                  const space = res.parkingSpace || '미지정';
                  return (
                    <div
                      key={`${res.id}-${idx}`}
                      onClick={() => setCrmSelected(res)}
                      className="bg-[#1C1C1E] border border-neutral-800/80 rounded-2xl p-3.5 space-y-2 hover:border-neutral-700/80 cursor-pointer transition-all active:scale-[0.99]"
                    >
                      <div className="flex justify-between items-center">
                        <div>
                          <span className="text-xs font-black text-white font-mono">{res.carNumber}</span>
                          <span className="text-[11px] text-zinc-500 ml-2">{res.carModel}</span>
                        </div>
                        {getStatusBadge(res.status)}
                      </div>
                      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[12px]">
                        <div className="text-zinc-500">입고: <span className="text-zinc-300 font-mono">{res.departureDate} {res.departureTime}</span></div>
                        <div className="text-zinc-500">주차: <span className="text-zinc-300 font-mono">{space}</span></div>
                        <div className="text-zinc-500">고객: <span className="text-zinc-300">{res.userName}</span></div>
                        <div className="text-zinc-500">금액: <span className="text-amber-400 font-black font-mono">{(res.totalPrice||0).toLocaleString()}원</span></div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })()}

      {/* 📊 월별 흐름 */}
      <div className="space-y-3 pt-1 border-t border-neutral-800/60">
        <div className="flex p-1 bg-[#1C1C1E] rounded-xl border border-neutral-800/40 select-none">
          {(['this_month', 'last_month'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setFilterType(t)}
              className={`flex-1 py-1.5 rounded-lg text-[11px] font-bold transition-all ${filterType === t ? 'bg-amber-500 text-neutral-950 shadow-sm' : 'text-zinc-500 hover:text-white'}`}
            >
              {t === 'this_month' ? '이번 달' : '지난 달'}
            </button>
          ))}
        </div>

        <div className="space-y-2.5">
          <div className="flex items-center justify-between px-1 select-none">
            <h3 className="text-[11.5px] text-zinc-400 font-extrabold tracking-wider uppercase">
              일별 입·출차 흐름 ({filterType === 'this_month' ? '이번 달' : '지난 달'})
            </h3>
            <span className="text-[10px] font-mono text-zinc-500 font-semibold uppercase">Lot Flow Daily</span>
          </div>

          {/* 현재 재차(주차 중) + 월 요약 바 */}
          <div className="grid grid-cols-4 gap-2 select-none">
            <div className="col-span-1 bg-gradient-to-br from-amber-500/15 to-amber-600/[0.04] border border-amber-500/25 rounded-2xl p-3 flex flex-col justify-center">
              <span className="text-[9px] text-amber-500/80 font-bold uppercase tracking-wider leading-tight">현재 주차 중</span>
              <span className="text-xl font-black text-amber-400 font-mono leading-none mt-1">
                {parkedNow}<span className="text-[12px] ml-0.5">대</span>
              </span>
            </div>
            <div className="col-span-3 bg-[#1C1C1E] border border-neutral-800/40 rounded-2xl p-3 grid grid-cols-3 gap-1 items-center">
              <div className="text-center">
                <span className="text-[9px] text-zinc-500 font-bold uppercase block tracking-wider">총 입고</span>
                <span className="text-sm font-black text-amber-500 font-mono">{totalAdmitted}</span>
              </div>
              <div className="text-center border-x border-neutral-800/60">
                <span className="text-[9px] text-zinc-500 font-bold uppercase block tracking-wider">총 출고</span>
                <span className="text-sm font-black text-emerald-400 font-mono">{totalExited}</span>
              </div>
              <div className="text-center">
                <span className="text-[9px] text-zinc-500 font-bold uppercase block tracking-wider">일평균 입고</span>
                <span className="text-sm font-black text-zinc-200 font-mono">{avgAdmitted}</span>
              </div>
            </div>
          </div>

          {busiestDay && busiestDay.admittedCount > 0 && (
            <div className="px-1.5 select-none">
              <span className="text-[10px] text-zinc-500 font-bold">
                최다 입고일 · <span className="text-amber-500/90 font-mono">{busiestDay.date}</span> ({busiestDay.admittedCount}대)
              </span>
            </div>
          )}

          {/* 날짜별 미니 막대 리스트 */}
          <div className="bg-[#1C1C1E] border border-neutral-800/40 rounded-2xl overflow-hidden divide-y divide-[#1D1D20] max-h-72 overflow-y-auto font-mono">
            {dailyFlow.map(({ date, admittedCount, exitedCount }) => {
              const dateObj = new Date(date);
              const daysArr = ['일', '월', '화', '수', '목', '금', '토'];
              const dow = dateObj.getDay();
              const dayOfWeek = daysArr[dow];
              const isWeekend = dow === 0 || dow === 6;
              const isToday = date === todayStr;
              const isEmpty = admittedCount === 0 && exitedCount === 0;
              const admPct = Math.round((admittedCount / flowMax) * 100);
              const extPct = Math.round((exitedCount / flowMax) * 100);

              return (
                <div
                  key={date}
                  className={`px-3.5 py-3 transition-all ${isToday ? 'bg-amber-500/[0.06]' : 'hover:bg-neutral-900/30'} ${isEmpty ? 'opacity-40' : ''}`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-1.5">
                      <span className={`text-xs font-bold ${isWeekend ? (dow === 0 ? 'text-rose-400/90' : 'text-sky-400/90') : 'text-zinc-200'}`}>
                        {date} ({dayOfWeek})
                      </span>
                      {isToday && (
                        <span className="text-[9px] bg-amber-500 text-neutral-950 px-1.5 py-0.5 rounded-md font-black tracking-wider">오늘</span>
                      )}
                    </div>
                    <div className="flex gap-2.5 text-[11px] font-black">
                      <span className="text-amber-500">입 {admittedCount}</span>
                      <span className="text-emerald-400">출 {exitedCount}</span>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[8.5px] text-zinc-600 font-bold w-6 shrink-0">입고</span>
                      <div className="flex-1 h-1.5 bg-neutral-800/60 rounded-full overflow-hidden">
                        <div className="h-full bg-amber-500 rounded-full transition-all duration-500" style={{ width: `${admPct}%` }} />
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[8.5px] text-zinc-600 font-bold w-6 shrink-0">출고</span>
                      <div className="flex-1 h-1.5 bg-neutral-800/60 rounded-full overflow-hidden">
                        <div className="h-full bg-emerald-400 rounded-full transition-all duration-500" style={{ width: `${extPct}%` }} />
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* CRM 상세 모달 */}
      {crmSelected && (() => {
        const visitCount = reservations.filter(r => r.userName === crmSelected.userName || r.phone === crmSelected.phone).length;
        return (
          <div className="fixed inset-0 z-[150] flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="w-full max-w-md bg-[#1C1C1E] border border-neutral-800 rounded-t-3xl sm:rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[88vh] text-zinc-100">
              <div className="p-4 border-b border-neutral-800/70 flex items-center justify-between bg-neutral-900/60">
                <div>
                  <h3 className="text-xs font-black text-white font-mono">{crmSelected.carNumber} 상세</h3>
                  <p className="text-[10.5px] text-zinc-500">{crmSelected.carModel} · {crmSelected.userName}</p>
                </div>
                <button onClick={() => setCrmSelected(null)} className="p-1.5 hover:bg-neutral-800 rounded-xl text-zinc-400"><X size={15} /></button>
              </div>
              <div className="p-4 space-y-4 overflow-y-auto">
                <div className="bg-amber-500/5 border border-amber-500/10 p-3.5 rounded-2xl flex items-center justify-between">
                  <div>
                    <p className="text-[10px] text-amber-500 font-mono font-bold uppercase">Customer</p>
                    <h4 className="text-sm font-black text-white">{crmSelected.userName} 고객님</h4>
                    <p className="text-[11px] text-zinc-400 mt-0.5">누적 예약 <span className="text-amber-500 font-bold">{visitCount}회</span></p>
                  </div>
                  <Award size={18} className="text-amber-500" />
                </div>
                <div className="bg-neutral-950/40 border border-neutral-800/40 p-3.5 rounded-2xl space-y-2 text-xs">
                  {[
                    ['입고일시', `${crmSelected.departureDate} ${crmSelected.departureTime}`],
                    ['출고일시', `${crmSelected.arrivalDate} ${crmSelected.arrivalTime}`],
                    ['주차구역', crmSelected.parkingSpace || '-'],
                    ['결제금액', `${(crmSelected.totalPrice||0).toLocaleString()}원`],
                    ['연락처', crmSelected.phone],
                  ].map(([label, val]) => (
                    <div key={label} className="flex justify-between">
                      <span className="text-zinc-500">{label}</span>
                      <span className="font-bold font-mono text-zinc-200">{val}</span>
                    </div>
                  ))}
                </div>
                <a href={`tel:${crmSelected.phone}`} className="flex items-center justify-center gap-2 w-full py-3 bg-amber-500 text-neutral-950 rounded-xl font-black text-xs">
                  <PhoneCall size={14} />즉시 통화
                </a>
                {onUpdateValetStatus && (crmSelected.status === 'completed_in' || crmSelected.status === 'request_out') && (
                  <div className="flex gap-2">
                    {crmSelected.status === 'completed_in' && (
                      <button
                        type="button"
                        onClick={async () => {
                          if (window.confirm('강제 출고요청으로 변경하시겠습니까?')) {
                            await onUpdateValetStatus(crmSelected.id!, 'request_out');
                            setCrmSelected(null);
                          }
                        }}
                        className="flex-1 py-2.5 bg-red-950/85 text-rose-400 border border-rose-500/20 rounded-xl text-[11.5px] font-black"
                      >강제 출고요청</button>
                    )}
                    <button
                      type="button"
                      onClick={async () => {
                        if (window.confirm('강제 반납완료 처리하시겠습니까?')) {
                          const kst = new Date(Date.now() + 9*60*60*1000).toISOString().replace('T',' ').substring(0,19);
                          await onUpdateValetStatus(crmSelected.id!, 'completed_out', { actualExitTime: kst });
                          setCrmSelected(null);
                        }
                      }}
                      className="flex-1 py-2.5 bg-emerald-950/85 text-emerald-400 border border-emerald-500/20 rounded-xl text-[11.5px] font-black"
                    >강제 반납완료</button>
                  </div>
                )}
              </div>
              <div className="p-4 border-t border-neutral-800/60 bg-neutral-900/60">
                <button onClick={() => setCrmSelected(null)} className="w-full py-3 bg-neutral-800 text-white rounded-xl text-xs font-black">닫기</button>
              </div>
            </div>
          </div>
        );
      })()}

    </div>
  );
}
