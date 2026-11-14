import { useEffect, useMemo, useState } from 'react';
import { Phone } from 'lucide-react';
import { auth } from '../firebase';
import {
  PARTNER_APPLICATION_STATUS_LABEL,
  subscribePartnerApplications,
  updatePartnerApplication,
  type PartnerApplication,
  type PartnerApplicationStatus,
} from '../lib/partnerApplicationsFirestore';

function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ');
}

const FILTERS: Array<{ id: PartnerApplicationStatus | 'all'; label: string }> = [
  { id: 'new', label: '새 신청' },
  { id: 'contacted', label: '연락함' },
  { id: 'joined', label: '입점 완료' },
  { id: 'hold', label: '보류' },
  { id: 'all', label: '전체' },
];

const STATUS_TONE: Record<PartnerApplicationStatus, string> = {
  new: 'bg-red-500/15 text-red-300',
  contacted: 'bg-amber-500/15 text-amber-300',
  joined: 'bg-emerald-500/15 text-emerald-300',
  hold: 'bg-neutral-800 text-zinc-400',
};

/** 다음 단계 버튼 — 새 신청 → 연락함 → 입점 완료 */
const NEXT: Partial<Record<PartnerApplicationStatus, { to: PartnerApplicationStatus; label: string }>> = {
  new: { to: 'contacted', label: '연락함으로' },
  contacted: { to: 'joined', label: '입점 완료' },
  hold: { to: 'contacted', label: '다시 연락함' },
};

function formatPhone(d: string): string {
  if (d.length === 11) return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  return d;
}

function formatWhen(ms: number): string {
  if (!ms) return '—';
  const k = new Date(ms + 9 * 3600 * 1000);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${k.getUTCMonth() + 1}.${p(k.getUTCDate())} ${p(k.getUTCHours())}:${p(k.getUTCMinutes())}`;
}

/**
 * 본사 · 입점 신청함 — 에어픽.kr/join 상담 신청 (메일과 같은 내용).
 * 계획: docs/work/hq-app-refresh-plan.md
 */
export default function HqPartnerApplicationsView() {
  const [rows, setRows] = useState<PartnerApplication[] | null>(null);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<PartnerApplicationStatus | 'all'>('new');
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(
    () =>
      subscribePartnerApplications(
        (next) => {
          setRows(next);
          setError('');
        },
        (err) => setError(err.message || '불러오지 못했어요')
      ),
    []
  );

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: rows?.length ?? 0 };
    for (const r of rows || []) c[r.status] = (c[r.status] || 0) + 1;
    return c;
  }, [rows]);

  const visible = useMemo(
    () => (rows || []).filter((r) => filter === 'all' || r.status === filter),
    [rows, filter]
  );

  const setStatus = async (id: string, status: PartnerApplicationStatus) => {
    setBusyId(id);
    try {
      await updatePartnerApplication(id, { status }, auth.currentUser?.email || 'hq');
    } catch (err) {
      setError(err instanceof Error ? err.message : '저장하지 못했어요');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="bg-black min-h-screen text-zinc-100 px-4 pt-4 pb-24">
      <h2 className="text-base font-black text-white">입점 신청</h2>
      <p className="text-[12px] text-zinc-500 font-semibold mt-1">
        에어픽.kr/join 에서 들어온 상담 신청이에요. 메일과 같은 내용이 여기 쌓여요.
      </p>

      <div className="flex flex-wrap gap-2 mt-4 mb-3">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            className={cn(
              'px-3 py-1.5 rounded-full text-[12px] font-bold border',
              filter === f.id
                ? 'bg-zinc-100 text-neutral-950 border-zinc-100'
                : 'bg-neutral-900 text-zinc-400 border-neutral-800'
            )}
          >
            {f.label} {counts[f.id] ?? 0}
          </button>
        ))}
      </div>

      {error ? <p className="text-[12px] text-red-400 font-semibold mb-3">{error}</p> : null}

      {rows === null ? (
        <p className="py-12 text-center text-sm text-zinc-500">불러오는 중…</p>
      ) : visible.length === 0 ? (
        <p className="py-12 text-center text-sm text-zinc-500 font-semibold">
          {filter === 'new' ? '새 신청이 없어요.' : '해당하는 신청이 없어요.'}
        </p>
      ) : (
        <ul className="divide-y divide-neutral-800/80 border-y border-neutral-800/80">
          {visible.map((r) => {
            const next = NEXT[r.status];
            const busy = busyId === r.id;
            return (
              <li key={r.id} className="py-4 flex flex-col gap-3 md:flex-row md:items-center">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[14px] font-black text-white">{r.companyName || '(업체명 없음)'}</span>
                    <span className={cn('px-2 py-0.5 rounded-full text-[11px] font-black', STATUS_TONE[r.status])}>
                      {PARTNER_APPLICATION_STATUS_LABEL[r.status]}
                    </span>
                  </div>
                  <p className="text-[12px] text-zinc-400 mt-1">
                    {r.contactName} · {formatPhone(r.phone)} · {formatWhen(r.createdAtMs)}
                  </p>
                  {r.memo ? <p className="text-[12px] text-zinc-500 mt-1">{r.memo}</p> : null}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <a
                    href={`tel:${r.phone}`}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-neutral-700 bg-neutral-900 text-[12px] font-black text-zinc-200"
                  >
                    <Phone size={13} aria-hidden /> 전화
                  </a>
                  {next ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void setStatus(r.id, next.to)}
                      className="px-3 py-2 rounded-xl bg-amber-500 text-neutral-950 text-[12px] font-black disabled:opacity-50"
                    >
                      {next.label}
                    </button>
                  ) : null}
                  {r.status !== 'hold' && r.status !== 'joined' ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void setStatus(r.id, 'hold')}
                      className="px-3 py-2 rounded-xl text-[12px] font-bold text-zinc-500 hover:text-zinc-300 disabled:opacity-50"
                    >
                      보류
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
