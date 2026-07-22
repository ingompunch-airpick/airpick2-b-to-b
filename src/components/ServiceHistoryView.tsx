import React, { useMemo } from 'react';
import { ArrowLeft, Copy, User, Calendar, Car, Tag, Landmark, ExternalLink, ClipboardCheck } from 'lucide-react';
import { Reservation } from '../types';
import { isAdmitted, isCompletedOut } from '../utils/reservationStatus';
import { airportShortName } from '../utils/airport';

interface ServiceHistoryViewProps {
  onBack: () => void;
  reservations: Reservation[];
}

export default function ServiceHistoryView({ onBack, reservations }: ServiceHistoryViewProps) {
  const [copiedId, setCopiedId] = React.useState<string | null>(null);

  // Obtain KST Date formatted as YYYY-MM-DD
  const getKSTDateString = () => {
    return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().split('T')[0];
  };

  const [todayStr, setTodayStr] = React.useState(() => getKSTDateString());

  // Automatically refresh date-related views when midnight KST rolls over
  React.useEffect(() => {
    const checkDateRollOver = () => {
      const currentTodayKST = getKSTDateString();
      setTodayStr((prevDate) => {
        if (prevDate !== currentTodayKST) {
          console.log(`[ServiceHistory Rollover] Midnight passed! Updating todayStr from ${prevDate} to ${currentTodayKST}`);
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

  // Filter completed reservations only
  const completedReservations = reservations.filter(res => isCompletedOut(res.status));

  // Compute live statistics for driver today (실데이터만, 없으면 0)
  const stats = useMemo(() => {
    const todayAdmitted = reservations.filter(r => 
      r.departureDate === todayStr && isAdmitted(r.status)
    ).length;

    const todayExited = reservations.filter(r => {
      if (!isCompletedOut(r.status)) return false;
      // actualExitTime(실제 출고 시각) 우선, 없으면 arrivalDate(예정일) fallback
      const exitDate = r.actualExitTime
        ? r.actualExitTime.slice(0, 10)
        : r.arrivalDate;
      return exitDate === todayStr;
    }).length;

    return { todayAdmitted, todayExited };
  }, [reservations, todayStr]);

  const handleCopyReceipt = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedId(code);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Group reservations by date
  const groupedHistory = completedReservations.reduce<{ [date: string]: Reservation[] }>((acc, res) => {
    // 실제 출고 시각 우선, 없으면 출고 예정일 fallback
    const rawDate = (res.actualExitTime ? res.actualExitTime.slice(0, 10) : null)
      || res.arrivalDate
      || res.departureDate;
    // Format date in Korean: e.g., "05월 22일(금)"
    let formattedDate = rawDate;
    try {
      const dateObj = new Date(rawDate);
      const options: Intl.DateTimeFormatOptions = { month: '2-digit', day: '2-digit', weekday: 'short' };
      formattedDate = dateObj.toLocaleDateString('ko-KR', options).replace(/ /g, '');
    } catch (_) {}

    const region = airportShortName(res.airport).replace(/공항$/, '') || '인천';
    const heading = `${formattedDate} · ${region}`;
    if (!acc[heading]) {
      acc[heading] = [];
    }
    acc[heading].push(res);
    return acc;
  }, {});

  const hasHistory = Object.keys(groupedHistory).length > 0;

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
          <h2 className="text-sm font-black tracking-tight text-white">나의 서비스 기록</h2>
          <p className="text-[12px] text-zinc-500 font-bold uppercase">My Driving & Service Logs</p>
        </div>
      </div>

      {/* 1. 상단 컴팩트 통계 위젯 (Compact Stats Widget) */}
      <div className="bg-gradient-to-br from-neutral-900 via-neutral-900 to-neutral-950 p-5 rounded-3xl border border-neutral-850 shadow-xl space-y-4 mb-6">
        <div className="flex items-center justify-between">
          <span className="text-[12.5px] font-black text-zinc-400 tracking-wider flex items-center gap-1.5 uppercase">
            <ClipboardCheck size={14} className="text-amber-500 animate-pulse" />
            당일 운행 현황 요약
          </span>
          <span className="text-[11.5px] font-mono text-zinc-500 font-bold bg-[#1C1C1E] px-2 py-0.5 rounded border border-neutral-800">
            {todayStr}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3.5">
          {/* 완료 건수 요약 카드 */}
          <div className="bg-[#A855F7]/10 p-4 border border-[#A855F7]/20 rounded-2xl flex flex-col justify-center gap-1.5">
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-[#A855F7]" />
              <span className="text-[12px] text-zinc-400 font-bold">주차 완료</span>
            </div>
            <span className="font-mono font-black text-xl text-[#A855F7]">{stats.todayAdmitted}건</span>
          </div>

          <div className="bg-[#22C55E]/10 p-4 border border-[#22C55E]/20 rounded-2xl flex flex-col justify-center gap-1.5">
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-[#22C55E]" />
              <span className="text-[12px] text-zinc-400 font-bold">출차 완료</span>
            </div>
            <span className="font-mono font-black text-xl text-[#22C55E]">{stats.todayExited}건</span>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between px-1 mb-4 select-none">
        <h3 className="text-[13px] text-zinc-400 font-black tracking-wider uppercase">
          전체 완료 서비스 히스토리 Log ({completedReservations.length}건)
        </h3>
        <span className="text-[11.5px] font-mono text-zinc-500 font-semibold uppercase">Completed Timelines</span>
      </div>

      {/* Spacing List of Historical Log Entries */}
      <div className="space-y-6">
        {hasHistory ? (
          Object.keys(groupedHistory).map((dateHeading, index) => (
            <div key={index} className="space-y-3">
              <h3 className="text-xs font-black text-amber-500 border-l-2 border-amber-500 pl-2.5 uppercase tracking-wide">
                {dateHeading}
              </h3>

              <div className="space-y-3">
                {groupedHistory[dateHeading].map((res, idx) => {
                  const rCode = res.receiptCode || '미발급';
                  return (
                    <div 
                      key={`${res.id || ''}-${idx}`}
                      className="p-4 bg-neutral-900 border border-neutral-850 rounded-2xl space-y-3 hover:border-neutral-750 transition-all font-sans"
                    >
                      <div className="grid grid-cols-2 gap-y-2 gap-x-3 text-[13px]">
                        <div className="flex flex-col">
                          <span className="text-zinc-500 font-bold">이용시간</span>
                          <span className="font-mono text-zinc-300 font-bold mt-0.5">
                            {res.departureTime || '-'} ~ {res.arrivalTime || '-'}
                          </span>
                        </div>
                        <div className="flex flex-col">
                          <span className="text-zinc-500 font-bold">주차지 배정</span>
                          <span className="text-zinc-300 font-bold mt-0.5">{res.parkingSpace || '미지정'}</span>
                        </div>

                        <div className="flex flex-col col-span-2 pt-1 border-t border-neutral-800/60">
                          <span className="text-zinc-500 font-bold">사용자 정보</span>
                          <span className="text-zinc-300 font-bold mt-0.5 flex items-center gap-1.5">
                            <User size={11} className="text-zinc-500" />
                            {res.userName} / <span className="font-mono">{res.phone}</span>
                          </span>
                        </div>

                        <div className="flex flex-col col-span-2 pt-1 border-t border-neutral-800/60">
                          <span className="text-zinc-500 font-bold">차량 및 승인내역</span>
                          <span className="text-amber-500/90 font-medium mt-0.5 flex items-center gap-1.5 select-all">
                            <Car size={11} />
                            (출차완료) {res.carNumber} ({res.carModel}) • <span className="text-zinc-450 text-[13px] font-medium">({res.paymentMethod || '선결'})</span>
                          </span>
                        </div>
                      </div>

                      {/* Receipt Code Box with Quick Clip Copy */}
                      <div className="mt-2 p-2.5 bg-neutral-950 rounded-xl border border-neutral-850 flex items-center justify-between text-[12px]">
                        <span className="text-zinc-500 font-mono tracking-tight flex items-center gap-1.5">
                          <Tag size={10} />
                          발급 영수증: <strong className="text-zinc-300 font-mono">{rCode}</strong>
                        </span>
                        
                        <button
                          onClick={() => handleCopyReceipt(rCode)}
                          className="p-1 hover:bg-neutral-800 rounded-lg text-zinc-400 hover:text-white transition-all flex items-center gap-1"
                        >
                          {copiedId === rCode ? (
                            <ClipboardCheck size={11} className="text-emerald-500" />
                          ) : (
                            <Copy size={11} />
                          )}
                        </button>
                      </div>

                    </div>
                  );
                })}
              </div>

            </div>
          ))
        ) : (
          <div className="py-16 flex flex-col items-center justify-center text-center gap-2 select-none">
            <ClipboardCheck size={28} className="text-neutral-700" />
            <p className="text-xs font-bold text-zinc-400">아직 완료된 서비스 기록이 없습니다</p>
            <p className="text-[12px] text-zinc-600">출차완료 처리된 차량이 여기에 표시됩니다.</p>
          </div>
        )}
      </div>
    </div>
  );
}
