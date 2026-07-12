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
  Award,
  TrendingDown,
  Minus,
  Users,
  UserPlus,
} from 'lucide-react';
import { motion } from 'motion/react';
import { Reservation } from '../types';
import { AIRPICK_HQ_ID, isAirpickHeadquarters } from '../constants/platform';
import {
  adminStatusBadgeClass,
  isAdmitted,
  isCompletedOut,
  isParked,
  statusToLabel,
} from '../utils/reservationStatus';
import { normalizeDateString } from '../utils/reservationNormalize';
import { getKSTDateOnlyString, toKSTDateOnlyString } from '../utils/kstDate';
import {
  aggregateGroupedBookingSourceMetrics,
  groupedBookingSourceBadgeClass,
  groupedBookingSourceLabel,
  GROUPED_SOURCE_ROWS,
  toGroupedBookingSource,
  resolveBookingSourceFromReservation,
} from '../utils/bookingSource';
import {
  buildAirpickShareTrend,
  buildCompanyRankChanges,
  buildHqCompanyRows,
  computeCustomerMix,
  filterAdmittedInMonth,
  monthLabelFromPrefix,
  shiftMonthPrefix,
} from '../utils/hqAnalytics';

function reservationDepartureOn(r: Reservation, ymd: string): boolean {
  return normalizeDateString(r.departureDate) === ymd;
}

function reservationExitOn(r: Reservation, ymd: string): boolean {
  const exitDate = r.actualExitTime
    ? normalizeDateString(r.actualExitTime.slice(0, 10))
    : normalizeDateString(r.arrivalDate);
  return exitDate === ymd;
}

/** 당일 예약 = 오늘(KST) 접수(createdAt)한 건 */
function isTodayReserveRow(r: Reservation, ymd: string): boolean {
  return toKSTDateOnlyString(r.createdAt) === ymd;
}

interface StatisticsViewProps {
  reservations: Reservation[];
  allReservations?: Reservation[];
  companyName?: string;
  isSuperAdmin?: boolean;
  currentCompanyId?: string;
  blockedDates?: string[];
  onSaveBlockedDates?: (dates: string[]) => void;
  onUpdateValetStatus?: (resId: string, nextStatus: any, extraFields?: any) => Promise<void> | void;
  /** CRM 상세 → 예약 수정/취소 모달 */
  onEditReservation?: (res: Reservation) => void;
}

export default function StatisticsView({ 
  reservations = [], 
  allReservations = [],
  companyName = '와와주차장',
  isSuperAdmin = false,
  currentCompanyId = AIRPICK_HQ_ID,
  blockedDates = [],
  onSaveBlockedDates,
  onUpdateValetStatus,
  onEditReservation,
}: StatisticsViewProps) {
  // ── 접수내역 CRM 상태 (합친 섹션) ──────────────────────────
  const [crmSearch, setCrmSearch] = useState('');
  const [crmTab, setCrmTab] = useState<'today_reserve' | 'today_parked' | 'today_released'>('today_reserve');
  const [crmSelected, setCrmSelected] = useState<Reservation | null>(null);
  
  const [filterType, setFilterType] = useState<'this_month' | 'last_month'>('this_month');
  const [hqMonthPrefix, setHqMonthPrefix] = useState(() => getKSTDateOnlyString().substring(0, 7));
  
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
  const getKSTDateString = () => getKSTDateOnlyString();

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

  // ── Partner-scope derived data ────────────────────────────
  // 훅은 반드시 조기 return 이전에 무조건 호출되어야 함(에어픽 본사 ↔ 입점 업체 전환 시 훅 순서 고정)
  const activeReservations = reservations.filter(r => r.status !== 'cancelled');

  const todaySourceMetrics = useMemo(
    () =>
      aggregateGroupedBookingSourceMetrics(activeReservations, (r) =>
        reservationDepartureOn(r, todayStr)
      ),
    [activeReservations, todayStr]
  );

  const monthSourceMetrics = useMemo(
    () =>
      aggregateGroupedBookingSourceMetrics(activeReservations, (r) =>
        normalizeDateString(r.departureDate).startsWith(currentMonthPrefix)
      ),
    [activeReservations, currentMonthPrefix]
  );

  const datesRange = useMemo(() => {
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
  }, [filterType, todayStr]);

  const flowPeriodSourceMetrics = useMemo(() => {
    const dateSet = new Set(datesRange);
    return aggregateGroupedBookingSourceMetrics(activeReservations, (r) =>
      dateSet.has(normalizeDateString(r.departureDate))
    );
  }, [activeReservations, datesRange]);

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
      .filter(r => reservationDepartureOn(r, todayStr))
      .reduce((sum, r) => sum + (r.totalPrice || 0), 0);

    // Sum today's total reservations
    const masterTodayReservations = masterActiveRes.filter(r =>
      toKSTDateOnlyString(r.createdAt) === todayStr
    ).length;

    // Sum today's total check-in count
    const masterTodayAdmitted = masterActiveRes.filter(r =>
      reservationDepartureOn(r, todayStr) && isAdmitted(r.status)
    ).length;

    // Sum today's total check-out count
    const masterTodayExited = masterActiveRes.filter(r =>
      reservationExitOn(r, todayStr) && r.status === 'completed_out'
    ).length;

    const hqMonthLabel = monthLabelFromPrefix(hqMonthPrefix);
    const hqMonthMax = todayStr.substring(0, 7);
    const hqCanGoNext = hqMonthPrefix < hqMonthMax;

    const hqMonthAdmitted = filterAdmittedInMonth(masterActiveRes, hqMonthPrefix);
    const hqPrevMonthPrefix = shiftMonthPrefix(hqMonthPrefix, -1);
    const hqPrevMonthAdmitted = filterAdmittedInMonth(masterActiveRes, hqPrevMonthPrefix);
    const hqPrevMonthLabel = monthLabelFromPrefix(hqPrevMonthPrefix);

    const hqMonthSourceMetrics = aggregateGroupedBookingSourceMetrics(hqMonthAdmitted);
    const hqMonthTotalAdmitted = hqMonthAdmitted.length;
    const hqMonthTotalRevenue = hqMonthAdmitted.reduce((s, r) => s + (r.totalPrice || 0), 0);

    const hqCompanyRows = buildHqCompanyRows(hqMonthAdmitted);
    const hqPrevCompanyRows = buildHqCompanyRows(hqPrevMonthAdmitted);
    const hqRankRows = buildCompanyRankChanges(hqCompanyRows, hqPrevCompanyRows);
    const hqCustomerMix = computeCustomerMix(masterActiveRes, hqMonthPrefix, hqMonthAdmitted);
    const hqAirpickTrend = buildAirpickShareTrend(masterActiveRes, hqMonthPrefix, 6);

    const hqCustomerTotal =
      hqCustomerMix.newCustomers + hqCustomerMix.returningCustomers;
    const hqBookingTotal =
      hqCustomerMix.newBookings + hqCustomerMix.returningBookings;

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
                <h2 className="text-sm font-black tracking-tight text-white">에어픽</h2>
                <span className="text-[12px] bg-amber-500/10 text-amber-500 border border-amber-500/20 px-2 py-0.5 rounded-lg font-black">본사</span>
              </div>
            </div>
          </div>
          
          <div className="text-[12.5px] text-zinc-400 font-mono font-bold bg-[#1C1C1E] px-3.5 py-1.5 rounded-xl border border-neutral-800 text-center md:text-right">
            오늘 기준일: {todayStr}
          </div>
        </div>

        {/* 1. 업체들 총 현황 (Scoreboard Bento Boards) */}
        <div>
          <h3 className="text-xs font-black text-zinc-400 px-1 mb-3">
            📊 플랫폼 입출차 총 현황
          </h3>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            
            {/* TOTAL RESERVATIONS */}
            <div className="bg-[#121214] border border-neutral-800/80 rounded-[22px] p-4 sm:p-5 relative overflow-hidden flex flex-col justify-between h-28 sm:h-32 shadow-xl hover:border-amber-500/30 transition-all group">
              <div className="absolute right-3.5 top-3.5 bg-amber-500/10 p-1.5 rounded-lg text-amber-500">
                <CalendarRange size={14} />
              </div>
              <span className="text-[11.5px] text-zinc-500 font-bold">오늘 총 예약 접수</span>
              <div className="space-y-0.5">
                <div className="text-xl sm:text-2xl font-black text-amber-500 tracking-tight font-mono">
                  {masterTodayReservations}건
                </div>
              </div>
            </div>

            {/* TOTAL ADMISSION */}
            <div className="bg-[#121214] border border-neutral-800/80 rounded-[22px] p-4 sm:p-5 relative overflow-hidden flex flex-col justify-between h-28 sm:h-32 shadow-xl hover:border-amber-500/30 transition-all group">
              <div className="absolute right-3.5 top-3.5 bg-amber-500/10 p-1.5 rounded-lg text-amber-500">
                <Car size={14} />
              </div>
              <span className="text-[11.5px] text-zinc-500 font-bold">오늘 총 입차 완료</span>
              <div className="space-y-0.5">
                <div className="text-xl sm:text-2xl font-black text-amber-500 tracking-tight font-mono">
                  {masterTodayAdmitted}대
                </div>
              </div>
            </div>

            {/* TOTAL DEPARTURE */}
            <div className="bg-[#121214] border border-neutral-800/80 rounded-[22px] p-4 sm:p-5 relative overflow-hidden flex flex-col justify-between h-28 sm:h-32 shadow-xl hover:border-amber-500/30 transition-all group">
              <div className="absolute right-3.5 top-3.5 bg-amber-500/10 p-1.5 rounded-lg text-amber-500">
                <ArrowRight size={14} />
              </div>
              <span className="text-[11.5px] text-zinc-500 font-bold">오늘 총 출차 완료</span>
              <div className="space-y-0.5">
                <div className="text-xl sm:text-2xl font-black text-amber-500 tracking-tight font-mono">
                  {masterTodayExited}대
                </div>
              </div>
            </div>

            {/* TODAY REVENUE */}
            <div className="bg-[#121214] border border-neutral-800/80 rounded-[22px] p-4 sm:p-5 relative overflow-hidden flex flex-col justify-between h-28 sm:h-32 shadow-xl hover:border-amber-500/30 transition-all group">
              <div className="absolute right-3.5 top-3.5 bg-amber-500/10 p-1.5 rounded-lg text-amber-500">
                <Coins size={14} />
              </div>
              <span className="text-[11.5px] text-zinc-500 font-bold">오늘 총 결제 금액</span>
              <div className="space-y-0.5">
                <div className="text-xl sm:text-2xl font-black text-amber-500 tracking-tight font-mono">
                  {masterTodaySales.toLocaleString()}원
                </div>
              </div>
            </div>

          </div>
        </div>

        {/* 2. 월별 입고 통계 */}
        <div className="space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between px-1 gap-2">
            <h3 className="text-xs font-black text-zinc-400">
              📅 월별 입고 현황
            </h3>
            <div className="flex items-center gap-1.5 bg-[#1C1C1E] border border-neutral-800/50 rounded-xl p-1">
              <button
                type="button"
                onClick={() => setHqMonthPrefix((p) => shiftMonthPrefix(p, -1))}
                className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-neutral-800 transition-colors"
                aria-label="이전 달"
              >
                <ChevronLeft size={18} />
              </button>
              <input
                type="month"
                value={hqMonthPrefix}
                max={hqMonthMax}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v) setHqMonthPrefix(v);
                }}
                className="bg-transparent text-sm font-black text-amber-400 font-mono text-center min-w-[8.5rem] outline-none [color-scheme:dark]"
              />
              <button
                type="button"
                disabled={!hqCanGoNext}
                onClick={() => hqCanGoNext && setHqMonthPrefix((p) => shiftMonthPrefix(p, 1))}
                className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-neutral-800 transition-colors disabled:opacity-30 disabled:pointer-events-none"
                aria-label="다음 달"
              >
                <ChevronRight size={18} />
              </button>
            </div>
          </div>

          <div className="bg-gradient-to-br from-[#121214] via-[#121214] to-[#1C1C1F] rounded-[22px] border border-neutral-800/80 p-4 space-y-4">
            <div className="flex items-end justify-between gap-3">
              <div>
                <span className="text-[12px] text-zinc-500 font-bold block">{hqMonthLabel} · 입고일 기준</span>
                <div className="text-3xl font-black text-amber-400 font-mono tracking-tight mt-0.5">
                  {hqMonthTotalAdmitted}<span className="text-lg ml-0.5">대</span>
                </div>
              </div>
              <div className="text-right">
                <span className="text-[11px] text-zinc-500 font-bold block">월 매출 합계</span>
                <span className="text-base font-black text-white font-mono">
                  {hqMonthTotalRevenue.toLocaleString()}원
                </span>
              </div>
            </div>

            <div className="h-px bg-neutral-800/50" />

            <div className="space-y-2">
              <span className="text-[12px] text-zinc-500 font-bold block">유입별 입고</span>
              {GROUPED_SOURCE_ROWS.map(({ key, label }) => {
                const { count, revenue } = hqMonthSourceMetrics[key];
                const pct = hqMonthTotalAdmitted > 0
                  ? Math.round((count / hqMonthTotalAdmitted) * 100)
                  : 0;
                return (
                  <div key={key} className="flex items-center gap-2">
                    <span
                      className={`shrink-0 text-[10px] font-black px-1.5 py-0.5 rounded border ${groupedBookingSourceBadgeClass(key)}`}
                    >
                      {label}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="h-2 bg-neutral-800 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${
                            key === 'airpick-b2c' ? 'bg-fuchsia-500' : 'bg-sky-500'
                          }`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                    <span className="text-[11px] text-zinc-400 font-mono w-12 text-right shrink-0">
                      {count}대
                    </span>
                    <span className="text-[11px] text-zinc-200 font-bold font-mono w-20 text-right shrink-0">
                      {revenue.toLocaleString()}원
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* 에어픽 유입 비중 추이 */}
        <div className="space-y-3">
          <h3 className="text-xs font-black text-zinc-400 px-1">
            📈 에어픽 유입 비중 추이 (최근 6개월)
          </h3>
          <div className="bg-[#121214] border border-neutral-800/80 rounded-[22px] p-4 space-y-3">
            {hqAirpickTrend.map((m) => {
              const isSelected = m.prefix === hqMonthPrefix;
              return (
                <div
                  key={m.prefix}
                  className={`space-y-1 rounded-xl px-2 py-1.5 -mx-2 ${
                    isSelected ? 'bg-fuchsia-500/8 ring-1 ring-fuchsia-500/25' : ''
                  }`}
                >
                  <div className="flex items-center justify-between text-[11px]">
                    <span
                      className={`font-bold ${isSelected ? 'text-fuchsia-300' : 'text-zinc-400'}`}
                    >
                      {m.label}
                      {isSelected && (
                        <span className="ml-1.5 text-[9px] text-fuchsia-400/80">선택</span>
                      )}
                    </span>
                    <span className="text-zinc-500 font-mono">
                      {m.airpick}/{m.total}대
                    </span>
                    <span
                      className={`font-black font-mono w-10 text-right ${
                        m.pct >= 30 ? 'text-fuchsia-400' : 'text-zinc-300'
                      }`}
                    >
                      {m.pct}%
                    </span>
                  </div>
                  <div className="h-2 bg-neutral-800 rounded-full overflow-hidden flex">
                    <div
                      className="h-full bg-fuchsia-500 rounded-l-full"
                      style={{ width: `${m.pct}%` }}
                    />
                    <div
                      className="h-full bg-sky-500/40 flex-1 rounded-r-full"
                      style={{ width: `${100 - m.pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 신규 vs 재방문 */}
        <div className="space-y-3">
          <h3 className="text-xs font-black text-zinc-400 px-1">
            👥 신규 vs 재방문 ({hqMonthLabel})
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="bg-[#121214] border border-neutral-800/80 rounded-[22px] p-4 space-y-3">
              <div className="flex items-center gap-2">
                <UserPlus size={16} className="text-sky-400" />
                <span className="text-[12px] text-zinc-500 font-bold">고객 수 (중복 제외)</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-sky-500/10 border border-sky-500/20 rounded-xl p-3 text-center">
                  <span className="text-[10px] text-sky-400 font-bold block">신규</span>
                  <span className="text-2xl font-black text-sky-300 font-mono">
                    {hqCustomerMix.newCustomers}
                  </span>
                  <span className="text-[10px] text-zinc-500 block mt-0.5">
                    {hqCustomerTotal > 0
                      ? Math.round((hqCustomerMix.newCustomers / hqCustomerTotal) * 100)
                      : 0}
                    %
                  </span>
                </div>
                <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 text-center">
                  <span className="text-[10px] text-amber-400 font-bold block">재방문</span>
                  <span className="text-2xl font-black text-amber-300 font-mono">
                    {hqCustomerMix.returningCustomers}
                  </span>
                  <span className="text-[10px] text-zinc-500 block mt-0.5">
                    {hqCustomerTotal > 0
                      ? Math.round(
                          (hqCustomerMix.returningCustomers / hqCustomerTotal) * 100
                        )
                      : 0}
                    %
                  </span>
                </div>
              </div>
            </div>
            <div className="bg-[#121214] border border-neutral-800/80 rounded-[22px] p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Users size={16} className="text-zinc-400" />
                <span className="text-[12px] text-zinc-500 font-bold">입고 건수 기준</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-3 text-center">
                  <span className="text-[10px] text-sky-400 font-bold block">신규 입고</span>
                  <span className="text-2xl font-black text-white font-mono">
                    {hqCustomerMix.newBookings}
                  </span>
                  <span className="text-[10px] text-zinc-500 block mt-0.5">
                    {hqBookingTotal > 0
                      ? Math.round((hqCustomerMix.newBookings / hqBookingTotal) * 100)
                      : 0}
                    %
                  </span>
                </div>
                <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-3 text-center">
                  <span className="text-[10px] text-amber-400 font-bold block">재방문 입고</span>
                  <span className="text-2xl font-black text-white font-mono">
                    {hqCustomerMix.returningBookings}
                  </span>
                  <span className="text-[10px] text-zinc-500 block mt-0.5">
                    {hqBookingTotal > 0
                      ? Math.round(
                          (hqCustomerMix.returningBookings / hqBookingTotal) * 100
                        )
                      : 0}
                    %
                  </span>
                </div>
              </div>
              <p className="text-[10px] text-zinc-600 leading-relaxed">
                해당 월 이전에 입고 이력이 있으면 재방문으로 집계합니다 (전화번호 우선).
              </p>
            </div>
          </div>
        </div>

        {/* 3. 업장별 입고 + 순위 변동 */}
        <div className="space-y-3">
          <h3 className="text-xs font-black text-zinc-400 px-1">
            🏢 업장별 입고 · 순위 변동 ({hqMonthLabel})
          </h3>
          <p className="text-[10px] text-zinc-600 px-1">
            전월({hqPrevMonthLabel}) 대비 입고 순위 · 대수 변화
          </p>
          {hqRankRows.length === 0 ? (
            <div className="bg-[#121214] border border-neutral-800/80 rounded-[22px] p-8 text-center">
              <Car size={22} className="mx-auto text-zinc-600 mb-2" />
              <p className="text-xs text-zinc-500 font-bold">해당 월 입고 내역이 없습니다.</p>
            </div>
          ) : (
            <div className="bg-[#121214] border border-neutral-800/80 rounded-[22px] overflow-hidden divide-y divide-neutral-800/60">
              {hqRankRows.map((row) => {
                const pct = hqMonthTotalAdmitted > 0
                  ? Math.round((row.total / hqMonthTotalAdmitted) * 100)
                  : 0;
                return (
                  <div key={row.id} className="px-4 py-3.5 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="text-lg font-black text-zinc-500 font-mono w-6 shrink-0">
                          {row.rank}
                        </span>
                        <div className="min-w-0">
                          <span className="text-sm font-black text-white block truncate">
                            {row.name}
                          </span>
                          <span className="text-[10px] text-zinc-500 font-mono">{row.id}</span>
                        </div>
                      </div>
                      <div className="text-right shrink-0 flex flex-col items-end gap-0.5">
                        <span className="text-lg font-black text-amber-400 font-mono">
                          {row.total}대
                        </span>
                        {row.rankDelta != null && row.rankDelta !== 0 && (
                          <span
                            className={`text-[10px] font-black flex items-center gap-0.5 ${
                              row.rankDelta > 0 ? 'text-emerald-400' : 'text-rose-400'
                            }`}
                          >
                            {row.rankDelta > 0 ? (
                              <TrendingUp size={11} />
                            ) : (
                              <TrendingDown size={11} />
                            )}
                            {Math.abs(row.rankDelta)}위
                          </span>
                        )}
                        {row.rankDelta === 0 && row.prevRank != null && (
                          <span className="text-[10px] text-zinc-500 flex items-center gap-0.5">
                            <Minus size={11} /> 유지
                          </span>
                        )}
                        {row.prevRank == null && (
                          <span className="text-[10px] text-sky-400 font-bold">신규 진입</span>
                        )}
                        {row.totalDelta !== 0 && (
                          <span
                            className={`text-[10px] font-mono ${
                              row.totalDelta > 0 ? 'text-emerald-400/90' : 'text-rose-400/90'
                            }`}
                          >
                            {row.totalDelta > 0 ? '+' : ''}
                            {row.totalDelta}대
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className={`text-[9.5px] font-bold px-1.5 py-0.5 rounded border ${groupedBookingSourceBadgeClass('airpick-b2c')}`}
                      >
                        에어픽 {row.airpick}대
                      </span>
                      <span
                        className={`text-[9.5px] font-bold px-1.5 py-0.5 rounded border ${groupedBookingSourceBadgeClass('other')}`}
                      >
                        홈·현장 {row.other}대
                      </span>
                      <span className="text-[10px] text-zinc-400 font-mono ml-auto">
                        {row.revenue.toLocaleString()}원
                      </span>
                    </div>
                    <div className="h-1.5 bg-neutral-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-amber-500/80 rounded-full"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

      </div>
    );
  }

  // --- Rendering Path B: B2B Partner Owner Dashboard (isSuperAdmin === false) ---
  // Real-time calculated statistics from active reservations
  const realTodaySales = activeReservations
    .filter(r => reservationDepartureOn(r, todayStr))
    .reduce((sum, r) => sum + (r.totalPrice || 0), 0);

  const realMonthSales = activeReservations
    .filter(r => normalizeDateString(r.departureDate).startsWith(currentMonthPrefix))
    .reduce((sum, r) => sum + (r.totalPrice || 0), 0);

  const todaySales = realTodaySales;
  const monthSales = realMonthSales;

  // --- Daily flow data (A+C: 월 요약 + 미니 막대 + 현재 재차) ---
  const dailyFlow = datesRange.map((date) => {
    const dayRes = activeReservations.filter(r => reservationDepartureOn(r, date));
    const admittedCount = dayRes.filter(r => isAdmitted(r.status)).length;
    const exitedCount = activeReservations.filter(r =>
      isCompletedOut(r.status) && reservationExitOn(r, date)
    ).length;
    const sourceMetrics = aggregateGroupedBookingSourceMetrics(dayRes);
    return { date, admittedCount, exitedCount, sourceMetrics };
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
  const parkedNow = activeReservations.filter(r => isParked(r.status)).length;

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
        </div>
      </div>

      {/* 💳 Sales Statistics Card */}
      <div className="bg-gradient-to-br from-[#121214] via-[#121214] to-[#1C1C1F] p-4.5 rounded-[22px] border border-neutral-800/80 shadow-lg space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-[12.5px] font-black text-zinc-400 tracking-wider flex items-center gap-1.5">
            <Coins size={14} className="text-amber-500 animate-pulse animate-duration-1000" />
            매출 통계
          </span>
        </div>

        <div className="pt-1.5 space-y-4">
          <div>
            <span className="text-[12px] text-[#8E8E93] font-bold block mb-0.5">오늘 총 매출액</span>
            <div className="text-2xl font-black text-amber-400 tracking-tight font-mono">
              {todaySales.toLocaleString()}원
            </div>
          </div>

          <div className="h-px bg-neutral-800/40" />

          <div className="flex justify-between items-center text-xs font-mono">
            <div>
              <span className="text-[12px] text-[#8E8E93] font-bold block mb-0.5">이번 달 누적 매출</span>
              <span className="text-base font-black text-white tracking-tight">
                {monthSales.toLocaleString()}원
              </span>
            </div>
          </div>

          <div className="h-px bg-neutral-800/40" />

          <div className="space-y-3">
            <span className="text-[12px] text-[#8E8E93] font-bold block">유입별 매출 비교</span>
            {(['today', 'month'] as const).map((period) => {
              const metrics = period === 'today' ? todaySourceMetrics : monthSourceMetrics;
              const totalRev = GROUPED_SOURCE_ROWS.reduce((s, row) => s + metrics[row.key].revenue, 0);
              const title = period === 'today' ? '오늘 (입고일 기준)' : '이번 달 (입고일 기준)';
              return (
                <div key={period} className="space-y-2">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-zinc-500 font-bold">{title}</span>
                    <span className="text-zinc-400 font-mono">{totalRev.toLocaleString()}원</span>
                  </div>
                  <div className="space-y-1.5">
                    {GROUPED_SOURCE_ROWS.map(({ key, label }) => {
                      const { count, revenue } = metrics[key];
                      const pct = totalRev > 0 ? Math.round((revenue / totalRev) * 100) : 0;
                      return (
                        <div key={`${period}-${key}`} className="flex items-center gap-2">
                          <span
                            className={`shrink-0 text-[10px] font-black px-1.5 py-0.5 rounded border ${groupedBookingSourceBadgeClass(key)}`}
                          >
                            {label}
                          </span>
                          <div className="flex-1 min-w-0">
                            <div className="h-1.5 bg-neutral-800 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full ${
                                  key === 'airpick-b2c' ? 'bg-fuchsia-500' : 'bg-sky-500'
                                }`}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </div>
                          <span className="text-[10px] text-zinc-400 font-mono shrink-0 w-16 text-right">
                            {count}건
                          </span>
                          <span className="text-[11px] text-zinc-200 font-bold font-mono shrink-0 w-20 text-right">
                            {revenue.toLocaleString()}원
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── 접수내역 CRM (합친 섹션) ────────────────────────── */}
      {(() => {
        const activeRes = reservations.filter(r => r.status !== 'cancelled');
        const crmCounts = {
          today_reserve: activeRes.filter(r => isTodayReserveRow(r, todayStr)).length,
          today_parked: activeRes.filter(r => reservationDepartureOn(r, todayStr) && isParked(r.status)).length,
          today_released: activeRes.filter(r =>
            r.status === 'completed_out' && reservationExitOn(r, todayStr)
          ).length,
        };
        const todayTotal = activeRes.filter(r => {
          const isReserve = isTodayReserveRow(r, todayStr);
          const isParkedRow = reservationDepartureOn(r, todayStr) && isParked(r.status);
          const isOut = r.status === 'completed_out' && reservationExitOn(r, todayStr);
          return isReserve || isParkedRow || isOut;
        });
        const todayRevenue = todayTotal.reduce((s, r) => s + (r.totalPrice || 0), 0);
        const todayGroupedMetrics = aggregateGroupedBookingSourceMetrics(todayTotal);

        const crmFiltered = (() => {
          const q = crmSearch.trim().toLowerCase().replace(/[ㄱ-ㅎㅏ-ㅣ\s]+$/, '');
          if (q) {
            return activeRes.filter(r =>
              (r.carNumber || '').toLowerCase().includes(q) ||
              (r.userName || '').toLowerCase().includes(q)
            );
          }
          return activeRes.filter(r => {
            if (crmTab === 'today_reserve') return isTodayReserveRow(r, todayStr);
            if (crmTab === 'today_parked') return reservationDepartureOn(r, todayStr) && isParked(r.status);
            if (crmTab === 'today_released') {
              return r.status === 'completed_out' && reservationExitOn(r, todayStr);
            }
            return false;
          });
        })();

        const getStatusBadge = (status: string) => (
          <span className={`text-[11px] font-bold px-2 py-0.5 rounded-lg border ${adminStatusBadgeClass(status)}`}>
            {statusToLabel(status, 'admin')}
          </span>
        );

        return (
          <div className="space-y-3 pt-1 border-t border-neutral-800/60">
            <div className="flex items-center justify-between px-0.5">
              <h3 className="text-[12.5px] text-zinc-400 font-black tracking-wider flex items-center gap-1.5">
                <ClipboardList size={13} className="text-amber-500" />
                주차접수 현황
              </h3>
              <div className="text-right">
                <div className="flex items-center gap-2 text-[12px] font-mono text-zinc-500 justify-end">
                  <span className="text-amber-500 font-bold">{todayTotal.length}건</span>
                  <span>·</span>
                  <span>{todayRevenue.toLocaleString()}원</span>
                </div>
                <div className="flex items-center gap-1.5 mt-0.5 justify-end flex-wrap">
                  {GROUPED_SOURCE_ROWS.map(({ key }) => {
                    const { count, revenue } = todayGroupedMetrics[key];
                    if (count === 0 && revenue === 0) return null;
                    return (
                      <span
                        key={key}
                        className={`text-[9.5px] font-bold px-1.5 py-0.5 rounded border ${groupedBookingSourceBadgeClass(key)}`}
                      >
                        {groupedBookingSourceLabel(key)} {count}건 · {revenue.toLocaleString()}원
                      </span>
                    );
                  })}
                </div>
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
                  className={`py-2 rounded-lg text-[12px] font-bold transition-all flex flex-col items-center gap-0.5 leading-tight ${
                    crmTab === key && !crmSearch ? color + ' shadow-sm' : 'text-zinc-400 hover:text-white hover:bg-neutral-800/40'
                  }`}
                >
                  <span>{label}</span>
                  <span className="text-[10.5px] font-mono font-extrabold">{count}건</span>
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
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-xs font-black text-white font-mono">{res.carNumber}</span>
                          <span className="text-[12px] text-zinc-500 truncate">{res.carModel}</span>
                          {(() => {
                            const grouped = toGroupedBookingSource(resolveBookingSourceFromReservation(res));
                            if (grouped === 'other') return null;
                            return (
                              <span
                                className={`text-[10px] font-black px-1.5 py-0.5 rounded border shrink-0 ${groupedBookingSourceBadgeClass(grouped)}`}
                              >
                                {groupedBookingSourceLabel(grouped)}
                              </span>
                            );
                          })()}
                        </div>
                        {getStatusBadge(res.status)}
                      </div>
                      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[13px]">
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
              className={`flex-1 py-1.5 rounded-lg text-[12px] font-bold transition-all ${filterType === t ? 'bg-amber-500 text-neutral-950 shadow-sm' : 'text-zinc-500 hover:text-white'}`}
            >
              {t === 'this_month' ? '이번 달' : '지난 달'}
            </button>
          ))}
        </div>

        <div className="space-y-2.5">
          <div className="flex items-center justify-between px-1 select-none">
            <h3 className="text-[12.5px] text-zinc-400 font-extrabold tracking-wider uppercase">
              일별 입·출차 흐름 ({filterType === 'this_month' ? '이번 달' : '지난 달'})
            </h3>
            <span className="text-[11px] font-mono text-zinc-500 font-semibold">일별 입·출차</span>
          </div>

          {/* 현재 재차(주차 중) + 월 요약 바 */}
          <div className="grid grid-cols-4 gap-2 select-none">
            <div className="col-span-1 bg-gradient-to-br from-amber-500/15 to-amber-600/[0.04] border border-amber-500/25 rounded-2xl p-3 flex flex-col justify-center">
              <span className="text-[11px] text-amber-500/80 font-bold uppercase tracking-wider leading-tight">현재 주차 중</span>
              <span className="text-xl font-black text-amber-400 font-mono leading-none mt-1">
                {parkedNow}<span className="text-[13px] ml-0.5">대</span>
              </span>
            </div>
            <div className="col-span-3 bg-[#1C1C1E] border border-neutral-800/40 rounded-2xl p-3 grid grid-cols-3 gap-1 items-center">
              <div className="text-center">
                <span className="text-[11px] text-zinc-500 font-bold uppercase block tracking-wider">총 입고</span>
                <span className="text-sm font-black text-amber-500 font-mono">{totalAdmitted}</span>
              </div>
              <div className="text-center border-x border-neutral-800/60">
                <span className="text-[11px] text-zinc-500 font-bold uppercase block tracking-wider">총 출고</span>
                <span className="text-sm font-black text-emerald-400 font-mono">{totalExited}</span>
              </div>
              <div className="text-center">
                <span className="text-[11px] text-zinc-500 font-bold uppercase block tracking-wider">일평균 입고</span>
                <span className="text-sm font-black text-zinc-200 font-mono">{avgAdmitted}</span>
              </div>
            </div>
          </div>

          {busiestDay && busiestDay.admittedCount > 0 && (
            <div className="px-1.5 select-none">
              <span className="text-[11px] text-zinc-500 font-bold">
                최다 입고일 · <span className="text-amber-500/90 font-mono">{busiestDay.date}</span> ({busiestDay.admittedCount}대)
              </span>
            </div>
          )}

          <div className="bg-[#1C1C1E] border border-neutral-800/40 rounded-2xl p-3 space-y-1.5">
            <span className="text-[11px] text-zinc-500 font-bold block">
              기간 매출 ({filterType === 'this_month' ? '이번 달' : '지난 달'} · 입고일 기준)
            </span>
            {GROUPED_SOURCE_ROWS.map(({ key, label }) => {
              const { count, revenue } = flowPeriodSourceMetrics[key];
              return (
                <div key={key} className="flex items-center justify-between text-[11px] font-mono">
                  <span className={`text-[10px] font-black px-1.5 py-0.5 rounded border ${groupedBookingSourceBadgeClass(key)}`}>
                    {label}
                  </span>
                  <span className="text-zinc-400">{count}건</span>
                  <span className="text-zinc-200 font-bold">{revenue.toLocaleString()}원</span>
                </div>
              );
            })}
          </div>

          {/* 날짜별 미니 막대 리스트 */}
          <div className="bg-[#1C1C1E] border border-neutral-800/40 rounded-2xl overflow-hidden divide-y divide-[#1D1D20] max-h-72 overflow-y-auto font-mono">
            {dailyFlow.map(({ date, admittedCount, exitedCount, sourceMetrics }) => {
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
                        <span className="text-[11px] bg-amber-500 text-neutral-950 px-1.5 py-0.5 rounded-md font-black tracking-wider">오늘</span>
                      )}
                    </div>
                    <div className="flex gap-2.5 text-[12px] font-black">
                      <span className="text-amber-500">입 {admittedCount}</span>
                      <span className="text-emerald-400">출 {exitedCount}</span>
                    </div>
                  </div>

                  {(sourceMetrics['airpick-b2c'].revenue > 0 || sourceMetrics.other.revenue > 0) && (
                    <div className="flex gap-2 mb-2 flex-wrap">
                      {GROUPED_SOURCE_ROWS.map(({ key }) => {
                        const { count, revenue } = sourceMetrics[key];
                        if (count === 0 && revenue === 0) return null;
                        return (
                          <span
                            key={key}
                            className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${groupedBookingSourceBadgeClass(key)}`}
                          >
                            {groupedBookingSourceLabel(key)} {revenue.toLocaleString()}원
                          </span>
                        );
                      })}
                    </div>
                  )}

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
                  <p className="text-[11.5px] text-zinc-500">{crmSelected.carModel} · {crmSelected.userName}</p>
                </div>
                <button onClick={() => setCrmSelected(null)} className="p-1.5 hover:bg-neutral-800 rounded-xl text-zinc-400"><X size={15} /></button>
              </div>
              <div className="p-4 space-y-4 overflow-y-auto">
                <div className="bg-amber-500/5 border border-amber-500/10 p-3.5 rounded-2xl flex items-center justify-between">
                  <div>
                    <p className="text-[11px] text-amber-500 font-mono font-bold">고객 정보</p>
                    <h4 className="text-sm font-black text-white">{crmSelected.userName} 고객님</h4>
                    <p className="text-[12px] text-zinc-400 mt-0.5">누적 예약 <span className="text-amber-500 font-bold">{visitCount}회</span></p>
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
                {onEditReservation && crmSelected.status !== 'cancelled' && crmSelected.status !== 'completed_out' && (
                  <button
                    type="button"
                    onClick={() => {
                      const target = crmSelected;
                      setCrmSelected(null);
                      onEditReservation(target);
                    }}
                    className="flex items-center justify-center gap-2 w-full py-3 bg-white text-neutral-950 rounded-xl font-black text-xs"
                  >
                    예약 수정 · 취소
                  </button>
                )}
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
                        className="flex-1 py-2.5 bg-red-950/85 text-rose-400 border border-rose-500/20 rounded-xl text-[12.5px] font-black"
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
                      className="flex-1 py-2.5 bg-emerald-950/85 text-emerald-400 border border-emerald-500/20 rounded-xl text-[12.5px] font-black"
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
