import React, { useEffect, useMemo, useRef, useState } from 'react';
import { X, ChevronLeft, ChevronRight, CalendarRange, Check, Power } from 'lucide-react';
import { normalizeMaxCarsPerHour } from '../utils/hourlyCapacity';
import { normalizeMaxParkedCars } from '../utils/parkingCapacity';
import { normalizeMaxCarsPerDay } from '../utils/dailyIntakeCapacity';
import {
  hoursCoveredByRule,
  normalizeScheduleBlocks,
  scheduleBlockMessage,
  scheduleBlocksFromHours,
  type ScheduleBlockRule,
} from '../utils/scheduleBlock';
import {
  normalizeBookingLeadHours,
  sameDaySettingDetail,
  sameDaySettingFromCompany,
  sameDaySettingLabel,
  type SameDaySetting,
} from '../utils/bookingLead';
import { getAirportTerminals, resolveCompanyAirportId, type AirportTerminalDef } from '../utils/airport';
import type { Company } from '../types';

type Scene = 'usual' | 'date';
type BlockLeg = ScheduleBlockRule['leg'];

interface BlockoutCalendarModalProps {
  isOpen: boolean;
  onClose: () => void;
  blockedDates: string[];
  cancelCutoffHours?: number;
  sameDayBookingBlocked?: boolean;
  bookingLeadHours?: number;
  hourlyCapEnabled?: boolean;
  maxCarsPerHour?: number;
  parkingCapEnabled?: boolean;
  maxParkedCars?: number;
  dailyIntakeCapEnabled?: boolean;
  maxCarsPerDay?: number;
  scheduleBlocks?: ScheduleBlockRule[];
  company?: Pick<Company, 'airport'> | null;
  onSave: (settings: {
    blockedDates: string[];
    cancelCutoffHours: number;
    sameDayBookingBlocked: boolean;
    bookingLeadHours: number;
    hourlyCapEnabled: boolean;
    maxCarsPerHour: number;
    parkingCapEnabled: boolean;
    maxParkedCars: number;
    dailyIntakeCapEnabled: boolean;
    maxCarsPerDay: number;
    scheduleBlocks: ScheduleBlockRule[];
  }) => Promise<void>;
  companyIsOpen: boolean;
  onToggleCompanyOpen: (isOpen: boolean) => Promise<void>;
  companyName: string;
}

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
const MONTHS = ['1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월'];

function terminalChipLabel(terminal: AirportTerminalDef): string {
  if (terminal.code === 'T1') return '1터미널';
  if (terminal.code === 'T2') return '2터미널';
  return terminal.shortLabel;
}

function hoursForSelection(
  date: string,
  leg: BlockLeg,
  terminal: string,
  blocked: string[],
  rules: ScheduleBlockRule[]
): number[] {
  if (leg === 'intake' && terminal === 'all' && blocked.includes(date)) {
    return Array.from({ length: 24 }, (_, hour) => hour);
  }
  const hours = new Set<number>();
  for (const rule of rules) {
    if (rule.date !== date || rule.leg !== leg || rule.terminal !== terminal) continue;
    for (const hour of hoursCoveredByRule(rule)) hours.add(hour);
  }
  return [...hours].sort((a, b) => a - b);
}

function dayHasClose(date: string, blocked: string[], rules: ScheduleBlockRule[]): boolean {
  return blocked.includes(date) || rules.some((rule) => rule.date === date);
}

function blockedDateLine(date: string): string {
  const month = Number(date.slice(5, 7));
  const day = Number(date.slice(8, 10));
  return `${month}월 ${day}일 입고는 받지 않습니다.`;
}

export default function BlockoutCalendarModal({
  isOpen,
  onClose,
  blockedDates,
  cancelCutoffHours = 3,
  sameDayBookingBlocked = false,
  bookingLeadHours = 0,
  hourlyCapEnabled = false,
  maxCarsPerHour = 5,
  parkingCapEnabled = false,
  maxParkedCars = 50,
  dailyIntakeCapEnabled = false,
  maxCarsPerDay = 20,
  scheduleBlocks = [],
  company = null,
  onSave,
  companyIsOpen,
  onToggleCompanyOpen,
  companyName,
}: BlockoutCalendarModalProps) {
  const terminals = getAirportTerminals(resolveCompanyAirportId(company));
  const [scene, setScene] = useState<Scene>('usual');
  const [picked, setPicked] = useState<string | null>(null);
  const [leg, setLeg] = useState<BlockLeg>('exit');
  const [terminal, setTerminal] = useState('all');

  const [currentYear, setCurrentYear] = useState(() => {
    const kstDate = new Date(Date.now() + 9 * 60 * 60 * 1000);
    return kstDate.getUTCFullYear();
  });
  const [currentMonth, setCurrentMonth] = useState(() => {
    const kstDate = new Date(Date.now() + 9 * 60 * 60 * 1000);
    return kstDate.getUTCMonth();
  });

  const [localBlocked, setLocalBlocked] = useState<string[]>(() => [...blockedDates]);
  const [localSameDay, setLocalSameDay] = useState<SameDaySetting>(() =>
    sameDaySettingFromCompany({ sameDayBookingBlocked, bookingLeadHours })
  );
  const [localHourlyCapEnabled, setLocalHourlyCapEnabled] = useState(hourlyCapEnabled);
  const [localMaxCarsPerHour, setLocalMaxCarsPerHour] = useState(
    normalizeMaxCarsPerHour(maxCarsPerHour) || 5
  );
  const [localParkingCapEnabled, setLocalParkingCapEnabled] = useState(parkingCapEnabled);
  const [localMaxParkedCars, setLocalMaxParkedCars] = useState(
    normalizeMaxParkedCars(maxParkedCars) || 50
  );
  const [localDailyEnabled, setLocalDailyEnabled] = useState(dailyIntakeCapEnabled);
  const [localMaxCarsPerDay, setLocalMaxCarsPerDay] = useState(
    normalizeMaxCarsPerDay(maxCarsPerDay) || 20
  );
  const [localBlocks, setLocalBlocks] = useState<ScheduleBlockRule[]>(() =>
    normalizeScheduleBlocks(scheduleBlocks)
  );
  const [isSaving, setIsSaving] = useState(false);
  const syncedOpen = useRef(false);

  useEffect(() => {
    if (!isOpen) {
      syncedOpen.current = false;
      return;
    }
    if (syncedOpen.current) return;
    syncedOpen.current = true;
    setScene('usual');
    setPicked(null);
    setLeg('exit');
    setTerminal('all');
    setLocalBlocked([...blockedDates]);
    setLocalSameDay(sameDaySettingFromCompany({ sameDayBookingBlocked, bookingLeadHours }));
    setLocalHourlyCapEnabled(hourlyCapEnabled === true);
    setLocalMaxCarsPerHour(normalizeMaxCarsPerHour(maxCarsPerHour) || 5);
    setLocalParkingCapEnabled(parkingCapEnabled === true);
    setLocalMaxParkedCars(normalizeMaxParkedCars(maxParkedCars) || 50);
    setLocalDailyEnabled(dailyIntakeCapEnabled === true);
    setLocalMaxCarsPerDay(normalizeMaxCarsPerDay(maxCarsPerDay) || 20);
    setLocalBlocks(normalizeScheduleBlocks(scheduleBlocks));
  }, [
    isOpen,
    blockedDates,
    sameDayBookingBlocked,
    bookingLeadHours,
    hourlyCapEnabled,
    maxCarsPerHour,
    parkingCapEnabled,
    maxParkedCars,
    dailyIntakeCapEnabled,
    maxCarsPerDay,
    scheduleBlocks,
  ]);

  const closeLines = useMemo(() => {
    const blocked = new Set(localBlocked);
    const lines = localBlocked.map((date) => ({ date, text: blockedDateLine(date) }));
    for (const rule of localBlocks) {
      if (rule.leg === 'intake' && rule.terminal === 'all' && blocked.has(rule.date)) continue;
      lines.push({ date: rule.date, text: scheduleBlockMessage(rule) });
    }
    return lines.sort((a, b) => a.date.localeCompare(b.date) || a.text.localeCompare(b.text));
  }, [localBlocked, localBlocks]);

  if (!isOpen) return null;

  const handleSaveClick = async () => {
    setIsSaving(true);
    try {
      const closed = localSameDay === 'closed';
      await onSave({
        blockedDates: localBlocked,
        cancelCutoffHours: Math.max(0, Math.min(72, cancelCutoffHours || 0)),
        sameDayBookingBlocked: closed,
        bookingLeadHours: closed ? 0 : normalizeBookingLeadHours(localSameDay),
        hourlyCapEnabled: localHourlyCapEnabled,
        maxCarsPerHour: Math.max(1, normalizeMaxCarsPerHour(localMaxCarsPerHour) || 1),
        parkingCapEnabled: localParkingCapEnabled,
        maxParkedCars: Math.max(1, normalizeMaxParkedCars(localMaxParkedCars) || 1),
        dailyIntakeCapEnabled: localDailyEnabled,
        maxCarsPerDay: Math.max(1, normalizeMaxCarsPerDay(localMaxCarsPerDay) || 1),
        scheduleBlocks: localBlocks,
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

  const shiftSameDay = (dir: -1 | 1) => {
    setLocalSameDay((current) => {
      if (dir < 0) {
        if (current === 'closed') return 24;
        return Math.max(0, current - 1);
      }
      if (current === 'closed') return 'closed';
      return current >= 24 ? 'closed' : current + 1;
    });
  };

  const commitDay = (date: string, nextLeg: BlockLeg, nextTerminal: string, hours: number[]) => {
    const wholeIntake = nextLeg === 'intake' && nextTerminal === 'all' && hours.length === 24;
    setLocalBlocks((prev) => {
      let rest = prev.filter(
        (rule) => !(rule.date === date && rule.leg === nextLeg && rule.terminal === nextTerminal)
      );
      if (wholeIntake) rest = rest.filter((rule) => !(rule.date === date && rule.leg === 'intake'));
      if (hours.length === 0 || wholeIntake) return rest;
      return normalizeScheduleBlocks([
        ...rest,
        ...scheduleBlocksFromHours({
          date,
          leg: nextLeg,
          terminal: nextTerminal,
          hours,
        }),
      ]);
    });
    if (nextLeg === 'intake' && nextTerminal === 'all') {
      setLocalBlocked((prev) => {
        const without = prev.filter((item) => item !== date);
        return wholeIntake ? [...without, date] : without;
      });
    }
    setPicked(null);
  };

  const shiftMonth = (dir: -1 | 1) => {
    if (dir < 0) {
      if (currentMonth === 0) {
        setCurrentMonth(11);
        setCurrentYear((year) => year - 1);
      } else {
        setCurrentMonth((month) => month - 1);
      }
      return;
    }
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear((year) => year + 1);
    } else {
      setCurrentMonth((month) => month + 1);
    }
  };

  const firstDayIndex = new Date(currentYear, currentMonth, 1).getDay();
  const totalDays = new Date(currentYear, currentMonth + 1, 0).getDate();

  const stepBtn =
    'px-3 py-1.5 rounded-xl text-[13px] font-black border border-neutral-700 bg-neutral-900 text-zinc-200 disabled:opacity-40';

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-neutral-950/80 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-lg bg-[#121212] rounded-2xl border border-neutral-800/80 overflow-hidden shadow-2xl flex flex-col relative max-h-[90vh]">
        <div className="p-4.5 border-b border-neutral-800/50 flex items-center justify-between bg-[#121212]">
          <div className="flex items-center gap-2 min-w-0">
            <CalendarRange size={16} className="text-amber-500 shrink-0" />
            <div className="min-w-0">
              <h3 className="text-sm font-black text-white truncate">예약 관리</h3>
              <p className="text-[11px] text-zinc-400 font-bold tracking-tight truncate">{companyName}</p>
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

        <div className="px-4.5 pt-3">
          <div className="grid grid-cols-2 gap-1 p-1 bg-neutral-900/80 rounded-xl border border-neutral-800/60">
            {(
              [
                ['usual', '접수'],
                ['date', '날짜 마감'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => {
                  setScene(id);
                  setPicked(null);
                }}
                className={`py-2 rounded-lg text-[12px] font-black transition-all ${
                  scene === id ? 'bg-amber-500 text-neutral-950' : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-y-auto p-4.5 space-y-3">
          {scene === 'usual' ? (
            <>
              <SettingRow
                label="신규 예약"
                detail={companyIsOpen ? '받는 중' : '받지 않음'}
                aside="즉시 적용"
              >
                <button
                  type="button"
                  onClick={() => void onToggleCompanyOpen(!companyIsOpen)}
                  className={`px-3 py-1.5 rounded-xl text-[12px] font-black border shrink-0 ${
                    companyIsOpen
                      ? 'bg-emerald-500 text-neutral-950 border-emerald-600/20'
                      : 'bg-red-600 text-white border-red-500/25'
                  }`}
                >
                  <span className="inline-flex items-center gap-1">
                    <Power size={12} />
                    {companyIsOpen ? '받는 중' : '받지 않음'}
                  </span>
                </button>
              </SettingRow>

              <div className="p-3.5 bg-[#141416]/90 border border-neutral-800/85 rounded-2xl space-y-2.5">
                <div>
                  <p className="text-[12px] font-black text-zinc-200">당일 예약</p>
                  <p className="text-[11px] text-zinc-500 mt-0.5">{sameDaySettingDetail(localSameDay)}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className={stepBtn}
                    disabled={localSameDay === 0}
                    onClick={() => shiftSameDay(-1)}
                  >
                    −
                  </button>
                  <p className="flex-1 text-center text-[13px] font-black text-white">
                    {sameDaySettingLabel(localSameDay)}
                  </p>
                  <button
                    type="button"
                    className={stepBtn}
                    disabled={localSameDay === 'closed'}
                    onClick={() => shiftSameDay(1)}
                  >
                    +
                  </button>
                </div>
              </div>

              <CountRow
                label="하루 대수"
                on={localDailyEnabled}
                onToggle={() => setLocalDailyEnabled((v) => !v)}
                value={localMaxCarsPerDay}
                onValue={(n) => setLocalMaxCarsPerDay(normalizeMaxCarsPerDay(n) || 1)}
                onText={localDailyEnabled ? `날짜마다 ${localMaxCarsPerDay}대까지` : '대수 제한 없음'}
                unit="대 / 하루"
              />
              <CountRow
                label="시간당 대수"
                on={localHourlyCapEnabled}
                onToggle={() => setLocalHourlyCapEnabled((v) => !v)}
                value={localMaxCarsPerHour}
                onValue={(n) => setLocalMaxCarsPerHour(normalizeMaxCarsPerHour(n) || 1)}
                onText={localHourlyCapEnabled ? `한 시간 ${localMaxCarsPerHour}대까지` : '대수 제한 없음'}
                unit="대 / 시간"
                max={99}
              />
              <CountRow
                label="주차 대수"
                on={localParkingCapEnabled}
                onToggle={() => setLocalParkingCapEnabled((v) => !v)}
                value={localMaxParkedCars}
                onValue={(n) => setLocalMaxParkedCars(normalizeMaxParkedCars(n) || 1)}
                onText={
                  localParkingCapEnabled
                    ? `겹치는 날 ${localMaxParkedCars}대까지`
                    : '대수 제한 없음'
                }
                unit="대"
              />
            </>
          ) : picked ? (
            <DayEditor
              key={`${picked}-${leg}-${terminal}`}
              date={picked}
              leg={leg}
              terminal={terminal}
              terminals={terminals}
              initialHours={hoursForSelection(picked, leg, terminal, localBlocked, localBlocks)}
              saved={
                (leg === 'intake' && terminal === 'all' && localBlocked.includes(picked)) ||
                localBlocks.some(
                  (rule) => rule.date === picked && rule.leg === leg && rule.terminal === terminal
                )
              }
              onLeg={setLeg}
              onTerminal={setTerminal}
              onBack={() => setPicked(null)}
              onCommit={(hours) => commitDay(picked, leg, terminal, hours)}
              onRemove={() => commitDay(picked, leg, terminal, [])}
            />
          ) : (
            <>
              <div className="flex items-center justify-between">
                <button type="button" onClick={() => shiftMonth(-1)} className="p-1.5 text-zinc-400 hover:text-white">
                  <ChevronLeft size={18} />
                </button>
                <p className="text-[13px] font-black text-white">
                  {currentYear}년 {MONTHS[currentMonth]}
                </p>
                <button type="button" onClick={() => shiftMonth(1)} className="p-1.5 text-zinc-400 hover:text-white">
                  <ChevronRight size={18} />
                </button>
              </div>
              <p className="text-[11px] text-zinc-500">
                이미 받은 예약은 그대로 두고, 지금 이후 접수만 닫습니다.
              </p>
              <div className="grid grid-cols-7 gap-1">
                {WEEKDAYS.map((name) => (
                  <div key={name} className="text-center text-[10px] font-bold text-zinc-500 py-1">
                    {name}
                  </div>
                ))}
                {Array.from({ length: firstDayIndex }, (_, i) => (
                  <div key={`pad-${i}`} />
                ))}
                {Array.from({ length: totalDays }, (_, i) => {
                  const day = i + 1;
                  const date = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                  const marked = dayHasClose(date, localBlocked, localBlocks);
                  return (
                    <button
                      key={date}
                      type="button"
                      onClick={() => {
                        if (localBlocked.includes(date)) {
                          setLeg('intake');
                          setTerminal('all');
                        } else {
                          const rule = localBlocks.find((item) => item.date === date);
                          if (rule) {
                            setLeg(rule.leg);
                            setTerminal(rule.terminal || 'all');
                          }
                        }
                        setPicked(date);
                      }}
                      className={`h-9 rounded-lg text-[12px] font-black border ${
                        marked
                          ? 'border-amber-500/70 bg-amber-500/15 text-amber-200'
                          : 'border-neutral-800 text-zinc-200 hover:border-neutral-600'
                      }`}
                    >
                      {day}
                    </button>
                  );
                })}
              </div>
              {closeLines.length > 0 ? (
                <div className="space-y-1.5">
                  {closeLines.map((line) => (
                    <p key={`${line.date}-${line.text}`} className="text-[12px] font-semibold text-zinc-200 leading-snug">
                      {line.text}
                    </p>
                  ))}
                </div>
              ) : null}
            </>
          )}
        </div>

        <div className="p-4 bg-[#141416]/50 border-t border-neutral-800/60 flex gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-3 text-xs bg-neutral-900 hover:bg-neutral-850 text-zinc-400 hover:text-white rounded-xl font-bold transition-all border border-neutral-800/50"
          >
            닫기
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

function SettingRow({
  label,
  detail,
  aside,
  children,
}: {
  label: string;
  detail: string;
  aside?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="p-3.5 bg-[#141416]/90 border border-neutral-800/85 rounded-2xl flex items-center justify-between gap-3">
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <p className="text-[12px] font-black text-zinc-200">{label}</p>
          {aside ? (
            <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/25">
              {aside}
            </span>
          ) : null}
        </div>
        <p className="text-[11px] text-zinc-500 mt-0.5">{detail}</p>
      </div>
      {children}
    </div>
  );
}

function CountRow({
  label,
  on,
  onToggle,
  value,
  onValue,
  onText,
  unit,
  max = 999,
}: {
  label: string;
  on: boolean;
  onToggle: () => void;
  value: number;
  onValue: (n: number) => void;
  onText: string;
  unit: string;
  max?: number;
}) {
  return (
    <div className="p-3.5 bg-[#141416]/90 border border-neutral-800/85 rounded-2xl space-y-2.5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[12px] font-black text-zinc-200">{label}</p>
          <p className="text-[11px] text-zinc-500 mt-0.5">{onText}</p>
        </div>
        <button
          type="button"
          onClick={onToggle}
          className={`px-3 py-1.5 rounded-xl text-[12px] font-black border shrink-0 ${
            on
              ? 'bg-amber-500/15 text-amber-400 border-amber-500/30'
              : 'bg-neutral-900 text-zinc-400 border-neutral-800'
          }`}
        >
          {on ? '켜짐' : '꺼짐'}
        </button>
      </div>
      {on ? (
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={1}
            max={max}
            value={value}
            onChange={(e) => onValue(Number(e.target.value))}
            className="w-24 px-3 py-2 bg-neutral-950 border border-neutral-800 rounded-xl text-white text-sm font-bold text-center"
          />
          <span className="text-[12px] text-zinc-400 font-bold">{unit}</span>
        </div>
      ) : null}
    </div>
  );
}

function DayEditor({
  date,
  leg,
  terminal,
  terminals,
  initialHours,
  saved,
  onLeg,
  onTerminal,
  onBack,
  onCommit,
  onRemove,
}: {
  date: string;
  leg: BlockLeg;
  terminal: string;
  terminals: AirportTerminalDef[];
  initialHours: number[];
  saved: boolean;
  onLeg: (leg: BlockLeg) => void;
  onTerminal: (terminal: string) => void;
  onBack: () => void;
  onCommit: (hours: number[]) => void;
  onRemove: () => void;
}) {
  const [hours, setHours] = useState<number[]>(initialHours);
  const drafts = scheduleBlocksFromHours({ date, leg, terminal, hours });
  const chip = (on: boolean) =>
    `px-2.5 py-1.5 rounded-lg text-[11px] font-black border ${
      on ? 'bg-amber-500 text-neutral-950 border-amber-500' : 'bg-neutral-900 text-zinc-300 border-neutral-800'
    }`;
  const month = Number(date.slice(5, 7));
  const day = Number(date.slice(8, 10));

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <button type="button" onClick={onBack} className={`${chip(false)} shrink-0`}>
          달력
        </button>
        <p className="text-[13px] font-black text-white">
          {month}월 {day}일
        </p>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <button type="button" className={chip(leg === 'intake')} onClick={() => onLeg('intake')}>
          입고
        </button>
        <button type="button" className={chip(leg === 'exit')} onClick={() => onLeg('exit')}>
          출고
        </button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <button type="button" className={chip(terminal === 'all')} onClick={() => onTerminal('all')}>
          전체
        </button>
        {terminals.map((item) => (
          <button
            key={item.code}
            type="button"
            className={chip(terminal === item.code)}
            onClick={() => onTerminal(item.code)}
          >
            {terminalChipLabel(item)}
          </button>
        ))}
      </div>
      <p className="text-[11px] text-zinc-500">닫을 시간을 누릅니다. 이어진 시간은 한 구간이 됩니다.</p>
      <div className="grid grid-cols-2 gap-1.5">
        <button
          type="button"
          className={`${chip(hours.length === 24)} col-span-2`}
          onClick={() =>
            setHours(hours.length === 24 ? [] : Array.from({ length: 24 }, (_, hour) => hour))
          }
        >
          하루 종일
        </button>
        {Array.from({ length: 24 }, (_, hour) => {
          const hh = String(hour).padStart(2, '0');
          const on = hours.includes(hour);
          return (
            <button
              key={hour}
              type="button"
              className={chip(on)}
              onClick={() =>
                setHours((prev) =>
                  prev.includes(hour) ? prev.filter((item) => item !== hour) : [...prev, hour]
                )
              }
            >
              {hh}:00 ~ {hh}:50
            </button>
          );
        })}
      </div>
      {drafts.length > 0 ? (
        <div className="space-y-1">
          {drafts.map((rule) => (
            <p key={rule.id} className="text-[12px] font-semibold text-zinc-100">
              {scheduleBlockMessage(rule)}
            </p>
          ))}
        </div>
      ) : (
        <p className="text-[12px] text-zinc-500">이 터미널은 이날 그대로 받습니다.</p>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          disabled={hours.length === 0}
          onClick={() => onCommit(hours)}
          className="px-4 py-2 rounded-xl bg-amber-500 text-neutral-950 text-[12px] font-black disabled:opacity-40"
        >
          마감
        </button>
        {saved ? (
          <button
            type="button"
            onClick={onRemove}
            className="px-4 py-2 rounded-xl text-[12px] font-black text-zinc-300 border border-neutral-700"
          >
            해제
          </button>
        ) : null}
      </div>
    </div>
  );
}
