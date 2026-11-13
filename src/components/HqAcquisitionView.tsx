import { useEffect, useMemo, useState } from 'react';
import type { Company, Reservation } from '../types';
import { adminUpsertCompany } from '../lib/adminCompanyApi';
import { fetchPartnerHomepageDays } from '../lib/partnerHomepageStatsFirestore';
import { SHORT_PATH_NONE } from '../utils/airpickShortPathStats';
import { formatPartnerDisplayName } from '../utils/companyDisplay';
import { getKSTDateOnlyString } from '../utils/kstDate';
import { aggregateHomepageBookings } from '../utils/homepageBookingStats';
import {
  channelsFromCounts,
  homepageChannelUrl,
  homepageOtherCount,
  homepageStatsCompanyIds,
  homepageVisitRange,
  HOMEPAGE_CHANNEL_PRESETS,
  rangeIncludesPreSourceDays,
  sanitizeHomepageVisitChannels,
  sumHomepageSourceCounts,
  sumHomepageVisits,
  type HomepageDayStat,
  type HomepageVisitChannel,
} from '../utils/partnerHomepageStats';
import HqAirpickShortPaths from './HqAirpickShortPaths';
import type { ShortPathPeriod } from '../utils/airpickShortPathStats';

const PERIODS: { id: ShortPathPeriod; label: string }[] = [
  { id: 'last7', label: '최근 7일' },
  { id: 'month', label: '이번 달' },
];

const NAME_FALLBACK: Record<string, string> = {
  gayu: '가유',
  hi: '안녕',
  season: '시즌',
  wawa: '와와발렛',
  bucks: '주차벅스',
};

function companyLabel(companyId: string, companies: Company[]): string {
  const found = companies.find((c) => (c.id || '').toLowerCase() === companyId);
  const named = formatPartnerDisplayName(found?.name, companyId);
  if (named && named !== companyId) return named;
  return NAME_FALLBACK[companyId] || named || companyId;
}

function shortDate(ymd: string): string {
  const [, month, day] = ymd.split('-');
  return `${Number(month)}/${Number(day)}`;
}

type MergedLink = {
  key: string;
  label: string;
  visits: number;
  bookings: number;
};

function PartnerCompanyCard({
  companyId,
  name,
  pageViews,
  bookingTotal,
  channels,
  visitCounts,
  bookingLinks,
  saving,
  error,
  onSave,
}: {
  companyId: string;
  name: string;
  pageViews: number;
  bookingTotal: number;
  channels: HomepageVisitChannel[];
  visitCounts: Record<string, number>;
  bookingLinks: { key: string; label: string; count: number }[];
  saving?: boolean;
  error?: string;
  onSave: (next: HomepageVisitChannel[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState('');
  const [key, setKey] = useState('');
  const [formError, setFormError] = useState('');
  const [copiedKey, setCopiedKey] = useState('');

  const otherVisits = homepageOtherCount(pageViews, visitCounts, channels);
  const used = new Set(channels.map((c) => c.key));
  const bookingBySource = useMemo(() => {
    const map = new Map<string, { label: string; count: number }>();
    for (const link of bookingLinks) {
      // campaign 분리 키(source::campaign)는 예약만 표시
      if (link.key.includes('::')) {
        map.set(link.key, { label: link.label, count: link.count });
        continue;
      }
      map.set(link.key, { label: link.label, count: link.count });
    }
    return map;
  }, [bookingLinks]);

  const merged: MergedLink[] = useMemo(() => {
    const rows: MergedLink[] = [];
    const seen = new Set<string>();

    for (const ch of channels) {
      seen.add(ch.key);
      rows.push({
        key: ch.key,
        label: ch.label,
        visits: visitCounts[ch.key] || 0,
        bookings: bookingBySource.get(ch.key)?.count || 0,
      });
    }
    if (otherVisits > 0) {
      rows.push({
        key: '__other_visits__',
        label: '그 외 방문',
        visits: otherVisits,
        bookings: 0,
      });
    }
    for (const [bk, meta] of bookingBySource) {
      if (seen.has(bk)) continue;
      if (bk === SHORT_PATH_NONE) continue;
      rows.push({
        key: bk,
        label: meta.label,
        visits: visitCounts[bk] || 0,
        bookings: meta.count,
      });
      seen.add(bk);
    }
    const none = bookingBySource.get(SHORT_PATH_NONE);
    if (none && none.count > 0) {
      rows.push({
        key: SHORT_PATH_NONE,
        label: '경로 없음(예약)',
        visits: 0,
        bookings: none.count,
      });
    }
    return rows.sort(
      (a, b) => b.bookings + b.visits - (a.bookings + a.visits) || a.label.localeCompare(b.label, 'ko')
    );
  }, [channels, visitCounts, bookingBySource, otherVisits]);

  const copy = (channelKey: string) => {
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
    onSave(parsed);
  };

  return (
    <div
      className={`bg-[#121214] border rounded-2xl px-4 py-3.5 space-y-2.5 ${
        open ? 'border-sky-500/35' : 'border-neutral-800/80'
      }`}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full text-left flex items-center justify-between gap-3"
      >
        <span className="text-sm font-black text-white truncate">{name}</span>
        <div className="flex items-center gap-3 shrink-0">
          <div className="text-right">
            <span className="text-[10px] text-zinc-500 font-bold block">방문</span>
            <span
              className={`text-sm font-black font-mono ${
                pageViews > 0 ? 'text-amber-400' : 'text-zinc-600'
              }`}
            >
              {pageViews.toLocaleString()}
            </span>
          </div>
          <div className="text-right">
            <span className="text-[10px] text-zinc-500 font-bold block">예약</span>
            <span
              className={`text-sm font-black font-mono ${
                bookingTotal > 0 ? 'text-sky-300' : 'text-zinc-600'
              }`}
            >
              {bookingTotal.toLocaleString()}
            </span>
          </div>
          <span className="text-[10px] text-zinc-500 font-bold w-8 text-right">
            {open ? '접기' : '링크'}
          </span>
        </div>
      </button>

      {open ? (
        <div className="space-y-2 border-t border-neutral-800 pt-2">
          <div className="grid grid-cols-[1fr_3.25rem_3.25rem] gap-1 px-0.5">
            <span className="text-[10px] text-zinc-600 font-bold">링크</span>
            <span className="text-[10px] text-zinc-600 font-bold text-right">방문</span>
            <span className="text-[10px] text-zinc-600 font-bold text-right">예약</span>
          </div>
          {merged.length === 0 ? (
            <p className="text-[11px] text-zinc-500 font-bold py-1">이 기간 수치가 없습니다.</p>
          ) : (
            merged.map((row) => {
              const isVisitChannel = channels.some((c) => c.key === row.key);
              return (
                <div
                  key={row.key}
                  className="grid grid-cols-[1fr_3.25rem_3.25rem] gap-1 items-center px-0.5"
                >
                  <div className="min-w-0 flex items-center gap-1.5">
                    <span className="text-[11px] text-zinc-300 font-bold truncate">{row.label}</span>
                    {isVisitChannel ? (
                      <button
                        type="button"
                        onClick={() => copy(row.key)}
                        className="text-[10px] font-black text-zinc-600 hover:text-white shrink-0"
                      >
                        {copiedKey === row.key ? '복사됨' : '주소'}
                      </button>
                    ) : null}
                  </div>
                  <span
                    className={`text-[11px] font-mono font-black text-right ${
                      row.visits > 0 ? 'text-amber-400' : 'text-zinc-700'
                    }`}
                  >
                    {row.visits > 0 ? row.visits : '—'}
                  </span>
                  <span
                    className={`text-[11px] font-mono font-black text-right ${
                      row.bookings > 0 ? 'text-sky-300' : 'text-zinc-700'
                    }`}
                  >
                    {row.bookings > 0 ? row.bookings : '—'}
                  </span>
                </div>
              );
            })
          )}

          <div className="space-y-2 pt-1">
            {!adding ? (
              <button
                type="button"
                disabled={saving}
                onClick={() => setAdding(true)}
                className="text-[11px] font-black text-zinc-400 hover:text-white"
              >
                방문 측정 추가
              </button>
            ) : (
              <div className="space-y-2 rounded-xl border border-neutral-800 bg-neutral-950/50 p-2.5">
                <div className="flex flex-wrap gap-1.5">
                  {HOMEPAGE_CHANNEL_PRESETS.filter((preset) => !used.has(preset.key)).map(
                    (preset) => (
                      <button
                        key={preset.key}
                        type="button"
                        onClick={() => save([...channels, preset])}
                        className="rounded-lg border border-neutral-700 px-2 py-1 text-[10px] font-black text-zinc-300"
                      >
                        {preset.label}
                      </button>
                    )
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    value={label}
                    onChange={(e) => setLabel(e.target.value)}
                    placeholder="이름"
                    className="rounded-lg border border-neutral-800 bg-neutral-900 px-2 py-1.5 text-[12px] font-bold text-white"
                  />
                  <input
                    value={key}
                    onChange={(e) => setKey(e.target.value.toLowerCase())}
                    placeholder="주소 place2"
                    className="rounded-lg border border-neutral-800 bg-neutral-900 px-2 py-1.5 text-[12px] font-bold text-white"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      save([...channels, { key: key.trim().toLowerCase(), label: label.trim() }])
                    }
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
        </div>
      ) : null}
    </div>
  );
}

export default function HqAcquisitionView({
  companies,
  reservations,
}: {
  companies: Company[];
  reservations: Reservation[];
}) {
  const today = getKSTDateOnlyString();
  const monthPrefix = today.slice(0, 7);
  const [period, setPeriod] = useState<ShortPathPeriod>('month');
  const [days, setDays] = useState<HomepageDayStat[] | null>(null);
  const [error, setError] = useState('');
  const [overrides, setOverrides] = useState<Record<string, HomepageVisitChannel[]>>({});
  const [savingId, setSavingId] = useState('');
  const [saveError, setSaveError] = useState<Record<string, string>>({});

  const visitPeriod = period === 'last7' ? 'week' : 'month';
  const range = homepageVisitRange(today, visitPeriod);
  const statsCompanyIds = useMemo(() => homepageStatsCompanyIds(companies), [companies]);

  useEffect(() => {
    let cancelled = false;
    setError('');
    setDays(null);
    fetchPartnerHomepageDays(today, statsCompanyIds)
      .then((rows) => {
        if (!cancelled) setDays(rows);
      })
      .catch(() => {
        if (!cancelled) setError('방문 수를 불러오지 못했습니다.');
      });
    return () => {
      cancelled = true;
    };
  }, [today, statsCompanyIds]);

  const bookingStats = useMemo(
    () =>
      aggregateHomepageBookings(reservations, {
        period,
        monthPrefix,
        todayYmd: today,
        companies,
      }),
    [reservations, period, monthPrefix, today, companies]
  );

  const bookingByCompany = useMemo(() => {
    const map = new Map<string, (typeof bookingStats.rows)[number]>();
    for (const row of bookingStats.rows) map.set(row.companyId, row);
    return map;
  }, [bookingStats.rows]);

  const companyIds = useMemo(() => {
    const set = new Set<string>([...statsCompanyIds, ...bookingByCompany.keys()]);
    return [...set].sort((a, b) =>
      companyLabel(a, companies).localeCompare(companyLabel(b, companies), 'ko')
    );
  }, [statsCompanyIds, bookingByCompany, companies]);

  const partnerRows = useMemo(() => {
    const loaded = days || [];
    return companyIds.map((companyId) => {
      const company = companies.find((item) => (item.id || '').toLowerCase() === companyId);
      const explicit = Array.isArray(company?.homepageVisitChannels)
        ? sanitizeHomepageVisitChannels(company.homepageVisitChannels) ?? []
        : null;
      const summed = sumHomepageSourceCounts(loaded, companyId, range.start, range.end);
      const booking = bookingByCompany.get(companyId);
      return {
        id: companyId,
        name: companyLabel(companyId, companies),
        pageViews: sumHomepageVisits(loaded, companyId, range.start, range.end).pageViews,
        visitCounts: summed.counts,
        channels: overrides[companyId] ?? explicit ?? channelsFromCounts(summed.counts),
        bookingTotal: booking?.count || 0,
        bookingLinks: booking?.links || [],
      };
    });
  }, [days, companyIds, companies, range.start, range.end, overrides, bookingByCompany]);

  const allVisits = partnerRows.reduce((s, r) => s + r.pageViews, 0);
  const allBookings = bookingStats.total;

  const note = rangeIncludesPreSourceDays(range.start)
    ? '방문: 파트너 홈 유입. 9/27 전은 페이지 연 횟수. 예약: 홈 예약완료(취소 제외)·접수일. 명함 QR 클릭 퍼널은 주차업체 관리.'
    : '방문: 파트너 홈(사람당 1). 예약: 홈 예약완료·접수일. 에어픽 짧은 경로는 위 카드. 명함 클릭 퍼널은 주차업체 관리.';

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
    <div className="space-y-4">
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
        {period === 'last7' ? ' · 오늘 기준' : ''}
      </p>
      <p className="px-1 text-[10px] text-zinc-600 font-semibold leading-relaxed">{note}</p>

      <HqAirpickShortPaths
        reservations={reservations}
        monthPrefix={monthPrefix}
        period={period}
        hidePeriodToggle
      />

      <div className="space-y-2.5">
        <div className="flex items-end justify-between px-1 gap-2">
          <div>
            <p className="text-xs font-black text-sky-300 tracking-wider">업체 홈</p>
            <p className="text-[11px] text-zinc-500 font-bold mt-0.5">
              업체별 → 링크 · 방문 + 예약완료
            </p>
          </div>
          <div className="flex gap-3 shrink-0 text-right">
            <div>
              <span className="text-[10px] text-zinc-500 font-bold block">방문 합</span>
              <span className="text-sm font-black font-mono text-amber-400">
                {days === null ? '…' : allVisits.toLocaleString()}
              </span>
            </div>
            <div>
              <span className="text-[10px] text-zinc-500 font-bold block">예약 합</span>
              <span className="text-sm font-black font-mono text-sky-300">
                {allBookings.toLocaleString()}
              </span>
            </div>
          </div>
        </div>

        {error ? (
          <p className="px-4 py-4 text-center text-xs text-zinc-500 font-bold">{error}</p>
        ) : days === null ? (
          <p className="px-4 py-4 text-center text-xs text-zinc-500 font-bold">방문 불러오는 중</p>
        ) : partnerRows.length === 0 ? (
          <p className="px-4 py-4 text-center text-xs text-zinc-500 font-bold">
            표시할 업체가 없습니다.
          </p>
        ) : (
          partnerRows.map((row) => (
            <PartnerCompanyCard
              key={row.id}
              companyId={row.id}
              name={row.name}
              pageViews={row.pageViews}
              bookingTotal={row.bookingTotal}
              channels={row.channels}
              visitCounts={row.visitCounts}
              bookingLinks={row.bookingLinks}
              saving={savingId === row.id}
              error={saveError[row.id]}
              onSave={(next) => void saveChannels(row.id, next)}
            />
          ))
        )}
      </div>
    </div>
  );
}
