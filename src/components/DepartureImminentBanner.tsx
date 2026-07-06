import React, { useState } from 'react';
import { Bell, ChevronDown, ChevronUp, Clock } from 'lucide-react';
import type { Reservation } from '../types';
import {
  DEPARTURE_IMMINENT_WINDOW_MINUTES,
  formatDepartureCountdown,
  type DepartureAlertItem,
} from '../utils/departureImminent';

interface DepartureImminentBannerProps {
  alerts: DepartureAlertItem[];
  onSelect: (res: Reservation) => void;
}

export default function DepartureImminentBanner({
  alerts,
  onSelect,
}: DepartureImminentBannerProps) {
  const [expanded, setExpanded] = useState(true);

  if (alerts.length === 0) return null;

  const overdueCount = alerts.filter((a) => a.level === 'overdue').length;
  const imminentCount = alerts.length - overdueCount;

  return (
    <div className="rounded-[22px] border border-amber-500/35 bg-gradient-to-br from-amber-500/12 via-[#1C1C1E] to-[#1C1C1E] overflow-hidden shadow-[0_0_24px_rgba(245,158,11,0.08)]">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3.5 text-left"
      >
        <div className="flex items-center gap-2 min-w-0">
          <div className="p-1.5 rounded-xl bg-amber-500/20 text-amber-400 shrink-0">
            <Bell size={16} className={imminentCount > 0 ? 'animate-pulse' : ''} />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-black text-amber-400 leading-tight">
              출차 임박 {alerts.length}대
            </p>
            <p className="text-[11px] text-zinc-500 font-bold mt-0.5">
              {DEPARTURE_IMMINENT_WINDOW_MINUTES}분 이내
              {imminentCount > 0 && ` ${imminentCount}대`}
              {overdueCount > 0 && (
                <span className="text-rose-400"> · 지연 {overdueCount}대</span>
              )}
            </p>
          </div>
        </div>
        {expanded ? (
          <ChevronUp size={18} className="text-zinc-500 shrink-0" />
        ) : (
          <ChevronDown size={18} className="text-zinc-500 shrink-0" />
        )}
      </button>

      {expanded && (
        <div className="px-3 pb-3 space-y-1.5 border-t border-amber-500/15">
          {alerts.map(({ res, level, minutes }) => (
            <button
              key={res.id}
              type="button"
              onClick={() => onSelect(res)}
              className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl text-left transition-colors active:scale-[0.99] ${
                level === 'overdue'
                  ? 'bg-rose-500/10 border border-rose-500/25 hover:bg-rose-500/15'
                  : 'bg-amber-500/8 border border-amber-500/20 hover:bg-amber-500/12'
              }`}
            >
              <div className="min-w-0">
                <span className="text-sm font-black text-white font-mono block truncate">
                  {res.carNumber || '미등록'}
                </span>
                <span className="text-[11px] text-zinc-400 truncate block">
                  {res.userName} · {res.arrivalDate} {res.arrivalTime}
                </span>
              </div>
              <div className="shrink-0 text-right">
                <span
                  className={`text-[10px] font-black px-1.5 py-0.5 rounded border block mb-0.5 ${
                    level === 'overdue'
                      ? 'bg-rose-500/20 text-rose-300 border-rose-500/30'
                      : 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                  }`}
                >
                  {level === 'overdue' ? '출차지연' : '출차임박'}
                </span>
                <span className="text-[11px] font-bold text-zinc-300 flex items-center justify-end gap-0.5">
                  <Clock size={10} />
                  {formatDepartureCountdown(minutes)}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
