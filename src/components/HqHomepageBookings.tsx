import { useMemo, useState } from 'react';
import type { Company, Reservation } from '../types';
import {
  aggregateHomepageBookings,
  type HomepageBookingPeriod,
} from '../utils/homepageBookingStats';
import { getKSTDateOnlyString } from '../utils/kstDate';

const PERIODS: { id: HomepageBookingPeriod; label: string }[] = [
  { id: 'last7', label: '최근 7일' },
  { id: 'month', label: '이번 달' },
];

function shortDate(ymd: string): string {
  const [, month, day] = ymd.split('-');
  return `${Number(month)}/${Number(day)}`;
}

export default function HqHomepageBookings({
  reservations,
  monthPrefix,
  companies,
}: {
  reservations: Reservation[];
  monthPrefix: string;
  companies: Company[];
}) {
  const todayYmd = getKSTDateOnlyString();
  const [period, setPeriod] = useState<HomepageBookingPeriod>('month');

  const stats = useMemo(
    () =>
      aggregateHomepageBookings(reservations, {
        period,
        monthPrefix,
        todayYmd,
        companies,
      }),
    [reservations, period, monthPrefix, todayYmd, companies]
  );

  return (
    <div className="bg-[#121214] border border-sky-500/20 rounded-[22px] p-4 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-xs font-black text-sky-300 tracking-wider">업체 홈페이지 예약</p>
          <p className="text-[11px] text-zinc-500 font-bold mt-1 leading-relaxed">
            홈에서 예약완료된 건만 · 취소 제외 · 접수일 기준
          </p>
        </div>
        <div className="flex bg-neutral-900/80 p-1 rounded-xl border border-neutral-800 gap-0.5">
          {PERIODS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setPeriod(p.id)}
              className={`px-2.5 py-1.5 text-[11px] font-black rounded-lg transition-all ${
                period === p.id
                  ? 'bg-sky-500/20 text-sky-200 border border-sky-500/30'
                  : 'text-zinc-500 hover:text-zinc-300 border border-transparent'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <p className="text-[10px] text-zinc-600 font-bold px-0.5">
        {shortDate(stats.fromYmd)} – {shortDate(stats.toYmd)}
        {period === 'last7' ? ' · 오늘 기준' : ''}
      </p>

      <div className="rounded-xl bg-sky-500/10 border border-sky-500/20 px-3 py-2.5">
        <span className="text-[10px] text-sky-300 font-bold block">예약완료 합계</span>
        <span className="text-xl font-black text-sky-100 font-mono">
          {stats.total}
          <span className="text-sm ml-0.5">건</span>
        </span>
      </div>

      {stats.rows.length === 0 ? (
        <p className="text-[12px] text-zinc-500 font-bold py-2 px-0.5">
          이 기간에 홈페이지 예약완료 건이 없습니다.
        </p>
      ) : (
        <div className="space-y-2">
          {stats.rows.map((row) => (
            <div key={row.companyId} className="flex items-center gap-2">
              <span className="shrink-0 text-[11px] text-zinc-300 font-bold w-20 truncate">
                {row.label}
              </span>
              <div className="flex-1 min-w-0">
                <div className="h-1.5 bg-neutral-800 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full bg-sky-500"
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
