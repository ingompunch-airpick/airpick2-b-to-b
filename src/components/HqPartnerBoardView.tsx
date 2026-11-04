import { useMemo, useState } from 'react';
import { Check, X } from 'lucide-react';
import type { Company } from '../types';
import { buildHqPartnerBoardRows } from '../utils/hqPartnerBoard';

function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ');
}

interface HqPartnerBoardViewProps {
  companies: Company[];
  onUpdateCompanies: (updated: Company[]) => void;
  onToggleCompanyOpen: (companyId: string, isOpen: boolean) => Promise<void> | void;
  onSetListingApproved?: (companyId: string, approved: boolean) => Promise<void> | void;
  onRemoteOpen: (companyId: string) => void;
  onOpenPartnerEditor?: () => void;
  onOpenReviews?: (companyId: string) => void;
  /** 상위 「주차 업체」에 끼워 넣을 때 — 중복 헤더 숨김 */
  embedded?: boolean;
}

export default function HqPartnerBoardView({
  companies,
  onToggleCompanyOpen,
  onSetListingApproved,
  onRemoteOpen,
  onOpenPartnerEditor,
  onOpenReviews,
  embedded = false,
}: HqPartnerBoardViewProps) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const rows = useMemo(() => buildHqPartnerBoardRows(companies), [companies]);

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
        'text-zinc-100 font-sans',
        embedded ? 'px-4 pb-24' : 'min-h-screen bg-black p-4 pb-24'
      )}
    >
      {!embedded ? (
        <div className="space-y-1 mb-4">
          <h2 className="text-sm font-black text-white">주차 업체 · 상태</h2>
          <p className="text-[11px] text-zinc-500 font-semibold">
            영업, 알림톡, 마감. 매출·예약은 ① 대시보드.
          </p>
        </div>
      ) : (
        <p className="text-[11px] text-zinc-500 font-semibold mb-3">
          영업, 알림톡, 마감. 매출·예약은 ① 대시보드.
        </p>
      )}

      {rows.length === 0 ? (
        <p className="py-12 text-center text-sm text-zinc-500 font-semibold">등록된 업체가 없습니다.</p>
      ) : (
        <ul className="divide-y divide-neutral-800/80 border-y border-neutral-800/80">
          {rows.map((row) => {
            const busy = busyId === row.id;
            return (
              <li key={row.id} className="py-4 space-y-2.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-black text-white truncate">{row.name}</h3>
                      {row.incomplete ? (
                        <span className="text-[10px] font-black text-zinc-500">프로필 미완</span>
                      ) : null}
                    </div>
                    <p className="text-[11px] text-zinc-500 font-mono mt-0.5">
                      {row.id} · {row.airportLabel}
                      {row.parentCompanyId ? ` · →${row.parentCompanyId}` : ''}
                    </p>
                    <p
                      className="mt-1 text-[11px] font-semibold text-zinc-500 truncate"
                      title={row.alimtalk.detail}
                    >
                      알림톡{' '}
                      <span
                        className={cn(
                          'font-black',
                          row.alimtalk.kind === 'partner' && 'text-zinc-300',
                          row.alimtalk.kind === 'airpick' && 'text-zinc-400',
                          row.alimtalk.kind === 'incomplete' && 'text-zinc-400',
                          row.alimtalk.kind === 'off' && 'text-zinc-600'
                        )}
                      >
                        {row.alimtalk.label}
                      </span>
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void toggleOpen(row.id, !row.isOpen)}
                      className={cn(
                        'px-2.5 py-1.5 rounded-lg text-[11px] font-black border disabled:opacity-40',
                        row.isOpen
                          ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                          : 'border-neutral-700 bg-neutral-900 text-zinc-400'
                      )}
                    >
                      {row.isOpen ? '영업중' : '휴업'}
                    </button>
                    <button
                      type="button"
                      disabled={busy || !onSetListingApproved}
                      onClick={() =>
                        void (async () => {
                          if (!onSetListingApproved) return;
                          setBusyId(row.id);
                          try {
                            await onSetListingApproved(row.id, !row.listingApproved);
                          } finally {
                            setBusyId(null);
                          }
                        })()
                      }
                      className={cn(
                        'px-2.5 py-1.5 rounded-lg text-[11px] font-black border disabled:opacity-40',
                        row.listingApproved
                          ? 'border-sky-500/30 bg-sky-500/10 text-sky-300'
                          : 'border-neutral-700 bg-neutral-900 text-zinc-400'
                      )}
                    >
                      {row.listingApproved ? '손님앱' : '숨김'}
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => onRemoteOpen(row.id)}
                      className="px-3 py-1.5 rounded-lg bg-amber-500 text-neutral-950 text-[11px] font-black disabled:opacity-50"
                    >
                      원격
                    </button>
                  </div>
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
