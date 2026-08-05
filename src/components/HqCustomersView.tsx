import { useMemo, useState } from 'react';
import { Loader2, Search, UserRoundSearch } from 'lucide-react';
import type { Company, Reservation } from '../types';
import {
  lookupCustomerByPhone,
  type HqCustomerLookupResult,
} from '../lib/adminCustomerLookup';
import { isAirpickHeadquarters } from '../constants/platform';
import { statusToLabel } from '../utils/reservationStatus';
import { formatPhoneDisplay } from '../utils/phone';

function formatWhen(raw?: string): string {
  const t = String(raw || '').trim();
  if (!t) return '-';
  const d = new Date(t);
  if (Number.isNaN(d.getTime())) return t.slice(0, 16);
  return d.toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function money(n: number): string {
  return `${Math.max(0, Math.trunc(n || 0)).toLocaleString('ko-KR')}원`;
}

interface HqCustomersViewProps {
  companies: Company[];
  onOpenReservation?: (res: Reservation) => void;
}

export default function HqCustomersView({
  companies,
  onOpenReservation,
}: HqCustomersViewProps) {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<HqCustomerLookupResult | null>(null);
  const [searched, setSearched] = useState(false);

  const companyNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of companies) {
      if (!c.id || isAirpickHeadquarters(c.id)) continue;
      map.set(c.id, String(c.name || c.id));
    }
    return map;
  }, [companies]);

  const runSearch = async () => {
    setLoading(true);
    setError('');
    setSearched(true);
    try {
      const data = await lookupCustomerByPhone(query);
      setResult(data);
    } catch (err) {
      setResult(null);
      setError(err instanceof Error ? err.message : '조회에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-white p-4 pb-24 font-sans space-y-5 animate-fade-in">
      <div className="flex flex-col gap-3 bg-neutral-900/40 p-5 rounded-[22px] border border-neutral-900/60 shadow-md">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-[18px] text-zinc-950 shadow-lg shadow-emerald-500/10">
            <UserRoundSearch size={24} className="stroke-[2.5]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-black tracking-tight text-white">고객 조회</h2>
              <span className="text-[12px] bg-amber-500/10 text-amber-500 border border-amber-500/20 px-2 py-0.5 rounded-lg font-black">
                본사
              </span>
            </div>
            <p className="text-[12px] text-zinc-500 mt-0.5">
              휴대폰 번호로 방문 횟수·예약 이력을 찾습니다.
            </p>
          </div>
        </div>

        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void runSearch();
          }}
        >
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="010-1234-5678"
              inputMode="tel"
              className="w-full rounded-2xl border border-neutral-800 bg-[#1C1C1E] pl-9 pr-3 py-2.5 text-sm text-white placeholder:text-zinc-600 outline-none focus:border-emerald-500/40"
            />
          </div>
          <button
            type="submit"
            disabled={loading || !query.trim()}
            className="shrink-0 px-4 py-2.5 rounded-2xl bg-emerald-500 text-neutral-950 text-xs font-black disabled:opacity-50"
          >
            {loading ? '조회…' : '조회'}
          </button>
        </form>
      </div>

      {error && (
        <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-3 py-2.5 text-[12px] font-bold text-rose-300">
          {error}
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center gap-2 py-12 text-zinc-500 text-sm font-bold">
          <Loader2 size={16} className="animate-spin" />
          조회 중…
        </div>
      )}

      {!loading && searched && result && (
        <div className="space-y-4">
          <section className="rounded-[22px] border border-neutral-800 bg-[#1C1C1E] p-4 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-black text-white">
                  {result.customer?.nameLast || '이름 미확인'}
                </h3>
                <p className="text-[12px] text-zinc-500 font-mono mt-0.5">
                  {result.phoneDisplay}
                </p>
              </div>
              {result.customer ? (
                <span className="text-[11px] font-black px-2 py-1 rounded-lg bg-emerald-500/15 text-emerald-400 border border-emerald-500/25">
                  방문 {result.customer.visitCount}회
                </span>
              ) : (
                <span className="text-[11px] font-black px-2 py-1 rounded-lg bg-zinc-500/15 text-zinc-400 border border-zinc-500/25">
                  고객 문서 없음
                </span>
              )}
            </div>

            {result.customer ? (
              <div className="grid grid-cols-2 gap-2 text-[12px]">
                <div className="rounded-xl border border-neutral-800/80 bg-neutral-950/40 px-2.5 py-2">
                  <p className="text-zinc-500 font-bold mb-0.5">첫 방문</p>
                  <p className="font-bold text-zinc-200">{formatWhen(result.customer.firstAt)}</p>
                </div>
                <div className="rounded-xl border border-neutral-800/80 bg-neutral-950/40 px-2.5 py-2">
                  <p className="text-zinc-500 font-bold mb-0.5">최근 방문</p>
                  <p className="font-bold text-zinc-200">{formatWhen(result.customer.lastAt)}</p>
                </div>
                <div className="col-span-2 rounded-xl border border-neutral-800/80 bg-neutral-950/40 px-2.5 py-2">
                  <p className="text-zinc-500 font-bold mb-1">이용한 업체</p>
                  <div className="flex flex-wrap gap-1.5">
                    {(result.customer.companyIds || []).length === 0 ? (
                      <span className="text-zinc-500">기록 없음</span>
                    ) : (
                      (result.customer.companyIds || []).map((id) => (
                        <span
                          key={id}
                          className="px-2 py-0.5 rounded-md bg-neutral-900 border border-neutral-700 text-zinc-300 font-bold"
                        >
                          {companyNameById.get(id) || id}
                        </span>
                      ))
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-[12px] text-zinc-500 font-bold">
                방문 집계 문서는 없지만, 아래 예약이 있으면 동일 번호로 조회된 건입니다.
              </p>
            )}
          </section>

          <section className="space-y-2">
            <h4 className="text-xs font-black text-zinc-400 px-1">
              예약 이력 ({result.reservations.length})
            </h4>
            {result.reservations.length === 0 ? (
              <div className="rounded-[22px] border border-neutral-800 bg-[#1C1C1E] px-4 py-8 text-center text-sm text-zinc-500 font-bold">
                예약이 없습니다.
              </div>
            ) : (
              result.reservations.map((res) => (
                <article
                  key={res.id}
                  className="rounded-[22px] border border-neutral-800 bg-[#1C1C1E] p-4 space-y-2"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-black text-white truncate">
                        {res.companyName || companyNameById.get(res.companyId) || res.companyId}
                      </p>
                      <p className="text-[12px] text-zinc-500 mt-0.5">
                        {res.carNumber || '차량미상'}
                        {res.userName ? ` · ${res.userName}` : ''}
                      </p>
                    </div>
                    <span className="shrink-0 text-[11px] font-black px-2 py-1 rounded-lg bg-neutral-900 border border-neutral-700 text-zinc-300">
                      {statusToLabel(res.status, 'admin')}
                    </span>
                  </div>
                  <p className="text-[12px] text-zinc-400 font-bold">
                    {(res.departureDate || '-').slice(5)} {res.departureTime || ''}
                    {' → '}
                    {(res.arrivalDate || '-').slice(5)} {res.arrivalTime || ''}
                    <span className="text-zinc-600"> · </span>
                    {money(res.totalPrice || 0)}
                  </p>
                  <div className="flex items-center gap-2">
                    <p className="text-[11px] text-zinc-600 font-mono truncate mr-auto">
                      {res.id}
                    </p>
                    {onOpenReservation && (
                      <button
                        type="button"
                        onClick={() => onOpenReservation(res)}
                        className="text-[11px] font-black text-emerald-400 underline underline-offset-2"
                      >
                        상세
                      </button>
                    )}
                  </div>
                </article>
              ))
            )}
          </section>
        </div>
      )}

      {!loading && searched && !result && !error && (
        <div className="rounded-[22px] border border-neutral-800 bg-[#1C1C1E] px-4 py-8 text-center text-sm text-zinc-500 font-bold">
          결과가 없습니다.
        </div>
      )}

      {!loading && !searched && (
        <p className="text-center text-[12px] text-zinc-600 font-bold px-4">
          예: {formatPhoneDisplay('01012345678')}
        </p>
      )}
    </div>
  );
}
