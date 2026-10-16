import { useEffect, useMemo, useState } from 'react';
import type { Company } from '../types';
import { adminUpsertCompany } from '../lib/adminCompanyApi';
import { formatPartnerDisplayName } from '../utils/companyDisplay';
import { getKSTDateOnlyString } from '../utils/kstDate';
import { fetchPartnerHomepageDays } from '../lib/partnerHomepageStatsFirestore';
import {
  addHomepageVisitTotals,
  channelsFromCounts,
  emptyHomepageVisitTotals,
  HOMEPAGE_CHANNEL_PRESETS,
  HOMEPAGE_STATS_COMPANY_IDS,
  homepageChannelUrl,
  homepageOtherCount,
  homepageVisitRange,
  rangeIncludesPreSourceDays,
  sanitizeHomepageVisitChannels,
  sumHomepageSourceCounts,
  sumHomepageVisits,
  type HomepageDayStat,
  type HomepageVisitChannel,
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
  hint,
  onCopy,
  onRemove,
}: {
  label: string;
  value: number;
  hint?: string;
  onCopy?: () => void;
  onRemove?: () => void;
}) {
  return (
    <div className="rounded-xl bg-neutral-900/80 border border-neutral-800 px-2 py-2">
      <div className="flex items-start justify-between gap-1">
        <span className="text-[10px] text-zinc-500 font-bold block leading-tight">{label}</span>
        <span className="flex shrink-0 gap-1">
          {onCopy && (
            <button
              type="button"
              onClick={onCopy}
              className="text-[10px] font-black text-zinc-500 hover:text-white"
            >
              주소
            </button>
          )}
          {onRemove && (
            <button
              type="button"
              onClick={onRemove}
              className="text-[10px] font-black text-zinc-600 hover:text-rose-400"
            >
              빼기
            </button>
          )}
        </span>
      </div>
      <span
        className={`text-base font-black font-mono tracking-tight ${
          value > 0 ? 'text-white' : 'text-zinc-600'
        }`}
      >
        {value.toLocaleString()}
      </span>
      {hint && <span className="mt-0.5 block text-[10px] font-semibold text-zinc-600 truncate">{hint}</span>}
    </div>
  );
}

function CompanyCard({
  companyId,
  name,
  totals,
  channels,
  counts,
  saving,
  error,
  onSave,
}: {
  companyId?: string;
  name: string;
  totals: HomepageVisitTotals;
  channels: HomepageVisitChannel[];
  counts: Record<string, number>;
  saving?: boolean;
  error?: string;
  onSave?: (next: HomepageVisitChannel[]) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState('');
  const [key, setKey] = useState('');
  const [formError, setFormError] = useState('');
  const [copiedKey, setCopiedKey] = useState('');
  const other = homepageOtherCount(totals.pageViews, counts, channels);
  const used = new Set(channels.map((channel) => channel.key));

  const copy = (channelKey: string) => {
    if (!companyId) return;
    const url = homepageChannelUrl(companyId, channelKey);
    void navigator.clipboard.writeText(url).then(() => {
      setCopiedKey(channelKey);
      window.setTimeout(() => setCopiedKey(''), 1200);
    });
  };

  const save = (next: HomepageVisitChannel[]) => {
    const parsed = sanitizeHomepageVisitChannels(next);
    if (!parsed) {
      setFormError('이름과 주소를 확인해 주세요.');
      return;
    }
    setFormError('');
    setAdding(false);
    setLabel('');
    setKey('');
    onSave?.(parsed);
  };

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
      {onSave && (
      <div className="grid grid-cols-2 gap-2">
        {channels.map((channel) => (
          <Metric
            key={channel.key}
            label={channel.label}
            value={counts[channel.key] || 0}
            hint={copiedKey === channel.key ? '주소를 복사했습니다' : undefined}
            onCopy={companyId ? () => copy(channel.key) : undefined}
            onRemove={
              onSave
                ? () => {
                    if (!window.confirm(`「${channel.label}」 측정을 뺄까요? 숫자는 그 외에 남습니다.`)) return;
                    save(channels.filter((item) => item.key !== channel.key));
                  }
                : undefined
            }
          />
        ))}
        <Metric label="그 외" value={other} />
      </div>
      )}
      {onSave && (
        <div className="space-y-2">
          {!adding ? (
            <button
              type="button"
              disabled={saving}
              onClick={() => setAdding(true)}
              className="text-[11px] font-black text-zinc-400 hover:text-white"
            >
              측정 추가
            </button>
          ) : (
            <div className="space-y-2 rounded-xl border border-neutral-800 bg-neutral-950/50 p-2.5">
              <div className="flex flex-wrap gap-1.5">
                {HOMEPAGE_CHANNEL_PRESETS.filter((preset) => !used.has(preset.key)).map((preset) => (
                  <button
                    key={preset.key}
                    type="button"
                    onClick={() => save([...channels, preset])}
                    className="rounded-lg border border-neutral-700 px-2 py-1 text-[10px] font-black text-zinc-300"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input
                  value={label}
                  onChange={(event) => setLabel(event.target.value)}
                  placeholder="이름"
                  className="rounded-lg border border-neutral-800 bg-neutral-900 px-2 py-1.5 text-[12px] font-bold text-white"
                />
                <input
                  value={key}
                  onChange={(event) => setKey(event.target.value.toLowerCase())}
                  placeholder="주소 place2"
                  className="rounded-lg border border-neutral-800 bg-neutral-900 px-2 py-1.5 text-[12px] font-bold text-white"
                />
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => save([...channels, { key: key.trim().toLowerCase(), label: label.trim() }])}
                  className="rounded-lg bg-neutral-800 px-3 py-1.5 text-[11px] font-black text-white"
                >
                  추가
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAdding(false);
                    setFormError('');
                  }}
                  className="rounded-lg px-3 py-1.5 text-[11px] font-black text-zinc-500"
                >
                  닫기
                </button>
              </div>
            </div>
          )}
          {(formError || error) && (
            <p className="text-[11px] font-bold text-rose-400">{formError || error}</p>
          )}
        </div>
      )}
    </div>
  );
}

export default function HqHomepageVisits({ companies }: { companies: Company[] }) {
  const today = getKSTDateOnlyString();
  const [period, setPeriod] = useState<HomepageVisitPeriod>('week');
  const [days, setDays] = useState<HomepageDayStat[] | null>(null);
  const [error, setError] = useState('');
  const [overrides, setOverrides] = useState<Record<string, HomepageVisitChannel[]>>({});
  const [savingId, setSavingId] = useState('');
  const [saveError, setSaveError] = useState<Record<string, string>>({});

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
    const companiesRows = HOMEPAGE_STATS_COMPANY_IDS.map((companyId) => {
      const company = companies.find((item) => (item.id || '').toLowerCase() === companyId);
      const explicit = Array.isArray(company?.homepageVisitChannels)
        ? sanitizeHomepageVisitChannels(company.homepageVisitChannels) ?? []
        : null;
      const summed = sumHomepageSourceCounts(loaded, companyId, range.start, range.end);
      return {
        id: companyId,
        name: companyLabel(companyId, companies),
        totals: sumHomepageVisits(loaded, companyId, range.start, range.end),
        channels: overrides[companyId] ?? explicit ?? channelsFromCounts(summed.counts),
        counts: summed.counts,
      };
    });
    const all = companiesRows.reduce(
      (total, row) => addHomepageVisitTotals(total, row.totals),
      emptyHomepageVisitTotals()
    );
    return { companiesRows, all };
  }, [companies, days, overrides, range.end, range.start]);

  const note = rangeIncludesPreSourceDays(range.start)
    ? '9월 27일 전 숫자는 페이지를 연 횟수라 사람 수보다 큽니다. 링크별 숫자는 그날 이후 방문부터입니다.'
    : '한 사람이 메뉴를 더 봐도 1번만 셉니다. 측정은 업체마다 따로 만듭니다.';

  const saveChannels = async (companyId: string, next: HomepageVisitChannel[]) => {
    setSavingId(companyId);
    setSaveError((prev) => ({ ...prev, [companyId]: '' }));
    setOverrides((prev) => ({ ...prev, [companyId]: next }));
    try {
      await adminUpsertCompany({
        companyId,
        patch: { homepageVisitChannels: next },
      });
    } catch (err) {
      setOverrides((prev) => {
        const copy = { ...prev };
        delete copy[companyId];
        return copy;
      });
      setSaveError((prev) => ({
        ...prev,
        [companyId]: err instanceof Error ? err.message : '저장하지 못했습니다.',
      }));
    } finally {
      setSavingId('');
    }
  };

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
          <CompanyCard name="전체" totals={rows.all} channels={[]} counts={{}} />
          {rows.companiesRows.map((row) => (
            <CompanyCard
              key={row.id}
              companyId={row.id}
              name={row.name}
              totals={row.totals}
              channels={row.channels}
              counts={row.counts}
              saving={savingId === row.id}
              error={saveError[row.id]}
              onSave={(next) => void saveChannels(row.id, next)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
