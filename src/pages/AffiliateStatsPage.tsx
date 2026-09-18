import React, { useEffect, useState } from 'react';
import {
  fetchAffiliateStatsPublic,
  type AffiliateStatsPublicDto,
} from '../lib/affiliateStatsApi';
import {
  loginAffiliatePortal,
  logoutAffiliatePortal,
  resolveAffiliateAuthCode,
} from '../lib/affiliateLoginApi';
import { formatAffiliateRewardWon } from '../utils/affiliate';

type Props = {
  /** URL `/a/{code}` 이면 코드 칸에 미리 채움 */
  initialCode?: string | null;
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

export default function AffiliateStatsPage({ initialCode }: Props) {
  const [codeInput, setCodeInput] = useState(
    () => String(initialCode || '').trim().toLowerCase()
  );
  const [password, setPassword] = useState('');
  const [authedCode, setAuthedCode] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [days, setDays] = useState(90);
  const [data, setData] = useState<AffiliateStatsPublicDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loggingIn, setLoggingIn] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const code = await resolveAffiliateAuthCode();
      if (cancelled) return;
      setAuthedCode(code);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!authedCode) {
      setData(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const next = await fetchAffiliateStatsPublic({ days });
        if (!cancelled) {
          setData(next);
          setDisplayName(next.name || next.code);
        }
      } catch (err) {
        if (!cancelled) {
          setData(null);
          setError(err instanceof Error ? err.message : '불러오지 못했습니다.');
          if (
            err instanceof Error &&
            (err.message.includes('로그인') || err.message.includes('만료'))
          ) {
            setAuthedCode(null);
          }
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authedCode, days]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoggingIn(true);
    setError(null);
    try {
      const result = await loginAffiliatePortal({
        code: codeInput,
        password,
      });
      setAuthedCode(result.code);
      setDisplayName(result.name);
      setPassword('');
      try {
        window.history.replaceState(null, '', `/a/${encodeURIComponent(result.code)}`);
      } catch {
        /* ignore */
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '로그인에 실패했습니다.');
    } finally {
      setLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    await logoutAffiliatePortal();
    setAuthedCode(null);
    setData(null);
    setDisplayName('');
    setError(null);
    try {
      window.history.replaceState(null, '', '/a');
    } catch {
      /* ignore */
    }
  };

  if (!authedCode) {
    return (
      <div className="min-h-screen bg-black text-zinc-100 font-sans antialiased">
        <div className="mx-auto max-w-md px-4 py-10 space-y-6">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-amber-500/90">
              Airpick · 제휴 실적
            </p>
            <h1 className="mt-1 text-xl font-black tracking-tight">로그인</h1>
            <p className="mt-2 text-[12px] text-zinc-500 font-semibold leading-relaxed">
              본사에서 받은 제휴 코드와 비밀번호로 실적을 확인합니다. 주차 업체 Gate와는
              별도입니다.
            </p>
          </div>

          <form onSubmit={(e) => void handleLogin(e)} className="space-y-3">
            <label className="block space-y-1">
              <span className="text-[10px] font-black text-zinc-500 uppercase">제휴 코드</span>
              <input
                value={codeInput}
                onChange={(e) => setCodeInput(e.target.value.toLowerCase())}
                autoComplete="username"
                placeholder="kim01"
                className="w-full px-3 py-2.5 rounded-xl bg-[#1C1C1E] border border-neutral-800 text-sm font-mono font-bold"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-[10px] font-black text-zinc-500 uppercase">비밀번호</span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                className="w-full px-3 py-2.5 rounded-xl bg-[#1C1C1E] border border-neutral-800 text-sm font-bold"
              />
            </label>
            {error ? (
              <p className="text-[12px] text-rose-300 font-semibold leading-relaxed">{error}</p>
            ) : null}
            <button
              type="submit"
              disabled={loggingIn || !codeInput.trim() || !password}
              className="w-full py-2.5 rounded-xl bg-amber-500 text-neutral-950 text-sm font-black disabled:opacity-40"
            >
              {loggingIn ? '로그인 중…' : '실적 보기'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-zinc-100 font-sans antialiased">
      <div className="mx-auto max-w-md px-4 py-8 space-y-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-amber-500/90">
              Airpick · 제휴 실적
            </p>
            <h1 className="mt-1 text-xl font-black tracking-tight">
              {displayName || authedCode}
            </h1>
            <p className="mt-1 text-[12px] text-zinc-500 font-semibold">
              코드 <span className="font-mono text-zinc-300">{authedCode}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={() => void handleLogout()}
            className="shrink-0 text-[11px] font-black text-zinc-500 hover:text-zinc-300"
          >
            로그아웃
          </button>
        </div>

        <p className="text-[11px] text-zinc-600 font-semibold leading-relaxed rounded-xl border border-neutral-800 bg-[#141416] px-3 py-2">
          실적 확인용입니다. 고객 이름·전화·차량번호는 표시하지 않습니다.
        </p>

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
          <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 space-y-1">
            <p className="text-sm text-rose-300 font-black">열 수 없습니다</p>
            <p className="text-[12px] text-rose-200/90 font-semibold leading-relaxed">{error}</p>
          </div>
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
          </>
        ) : null}
      </div>
    </div>
  );
}
