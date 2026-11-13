import { useMemo, useState } from 'react';
import type { Reservation } from '../types';
import {
  aggregateAirpickShortPaths,
  type ShortPathPeriod,
} from '../utils/airpickShortPathStats';
import { getKSTDateOnlyString } from '../utils/kstDate';

const PERIODS: { id: ShortPathPeriod; label: string }[] = [
  { id: 'last7', label: '최근 7일' },
  { id: 'month', label: '이번 달' },
];

function shortDate(ymd: string): string {
  const [, month, day] = ymd.split('-');
  return `${Number(month)}/${Number(day)}`;
}

export default function HqAirpickShortPaths({
  reservations,
  monthPrefix,
  period: periodProp,
  hidePeriodToggle = false,
}: {
  reservations: Reservation[];
  /** YYYY-MM — 「이번 달」집계용 */
  monthPrefix: string;
  /** 부모가 기간을 넘기면 토글 숨김 가능 */
  period?: ShortPathPeriod;
  hidePeriodToggle?: boolean;
}) {
  const todayYmd = getKSTDateOnlyString();
  const [periodLocal, setPeriodLocal] = useState<ShortPathPeriod>('month');
  const period = periodProp ?? periodLocal;

  const stats = useMemo(
    () =>
      aggregateAirpickShortPaths(reservations, {
        period,
        monthPrefix,
        todayYmd,
      }),
    [reservations, period, monthPrefix, todayYmd]
  );

  return (
    <div className="bg-[#121214] border border-fuchsia-500/20 rounded-[22px] p-4 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-xs font-black text-fuchsia-300 tracking-wider">에어픽 짧은 경로</p>
          <p className="text-[11px] text-zinc-500 font-bold mt-1 leading-relaxed">
            B2C 예약 · 접수일 기준 · 에어픽.kr/long1 등
          </p>
        </div>
        {!hidePeriodToggle ? (
          <div className="flex bg-neutral-900/80 p-1 rounded-xl border border-neutral-800 gap-0.5">
            {PERIODS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setPeriodLocal(p.id)}
                className={`px-2.5 py-1.5 text-[11px] font-black rounded-lg transition-all ${
                  period === p.id
                    ? 'bg-fuchsia-500/20 text-fuchsia-200 border border-fuchsia-500/30'
                    : 'text-zinc-500 hover:text-zinc-300 border border-transparent'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <p className="text-[10px] text-zinc-600 font-bold px-0.5">
        {shortDate(stats.fromYmd)} – {shortDate(stats.toYmd)}
        {period === 'last7' ? ' · 오늘 기준' : ''}
      </p>

      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-xl bg-fuchsia-500/10 border border-fuchsia-500/20 px-3 py-2.5">
          <span className="text-[10px] text-fuchsia-300 font-bold block">B2C 합계</span>
          <span className="text-xl font-black text-fuchsia-100 font-mono">
            {stats.total}
            <span className="text-sm ml-0.5">건</span>
          </span>
        </div>
        <div className="rounded-xl bg-neutral-900/80 border border-neutral-800 px-3 py-2.5">
          <span className="text-[10px] text-zinc-400 font-bold block">경로 있음</span>
          <span className="text-xl font-black text-zinc-100 font-mono">
            {stats.withPath}
            <span className="text-sm ml-0.5">건</span>
          </span>
        </div>
        <div className="rounded-xl bg-neutral-900/80 border border-neutral-800 px-3 py-2.5">
          <span className="text-[10px] text-zinc-400 font-bold block">경로 없음</span>
          <span className="text-xl font-black text-zinc-100 font-mono">
            {stats.withoutPath}
            <span className="text-sm ml-0.5">건</span>
          </span>
        </div>
      </div>

      {stats.rows.length === 0 ? (
        <p className="text-[12px] text-zinc-500 font-bold py-2 px-0.5">
          이 기간에 에어픽(B2C) 예약이 없습니다.
        </p>
      ) : (
        <div className="space-y-2">
          {stats.rows.map((row) => (
            <div key={row.source} className="flex items-center gap-2">
              <span className="shrink-0 text-[11px] text-zinc-300 font-bold w-20 truncate">
                {row.label}
              </span>
              <div className="flex-1 min-w-0">
                <div className="h-1.5 bg-neutral-800 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full bg-fuchsia-500"
                    style={{ width: `${row.pct}%` }}
                  />
                </div>
              </div>
              <span className="text-[11px] text-zinc-400 font-mono w-10 text-right shrink-0">
                {row.count}건
              </span>
              <span className="text-[11px] text-zinc-300 font-bold font-mono w-10 text-right shrink-0">
                {row.pct}%
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
