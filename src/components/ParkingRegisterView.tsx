import React, { useState, useMemo, useEffect } from 'react';
import { 
  ArrowLeft, Search, Calendar, FileText, CheckCircle, 
  ShieldAlert, CreditCard, X, PhoneCall, PlaneTakeoff, 
  PlaneLanding, User, ShieldCheck, Award, MessageSquare 
} from 'lucide-react';
import { Reservation } from '../types';

interface ParkingRegisterViewProps {
  reservations: Reservation[];
  companyName?: string;
  onUpdateStatus?: (resId: string, nextStatus: any, extraFields?: any) => Promise<void> | void;
}

export default function ParkingRegisterView({ 
  reservations = [], 
  companyName = '와와',
  onUpdateStatus
}: ParkingRegisterViewProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRes, setSelectedRes] = useState<Reservation | null>(null);

  // 1. Define today Date representation matching current systems locale focus (KST format)
  const getKSTDateString = () => {
    const kstDate = new Date(Date.now() + 9 * 60 * 60 * 1000);
    return kstDate.toISOString().split('T')[0];
  };

  const [todayDateStr, setTodayDateStr] = useState(() => getKSTDateString());

  // Automatically refresh date-related views when midnight KST rolls over
  useEffect(() => {
    const checkDateRollOver = () => {
      const currentTodayKST = getKSTDateString();
      setTodayDateStr((prevDate) => {
        if (prevDate !== currentTodayKST) {
          console.log(`[ParkingRegister Rollover] Midnight passed! Updating todayDateStr from ${prevDate} to ${currentTodayKST}`);
          return currentTodayKST;
        }
        return prevDate;
      });
    };

    // Run once on load
    checkDateRollOver();

    // Check periodically every 10 seconds
    const intervalId = setInterval(checkDateRollOver, 10000);
    return () => clearInterval(intervalId);
  }, []);

  // 2. Active Tab filter state
  const [activeTab, setActiveTab] = useState<'today_reserve' | 'today_parked' | 'today_released'>('today_reserve');

  // Compute live counter tallies for each tab
  const counts = useMemo(() => {
    let today_reserve = 0;
    let today_parked = 0;
    let today_released = 0;

    reservations.forEach(r => {
      if (r.status === 'cancelled') return;
      if (r.departureDate === todayDateStr && (r.status === 'pending' || r.status === 'pending_in')) {
        today_reserve++;
      }
      if (r.departureDate === todayDateStr && r.status === 'completed_in') {
        today_parked++;
      }
      if (r.arrivalDate === todayDateStr && r.status === 'completed_out') {
        today_released++;
      }
    });

    return { today_reserve, today_parked, today_released };
  }, [reservations, todayDateStr]);

  // We list all non-cancelled reservations for "주차접수내역" as requested
  const activeReservations = useMemo(() => {
    return reservations.filter(r => r.status !== 'cancelled');
  }, [reservations]);

  // Apply workflow tab filters in alignment with selected option
  const tabFilteredReservations = useMemo(() => {
    return activeReservations.filter(r => {
      if (activeTab === 'today_reserve') {
        // [당일 예약 온손님] : 오늘 입고 예정이고 (pending 또는 pending_in) 상태
        return r.departureDate === todayDateStr && (r.status === 'pending' || r.status === 'pending_in');
      } else if (activeTab === 'today_parked') {
        // [당일 주차 완료한손님] : 오늘 입고완료(completed_in) 상태
        return r.departureDate === todayDateStr && r.status === 'completed_in';
      } else if (activeTab === 'today_released') {
        // [당일 출차 완료한손님] : 오늘 출고완료(completed_out) 상태
        return r.arrivalDate === todayDateStr && r.status === 'completed_out';
      }
      return true;
    });
  }, [activeReservations, activeTab, todayDateStr]);

  // Calculate cumulative usage frequencies for any customer contact
  const getUserVisitCount = (userName: string, phone: string) => {
    return reservations.filter(r => r.userName === userName || r.phone === phone).length;
  };

  // Generate realistic flight code if not explicitly saved on the document object
  const getFlightCode = (res: any, isDeparture: boolean) => {
    if (isDeparture && res.departureFlight) return res.departureFlight;
    if (!isDeparture && res.arrivalFlight) return res.arrivalFlight;
    
    // Deterministic simulation based on customer hash
    const hashStr = res.userName + (res.carNumber || '');
    const codeVal = hashStr.split('').reduce((acc: number, char: string) => acc + char.charCodeAt(0), 0);
    const airlines = ['KE', 'OZ', 'LJ', '7C', 'TW', 'ZE'];
    const carrier = airlines[codeVal % airlines.length];
    const flightNumber = (codeVal % 700) + 101;
    return `${carrier}${flightNumber}`;
  };

  // 3. Compute todayAllReservations (union of 3 active tabs) for real-time Synchronized Stats
  const todayAllReservations = useMemo(() => {
    return activeReservations.filter(r => {
      const isReserve = r.departureDate === todayDateStr && (r.status === 'pending' || r.status === 'pending_in');
      const isParked = r.departureDate === todayDateStr && r.status === 'completed_in';
      const isReleased = r.arrivalDate === todayDateStr && r.status === 'completed_out';
      return isReserve || isParked || isReleased;
    });
  }, [activeReservations, todayDateStr]);

  // Helper utility to determine corresponding tab of any reservation today
  const getTabForReservation = (r: Reservation) => {
    if (r.departureDate === todayDateStr && (r.status === 'pending' || r.status === 'pending_in')) {
      return 'today_reserve';
    }
    if (r.departureDate === todayDateStr && r.status === 'completed_in') {
      return 'today_parked';
    }
    if (r.arrivalDate === todayDateStr && r.status === 'completed_out') {
      return 'today_released';
    }
    return null;
  };

  // Apply search query filter (matching carNumber or userName)
  const filteredReservations = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    
    // 1. If NO search query active, return standard tab filtered list
    if (!query) {
      return tabFilteredReservations;
    }

    // 2. If search active, perform GLOBAL search across all current active reservations.
    // Clean trailing Korean consonants/vowels (자음/모음) and whitespace to survive IME transition
    const cleanQuery = query.replace(/[ㄱ-ㅎㅏ-ㅣ\s]+$/, "").trim().toLowerCase();

    return activeReservations.filter(r => {
      const carNum = (r.carNumber || '').toLowerCase();
      const uName = (r.userName || '').toLowerCase();
      
      const matchFull = carNum.includes(query) || uName.includes(query);
      const matchClean = cleanQuery ? (carNum.includes(cleanQuery) || uName.includes(cleanQuery)) : false;

      return matchFull || matchClean;
    });
  }, [tabFilteredReservations, activeReservations, searchQuery]);

  // Auto-activate matching tab when global search matches a reservation (only triggered on search query keystroke)
  React.useEffect(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return;

    const cleanQuery = query.replace(/[ㄱ-ㅎㅏ-ㅣ\s]+$/, "").trim().toLowerCase();

    // Find the first reservation matching the query across all active checkins of today
    const firstMatch = activeReservations.find(r => {
      const carNum = (r.carNumber || '').toLowerCase();
      const uName = (r.userName || '').toLowerCase();
      const matchFull = carNum.includes(query) || uName.includes(query);
      const matchClean = cleanQuery ? (carNum.includes(cleanQuery) || uName.includes(cleanQuery)) : false;
      return matchFull || matchClean;
    });

    if (firstMatch) {
      const tab = getTabForReservation(firstMatch);
      if (tab) {
        setActiveTab(tab);
      }
    }
  }, [searchQuery]);

  // Real-time Synchronized Summary Metrics based on today's active configurations
  const totalCount = todayAllReservations.length;
  const totalRevenue = todayAllReservations.reduce((sum, r) => sum + (r.totalPrice || 0), 0);

  // Status badge style helper
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <span className="bg-[#1C1C1E] text-amber-500 border border-amber-500/20 text-[10px] font-bold px-2 py-0.5 rounded-lg">접수대기</span>;
      case 'pending_in':
        return <span className="bg-amber-500/10 text-amber-400 border border-amber-500/20 text-[10px] font-bold px-2 py-0.5 rounded-lg">입고대기</span>;
      case 'completed_in':
        return <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] font-bold px-2 py-0.5 rounded-lg">입고완료</span>;
      case 'request_out':
        return <span className="bg-rose-500/10 text-rose-400 border border-rose-500/20 text-[10px] font-bold px-2 py-0.5 rounded-lg">출고요청</span>;
      case 'completed_out':
        return <span className="bg-zinc-800 text-zinc-400 border border-zinc-700 text-[10px] font-bold px-2 py-0.5 rounded-lg">반납출고완료</span>;
      default:
        return <span className="bg-neutral-800 text-neutral-400 text-[10px] font-bold px-2 py-0.5 rounded-lg">{status}</span>;
    }
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-white p-4 pb-24 font-sans relative">
      {/* Header */}
      <div className="flex items-center gap-3.5 mb-5 select-none px-1">
        <div>
          <h2 className="text-sm font-black tracking-tight text-white">{companyName} 주차접수 내역 (CRM)</h2>
          <p className="text-[11px] text-zinc-500 font-bold uppercase tracking-wider">Active Parking Registrations & CRM</p>
        </div>
      </div>

      {/* 1. 상단 요약 정산 카드 (Compact Summary Wallet) */}
      <div className="bg-gradient-to-r from-neutral-900 via-[#1C1C1E] to-neutral-900 p-4.5 rounded-2xl border border-neutral-800/50 shadow-xl mb-4.5">
        <div className="flex justify-between items-center mb-3">
          <span className="text-[11px] uppercase font-black tracking-wider text-zinc-400 flex items-center gap-1">
            <CreditCard size={12} className="text-amber-500" />
            접수 요약 현황
          </span>
          <span className="text-[10px] font-mono text-zinc-500 font-bold bg-[#1C1C1E] px-2 py-0.5 rounded border border-neutral-800">
            KST Realtime
          </span>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-neutral-950/60 p-3 rounded-xl border border-neutral-800/40">
            <span className="text-[10.5px] text-zinc-500 font-bold block mb-0.5">전체 접수 건수</span>
            <span className="text-base font-black text-amber-500 font-mono">
              {totalCount.toLocaleString()}건
            </span>
          </div>
          <div className="bg-neutral-950/60 p-3 rounded-xl border border-neutral-800/40">
            <span className="text-[10.5px] text-zinc-500 font-bold block mb-0.5">총 결제금액</span>
            <span className="text-base font-black text-white font-mono">
              {totalRevenue.toLocaleString()}원
            </span>
          </div>
        </div>
      </div>

      {/* 2. 검색 바 (Integrated Query Bar) */}
      <div className="relative mb-4">
        <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500" />
        <input
          type="text"
          placeholder="차량번호 또는 고객명으로 검색..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full bg-[#1C1C1E] border border-neutral-800/60 text-xs rounded-xl pl-9 pr-4 py-3 text-white placeholder-zinc-500 outline-none focus:border-amber-500/80 transition-all font-semibold"
        />
      </div>

      {/* 오늘 현장 업무 흐름 맞춤형 퀵 필터 탭 */}
      <div className="grid grid-cols-3 gap-2 p-1 bg-neutral-900 rounded-xl border border-neutral-800/50 mb-5 select-none text-center">
        <button
          onClick={() => setActiveTab('today_reserve')}
          className={`py-2 rounded-lg text-[11px] sm:text-xs font-bold transition-all flex flex-col items-center justify-center gap-1 leading-tight ${
            activeTab === 'today_reserve'
              ? 'bg-amber-500 text-neutral-950 shadow-md shadow-amber-500/10'
              : 'text-zinc-400 hover:text-white hover:bg-neutral-800/40'
          }`}
        >
          <span>당일 예약 온손님</span>
          <span className={`text-[9.5px] px-1.5 py-0.2 rounded font-mono font-extrabold ${
            activeTab === 'today_reserve' ? 'bg-neutral-950/20 text-neutral-950' : 'bg-[#1C1C1E] text-zinc-400 border border-neutral-800/60'
          }`}>
            {counts.today_reserve}건
          </span>
        </button>
        <button
          onClick={() => setActiveTab('today_parked')}
          className={`py-2 rounded-lg text-[11px] sm:text-xs font-bold transition-all flex flex-col items-center justify-center gap-1 leading-tight ${
            activeTab === 'today_parked'
              ? 'bg-[#A855F7] text-white shadow-md shadow-purple-600/15'
              : 'text-zinc-400 hover:text-white hover:bg-neutral-800/40'
          }`}
        >
          <span>당일 주차 완료</span>
          <span className={`text-[9.5px] px-1.5 py-0.2 rounded font-mono font-extrabold ${
            activeTab === 'today_parked' ? 'bg-neutral-950/20 text-white' : 'bg-[#1C1C1E] text-zinc-400 border border-neutral-800/60'
          }`}>
            {counts.today_parked}건
          </span>
        </button>
        <button
          onClick={() => setActiveTab('today_released')}
          className={`py-2 rounded-lg text-[11px] sm:text-xs font-bold transition-all flex flex-col items-center justify-center gap-1 leading-tight ${
            activeTab === 'today_released'
              ? 'bg-[#22C55E] text-white shadow-md shadow-green-600/15'
              : 'text-zinc-400 hover:text-white hover:bg-neutral-800/40'
          }`}
        >
          <span>당일 출차 완료</span>
          <span className={`text-[9.5px] px-1.5 py-0.2 rounded font-mono font-extrabold ${
            activeTab === 'today_released' ? 'bg-neutral-950/20 text-white' : 'bg-[#1C1C1E] text-zinc-400 border border-neutral-800/60'
          }`}>
            {counts.today_released}건
          </span>
        </button>
      </div>

      {/* 3. 리스트 영역 (모바일 카드 레이아웃) */}
      <div className="space-y-3">
        <div className="flex justify-between items-center px-1">
          <span className="text-[11px] text-zinc-500 font-bold uppercase tracking-wider">
            검색 결과 ({filteredReservations.length}건)
          </span>
        </div>

        {filteredReservations.length === 0 ? (
          <div className="text-center py-12 bg-[#1C1C1E] rounded-2xl border border-neutral-850 p-6">
            <ShieldAlert size={28} className="mx-auto text-zinc-600 mb-2.5 animate-pulse" />
            <p className="text-xs text-zinc-400 font-bold">검색에 부합하는 접수 내역이 존재하지 않습니다.</p>
            <p className="text-[11px] text-zinc-600 mt-1 font-medium">검색어 철자 또는 차량번호 띄어쓰기를 다시 확인해 주세요.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredReservations.map((res, idx) => {
              const visitCount = getUserVisitCount(res.userName, res.phone);
              const isVIP = visitCount >= 2;

              // 실제 배정된 자리만 표시(없으면 미지정), 실내/야외는 접수 시 결정된 등급(res.isIndoor) 사용
              const computedSpace = res.parkingSpace || '미지정';
              const isIndoor = res.isIndoor !== false;

              return (
                <div 
                  key={`${res.id || ''}-${res.carNumber}-${idx}`} 
                  onClick={() => setSelectedRes(res)}
                  className="bg-[#1C1C1E] border border-neutral-800/80 rounded-2xl p-4 space-y-3 hover:border-neutral-700/80 hover:bg-neutral-900/40 active:scale-[0.99] duration-100 transition-all cursor-pointer flex flex-col justify-between"
                >
                  {/* Top Section with Car Number and Status */}
                  <div className="flex justify-between items-center pb-2.5 border-b border-neutral-800/35">
                    <div className="space-y-0.5">
                      <span className="text-xs font-black text-white tracking-tight font-mono flex items-center gap-1.5">
                        {res.carNumber}
                        {isVIP && (
                          <span className="text-[10.5px] px-1.5 py-0.2 bg-amber-500/10 text-amber-500 border border-amber-500/20 rounded font-black tracking-normal">
                            VIP 단골
                          </span>
                        )}
                      </span>
                      <span className="text-[11px] text-zinc-500 font-bold block">
                        {res.carModel}
                      </span>
                    </div>
                    <div>
                      {getStatusBadge(res.status)}
                    </div>
                  </div>

                  {/* Middle details mapping */}
                  <div className="grid grid-cols-1 gap-y-1.5 text-xs text-zinc-300 font-sans">
                    <div className="flex justify-between items-center text-[12px]">
                      <span className="text-zinc-550 font-bold">주차 입고일시</span>
                      <div className="flex items-center gap-1.5 font-mono">
                        <span className="font-semibold text-zinc-200">
                          {res.departureDate} {res.departureTime}
                        </span>
                        {res.departureTerminal === 'T1' ? (
                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-[#00D2FF]/10 text-[#00D2FF] border border-[#00D2FF]/20 font-black">
                            1터미널
                          </span>
                        ) : (
                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-[#FFB800]/10 text-[#FFB800] border border-[#FFB800]/20 font-black">
                            2터미널
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex justify-between items-center text-[12px]">
                      <span className="text-zinc-550 font-bold">출차 반납일시</span>
                      <div className="flex items-center gap-1.5 font-mono">
                        <span className="font-semibold text-zinc-200">
                          {res.arrivalDate} {res.arrivalTime}
                        </span>
                        {res.arrivalTerminal === 'T1' ? (
                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-[#00D2FF]/10 text-[#00D2FF] border border-[#00D2FF]/20 font-black">
                            1터미널
                          </span>
                        ) : (
                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-[#FFB800]/10 text-[#FFB800] border border-[#FFB800]/20 font-black">
                            2터미널
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex justify-between items-center text-[12px]">
                      <span className="text-zinc-550 font-bold">지정 주차구역</span>
                      <div className="flex items-center gap-1.5 font-mono">
                        <span className="font-semibold text-zinc-200">
                          {computedSpace}
                        </span>
                        {isIndoor ? (
                          <span className="text-[10px] px-1.5 py-0.2 rounded-[6px] bg-[#A855F7] text-white font-black shrink-0 tracking-tight">
                            실내
                          </span>
                        ) : (
                          <span className="text-[10px] px-1.5 py-0.2 rounded-[6px] bg-[#22C55E] text-white font-black shrink-0 tracking-tight">
                            야외
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex justify-between text-[12px] items-center pt-0.5">
                      <span className="text-zinc-550 font-bold">결제금액</span>
                      <span className="font-black text-amber-400 font-mono">
                        {(res.totalPrice || 0).toLocaleString()}원
                      </span>
                    </div>
                    <div className="flex justify-between text-[12px] pt-1 border-t border-dashed border-neutral-800/85">
                      <span className="text-zinc-550 font-semibold">고객 정보</span>
                      <span className="font-bold text-zinc-200">
                        {res.userName} <span className="text-amber-500 text-[11px] font-mono font-bold">[이용: {visitCount}회]</span>
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* CRM Detail Master Modal */}
      {selectedRes && (() => {
        const visitCount = getUserVisitCount(selectedRes.userName, selectedRes.phone);
        const depFlightCode = getFlightCode(selectedRes, true);
        const arrFlightCode = getFlightCode(selectedRes, false);

        // 실제 배정된 자리만 표시(없으면 미지정), 실내/야외는 접수 시 결정된 등급(selectedRes.isIndoor) 사용
        const selectedSpace = selectedRes.parkingSpace || '미지정';
        const isSelectedIndoor = selectedRes.isIndoor !== false;

        return (
          <div className="fixed inset-0 z-[150] flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fade-in">
            <div className="w-full max-w-md bg-[#1C1C1E] border border-neutral-800 rounded-t-3xl sm:rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh] text-zinc-100 animate-slide-up">
              
              {/* Modal Header */}
              <div className="p-5 border-b border-neutral-800/70 flex items-center justify-between bg-neutral-900/60">
                <div className="flex items-center gap-2.5">
                  <div className="p-2.5 bg-neutral-950 rounded-xl border border-neutral-800/50">
                    <ShieldCheck size={16} className="text-emerald-500 animate-pulse" />
                  </div>
                  <div>
                    <h3 className="text-xs font-black text-white font-mono uppercase tracking-tight">
                      {selectedRes.carNumber} 상세 정보
                    </h3>
                    <p className="text-[10.5px] text-zinc-500 font-bold uppercase tracking-wider">
                      ADMIN SPECIAL CUSTOMER MANAGEMENT
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedRes(null)}
                  className="p-1.5 hover:bg-neutral-800 rounded-xl text-zinc-400 hover:text-white transition-all border border-neutral-800/40"
                >
                  <X size={15} />
                </button>
              </div>

              {/* Scrollable details view */}
              <div className="p-5 space-y-5 overflow-y-auto max-h-[60vh]">
                
                {/* 1. VIP Badge Banner */}
                <div className="bg-gradient-to-br from-amber-500/5 to-amber-500/0 border border-amber-500/10 p-4 rounded-2xl flex items-center justify-between">
                  <div>
                    <span className="text-[10px] font-mono font-bold uppercase text-amber-500 tracking-wider">Customer Premium Rating</span>
                    <h4 className="text-sm font-black text-white">{selectedRes.userName} 고객님</h4>
                    <p className="text-[11px] text-zinc-400 font-semibold mt-0.5">{companyName} 누적 예약 건수: <span className="text-amber-500 font-bold font-mono">{visitCount}회</span></p>
                  </div>
                  <div className="bg-amber-500/10 border border-amber-500/20 p-2.5 rounded-xl">
                    <Award size={18} className="text-amber-500" />
                  </div>
                </div>

                {/* 2. Flight & Terminal Mapping Area */}
                <div className="space-y-3">
                  <h4 className="text-[11px] font-black text-zinc-500 uppercase tracking-wider">항공편 및 관영 스케줄 매핑</h4>
                  
                  {/* Departures */}
                  <div className="bg-neutral-950/40 border border-neutral-800/40 p-4 rounded-2xl space-y-3">
                    <div className="flex items-center gap-2 text-zinc-300 font-bold text-xs">
                      <PlaneTakeoff size={14} className="text-amber-500" />
                      <span>출국 정보</span>
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-xs pt-0.5">
                      <div>
                        <span className="text-[11px] text-zinc-500 font-bold block mb-0.5">출국 터미널</span>
                        {selectedRes.departureTerminal === 'T1' ? (
                          <span className="font-black text-[#00D2FF] bg-[#00D2FF]/10 px-2 py-0.5 rounded border border-[#00D2FF]/20">제 1여객터미널</span>
                        ) : (
                          <span className="font-black text-[#FFB800] bg-[#FFB800]/10 px-2 py-0.5 rounded border border-[#FFB800]/25">제 2여객터미널</span>
                        )}
                      </div>
                      <div>
                        <span className="text-[11px] text-zinc-500 font-bold block mb-0.5">항공편명</span>
                        <span className="font-black text-amber-400 font-mono tracking-wider">{depFlightCode}</span>
                      </div>
                    </div>
                    <div className="pt-2 text-[12px] border-t border-dashed border-neutral-800">
                      <span className="text-zinc-550 font-bold">주차 입고시간 : </span>
                      <span className="text-zinc-300 font-mono font-semibold">{selectedRes.departureDate} | {selectedRes.departureTime}</span>
                    </div>
                  </div>

                  {/* Arrivals */}
                  <div className="bg-neutral-950/40 border border-neutral-800/40 p-4 rounded-2xl space-y-3">
                    <div className="flex items-center gap-2 text-zinc-300 font-bold text-xs">
                      <PlaneLanding size={14} className="text-emerald-500" />
                      <span>입국 정보</span>
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-xs pt-0.5">
                      <div>
                        <span className="text-[11px] text-zinc-500 font-bold block mb-0.5">입국 터미널</span>
                        {selectedRes.arrivalTerminal === 'T1' ? (
                          <span className="font-black text-[#00D2FF] bg-[#00D2FF]/10 px-2 py-0.5 rounded border border-[#00D2FF]/20">제 1여객터미널</span>
                        ) : (
                          <span className="font-black text-[#FFB800] bg-[#FFB800]/10 px-2 py-0.5 rounded border border-[#FFB800]/25">제 2여객터미널</span>
                        )}
                      </div>
                      <div>
                        <span className="text-[11px] text-zinc-500 font-bold block mb-0.5">편명 (귀국)</span>
                        <span className="font-black text-emerald-400 font-mono tracking-wider">{arrFlightCode}</span>
                      </div>
                    </div>
                    <div className="pt-2 text-[12px] border-t border-dashed border-neutral-800">
                      <span className="text-zinc-550 font-bold">출차 반납시간 : </span>
                      <span className="text-zinc-300 font-mono font-semibold">{selectedRes.arrivalDate} | {selectedRes.arrivalTime}</span>
                    </div>
                  </div>
                </div>

                {/* 3. Detailed Client Identification */}
                <div className="space-y-3">
                  <h4 className="text-[11px] font-black text-zinc-500 uppercase tracking-wider">주문 및 차량상세</h4>
                  <div className="bg-neutral-950/20 border border-neutral-800/40 rounded-2xl p-4 space-y-2 text-xs">
                    <div className="flex justify-between py-1">
                      <span className="text-zinc-500 font-semibold">차량정보</span>
                      <span className="font-bold text-white font-mono">{selectedRes.carModel} ({selectedRes.carNumber})</span>
                    </div>
                    <div className="flex justify-between py-1">
                      <span className="text-zinc-500 font-semibold">위탁대행 제휴사</span>
                      <span className="font-extrabold text-stone-200">{selectedRes.companyName}</span>
                    </div>
                    <div className="flex justify-between py-1 items-center">
                      <span className="text-zinc-500 font-semibold">고강도 총액</span>
                      <span className="font-black text-amber-500 text-sm font-mono">{selectedRes.totalPrice.toLocaleString()}원</span>
                    </div>
                    <div className="flex justify-between py-1 items-center">
                      <span className="text-zinc-500 font-semibold">지정 주차구획</span>
                      <div className="flex items-center gap-1.5 font-mono">
                        <span className="font-extrabold text-neutral-200">{selectedSpace}</span>
                        {isSelectedIndoor ? (
                          <span className="text-[10px] px-1.5 py-0.2 rounded-[6px] bg-[#A855F7] text-white font-black shrink-0 tracking-tight">
                            실내
                          </span>
                        ) : (
                          <span className="text-[10px] px-1.5 py-0.2 rounded-[6px] bg-[#22C55E] text-white font-black shrink-0 tracking-tight">
                            야외
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* 4. One-click Mobile Dialer Area & Emergency Quicklink */}
                <div className="space-y-3">
                  <h4 className="text-[11px] font-black text-zinc-500 uppercase tracking-wider font-mono">Mobile Contact Action</h4>
                  <div className="bg-neutral-950/30 border border-zinc-800 p-4 rounded-2xl flex items-center justify-between">
                    <div>
                      <span className="text-[10.5px] text-zinc-500 block font-bold">고객 안전 연락처</span>
                      <span className="text-xs font-bold text-white font-mono">{selectedRes.phone}</span>
                    </div>
                    <a 
                      href={`tel:${selectedRes.phone}`} 
                      className="p-3 bg-amber-500 text-neutral-950 hover:bg-amber-400 active:scale-[0.95] rounded-xl duration-100 transition-all flex items-center gap-1.5 font-bold shadow-lg shadow-amber-500/10"
                    >
                      <PhoneCall size={14} />
                      <span className="text-[12px] font-black">즉시 통화</span>
                    </a>
                  </div>
                </div>

              </div>

              {/* Modal Footer Controls */}
              <div className="p-4 bg-neutral-900 border-t border-neutral-800/60 flex flex-col gap-2.5">
                {onUpdateStatus && (
                  <div className="flex gap-2 w-full">
                    {/* 강제 출고요청 버튼 (상태가 completed_in 일 때 활성화) */}
                    {selectedRes.status === 'completed_in' && (
                      <button
                        type="button"
                        onClick={async () => {
                          if (window.confirm("⚠️ 정말 강제로 출고요청 상태로 변경하시겠습니까?")) {
                            await onUpdateStatus(selectedRes.id!, 'request_out');
                            setSelectedRes(null);
                            alert("강제 출고요청 처리가 성공적으로 실행되었습니다.");
                          }
                        }}
                        className="flex-1 py-3 bg-red-950/85 hover:bg-rose-900/40 text-rose-450 border border-rose-500/20 rounded-xl text-[11.5px] font-black transition-all flex items-center justify-center gap-1"
                      >
                        🚨 강제 출고요청
                      </button>
                    )}

                    {/* 강제 반납완료 버튼 (상태가 completed_in 이거나 request_out 일 때 활성화) */}
                    {(selectedRes.status === 'completed_in' || selectedRes.status === 'request_out') && (
                      <button
                        type="button"
                        onClick={async () => {
                          if (window.confirm("⚠️ 정말 강제로 차량을 반납완료 처리하시겠습니까?")) {
                            const kstNow = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().replace('T', ' ').substring(0, 19);
                            await onUpdateStatus(selectedRes.id!, 'completed_out', {
                              actualExitTime: kstNow
                            });
                            setSelectedRes(null);
                            alert("강제 반납완료 처리가 성공적으로 실행되었습니다.");
                          }
                        }}
                        className="flex-1 py-3 bg-emerald-950/85 hover:bg-emerald-900/40 text-emerald-400 border border-emerald-500/20 rounded-xl text-[11.5px] font-black transition-all flex items-center justify-center gap-1"
                      >
                        ⚡ 강제 반납완료
                      </button>
                    )}
                  </div>
                )}
                
                <button
                  type="button"
                  onClick={() => setSelectedRes(null)}
                  className="w-full py-3.5 bg-neutral-800 hover:bg-neutral-750 text-white rounded-xl text-xs font-black transition-all border border-neutral-700/35"
                >
                  확인 및 닫기
                </button>
              </div>

            </div>
          </div>
        );
      })()}

    </div>
  );
}
