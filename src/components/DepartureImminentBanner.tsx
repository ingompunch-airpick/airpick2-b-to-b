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
    <div className="rounded-[20px] border border-neutral-800 bg-[#1C1C1E] overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3.5 text-left"
      >
        <div className="flex items-center gap-2 min-w-0">
          <div className="p-1.5 rounded-xl bg-zinc-800 text-zinc-300 shrink-0">
            <Bell size={16} />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-zinc-100 leading-tight">
              출차 임박 {alerts.length}대
            </p>
            <p className="text-[11px] text-zinc-500 font-medium mt-0.5">
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
        <div className="px-3 pb-3 space-y-1.5 border-t border-neutral-800">
          {alerts.map(({ res, level, minutes }) => (
            <button
              key={res.id}
              type="button"
              onClick={() => onSelect(res)}
              className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl text-left transition-colors active:scale-[0.99] ${
                level === 'overdue'
                  ? 'bg-rose-500/8 border border-rose-500/20 hover:bg-rose-500/12'
                  : 'bg-zinc-900/80 border border-neutral-800 hover:bg-zinc-900'
              }`}
            >
              <div className="min-w-0">
                <span className="text-sm font-semibold text-white tabular-nums block truncate">
                  {res.carNumber || '미등록'}
                </span>
                <span className="text-[11px] text-zinc-400 truncate block">
                  {res.userName} · {res.arrivalDate} {res.arrivalTime}
                </span>
              </div>
              <div className="shrink-0 text-right">
                <span
                  className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border block mb-0.5 ${
                    level === 'overdue'
                      ? 'bg-rose-500/12 text-rose-300 border-rose-500/25'
                      : 'bg-amber-500/10 text-amber-300/90 border-amber-500/20'
                  }`}
                >
                  {level === 'overdue' ? '출차지연' : '출차임박'}
                </span>
                <span className="text-[11px] font-medium text-zinc-400 flex items-center justify-end gap-0.5">
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
