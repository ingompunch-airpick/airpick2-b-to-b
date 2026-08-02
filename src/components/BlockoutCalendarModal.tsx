import React, { useState, useEffect, useMemo } from 'react';
import { X, ChevronLeft, ChevronRight, CalendarRange, Info, Check, Power } from 'lucide-react';
import { normalizeMaxCarsPerHour } from '../utils/hourlyCapacity';
import { normalizeMaxParkedCars } from '../utils/parkingCapacity';

type BookingPolicyTab = 'intake' | 'capacity' | 'dates';

interface BlockoutCalendarModalProps {
  isOpen: boolean;
  onClose: () => void;
  blockedDates: string[];
  cancelCutoffHours?: number;
  sameDayBookingBlocked?: boolean;
  hourlyCapEnabled?: boolean;
  maxCarsPerHour?: number;
  parkingCapEnabled?: boolean;
  maxParkedCars?: number;
  onSave: (settings: {
    blockedDates: string[];
    cancelCutoffHours: number;
    sameDayBookingBlocked: boolean;
    hourlyCapEnabled: boolean;
    maxCarsPerHour: number;
    parkingCapEnabled: boolean;
    maxParkedCars: number;
  }) => Promise<void>;
  companyIsOpen: boolean;
  onToggleCompanyOpen: (isOpen: boolean) => Promise<void>;
  companyName: string;
}

const TABS: { id: BookingPolicyTab; label: string }[] = [
  { id: 'intake', label: '접수' },
  { id: 'capacity', label: '대수' },
  { id: 'dates', label: '날짜' },
];

export default function BlockoutCalendarModal({
  isOpen,
  onClose,
  blockedDates,
  cancelCutoffHours = 3,
  sameDayBookingBlocked = false,
  hourlyCapEnabled = false,
  maxCarsPerHour = 5,
  parkingCapEnabled = false,
  maxParkedCars = 50,
  onSave,
  companyIsOpen,
  onToggleCompanyOpen,
  companyName,
}: BlockoutCalendarModalProps) {
  const [activeTab, setActiveTab] = useState<BookingPolicyTab>('intake');

  const [currentYear, setCurrentYear] = useState<number>(() => {
    const kstDate = new Date(Date.now() + 9 * 60 * 60 * 1000);
    return kstDate.getUTCFullYear();
  });
  const [currentMonth, setCurrentMonth] = useState<number>(() => {
    const kstDate = new Date(Date.now() + 9 * 60 * 60 * 1000);
    return kstDate.getUTCMonth();
  });

  const [localBlocked, setLocalBlocked] = useState<string[]>(() => [...blockedDates]);
  const [localSameDayBlocked, setLocalSameDayBlocked] = useState<boolean>(sameDayBookingBlocked);
  const [localHourlyCapEnabled, setLocalHourlyCapEnabled] = useState<boolean>(hourlyCapEnabled);
  const [localMaxCarsPerHour, setLocalMaxCarsPerHour] = useState<number>(
    normalizeMaxCarsPerHour(maxCarsPerHour) || 5
  );
  const [localParkingCapEnabled, setLocalParkingCapEnabled] = useState<boolean>(parkingCapEnabled);
  const [localMaxParkedCars, setLocalMaxParkedCars] = useState<number>(
    normalizeMaxParkedCars(maxParkedCars) || 50
  );
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setActiveTab('intake');
    setLocalBlocked([...blockedDates]);
    setLocalSameDayBlocked(sameDayBookingBlocked);
    setLocalHourlyCapEnabled(hourlyCapEnabled === true);
    setLocalMaxCarsPerHour(normalizeMaxCarsPerHour(maxCarsPerHour) || 5);
    setLocalParkingCapEnabled(parkingCapEnabled === true);
    setLocalMaxParkedCars(normalizeMaxParkedCars(maxParkedCars) || 50);
  }, [
    isOpen,
    blockedDates,
    sameDayBookingBlocked,
    hourlyCapEnabled,
    maxCarsPerHour,
    parkingCapEnabled,
    maxParkedCars,
  ]);

  const statusSummary = useMemo(() => {
    const parts: string[] = [];
    parts.push(companyIsOpen ? '접수 중' : '전체 마감');
    if (localSameDayBlocked) parts.push('당일 차단');
    if (localHourlyCapEnabled) {
      parts.push(`시간당 ${localMaxCarsPerHour}대`);
    }
    if (localParkingCapEnabled) {
      parts.push(`동시 ${localMaxParkedCars}대`);
    }
    if (localBlocked.length > 0) {
      parts.push(`마감일 ${localBlocked.length}개`);
    }
    return parts.join(' · ');
  }, [
    companyIsOpen,
    localSameDayBlocked,
    localHourlyCapEnabled,
    localMaxCarsPerHour,
    localParkingCapEnabled,
    localMaxParkedCars,
    localBlocked.length,
  ]);

  if (!isOpen) return null;

  const handleReset = () => {
    setLocalBlocked([...blockedDates]);
    setLocalSameDayBlocked(sameDayBookingBlocked);
    setLocalHourlyCapEnabled(hourlyCapEnabled === true);
    setLocalMaxCarsPerHour(normalizeMaxCarsPerHour(maxCarsPerHour) || 5);
    setLocalParkingCapEnabled(parkingCapEnabled === true);
    setLocalMaxParkedCars(normalizeMaxParkedCars(maxParkedCars) || 50);
  };

  const monthsKR = [
    '1월', '2월', '3월', '4월', '5월', '6월',
    '7월', '8월', '9월', '10월', '11월', '12월',
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

  const firstDayIndex = new Date(currentYear, currentMonth, 1).getDay();
  const totalDays = new Date(currentYear, currentMonth + 1, 0).getDate();
  const calendarCells: { dateStr: string | null; dayNum: number | null }[] = [];

  for (let i = 0; i < firstDayIndex; i++) {
    calendarCells.push({ dateStr: null, dayNum: null });
  }
  for (let d = 1; d <= totalDays; d++) {
    const mm = String(currentMonth + 1).padStart(2, '0');
    const dd = String(d).padStart(2, '0');
    calendarCells.push({ dateStr: `${currentYear}-${mm}-${dd}`, dayNum: d });
  }

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
        cancelCutoffHours: Math.max(0, Math.min(72, cancelCutoffHours || 0)),
        sameDayBookingBlocked: localSameDayBlocked,
        hourlyCapEnabled: localHourlyCapEnabled,
        maxCarsPerHour: Math.max(1, normalizeMaxCarsPerHour(localMaxCarsPerHour) || 1),
        parkingCapEnabled: localParkingCapEnabled,
        maxParkedCars: Math.max(1, normalizeMaxParkedCars(localMaxParkedCars) || 1),
      });
      alert('예약 정책이 성공적으로 저장되었습니다.');
      onClose();
    } catch (err) {
      console.error(err);
      alert('설정 저장 중 연동오류가 발생했습니다.');
    } finally {
      setIsSaving(false);
    }
  };

  const weekdays = ['일', '월', '화', '수', '목', '금', '토'];

  const toggleBtnClass = (on: boolean) =>
    `px-3 py-1.5 rounded-xl text-[12px] font-black border shrink-0 ${
      on
        ? 'bg-amber-500/15 text-amber-400 border-amber-500/30'
        : 'bg-neutral-900 text-zinc-400 border-neutral-800'
    }`;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-neutral-950/80 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-sm bg-[#121212] rounded-2xl border border-neutral-800/80 overflow-hidden shadow-2xl flex flex-col relative">
        <div className="p-4.5 border-b border-neutral-800/50 flex items-center justify-between bg-[#121212]">
          <div className="flex items-center gap-2 min-w-0">
            <CalendarRange size={16} className="text-amber-500 shrink-0" />
            <div className="min-w-0">
              <h3 className="text-sm font-black text-white truncate">예약 관리</h3>
              <p className="text-[11px] text-zinc-400 font-bold tracking-tight truncate">
                {companyName} · 신규 예약 제한
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 hover:bg-neutral-800 rounded-xl text-zinc-300 hover:text-white transition-all border border-neutral-800/40 shrink-0"
          >
            <X size={14} />
          </button>
        </div>

        {/* 상태 요약 */}
        <div className="px-4.5 pt-3 pb-2 border-b border-neutral-800/30">
          <p className="text-[11px] text-zinc-400 font-semibold leading-relaxed">{statusSummary}</p>
        </div>

        {/* 탭 */}
        <div className="px-4.5 pt-3">
          <div className="grid grid-cols-3 gap-1 p-1 bg-neutral-900/80 rounded-xl border border-neutral-800/60">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`py-2 rounded-lg text-[12px] font-black transition-all ${
                  activeTab === tab.id
                    ? 'bg-amber-500 text-neutral-950'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-y-auto max-h-[60vh] p-4.5 space-y-3">
          {activeTab === 'intake' && (
            <>
              <div className="p-3.5 bg-[#141416]/90 border border-neutral-800/85 rounded-2xl space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div
                      className={`w-8 h-8 rounded-xl flex items-center justify-center border shrink-0 ${
                        companyIsOpen
                          ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                          : 'bg-red-500/10 border-red-500/20 text-red-500'
                      }`}
                    >
                      <Power size={13} className="stroke-[2.5]" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <h4 className="text-[12.5px] font-black text-white">전체 마감</h4>
                        <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/25">
                          즉시 적용
                        </span>
                      </div>
                      <p className="text-[11px] text-zinc-500 mt-0.5">모든 신규 예약 ON/OFF</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={async () => {
                      await onToggleCompanyOpen(!companyIsOpen);
                    }}
                    className={`px-3 py-1.5 rounded-xl transition-all text-[12px] font-black border shrink-0 ${
                      companyIsOpen
                        ? 'bg-emerald-500 hover:bg-emerald-400 text-neutral-950 border-emerald-600/20'
                        : 'bg-red-600 hover:bg-red-500 text-white border-red-500/25'
                    }`}
                  >
                    {companyIsOpen ? '접수 중' : '마감'}
                  </button>
                </div>
              </div>

              <div className="p-3.5 bg-[#141416]/90 border border-neutral-800/85 rounded-2xl">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <p className="text-[12px] font-black text-zinc-200">당일 예약 차단</p>
                      <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-neutral-700">
                        저장 필요
                      </span>
                    </div>
                    <p className="text-[11px] text-zinc-500 mt-0.5">입고일이 오늘인 예약 차단</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setLocalSameDayBlocked((v) => !v)}
                    className={toggleBtnClass(localSameDayBlocked)}
                  >
                    {localSameDayBlocked ? '차단 ON' : '허용'}
                  </button>
                </div>
              </div>
            </>
          )}

          {activeTab === 'capacity' && (
            <>
              <div className="p-3.5 bg-[#141416]/90 border border-neutral-800/85 rounded-2xl space-y-2.5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[12px] font-black text-zinc-200">시간당 입고 한도</p>
                    <p className="text-[11px] text-zinc-500 mt-0.5">입고 시각 기준 · 홈·앱·현장 합산</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setLocalHourlyCapEnabled((v) => !v)}
                    className={toggleBtnClass(localHourlyCapEnabled)}
                  >
                    {localHourlyCapEnabled ? '사용 ON' : 'OFF'}
                  </button>
                </div>
                {localHourlyCapEnabled ? (
                  <div className="flex items-center gap-2 pt-1">
                    <input
                      type="number"
                      min={1}
                      max={99}
                      value={localMaxCarsPerHour}
                      onChange={(e) =>
                        setLocalMaxCarsPerHour(normalizeMaxCarsPerHour(e.target.value) || 1)
                      }
                      className="w-20 px-3 py-2 bg-neutral-950 border border-neutral-800 rounded-xl text-white text-sm font-bold text-center"
                    />
                    <span className="text-[12px] text-zinc-400 font-bold">대 / 시간</span>
                  </div>
                ) : null}
              </div>

              <div className="p-3.5 bg-[#141416]/90 border border-neutral-800/85 rounded-2xl space-y-2.5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[12px] font-black text-zinc-200">동시 주차 대수</p>
                    <p className="text-[11px] text-zinc-500 mt-0.5">입고~출고 겹침 · 만차 시 차단</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setLocalParkingCapEnabled((v) => !v)}
                    className={toggleBtnClass(localParkingCapEnabled)}
                  >
                    {localParkingCapEnabled ? '사용 ON' : 'OFF'}
                  </button>
                </div>
                {localParkingCapEnabled ? (
                  <div className="flex items-center gap-2 pt-1">
                    <input
                      type="number"
                      min={1}
                      max={999}
                      value={localMaxParkedCars}
                      onChange={(e) =>
                        setLocalMaxParkedCars(normalizeMaxParkedCars(e.target.value) || 1)
                      }
                      className="w-24 px-3 py-2 bg-neutral-950 border border-neutral-800 rounded-xl text-white text-sm font-bold text-center"
                    />
                    <span className="text-[12px] text-zinc-400 font-bold">대 (동시)</span>
                  </div>
                ) : null}
              </div>

              <p className="text-[11px] text-zinc-500 px-1 font-semibold">
                변경 후 아래 <span className="text-zinc-300">저장하기</span>를 눌러야 적용됩니다.
              </p>
            </>
          )}

          {activeTab === 'dates' && (
            <>
              <div className="flex items-center justify-between px-1">
                <button
                  type="button"
                  onClick={handlePrevMonth}
                  className="p-2 bg-neutral-900/45 hover:bg-neutral-800 text-zinc-300 hover:text-white rounded-xl transition-all border border-neutral-800/20"
                >
                  <ChevronLeft size={14} />
                </button>
                <div className="text-center">
                  <h4 className="text-[12px] font-black tracking-tight text-zinc-400">입고일 마감</h4>
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

              <div className="bg-amber-500/5 border border-amber-500/10 p-2.5 rounded-xl flex items-start gap-2 text-[11px] text-zinc-400">
                <Info size={12} className="text-amber-500 shrink-0 mt-0.5" />
                <p className="leading-relaxed">
                  빨간 날은 <strong className="text-amber-400/90">입고일</strong>로 받지 않습니다. (출고일은
                  해당 없음)
                </p>
              </div>

              <div>
                <div className="grid grid-cols-7 text-center text-[11px] font-black text-zinc-400 tracking-wider mb-2 font-mono">
                  {weekdays.map((day, idx) => (
                    <div
                      key={day}
                      className={
                        idx === 0 ? 'text-red-500/90' : idx === 6 ? 'text-blue-400/90' : 'text-neutral-300'
                      }
                    >
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
                            ? 'bg-red-600 border-red-500 text-white font-black shadow-lg shadow-red-650/10'
                            : 'bg-neutral-900/90 hover:bg-neutral-850 border-neutral-800/40 text-white'
                        }`}
                      >
                        {cell.dayNum}
                      </button>
                    );
                  })}
                </div>
              </div>

              <p className="text-[11px] text-zinc-500 px-1 font-semibold">
                변경 후 아래 <span className="text-zinc-300">저장하기</span>를 눌러야 적용됩니다.
              </p>
            </>
          )}
        </div>

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
            className="flex-1 py-3 text-xs bg-[#F12B2B] hover:bg-[#D11F1F] text-white rounded-xl font-black transition-all flex items-center justify-center gap-1.5 shadow-lg shadow-red-600/10 disabled:opacity-70"
          >
            <Check size={13} className="stroke-[3]" />
            {isSaving ? '저장 중…' : '저장하기'}
          </button>
        </div>
      </div>
    </div>
  );
}
