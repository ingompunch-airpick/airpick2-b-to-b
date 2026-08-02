import React, { useMemo, useState, useEffect } from 'react';
import { ArrowLeft, Copy, Search, X, ClipboardCheck } from 'lucide-react';
import { Reservation, ReservationStatus } from '../types';
import {
  isAdmitted,
  isCompletedOut,
  normalizeReservationStatus,
  statusBadgeColorClass,
} from '../utils/reservationStatus';
import { isReservationUnpaid } from '../utils/paymentStatus';
import { airportShortName } from '../utils/airport';
import { isGenericParkingSpaceLabel } from '../utils/parkingLot';

function cn(...classes: (string | boolean | undefined | null)[]) {
  return classes.filter(Boolean).join(' ');
}

type PeriodFilter = 'today' | '7d' | '30d' | 'all';

const PERIOD_OPTIONS: { id: PeriodFilter; label: string }[] = [
  { id: 'today', label: '오늘' },
  { id: '7d', label: '7일' },
  { id: '30d', label: '30일' },
  { id: 'all', label: '전체' },
];

/** 입고 시작 이후(실제로 움직인 차). 예약완료·취소는 제외 */
function isMovedReservation(status: Reservation['status']): boolean {
  const s = normalizeReservationStatus(status);
  return (
    s === 'pending_in' ||
    s === 'completed_in' ||
    s === 'request_out' ||
    s === 'completed_out'
  );
}

/** 타임라인 탭과 맞춘 짧은 상태 라벨 */
function serviceStatusLabel(status: Reservation['status']): string {
  const s = normalizeReservationStatus(status);
  const map: Partial<Record<ReservationStatus, string>> = {
    pending_in: '입고',
    completed_in: '출고예정',
    request_out: '출고',
    completed_out: '출차완료',
  };
  return map[s] || s;
}

function getKSTDateString() {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().split('T')[0];
}

/** KST 달력일(YYYY-MM-DD)에서 n일 전 */
function dateDaysBefore(todayStr: string, days: number): string {
  const [y, m, d] = todayStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d) - days * 86400000).toISOString().slice(0, 10);
}

function dateKeyFromMaybeIso(raw?: string | null): string {
  if (!raw || raw.length < 10) return '';
  return raw.slice(0, 10);
}

/** 기간·그룹용 — 출차일 > 실제입고일 > 상태별 예정일 */
function getActivityDateKey(res: Reservation): string {
  const exit = dateKeyFromMaybeIso(res.actualExitTime);
  if (exit) return exit;
  const parked = dateKeyFromMaybeIso(res.actualParkingTime);
  if (parked) return parked;

  const s = normalizeReservationStatus(res.status);
  if (s === 'request_out' || s === 'completed_out') {
    return (res.arrivalDate || res.departureDate || dateKeyFromMaybeIso(res.updatedAt) || '').slice(0, 10);
  }
  return (res.departureDate || res.arrivalDate || dateKeyFromMaybeIso(res.updatedAt) || '').slice(0, 10);
}

function getActivitySortMs(res: Reservation): number {
  if (res.updatedAt) {
    const ms = new Date(res.updatedAt).getTime();
    if (Number.isFinite(ms)) return ms;
  }
  if (res.actualExitTime) {
    const ms = new Date(res.actualExitTime).getTime();
    if (Number.isFinite(ms)) return ms;
  }
  if (res.actualParkingTime) {
    const ms = new Date(res.actualParkingTime).getTime();
    if (Number.isFinite(ms)) return ms;
  }
  const day = getActivityDateKey(res);
  if (!day) return 0;
  const s = normalizeReservationStatus(res.status);
  const timeRaw =
    s === 'request_out' || s === 'completed_out'
      ? res.arrivalTime || '00:00'
      : res.departureTime || '00:00';
  const m = String(timeRaw).trim().match(/^(\d{1,2}):(\d{2})/);
  const hh = m ? parseInt(m[1], 10) : 0;
  const mm = m ? parseInt(m[2], 10) : 0;
  const [y, mo, d] = day.split('-').map(Number);
  return Date.UTC(y, mo - 1, d, hh, mm) - 9 * 60 * 60 * 1000;
}

function formatHeadingDate(rawDate: string): string {
  try {
    const dateObj = new Date(`${rawDate}T12:00:00+09:00`);
    return dateObj
      .toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit', weekday: 'short' })
      .replace(/ /g, '');
  } catch {
    return rawDate;
  }
}

function matchesSearch(res: Reservation, keyword: string): boolean {
  const q = keyword.trim().toLowerCase().replace(/[\s-]/g, '');
  if (!q) return true;
  const plate = (res.carNumber || '').toLowerCase().replace(/[\s-]/g, '');
  const name = (res.userName || '').toLowerCase().replace(/\s/g, '');
  const phone = (res.phone || '').replace(/[\s-]/g, '');
  return plate.includes(q) || name.includes(q) || phone.includes(q);
}

interface ServiceHistoryViewProps {
  onBack: () => void;
  reservations: Reservation[];
  onOpenWorkbench?: (res: Reservation) => void;
}

export default function ServiceHistoryView({
  onBack,
  reservations,
  onOpenWorkbench,
}: ServiceHistoryViewProps) {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [todayStr, setTodayStr] = useState(() => getKSTDateString());
  const [searchKeyword, setSearchKeyword] = useState('');
  const [period, setPeriod] = useState<PeriodFilter>('30d');

  useEffect(() => {
    const checkDateRollOver = () => {
      const current = getKSTDateString();
      setTodayStr((prev) => (prev !== current ? current : prev));
    };
    checkDateRollOver();
    const intervalId = setInterval(checkDateRollOver, 60_000);
    return () => clearInterval(intervalId);
  }, []);

  const stats = useMemo(() => {
    const todayAdmitted = reservations.filter(
      (r) => r.departureDate === todayStr && isAdmitted(r.status)
    ).length;

    const todayExited = reservations.filter((r) => {
      if (!isCompletedOut(r.status)) return false;
      return getActivityDateKey(r) === todayStr;
    }).length;

    return { todayAdmitted, todayExited };
  }, [reservations, todayStr]);

  const filteredHistory = useMemo(() => {
    const cutoff =
      period === 'today'
        ? todayStr
        : period === '7d'
          ? dateDaysBefore(todayStr, 6)
          : period === '30d'
            ? dateDaysBefore(todayStr, 29)
            : null;

    return reservations
      .filter((res) => isMovedReservation(res.status))
      .filter((res) => {
        const day = getActivityDateKey(res);
        if (!day) return period === 'all';
        if (period === 'today') return day === todayStr;
        if (cutoff) return day >= cutoff && day <= todayStr;
        return true;
      })
      .filter((res) => matchesSearch(res, searchKeyword))
      .sort((a, b) => getActivitySortMs(b) - getActivitySortMs(a));
  }, [reservations, period, todayStr, searchKeyword]);

  const groupedHistory = useMemo(() => {
    const map = new Map<string, { sortKey: string; heading: string; items: Reservation[] }>();

    for (const res of filteredHistory) {
      const rawDate = getActivityDateKey(res) || '미정';
      const region = airportShortName(res.airport).replace(/공항$/, '') || '인천';
      const heading = `${formatHeadingDate(rawDate)} · ${region}`;
      const groupKey = `${rawDate}__${region}`;
      const existing = map.get(groupKey);
      if (existing) {
        existing.items.push(res);
      } else {
        map.set(groupKey, { sortKey: rawDate, heading, items: [res] });
      }
    }

    return [...map.values()].sort((a, b) => b.sortKey.localeCompare(a.sortKey));
  }, [filteredHistory]);

  const handleCopyReceipt = (e: React.MouseEvent, code: string) => {
    e.stopPropagation();
    e.preventDefault();
    void navigator.clipboard.writeText(code);
    setCopiedId(code);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const hasAnyMoved = reservations.some((r) => isMovedReservation(r.status));
  const hasFiltered = groupedHistory.length > 0;

  return (
    <div className="min-h-screen bg-neutral-950 text-white p-5 pb-24">
      <div className="flex items-center gap-3.5 mb-5">
        <button
          type="button"
          onClick={onBack}
          className="p-2 hover:bg-neutral-900 rounded-2xl text-zinc-400 hover:text-white transition-all bg-neutral-900/60 border border-neutral-800"
        >
          <ArrowLeft size={16} />
        </button>
        <div>
          <h2 className="text-sm font-black tracking-tight text-white">나의 서비스 기록</h2>
          <p className="text-[12px] text-zinc-500 font-bold">
            입고·출고·출차 기록 · 탭하면 결제·취소·되돌리기
          </p>
        </div>
      </div>

      {/* 당일 요약 — 얇게 */}
      <div className="bg-[#1C1C1E] p-4 rounded-[20px] border border-neutral-800/80 mb-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-[12px] font-bold text-zinc-400 flex items-center gap-1.5">
            <ClipboardCheck size={13} className="text-amber-500" />
            오늘 요약
          </span>
          <span className="text-[11px] font-mono text-zinc-500 tabular-nums">{todayStr}</span>
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          <div className="bg-[#A855F7]/10 px-3.5 py-3 border border-[#A855F7]/20 rounded-2xl">
            <p className="text-[11px] text-zinc-400 font-bold mb-1">입고완료</p>
            <p className="font-mono font-black text-lg text-[#A855F7] tabular-nums leading-none">
              {stats.todayAdmitted}건
            </p>
          </div>
          <div className="bg-[#22C55E]/10 px-3.5 py-3 border border-[#22C55E]/20 rounded-2xl">
            <p className="text-[11px] text-zinc-400 font-bold mb-1">출차완료</p>
            <p className="font-mono font-black text-lg text-[#22C55E] tabular-nums leading-none">
              {stats.todayExited}건
            </p>
          </div>
        </div>
      </div>

      {/* 검색 · 기간 */}
      <div className="space-y-2.5 mb-4">
        <div className="relative">
          <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            type="search"
            value={searchKeyword}
            onChange={(e) => setSearchKeyword(e.target.value)}
            placeholder="차량번호, 고객명, 연락처"
            className="w-full bg-[#1C1C1E] border border-neutral-800 text-sm rounded-[16px] pl-10 pr-9 py-3 text-white placeholder-zinc-600 outline-none focus:ring-1 focus:ring-amber-500/25 font-semibold"
          />
          {searchKeyword ? (
            <button
              type="button"
              onClick={() => setSearchKeyword('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 p-0.5"
            >
              <X size={14} />
            </button>
          ) : null}
        </div>
        <div className="flex gap-1.5">
          {PERIOD_OPTIONS.map((opt) => {
            const active = period === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => setPeriod(opt.id)}
                className={cn(
                  'flex-1 py-2 rounded-[12px] text-[12px] font-bold transition-all border',
                  active
                    ? 'bg-amber-500/15 text-amber-400 border-amber-500/25'
                    : 'bg-[#1C1C1E] text-zinc-500 border-neutral-800 hover:text-zinc-300'
                )}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex items-center justify-between px-0.5 mb-3">
        <h3 className="text-[12px] text-zinc-400 font-bold">
          움직인 차량 {filteredHistory.length}건
        </h3>
        <span className="text-[11px] text-zinc-600 font-medium">최신순</span>
      </div>

      <div className="space-y-5">
        {hasFiltered ? (
          groupedHistory.map((group) => (
            <div key={group.sortKey + group.heading} className="space-y-2.5">
              <h3 className="text-xs font-black text-amber-500 border-l-2 border-amber-500 pl-2.5 tracking-wide">
                {group.heading}
              </h3>
              <div className="space-y-2">
                {group.items.map((res, idx) => {
                  const spaceRaw = (res.parkingSpace || '').trim();
                  const space =
                    spaceRaw && !isGenericParkingSpaceLabel(spaceRaw) ? spaceRaw : '';
                  const facility = res.isIndoor === false ? '야외' : '실내';
                  const unpaid = isReservationUnpaid(res);
                  const receiptCode = (res.receiptCode || '').trim();

                  return (
                    <div
                      key={`${res.id || ''}-${idx}`}
                      role={onOpenWorkbench ? 'button' : undefined}
                      tabIndex={onOpenWorkbench ? 0 : undefined}
                      onClick={() => onOpenWorkbench?.(res)}
                      onKeyDown={(e) => {
                        if (!onOpenWorkbench) return;
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          onOpenWorkbench(res);
                        }
                      }}
                      className={cn(
                        'px-3.5 py-3 bg-neutral-900 border border-neutral-800 rounded-[18px] flex items-center justify-between gap-3 transition-all',
                        onOpenWorkbench && 'cursor-pointer active:scale-[0.99] hover:border-neutral-700'
                      )}
                    >
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                          <span className="text-[17px] font-black tabular-nums tracking-tight text-white leading-none">
                            {res.carNumber || '미등록차량'}
                          </span>
                          {(res.carModel || space) && (
                            <span className="text-[12px] text-zinc-500 font-semibold truncate">
                              {[res.carModel, space].filter(Boolean).join(' · ')}
                            </span>
                          )}
                        </div>
                        <p className="text-[12px] text-zinc-400 font-semibold truncate">
                          {[res.userName, `${res.departureTime || '-'} ~ ${res.arrivalTime || '-'}`]
                            .filter(Boolean)
                            .join(' · ')}
                        </p>
                        <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                          <span
                            className={cn(
                              'text-[11px] px-1.5 py-0.5 rounded-md font-bold',
                              statusBadgeColorClass(res.status)
                            )}
                          >
                            {serviceStatusLabel(res.status)}
                          </span>
                          <span className="text-[11px] px-1.5 py-0.5 rounded-md font-bold bg-zinc-800 text-zinc-300">
                            {facility}
                          </span>
                          <span
                            className={cn(
                              'text-[11px] px-1.5 py-0.5 rounded-md font-bold border',
                              unpaid
                                ? 'bg-rose-500/12 text-rose-400 border-rose-500/20'
                                : 'bg-emerald-500/12 text-emerald-400 border-emerald-500/20'
                            )}
                          >
                            {unpaid ? '미납' : '완납'}
                          </span>
                          {receiptCode ? (
                            <button
                              type="button"
                              onClick={(e) => handleCopyReceipt(e, receiptCode)}
                              className="text-[11px] px-1.5 py-0.5 rounded-md font-bold bg-neutral-950 border border-neutral-700 text-zinc-400 hover:text-white flex items-center gap-1"
                              title="영수증 코드 복사"
                            >
                              {copiedId === receiptCode ? (
                                <ClipboardCheck size={10} className="text-emerald-500" />
                              ) : (
                                <Copy size={10} />
                              )}
                              {receiptCode}
                            </button>
                          ) : null}
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-[13px] font-bold tabular-nums text-zinc-300">
                          {(res.totalPrice ?? 0).toLocaleString()}원
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        ) : (
          <div className="py-14 flex flex-col items-center justify-center text-center gap-2 select-none">
            <ClipboardCheck size={28} className="text-neutral-700" />
            {hasAnyMoved ? (
              <>
                <p className="text-xs font-bold text-zinc-400">검색·기간에 맞는 기록이 없습니다</p>
                <p className="text-[12px] text-zinc-600">기간을 넓히거나 검색어를 바꿔 보세요.</p>
              </>
            ) : (
              <>
                <p className="text-xs font-bold text-zinc-400">아직 움직인 차량 기록이 없습니다</p>
                <p className="text-[12px] text-zinc-600">입고를 시작한 차량부터 여기에 표시됩니다.</p>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
