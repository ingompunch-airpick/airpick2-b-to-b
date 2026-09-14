import React, { useEffect, useState } from 'react';
import {
  fetchAffiliateStatsPublic,
  type AffiliateStatsPublicDto,
} from '../lib/affiliateStatsApi';
import { formatAffiliateRewardWon } from '../utils/affiliate';

type Props = {
  code: string;
};

function Metric({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl border border-neutral-800 bg-[#141416] px-4 py-4">
      <p className="text-[10px] font-black uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="mt-1 text-2xl font-black text-zinc-100 tabular-nums">{value}</p>
      {sub ? <p className="mt-0.5 text-[11px] font-semibold text-zinc-500">{sub}</p> : null}
    </div>
  );
}

export default function AffiliateStatsPage({ code }: Props) {
  const [days, setDays] = useState(90);
  const [data, setData] = useState<AffiliateStatsPublicDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get('t')?.trim() || '';
    if (!token) {
      setError('링크에 토큰이 없습니다. 본사에서 받은 실적 링크를 사용해 주세요.');
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const next = await fetchAffiliateStatsPublic({ code, token, days });
        if (!cancelled) setData(next);
      } catch (err) {
        if (!cancelled) {
          setData(null);
          setError(err instanceof Error ? err.message : '불러오지 못했습니다.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [code, days]);

  return (
    <div className="min-h-screen bg-black text-zinc-100 font-sans antialiased">
      <div className="mx-auto max-w-md px-4 py-8 space-y-5">
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-amber-500/90">
            Airpick · 제휴 실적
          </p>
          <h1 className="mt-1 text-xl font-black tracking-tight">
            {data?.name || code}
          </h1>
          <p className="mt-1 text-[12px] text-zinc-500 font-semibold">
            코드 <span className="font-mono text-zinc-400">{code}</span> · 고객 개인정보는 표시하지 않습니다
          </p>
        </div>

        <label className="block space-y-1">
          <span className="text-[10px] font-black text-zinc-500 uppercase">기간</span>
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="w-full px-3 py-2.5 rounded-xl bg-[#1C1C1E] border border-neutral-800 text-sm font-bold"
          >
            <option value={30}>최근 30일</option>
            <option value={90}>최근 90일</option>
            <option value={365}>최근 1년</option>
          </select>
        </label>

        {loading ? (
          <p className="text-sm text-zinc-500 font-semibold">불러오는 중…</p>
        ) : error ? (
          <p className="text-sm text-rose-400 font-semibold">{error}</p>
        ) : data ? (
          <>
            <div className="grid grid-cols-2 gap-2">
              <Metric label="유입 예약" value={`${data.bookings}`} />
              <Metric label="출고 완료" value={`${data.completedOut}`} />
              <Metric label="취소" value={`${data.cancelled}`} />
              <Metric
                label="예상 페이백"
                value={formatAffiliateRewardWon(data.creditEarnedWon)}
                sub={`출고 완료 × ${formatAffiliateRewardWon(data.referrerCreditWon)}`}
              />
            </div>
            <div className="rounded-2xl border border-neutral-800 bg-[#1C1C1E] px-4 py-3 text-[12px] text-zinc-400 font-semibold space-y-1">
              <p>
                건당 고객 할인{' '}
                <span className="text-zinc-200">
                  {formatAffiliateRewardWon(data.customerDiscountWon)}
                </span>
              </p>
              <p>
                건당 제휴 페이백{' '}
                <span className="text-zinc-200">
                  {formatAffiliateRewardWon(data.referrerCreditWon)}
                </span>
              </p>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
