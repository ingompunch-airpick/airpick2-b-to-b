import { useMemo, useState } from 'react';
import { Check, Search, X } from 'lucide-react';
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

interface HqPartnerBoardViewProps {
  companies: Company[];
  onUpdateCompanies: (updated: Company[]) => void;
  onToggleCompanyOpen: (companyId: string, isOpen: boolean) => Promise<void> | void;
  onRemoteOpen: (companyId: string) => void;
  onOpenPartnerEditor?: () => void;
  onOpenReviews?: (companyId: string) => void;
  /** 상위 「주차 업체」에 끼워 넣을 때 — 중복 헤더·대시보드형 카드 숨김 */
  embedded?: boolean;
}

export default function HqPartnerBoardView({
  companies,
  onUpdateCompanies,
  onToggleCompanyOpen,
  onRemoteOpen,
  onOpenPartnerEditor,
  onOpenReviews,
  embedded = false,
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

  const filters: Array<{ id: HqPartnerBoardFilter; label: string; count: number }> = [
    { id: 'all', label: '전체', count: rows.length },
    { id: 'open', label: '영업중', count: summary.open },
    { id: 'closed', label: '휴업', count: summary.closed },
    { id: 'suspended', label: '정지', count: summary.suspended },
    { id: 'incomplete', label: '미완', count: summary.incomplete },
  ];

  const toggleAccountStatus = async (companyId: string, current: 'active' | 'suspended') => {
    const nextStatus = current === 'active' ? 'suspended' : 'active';
    const label = nextStatus === 'suspended' ? '정지' : '가동';
    if (!window.confirm(`「${companyId}」 계정을 ${label}할까요?`)) return;

    setBusyId(companyId);
    const prev = companies;
    onUpdateCompanies(
      companies.map((c) => (c.id === companyId ? { ...c, status: nextStatus } : c))
    );
    try {
      await adminSetCompanyStatus({ companyId, status: nextStatus });
    } catch (err) {
      console.warn('adminSetCompanyStatus failed:', err);
      onUpdateCompanies(prev);
      window.alert(err instanceof Error ? err.message : '계정 상태 변경에 실패했습니다.');
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
    <div
      className={cn(
        'text-zinc-100 font-sans space-y-4',
        embedded ? 'px-4 pb-24' : 'min-h-screen bg-black p-4 pb-24'
      )}
    >
      {!embedded ? (
        <div className="space-y-1">
          <h2 className="text-sm font-black text-white">주차 업체 · 상태</h2>
          <p className="text-[11px] text-zinc-500 font-semibold">
            영업·정지·원격 접속. 매출·예약 숫자는 ① 대시보드에서 봅니다.
          </p>
        </div>
      ) : (
        <p className="text-[11px] text-zinc-500 font-semibold">
          영업·정지·원격. 매출·예약은 ① 대시보드.
        </p>
      )}

      <div className="space-y-2.5">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="업체명 · ID"
            className="w-full rounded-xl border border-neutral-800 bg-[#1C1C1E] pl-9 pr-3 py-2.5 text-sm text-white placeholder:text-zinc-600 outline-none focus:border-amber-500/40"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {filters.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setFilter(item.id)}
              className={cn(
                'px-2.5 py-1.5 rounded-lg text-[11px] font-black border transition-colors tabular-nums',
                filter === item.id
                  ? 'bg-amber-500 text-neutral-950 border-amber-500'
                  : 'bg-transparent text-zinc-400 border-neutral-800 hover:text-zinc-200'
              )}
            >
              {item.label} {item.count}
            </button>
          ))}
        </div>
      </div>

      {visible.length === 0 ? (
        <p className="py-12 text-center text-sm text-zinc-500 font-semibold">
          조건에 맞는 업체가 없습니다.
        </p>
      ) : (
        <ul className="divide-y divide-neutral-800/80 border-y border-neutral-800/80">
          {visible.map((row) => {
            const busy = busyId === row.id;
            return (
              <li key={row.id} className="py-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-black text-white truncate">{row.name}</h3>
                      {row.accountStatus === 'suspended' ? (
                        <span className="text-[10px] font-black text-rose-400">정지</span>
                      ) : null}
                      {row.incomplete ? (
                        <span className="text-[10px] font-black text-zinc-500">프로필 미완</span>
                      ) : null}
                    </div>
                    <p className="text-[11px] text-zinc-500 font-mono mt-0.5">
                      {row.id} · {row.airportLabel}
                      {row.parentCompanyId ? ` · →${row.parentCompanyId}` : ''}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onRemoteOpen(row.id)}
                    className="shrink-0 px-3 py-1.5 rounded-lg bg-amber-500 text-neutral-950 text-[11px] font-black disabled:opacity-50"
                  >
                    원격
                  </button>
                </div>

                <div className="flex flex-wrap gap-2 text-[11px]">
                  <button
                    type="button"
                    disabled={busy || row.accountStatus === 'suspended'}
                    onClick={() => void toggleOpen(row.id, !row.isOpen)}
                    className={cn(
                      'px-2.5 py-1 rounded-lg font-black border disabled:opacity-40',
                      row.isOpen
                        ? 'border-neutral-700 text-zinc-200'
                        : 'border-neutral-800 text-zinc-500'
                    )}
                  >
                    {row.isOpen ? '영업중' : '휴업'} · 전환
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void toggleAccountStatus(row.id, row.accountStatus)}
                    className={cn(
                      'px-2.5 py-1 rounded-lg font-black border disabled:opacity-40',
                      row.accountStatus === 'active'
                        ? 'border-neutral-800 text-zinc-400'
                        : 'border-rose-500/30 text-rose-400'
                    )}
                  >
                    {row.accountStatus === 'active' ? '계정 정지' : '정지 해제'}
                  </button>
                </div>

                <p className="text-[11px] text-zinc-500 font-semibold leading-relaxed">
                  마감 시간 {row.hourlyCapLabel} · 주차 {row.parkingCapLabel}
                  <span className="text-zinc-700"> · </span>
                  블락 {row.blockedCount}일
                  <span className="text-zinc-700"> · </span>
                  {onOpenReviews ? (
                    <button
                      type="button"
                      onClick={() => onOpenReviews(row.id)}
                      className="text-zinc-300 hover:text-amber-400 font-black"
                    >
                      ★ {row.rating || '-'} ({row.reviewsCount})
                    </button>
                  ) : (
                    <span>
                      ★ {row.rating || '-'} ({row.reviewsCount})
                    </span>
                  )}
                </p>

                <div className="flex flex-wrap items-center gap-1.5">
                  <ProfileChip ok={row.profile.insurance} label="보험" />
                  <ProfileChip ok={row.profile.address} label="주소" />
                  <ProfileChip ok={row.profile.photos} label="사진" />
                  {row.incomplete && onOpenPartnerEditor ? (
                    <button
                      type="button"
                      onClick={onOpenPartnerEditor}
                      className="ml-auto text-[11px] font-black text-amber-500/90 hover:text-amber-400"
                    >
                      등록·편집에서 보완 →
                    </button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function ProfileChip({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-black',
        ok ? 'text-zinc-400' : 'text-zinc-600 line-through'
      )}
    >
      {ok ? <Check size={10} /> : <X size={10} />}
      {label}
    </span>
  );
}
