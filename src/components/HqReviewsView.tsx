import { useCallback, useEffect, useMemo, useState } from 'react';
import { EyeOff, Loader2, MessageSquareWarning, Star, Trash2 } from 'lucide-react';
import type { Company } from '../types';
import {
  listAdminReviews,
  moderateReview,
  type AdminReview,
} from '../lib/adminReviewsApi';
import { isAirpickHeadquarters } from '../constants/platform';

function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ');
}

type StatusFilter = 'all' | 'published' | 'hidden';

function formatCreatedAt(raw: string): string {
  const t = raw.trim();
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

interface HqReviewsViewProps {
  companies: Company[];
  /** 상태판에서 넘어올 때 업체 필터 */
  initialCompanyId?: string | null;
  onInitialCompanyConsumed?: () => void;
}

export default function HqReviewsView({
  companies,
  initialCompanyId = null,
  onInitialCompanyConsumed,
}: HqReviewsViewProps) {
  const [reviews, setReviews] = useState<AdminReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [companyFilter, setCompanyFilter] = useState('all');
  const [ratingFilter, setRatingFilter] = useState(0);

  useEffect(() => {
    const id = String(initialCompanyId || '').trim();
    if (!id) return;
    setCompanyFilter(id);
    onInitialCompanyConsumed?.();
  }, [initialCompanyId, onInitialCompanyConsumed]);

  const companyOptions = useMemo(
    () =>
      companies
        .filter((c) => c.id && !isAirpickHeadquarters(c.id))
        .slice()
        .sort((a, b) => String(a.name || a.id).localeCompare(String(b.name || b.id), 'ko')),
    [companies]
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const rows = await listAdminReviews();
      setReviews(rows);
    } catch (err) {
      setReviews([]);
      setError(err instanceof Error ? err.message : '후기 목록을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = useMemo(() => {
    return reviews.filter((r) => {
      const status = (r.status || 'published').toLowerCase();
      if (statusFilter === 'published' && status === 'hidden') return false;
      if (statusFilter === 'hidden' && status !== 'hidden') return false;
      if (companyFilter !== 'all' && r.companyId !== companyFilter) return false;
      if (ratingFilter > 0 && r.rating !== ratingFilter) return false;
      return true;
    });
  }, [reviews, statusFilter, companyFilter, ratingFilter]);

  const runModerate = async (id: string, action: 'hide' | 'delete') => {
    const label =
      action === 'hide'
        ? '숨기면 손님 앱·업체 평점에서 빠집니다. 계속할까요?'
        : '후기를 완전히 삭제할까요? 되돌릴 수 없습니다.';
    if (!window.confirm(label)) return;

    setBusyId(id);
    setError('');
    try {
      const result = await moderateReview(id, action);
      setReviews((prev) => {
        if (action === 'delete') return prev.filter((r) => r.id !== id);
        return prev.map((r) => (r.id === id ? { ...r, status: 'hidden' } : r));
      });
      if (result.aggregate) {
        // 목록만 갱신 — companies 구독이 평점 필드를 곧 따라옴
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '처리에 실패했습니다.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-white p-4 pb-24 font-sans space-y-5 animate-fade-in">
      <div className="flex flex-col gap-3 bg-neutral-900/40 p-5 rounded-[22px] border border-neutral-900/60 shadow-md">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-gradient-to-br from-violet-500 to-violet-600 rounded-[18px] text-zinc-950 shadow-lg shadow-violet-500/10">
              <MessageSquareWarning size={24} className="stroke-[2.5]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-black tracking-tight text-white">후기 관리</h2>
                <span className="text-[12px] bg-amber-500/10 text-amber-500 border border-amber-500/20 px-2 py-0.5 rounded-lg font-black">
                  본사
                </span>
              </div>
              <p className="text-[12px] text-zinc-500 mt-0.5">
                게시·숨김 후기를 확인하고 숨기거나 삭제합니다.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="shrink-0 px-3 py-1.5 rounded-xl border border-neutral-700 bg-neutral-900 text-[12px] font-black text-zinc-200 disabled:opacity-50"
          >
            새로고침
          </button>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex flex-wrap gap-1.5">
          {(
            [
              ['all', '전체'],
              ['published', '게시중'],
              ['hidden', '숨김'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setStatusFilter(id)}
              className={cn(
                'px-3 py-1.5 rounded-full text-[12px] font-black border',
                statusFilter === id
                  ? 'bg-violet-500 text-neutral-950 border-violet-400'
                  : 'bg-neutral-900 text-zinc-400 border-neutral-800'
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <select
            value={companyFilter}
            onChange={(e) => setCompanyFilter(e.target.value)}
            className="rounded-2xl border border-neutral-800 bg-[#1C1C1E] px-3 py-2.5 text-sm text-white outline-none"
          >
            <option value="all">전체 업체</option>
            {companyOptions.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name || c.id}
              </option>
            ))}
          </select>
          <select
            value={ratingFilter}
            onChange={(e) => setRatingFilter(Number(e.target.value) || 0)}
            className="rounded-2xl border border-neutral-800 bg-[#1C1C1E] px-3 py-2.5 text-sm text-white outline-none"
          >
            <option value={0}>별점 전체</option>
            {[5, 4, 3, 2, 1].map((n) => (
              <option key={n} value={n}>
                ★ {n}점만
              </option>
            ))}
          </select>
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-3 py-2.5 text-[12px] font-bold text-rose-300">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-zinc-500 text-sm font-bold">
          <Loader2 size={16} className="animate-spin" />
          불러오는 중…
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-[22px] border border-neutral-800 bg-[#1C1C1E] px-4 py-10 text-center text-sm text-zinc-500 font-bold">
          조건에 맞는 후기가 없습니다.
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map((review) => {
            const hidden = (review.status || '').toLowerCase() === 'hidden';
            const busy = busyId === review.id;
            return (
              <article
                key={review.id}
                className="rounded-[22px] border border-neutral-800 bg-[#1C1C1E] p-4 space-y-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="inline-flex items-center gap-0.5 text-amber-400 font-black text-sm">
                        <Star size={13} className="fill-amber-400" />
                        {review.rating}
                      </span>
                      <span className="text-sm font-black text-white truncate">
                        {review.companyName || review.companyId || '업체미상'}
                      </span>
                      {hidden && (
                        <span className="text-[11px] font-black px-1.5 py-0.5 rounded-md bg-zinc-500/20 text-zinc-300 border border-zinc-500/30">
                          숨김
                        </span>
                      )}
                    </div>
                    <p className="text-[12px] text-zinc-500 mt-0.5">
                      {review.authorMask}
                      {review.carMask ? ` · ${review.carMask}` : ''}
                      {' · '}
                      {formatCreatedAt(review.createdAt)}
                    </p>
                  </div>
                </div>

                {review.body ? (
                  <p className="text-[13px] text-zinc-200 leading-relaxed whitespace-pre-wrap">
                    {review.body}
                  </p>
                ) : (
                  <p className="text-[12px] text-zinc-600 font-bold">본문 없음</p>
                )}

                {review.photoUrls && review.photoUrls.length > 0 && (
                  <div className="flex gap-2 overflow-x-auto no-scrollbar">
                    {review.photoUrls.map((url) => (
                      <a
                        key={url}
                        href={url}
                        target="_blank"
                        rel="noreferrer"
                        className="shrink-0 w-16 h-16 rounded-xl overflow-hidden border border-neutral-700 bg-neutral-900"
                      >
                        <img src={url} alt="" className="w-full h-full object-cover" />
                      </a>
                    ))}
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <p className="text-[11px] text-zinc-600 font-mono mr-auto truncate max-w-[50%]">
                    {review.reservationId}
                  </p>
                  {!hidden && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void runModerate(review.id, 'hide')}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-zinc-600 bg-neutral-900 text-[11px] font-black text-zinc-200 disabled:opacity-50"
                    >
                      <EyeOff size={12} />
                      숨김
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void runModerate(review.id, 'delete')}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-rose-500/40 bg-rose-500/10 text-[11px] font-black text-rose-300 disabled:opacity-50"
                  >
                    <Trash2 size={12} />
                    삭제
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
