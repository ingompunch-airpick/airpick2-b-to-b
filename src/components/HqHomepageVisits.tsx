import { useEffect, useMemo, useState } from 'react';
import type { Company } from '../types';
import { formatPartnerDisplayName } from '../utils/companyDisplay';
import { getKSTDateOnlyString } from '../utils/kstDate';
import { fetchPartnerHomepageDays } from '../lib/partnerHomepageStatsFirestore';
import {
  addHomepageVisitTotals,
  emptyHomepageVisitTotals,
  HOMEPAGE_SOURCE_LABELS,
  HOMEPAGE_STATS_COMPANY_IDS,
  homepageVisitRange,
  rangeIncludesPreSourceDays,
  sumHomepageVisits,
  type HomepageDayStat,
  type HomepageVisitPeriod,
  type HomepageVisitTotals,
} from '../utils/partnerHomepageStats';

const PERIODS: { id: HomepageVisitPeriod; label: string }[] = [
  { id: 'week', label: '최근 7일' },
  { id: 'month', label: '이번 달' },
  { id: 'prevMonth', label: '지난달' },
];

const NAME_FALLBACK: Record<string, string> = {
  gayu: '가유',
  hi: '안녕',
  season: '시즌',
  wawa: '와와발렛',
};

function companyLabel(companyId: string, companies: Company[]): string {
  const found = companies.find((company) => (company.id || '').toLowerCase() === companyId);
  const named = formatPartnerDisplayName(found?.name, companyId);
  if (named && named !== companyId) return named;
  return NAME_FALLBACK[companyId] || named || companyId;
}

function shortDate(ymd: string): string {
  const [, month, day] = ymd.split('-');
  return `${Number(month)}월 ${Number(day)}일`;
}

function Metric({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-xl bg-neutral-900/80 border border-neutral-800 px-2 py-2">
      <span className="text-[10px] text-zinc-500 font-bold block leading-tight">{label}</span>
      <span
        className={`text-base font-black font-mono tracking-tight ${
          value > 0 ? 'text-white' : 'text-zinc-600'
        }`}
      >
        {value.toLocaleString()}
      </span>
    </div>
  );
}

function CompanyCard({
  name,
  totals,
}: {
  name: string;
  totals: HomepageVisitTotals;
}) {
  return (
    <div className="bg-[#121214] border border-neutral-800/80 rounded-2xl px-4 py-3.5 space-y-2.5">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-black text-white truncate">{name}</span>
        <div className="text-right shrink-0">
          <span className="text-[10px] text-zinc-500 font-bold block">합계</span>
          <span
            className={`text-lg font-black font-mono tracking-tight ${
              totals.pageViews > 0 ? 'text-amber-400' : 'text-zinc-600'
            }`}
          >
            {totals.pageViews.toLocaleString()}
          </span>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {HOMEPAGE_SOURCE_LABELS.map((source) => (
          <Metric key={source.key} label={source.label} value={totals[source.key]} />
        ))}
      </div>
    </div>
  );
}

export default function HqHomepageVisits({ companies }: { companies: Company[] }) {
  const today = getKSTDateOnlyString();
  const [period, setPeriod] = useState<HomepageVisitPeriod>('week');
  const [days, setDays] = useState<HomepageDayStat[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setError('');
    fetchPartnerHomepageDays(today)
      .then((rows) => {
        if (!cancelled) setDays(rows);
      })
      .catch(() => {
        if (!cancelled) setError('방문 수를 불러오지 못했습니다.');
      });
    return () => {
      cancelled = true;
    };
  }, [today]);

  const range = homepageVisitRange(today, period);
  const rows = useMemo(() => {
    const loaded = days || [];
    const companiesRows = HOMEPAGE_STATS_COMPANY_IDS.map((companyId) => ({
      id: companyId,
      name: companyLabel(companyId, companies),
      totals: sumHomepageVisits(loaded, companyId, range.start, range.end),
    }));
    const all = companiesRows.reduce(
      (total, row) => addHomepageVisitTotals(total, row.totals),
      emptyHomepageVisitTotals()
    );
    return { companiesRows, all };
  }, [companies, days, range.end, range.start]);

  const note = rangeIncludesPreSourceDays(range.start)
    ? '9월 27일 전 숫자는 페이지를 연 횟수라 사람 수보다 큽니다. 링크별 숫자는 그날 이후 방문부터입니다.'
    : '한 사람이 메뉴를 더 봐도 1번만 셉니다.';

  return (
    <div className="space-y-3">
      <div className="flex p-1 bg-[#1C1C1E] rounded-xl border border-neutral-800/40 select-none">
        {PERIODS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setPeriod(item.id)}
            className={`flex-1 py-2 rounded-lg text-[12px] font-black transition-all ${
              period === item.id ? 'bg-neutral-800 text-white' : 'text-zinc-500 hover:text-white'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>
      <p className="px-1 text-[11px] text-zinc-500 font-bold">
        {shortDate(range.start)} – {shortDate(range.end)}
      </p>
      <p className="px-1 text-[10px] text-zinc-600 font-semibold leading-relaxed">{note}</p>

      {error ? (
        <p className="px-4 py-6 text-center text-xs text-zinc-500 font-bold">{error}</p>
      ) : days === null ? (
        <p className="px-4 py-6 text-center text-xs text-zinc-500 font-bold">불러오는 중</p>
      ) : (
        <div className="space-y-2.5">
          <CompanyCard name="전체" totals={rows.all} />
          {rows.companiesRows.map((row) => (
            <CompanyCard key={row.id} name={row.name} totals={row.totals} />
          ))}
        </div>
      )}
    </div>
  );
}
