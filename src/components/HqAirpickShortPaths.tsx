import { useEffect, useMemo, useState } from 'react';
import type { Reservation } from '../types';
import {
  aggregateAirpickShortPaths,
  type ShortPathPeriod,
} from '../utils/airpickShortPathStats';
import { getKSTDateOnlyString } from '../utils/kstDate';
import {
  fetchB2cShortPathDays,
  sumB2cShortPathVisits,
  type B2cShortPathDayStat,
} from '../lib/b2cShortPathStatsFirestore';

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
  const [visitDays, setVisitDays] = useState<B2cShortPathDayStat[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchB2cShortPathDays(todayYmd)
      .then((rows) => {
        if (!cancelled) setVisitDays(rows);
      })
      .catch(() => {
        if (!cancelled) setVisitDays([]);
      });
    return () => {
      cancelled = true;
    };
  }, [todayYmd]);

  const visitSum = useMemo(
    () =>
      sumB2cShortPathVisits(visitDays || [], period, monthPrefix, todayYmd),
    [visitDays, period, monthPrefix, todayYmd]
  );

  const stats = useMemo(
    () =>
      aggregateAirpickShortPaths(reservations, {
        period,
        monthPrefix,
        todayYmd,
        visitBySource: visitSum.bySource,
        visitTotal: visitSum.pageViews,
      }),
    [reservations, period, monthPrefix, todayYmd, visitSum]
  );

  return (
    <div className="bg-[#121214] border border-fuchsia-500/20 rounded-[22px] p-4 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-xs font-black text-fuchsia-300 tracking-wider">에어픽 짧은 경로</p>
          <p className="text-[11px] text-zinc-500 font-bold mt-1 leading-relaxed">
            방문 + 예약 · 에어픽.kr/long1 등 · 접수일·방문일(KST)
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

      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-xl bg-amber-500/10 border border-amber-500/20 px-3 py-2.5">
          <span className="text-[10px] text-amber-300 font-bold block">방문 합</span>
          <span className="text-xl font-black text-amber-100 font-mono">
            {visitDays === null ? '…' : stats.visitTotal}
            <span className="text-sm ml-0.5">회</span>
          </span>
        </div>
        <div className="rounded-xl bg-fuchsia-500/10 border border-fuchsia-500/20 px-3 py-2.5">
          <span className="text-[10px] text-fuchsia-300 font-bold block">예약 합</span>
          <span className="text-xl font-black text-fuchsia-100 font-mono">
            {stats.total}
            <span className="text-sm ml-0.5">건</span>
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-xl bg-neutral-900/80 border border-neutral-800 px-3 py-2.5">
          <span className="text-[10px] text-zinc-400 font-bold block">경로 있는 예약</span>
          <span className="text-lg font-black text-zinc-100 font-mono">
            {stats.withPath}
            <span className="text-sm ml-0.5">건</span>
          </span>
        </div>
        <div className="rounded-xl bg-neutral-900/80 border border-neutral-800 px-3 py-2.5">
          <span className="text-[10px] text-zinc-400 font-bold block">경로 없는 예약</span>
          <span className="text-lg font-black text-zinc-100 font-mono">
            {stats.withoutPath}
            <span className="text-sm ml-0.5">건</span>
          </span>
        </div>
      </div>

      {stats.rows.length === 0 ? (
        <p className="text-[12px] text-zinc-500 font-bold py-2 px-0.5">
          {visitDays === null
            ? '불러오는 중…'
            : '이 기간에 방문·예약이 없습니다.'}
        </p>
      ) : (
        <div className="space-y-2">
          <div className="grid grid-cols-[1fr_3.25rem_3.25rem] gap-1 px-0.5">
            <span className="text-[10px] text-zinc-600 font-bold">경로</span>
            <span className="text-[10px] text-zinc-600 font-bold text-right">방문</span>
            <span className="text-[10px] text-zinc-600 font-bold text-right">예약</span>
          </div>
          {stats.rows.map((row) => (
            <div
              key={row.source}
              className="grid grid-cols-[1fr_3.25rem_3.25rem] gap-1 items-center"
            >
              <span className="text-[11px] text-zinc-300 font-bold truncate min-w-0">
                {row.label}
              </span>
              <span
                className={`text-[11px] font-mono font-black text-right ${
                  row.visits > 0 ? 'text-amber-400' : 'text-zinc-700'
                }`}
              >
                {row.visits > 0 ? row.visits : '—'}
              </span>
              <span
                className={`text-[11px] font-mono font-black text-right ${
                  row.count > 0 ? 'text-fuchsia-300' : 'text-zinc-700'
                }`}
              >
                {row.count > 0 ? row.count : '—'}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
