import { useMemo, useState } from 'react';
import {
  Building2,
  Check,
  Search,
  X,
} from 'lucide-react';
import type { Company } from '../types';
import { adminSetCompanyStatus } from '../lib/adminCompanyApi';
import {
  buildHqPartnerBoardRows,
  filterHqPartnerBoardRows,
  summarizeHqPartnerBoard,
  type HqPartnerBoardFilter,
} from '../utils/hqPartnerBoard';

function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ');
}

const FILTERS: Array<{ id: HqPartnerBoardFilter; label: string }> = [
  { id: 'all', label: '전체' },
  { id: 'open', label: '영업중' },
  { id: 'closed', label: '휴업' },
  { id: 'suspended', label: '정지' },
  { id: 'incomplete', label: '프로필 미완' },
];

interface HqPartnerBoardViewProps {
  companies: Company[];
  onUpdateCompanies: (updated: Company[]) => void;
  onToggleCompanyOpen: (companyId: string, isOpen: boolean) => Promise<void> | void;
  onRemoteOpen: (companyId: string) => void;
  onOpenPartnerEditor?: () => void;
  /** 평점 탭 → 해당 업체 후기 관리 */
  onOpenReviews?: (companyId: string) => void;
}

export default function HqPartnerBoardView({
  companies,
  onUpdateCompanies,
  onToggleCompanyOpen,
  onRemoteOpen,
  onOpenPartnerEditor,
  onOpenReviews,
}: HqPartnerBoardViewProps) {
  const [filter, setFilter] = useState<HqPartnerBoardFilter>('all');
  const [query, setQuery] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const rows = useMemo(() => buildHqPartnerBoardRows(companies), [companies]);
  const summary = useMemo(() => summarizeHqPartnerBoard(rows), [rows]);
  const visible = useMemo(
    () => filterHqPartnerBoardRows(rows, filter, query),
    [rows, filter, query]
  );

  const toggleAccountStatus = async (companyId: string, current: 'active' | 'suspended') => {
    const nextStatus = current === 'active' ? 'suspended' : 'active';
    const label = nextStatus === 'suspended' ? '정지' : '가동';
    if (!window.confirm(`「${companyId}」 계정을 ${label}할까요?`)) return;

    setBusyId(companyId);
    const prev = companies;
    onUpdateCompanies(
      companies.map((c) =>
        c.id === companyId ? { ...c, status: nextStatus } : c
      )
    );
    try {
      await adminSetCompanyStatus({ companyId, status: nextStatus });
    } catch (err) {
      console.warn('adminSetCompanyStatus failed:', err);
      onUpdateCompanies(prev);
      window.alert(
        err instanceof Error ? err.message : '계정 상태 변경에 실패했습니다.'
      );
    } finally {
      setBusyId(null);
    }
  };

  const toggleOpen = async (companyId: string, nextOpen: boolean) => {
    setBusyId(companyId);
    try {
      await onToggleCompanyOpen(companyId, nextOpen);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-white p-4 pb-24 font-sans space-y-5 animate-fade-in">
      <div className="flex flex-col gap-3 bg-neutral-900/40 p-5 rounded-[22px] border border-neutral-900/60 shadow-md">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-gradient-to-br from-sky-500 to-sky-600 rounded-[18px] text-zinc-950 shadow-lg shadow-sky-500/10">
            <Building2 size={24} className="stroke-[2.5]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-black tracking-tight text-white">업체 상태판</h2>
              <span className="text-[12px] bg-amber-500/10 text-amber-500 border border-amber-500/20 px-2 py-0.5 rounded-lg font-black">
                본사
              </span>
            </div>
            <p className="text-[12px] text-zinc-500 mt-0.5">
              영업·마감·프로필을 한눈에 보고 원격으로 들어갑니다.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {[
            { label: '영업중', value: summary.open, tone: 'text-emerald-400' },
            { label: '휴업', value: summary.closed, tone: 'text-amber-400' },
            { label: '정지', value: summary.suspended, tone: 'text-rose-400' },
            { label: '프로필 미완', value: summary.incomplete, tone: 'text-sky-400' },
          ].map((card) => (
            <div
              key={card.label}
              className="rounded-2xl border border-neutral-800 bg-[#1C1C1E] px-3 py-2.5"
            >
              <p className="text-[11px] text-zinc-500 font-bold">{card.label}</p>
              <p className={cn('text-lg font-black tabular-nums', card.tone)}>{card.value}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="업체명 · ID 검색"
            className="w-full rounded-2xl border border-neutral-800 bg-[#1C1C1E] pl-9 pr-3 py-2.5 text-sm text-white placeholder:text-zinc-600 outline-none focus:border-sky-500/40"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setFilter(item.id)}
              className={cn(
                'px-3 py-1.5 rounded-full text-[12px] font-black border transition-colors',
                filter === item.id
                  ? 'bg-sky-500 text-neutral-950 border-sky-400'
                  : 'bg-neutral-900 text-zinc-400 border-neutral-800'
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="rounded-[22px] border border-neutral-800 bg-[#1C1C1E] px-4 py-10 text-center text-sm text-zinc-500 font-bold">
          조건에 맞는 업체가 없습니다.
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map((row) => {
            const busy = busyId === row.id;
            return (
              <article
                key={row.id}
                className="rounded-[22px] border border-neutral-800 bg-[#1C1C1E] p-4 space-y-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <h3 className="text-sm font-black text-white truncate">{row.name}</h3>
                      {row.accountStatus === 'suspended' && (
                        <span className="text-[11px] font-black px-1.5 py-0.5 rounded-md bg-rose-500/15 text-rose-400 border border-rose-500/20">
                          정지
                        </span>
                      )}
                      {row.incomplete && (
                        <span className="text-[11px] font-black px-1.5 py-0.5 rounded-md bg-sky-500/15 text-sky-400 border border-sky-500/20">
                          미완
                        </span>
                      )}
                    </div>
                    <p className="text-[12px] text-zinc-500 font-mono mt-0.5">
                      {row.id} · {row.airportLabel}
                      {row.parentCompanyId ? ` · 하위→${row.parentCompanyId}` : ''}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onRemoteOpen(row.id)}
                    className="shrink-0 px-3 py-1.5 rounded-xl bg-amber-500 text-neutral-950 text-[12px] font-black disabled:opacity-50"
                  >
                    원격
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2 text-[12px]">
                  <div className="rounded-xl border border-neutral-800/80 bg-neutral-950/40 px-2.5 py-2">
                    <p className="text-zinc-500 font-bold mb-1">영업</p>
                    <button
                      type="button"
                      disabled={busy || row.accountStatus === 'suspended'}
                      onClick={() => void toggleOpen(row.id, !row.isOpen)}
                      className={cn(
                        'px-2 py-1 rounded-lg text-[11px] font-black border disabled:opacity-40',
                        row.isOpen
                          ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25'
                          : 'bg-amber-500/15 text-amber-400 border-amber-500/25'
                      )}
                    >
                      {row.isOpen ? '영업중' : '휴업'} · 전환
                    </button>
                  </div>
                  <div className="rounded-xl border border-neutral-800/80 bg-neutral-950/40 px-2.5 py-2">
                    <p className="text-zinc-500 font-bold mb-1">계정</p>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void toggleAccountStatus(row.id, row.accountStatus)}
                      className={cn(
                        'px-2 py-1 rounded-lg text-[11px] font-black border disabled:opacity-40',
                        row.accountStatus === 'active'
                          ? 'bg-zinc-500/15 text-zinc-300 border-zinc-500/25'
                          : 'bg-rose-500/15 text-rose-400 border-rose-500/25'
                      )}
                    >
                      {row.accountStatus === 'active' ? '가동중 · 정지' : '정지됨 · 해제'}
                    </button>
                  </div>
                  <div className="rounded-xl border border-neutral-800/80 bg-neutral-950/40 px-2.5 py-2">
                    <p className="text-zinc-500 font-bold mb-1">마감</p>
                    <p className="font-bold text-zinc-200">
                      시간 {row.hourlyCapLabel}
                      <span className="text-zinc-600"> · </span>
                      주차 {row.parkingCapLabel}
                    </p>
                  </div>
                  <div className="rounded-xl border border-neutral-800/80 bg-neutral-950/40 px-2.5 py-2">
                    <p className="text-zinc-500 font-bold mb-1">블락 / 평점</p>
                    <div className="flex flex-wrap items-center gap-1.5 font-bold text-zinc-200">
                      <span>블락 {row.blockedCount}일</span>
                      <span className="text-zinc-600">·</span>
                      {onOpenReviews ? (
                        <button
                          type="button"
                          onClick={() => onOpenReviews(row.id)}
                          className="text-amber-400 underline underline-offset-2 decoration-amber-400/40 hover:text-amber-300"
                          title="이 업체 후기 보기"
                        >
                          ★ {row.rating || '-'} ({row.reviewsCount})
                        </button>
                      ) : (
                        <span>
                          ★ {row.rating || '-'} ({row.reviewsCount})
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <ProfileChip ok={row.profile.insurance} label="보험" />
                  <ProfileChip ok={row.profile.address} label="주소" />
                  <ProfileChip ok={row.profile.photos} label="사진" />
                  {row.incomplete && onOpenPartnerEditor && (
                    <button
                      type="button"
                      onClick={onOpenPartnerEditor}
                      className="ml-auto text-[11px] font-black text-sky-400 underline underline-offset-2"
                    >
                      제휴업체에서 보완
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ProfileChip({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-black border',
        ok
          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
          : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
      )}
    >
      {ok ? <Check size={11} /> : <X size={11} />}
      {label}
    </span>
  );
}
