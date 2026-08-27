import React, { useEffect, useMemo, useState } from 'react';
import { Copy, QrCode, RefreshCw } from 'lucide-react';
import type { Company } from '../types';
import {
  acquisitionSourceLabel,
  buildAcquisitionBookingUrl,
  defaultAcquisitionCampaign,
} from '../utils/acquisition';
import {
  loadAcquisitionFunnelForCompany,
  type AcquisitionFunnelStats,
} from '../lib/acquisitionFirestore';
import { formatPartnerDisplayName } from '../utils/companyDisplay';

type Props = {
  companies: Company[];
  /** 본사가 아니면 자기 업체만 */
  currentCompanyId: string;
  isSuperAdmin?: boolean;
};

function companyLabel(c: Company): string {
  return formatPartnerDisplayName(c.name, c.id);
}

function Metric({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl border border-neutral-800 bg-[#141416] px-3 py-3">
      <p className="text-[10px] font-black uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="mt-1 text-xl font-black text-zinc-100 tabular-nums">{value}</p>
      {sub ? <p className="mt-0.5 text-[10px] font-semibold text-zinc-500">{sub}</p> : null}
    </div>
  );
}

export default function AcquisitionFunnelView({
  companies,
  currentCompanyId,
  isSuperAdmin = false,
}: Props) {
  const options = useMemo(() => {
    const list = isSuperAdmin
      ? companies.filter((c) => c.id && c.id !== 'airpick')
      : companies.filter((c) => c.id === currentCompanyId);
    return list.slice().sort((a, b) => companyLabel(a).localeCompare(companyLabel(b), 'ko'));
  }, [companies, currentCompanyId, isSuperAdmin]);

  const [companyId, setCompanyId] = useState(
    () => options[0]?.id || currentCompanyId || ''
  );
  const [days, setDays] = useState(30);
  const [stats, setStats] = useState<AcquisitionFunnelStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!options.some((c) => c.id === companyId) && options[0]) {
      setCompanyId(options[0].id);
    }
  }, [options, companyId]);

  const goUrl = useMemo(
    () =>
      buildAcquisitionBookingUrl(companyId, {
        source: 'business_card',
        medium: 'qr',
      }),
    [companyId]
  );

  const campaignHint = useMemo(
    () => defaultAcquisitionCampaign(companyId, 'business_card'),
    [companyId]
  );

  const load = async () => {
    if (!companyId) return;
    setLoading(true);
    setError(null);
    try {
      const since = new Date();
      since.setDate(since.getDate() - days);
      const next = await loadAcquisitionFunnelForCompany(companyId, {
        sinceIso: since.toISOString(),
      });
      setStats(next);
    } catch (err) {
      setStats(null);
      setError(err instanceof Error ? err.message : '통계를 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, days]);

  const copyUrl = async () => {
    if (!goUrl) return;
    try {
      await navigator.clipboard.writeText(goUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      window.prompt('URL 복사', goUrl);
    }
  };

  return (
    <div className="space-y-4 p-4 max-w-3xl mx-auto">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-2xl bg-amber-500/15 border border-amber-500/25 flex items-center justify-center text-amber-400 shrink-0">
          <QrCode size={18} />
        </div>
        <div className="min-w-0">
          <h2 className="text-base font-black text-white">명함 QR · 유입 성과</h2>
          <p className="text-[11px] text-zinc-500 font-semibold mt-0.5">
            본사 전용 · 업체별 스캔→예약 전환과 명함용 URL
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 items-end">
        {isSuperAdmin ? (
          <label className="space-y-1">
            <span className="text-[10px] font-black text-zinc-500 uppercase">업체</span>
            <select
              value={companyId}
              onChange={(e) => setCompanyId(e.target.value)}
              className="block w-full min-w-[10rem] px-3 py-2 rounded-xl bg-neutral-950 border border-neutral-800 text-sm text-zinc-100 font-bold"
            >
              {options.map((c) => (
                <option key={c.id} value={c.id}>
                  {companyLabel(c)}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <label className="space-y-1">
          <span className="text-[10px] font-black text-zinc-500 uppercase">기간</span>
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="block px-3 py-2 rounded-xl bg-neutral-950 border border-neutral-800 text-sm text-zinc-100 font-bold"
          >
            <option value={7}>최근 7일</option>
            <option value={30}>최근 30일</option>
            <option value={90}>최근 90일</option>
          </select>
        </label>
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-neutral-700 text-[11px] font-black text-zinc-300 hover:text-white"
        >
          <RefreshCw size={12} className={loading ? 'animate-spin' : undefined} />
          새로고침
        </button>
      </div>

      <div className="rounded-2xl border border-neutral-800 bg-[#1C1C1E] p-4 space-y-2">
        <p className="text-[11px] font-black text-zinc-300">명함용 QR URL</p>
        <p className="text-[10px] text-zinc-500 font-semibold break-all font-mono">{goUrl || '—'}</p>
        <p className="text-[10px] text-zinc-600 font-semibold">
          /h/…?src=business_card · campaign={campaignHint}
        </p>
        <button
          type="button"
          onClick={() => void copyUrl()}
          className="inline-flex items-center gap-1.5 mt-1 px-3 py-1.5 rounded-xl bg-amber-500 text-neutral-950 text-[11px] font-black"
        >
          <Copy size={12} />
          {copied ? '복사됨' : 'URL 복사'}
        </button>
        <p className="text-[10px] text-zinc-500 font-semibold pt-1">
          전단지 등: URL에{' '}
          <span className="font-mono text-zinc-400">?src=flyer</span> 또는{' '}
          <span className="font-mono text-zinc-400">?src=instagram&amp;med=qr</span> 를 붙이면
          됩니다.
        </p>
      </div>

      {error ? (
        <p className="text-sm font-semibold text-red-400">{error}</p>
      ) : null}

      {stats ? (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            <Metric label="QR 스캔" value={`${stats.scans}`} />
            <Metric label="고유 방문" value={`${stats.uniqueVisitors}`} sub="visitorKey 기준" />
            <Metric label="예약페이지 도착" value={`${stats.pageArrivals}`} />
            <Metric label="QR 유입 예약" value={`${stats.bookings}`} />
            <Metric
              label="예약 전환율"
              value={`${stats.conversionRate}%`}
              sub="예약 ÷ 스캔"
            />
          </div>

          {Object.keys(stats.bySource).length > 0 ? (
            <div className="rounded-2xl border border-neutral-800 overflow-hidden">
              <table className="w-full text-left text-[12px]">
                <thead className="bg-[#1C1C1E] text-[10px] text-zinc-500 font-black uppercase">
                  <tr>
                    <th className="px-3 py-2">소스</th>
                    <th className="px-3 py-2">스캔</th>
                    <th className="px-3 py-2">도착</th>
                    <th className="px-3 py-2">예약</th>
                    <th className="px-3 py-2">전환</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(stats.bySource).map(([src, row]) => (
                    <tr key={src} className="border-t border-neutral-800/80 text-zinc-300">
                      <td className="px-3 py-2 font-bold">{acquisitionSourceLabel(src)}</td>
                      <td className="px-3 py-2 tabular-nums">{row.scans}</td>
                      <td className="px-3 py-2 tabular-nums">{row.arrivals}</td>
                      <td className="px-3 py-2 tabular-nums">{row.bookings}</td>
                      <td className="px-3 py-2 tabular-nums">{row.conversionRate}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-[12px] text-zinc-500 font-semibold">
              아직 이 기간의 QR 스캔이 없습니다. 명함에 URL을 넣어 배포해 보세요.
            </p>
          )}
        </>
      ) : loading ? (
        <p className="text-[12px] text-zinc-500 font-semibold">불러오는 중…</p>
      ) : null}
    </div>
  );
}
