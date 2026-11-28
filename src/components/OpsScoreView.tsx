import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Award,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Gauge,
  Loader2,
  RefreshCw,
  XCircle,
} from 'lucide-react';
import type { Company, Reservation } from '../types';
import {
  fetchCompanyScore,
  fetchScoreMonth,
  kstMonth,
  monthLabel,
  nextMonth,
  recomputeScoreMonth,
  type OpsCompanyScore,
  type OpsMiss,
  type OpsMissKind,
  type OpsMonthSummary,
} from '../lib/opsScore';
import { resolveOperatorCompanyIds } from '../utils/operatorHierarchy';
import { isWawaCompany } from '../utils/pricing';
import { appConfirm } from './AppDialogHost';

function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ');
}

const MISS_LABEL: Record<OpsMissKind, string> = {
  photo: '입고 사진',
  parking: '주차 위치',
  speed: '입고 처리 속도',
  checkout: '출고 처리',
  cancel: '업체 사정 취소',
  review: '손님 후기',
};

const MISS_ORDER: OpsMissKind[] = ['checkout', 'cancel', 'photo', 'parking', 'speed', 'review'];

function pct(ok: number, total: number): string {
  return total > 0 ? `${Math.round((ok / total) * 100)}%` : '—';
}

function pts(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

function shortYmd(ymd: string): string {
  return ymd ? `${Number(ymd.slice(5, 7))}/${Number(ymd.slice(8, 10))}` : '';
}

function computedLabel(iso: string): string {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return '';
  const k = new Date(ms + 9 * 60 * 60 * 1000).toISOString();
  return `${Number(k.slice(5, 7))}월 ${Number(k.slice(8, 10))}일 ${k.slice(11, 16)}`;
}

function weightLabel(weight: number): string {
  if (weight >= 3) return '맨 위에 가장 자주';
  if (weight === 2) return '맨 위에 자주';
  if (weight === 1) return '돌아가며 보통';
  return '아래쪽 고정';
}

function statusHeadline(s: OpsCompanyScore): string {
  if (s.status === 'below') return '기준 미달';
  if (s.status === 'few') return '순위 없음 · 에어픽 입고 5건 미만';
  const prefix = s.final ? `${monthLabel(s.month)} ` : '지금까지 ';
  return `${prefix}${s.rank}등 / ${s.rankedCount}곳`;
}

function MinimumRow({ ok, label, value }: { ok: boolean | null; label: string; value: string }) {
  return (
    <li className="flex items-center justify-between gap-3 py-2">
      <span className="flex items-center gap-2 text-[14px] text-zinc-200">
        {ok == null ? (
          <span className="w-4 h-4 rounded-full border border-zinc-600 shrink-0" />
        ) : ok ? (
          <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
        ) : (
          <XCircle size={16} className="text-rose-400 shrink-0" />
        )}
        {label}
      </span>
      <span className={cn('text-[13px] font-bold text-right', ok === false ? 'text-rose-300' : 'text-zinc-400')}>
        {value}
      </span>
    </li>
  );
}

export function ScoreDetail({
  score,
  reservationsById,
  onOpenReservation,
}: {
  score: OpsCompanyScore;
  reservationsById: Map<string, Reservation>;
  onOpenReservation?: (res: Reservation) => void;
}) {
  const { items, minimum } = score;
  const ratioPct = Math.round(minimum.ratio * 100);
  const ratioChecked = score.status !== 'few';
  const missesByKind = useMemo(() => {
    const map = new Map<OpsMissKind, OpsMiss[]>();
    for (const m of score.misses || []) {
      const list = map.get(m.kind);
      if (list) list.push(m);
      else map.set(m.kind, [m]);
    }
    return MISS_ORDER.filter((k) => map.has(k)).map((k) => [k, map.get(k)!] as const);
  }, [score.misses]);

  const rows: Array<{ label: string; detail: string; points: number; max: number | null }> = [
    { label: '입고 사진', detail: `${items.photo.ok}/${items.photo.total}건 4장 이상`, points: items.photo.points, max: items.photo.max },
    { label: '주차 위치', detail: `${items.parking.ok}/${items.parking.total}건 주차장 선택`, points: items.parking.points, max: items.parking.max },
    { label: '입고 처리 속도', detail: `${items.speed.ok}/${items.speed.total}건 맡기는 시각 3시간 안`, points: items.speed.points, max: items.speed.max },
    { label: '출고 처리', detail: `${items.checkout.ok}/${items.checkout.total}건 찾는 날 안`, points: items.checkout.points, max: items.checkout.max },
    { label: '손님 후기', detail: items.review.low ? `1~3점 ${items.review.low}건` : '1~3점 후기 없음', points: items.review.points, max: items.review.max },
    { label: '업체 사정 취소', detail: items.cancel.count ? `${items.cancel.count}건` : '없음', points: items.cancel.points, max: items.cancel.max },
    { label: '자체 예약 가산', detail: `입고까지 간 자체 예약 ${items.own.count}건 (20건 +5 · 50건 +10)`, points: items.own.points, max: null },
  ];

  const next = nextMonth(score.month);

  return (
    <div className="space-y-4">
      <div className="rounded-[22px] border border-neutral-800 bg-[#1C1C1E] p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[13px] font-bold text-zinc-500">{score.companyName}</p>
            <p className="mt-1 text-[34px] leading-none font-black text-white">
              {pts(score.score)}
              <span className="ml-1 text-[15px] font-bold text-zinc-500">점</span>
            </p>
            <p
              className={cn(
                'mt-2 text-[14px] font-black',
                score.status === 'below' ? 'text-rose-300' : score.status === 'few' ? 'text-zinc-400' : 'text-amber-400'
              )}
            >
              {statusHeadline(score)}
            </p>
          </div>
          {score.badge && (
            <span className="shrink-0 inline-flex items-center gap-1 rounded-xl border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[12px] font-black text-amber-400">
              <Award size={14} />
              이달의 기록 우수
            </span>
          )}
        </div>
        <p className="mt-3 text-[13px] text-zinc-400 leading-relaxed">
          {score.trial
            ? `${monthLabel(score.month)}은 시험 계산이에요. 손님 목록 순서에는 쓰지 않아요.`
            : score.final
              ? `${monthLabel(next)} 손님 추천순: ${weightLabel(score.weight)}`
              : `이대로 끝나면 ${monthLabel(next)} 손님 추천순: ${weightLabel(score.weight)}`}
        </p>
        {score.computedAt && (
          <p className="mt-1 text-[12px] text-zinc-600">
            {computedLabel(score.computedAt)} 기준{score.final ? ' · 확정' : ' · 매일 오후 1시에 바뀌어요'}
          </p>
        )}
      </div>

      <section className="rounded-[22px] border border-neutral-800 bg-[#1C1C1E] px-4 py-3">
        <h3 className="text-[14px] font-black text-white">최소 기준</h3>
        <p className="text-[12px] text-zinc-500 mt-0.5">하나라도 못 넘으면 추천순 아래쪽에 고정돼요.</p>
        <ul className="mt-1 divide-y divide-neutral-800">
          <MinimumRow
            ok={ratioChecked && items.photo.total > 0 ? minimum.photo : null}
            label="입고 사진 4장 이상"
            value={`${pct(items.photo.ok, items.photo.total)} · 기준 ${ratioPct}% 이상`}
          />
          <MinimumRow
            ok={ratioChecked && items.parking.total > 0 ? minimum.parking : null}
            label="보관 주차장 선택"
            value={`${pct(items.parking.ok, items.parking.total)} · 기준 ${ratioPct}% 이상`}
          />
          <MinimumRow
            ok={minimum.checkout}
            label="출고 미처리"
            value={`${minimum.checkoutOpen}건 · 기준 0건`}
          />
          <MinimumRow
            ok={minimum.cancel}
            label="업체 사정 취소"
            value={`${items.cancel.count}건 · 기준 ${minimum.cancelMax}건 이하`}
          />
        </ul>
        {!ratioChecked && (
          <p className="mt-1 text-[12px] text-zinc-500">
            에어픽 입고가 5건이 안 돼 사진·주차장 비율은 아직 보지 않아요.
          </p>
        )}
      </section>

      <section className="rounded-[22px] border border-neutral-800 bg-[#1C1C1E] px-4 py-3">
        <h3 className="text-[14px] font-black text-white">항목별 점수</h3>
        <p className="text-[12px] text-zinc-500 mt-0.5">
          에어픽 예약 {score.airpickIntakes}건 중 입고 {score.checkedIn}건 기준이에요.
        </p>
        <ul className="mt-1 divide-y divide-neutral-800">
          {rows.map((row) => (
            <li key={row.label} className="flex items-center justify-between gap-3 py-2">
              <div className="min-w-0">
                <p className="text-[14px] text-zinc-200">{row.label}</p>
                <p className="text-[12px] text-zinc-500">{row.detail}</p>
              </div>
              <p className="shrink-0 text-[15px] font-black text-white">
                {row.max == null ? `+${pts(row.points)}` : pts(row.points)}
                {row.max != null && <span className="text-[12px] font-bold text-zinc-500"> / {row.max}</span>}
              </p>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-[22px] border border-neutral-800 bg-[#1C1C1E] px-4 py-3">
        <h3 className="text-[14px] font-black text-white">점수가 깎인 예약</h3>
        {missesByKind.length === 0 ? (
          <p className="py-3 text-[13px] text-zinc-500">없어요.</p>
        ) : (
          <div className="mt-2 space-y-3">
            {missesByKind.map(([kind, list]) => (
              <div key={kind}>
                <p className="text-[12px] font-black text-zinc-400">
                  {MISS_LABEL[kind]} · {list.length}건
                </p>
                <ul className="mt-1 space-y-1">
                  {list.map((m) => {
                    const res = reservationsById.get(m.reservationId);
                    const canOpen = Boolean(res && onOpenReservation);
                    return (
                      <li key={`${m.kind}-${m.reservationId}`}>
                        <button
                          type="button"
                          disabled={!canOpen}
                          onClick={() => res && onOpenReservation?.(res)}
                          className={cn(
                            'w-full flex items-center justify-between gap-2 rounded-xl px-3 py-2 text-left border',
                            m.blocking ? 'border-rose-500/30 bg-rose-500/10' : 'border-neutral-800 bg-neutral-900/60',
                            canOpen ? 'active:bg-neutral-800' : 'cursor-default'
                          )}
                        >
                          <span className="min-w-0 text-[13px] text-zinc-200">
                            <span className="font-black">{shortYmd(m.ymd)}</span>
                            {res?.userName ? ` · ${res.userName}` : ''}
                            {m.carTail ? ` · ${res?.carNumber || `··${m.carTail}`}` : ''}
                          </span>
                          <span className={cn('shrink-0 text-[12px] font-bold', m.blocking ? 'text-rose-300' : 'text-zinc-400')}>
                            {m.note}
                            {m.blocking ? ' · 미처리' : ''}
                          </span>
                          {canOpen && <ChevronRight size={14} className="shrink-0 text-zinc-600" />}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
            {score.missTotal > (score.misses || []).length && (
              <p className="text-[12px] text-zinc-500">최근 {score.misses.length}건만 보여요 (전체 {score.missTotal}건).</p>
            )}
          </div>
        )}
      </section>

      <details className="rounded-[22px] border border-neutral-800 bg-neutral-900/40 px-4 py-3 text-[13px] text-zinc-400">
        <summary className="cursor-pointer font-black text-zinc-300">점수는 이렇게 매겨요</summary>
        <ul className="mt-2 space-y-1 leading-relaxed list-disc pl-4">
          <li>에어픽으로 받은 예약만 봐요. 맡기는 날이 그달인 예약이 기준이에요.</li>
          <li>입고 사진은 앞·뒤·양옆 4장 이상, 주차 위치는 입고 때 보관 주차장을 고른 것이에요.</li>
          <li>입고 처리 속도는 맡기는 시각부터 입고완료를 누를 때까지 3시간 안이면 통과예요. 손님이 늦게 오면 맡기는 시각을 고쳐 주세요.</li>
          <li>출고는 찾는 날 안에 출고완료를 누르면 통과, 다음 날 정오까지 안 누르면 미처리예요.</li>
          <li>후기는 1~3점 한 건마다 5점 빠져요. 후기 개수는 점수에 넣지 않아요.</li>
          <li>취소할 때 「업체 사정」을 고른 에어픽 예약만 업체 사정 취소로 세요.</li>
          <li>순위는 매달 1일 오후에 정해져요. 1등·2등은 80점 이상일 때만 맨 위에 더 자주 나와요.</li>
        </ul>
      </details>
    </div>
  );
}

interface OpsScoreViewProps {
  companies: Company[];
  currentCompanyId: string;
  /** 본사 홈 — 전체 업체 순위 */
  isHq: boolean;
  reservations: Reservation[];
  onOpenReservation?: (res: Reservation) => void;
}

export default function OpsScoreView({
  companies,
  currentCompanyId,
  isHq,
  reservations,
  onOpenReservation,
}: OpsScoreViewProps) {
  const months = useMemo(() => [kstMonth(0), kstMonth(-1)], []);
  const [month, setMonth] = useState(months[0]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState<OpsMonthSummary | null>(null);
  const [scores, setScores] = useState<OpsCompanyScore[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const reservationsById = useMemo(() => {
    const map = new Map<string, Reservation>();
    for (const r of reservations) if (r.id) map.set(r.id, r);
    return map;
  }, [reservations]);

  const partnerIds = useMemo(() => {
    if (isHq) return [];
    const ids = new Set(resolveOperatorCompanyIds(currentCompanyId, companies));
    if (isWawaCompany(currentCompanyId)) {
      for (const c of companies) if (isWawaCompany(c.id, c.name)) ids.add(c.id);
      ids.add('wawa');
    }
    if (ids.size === 0 && currentCompanyId) ids.add(currentCompanyId);
    return [...ids];
  }, [isHq, currentCompanyId, companies]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      if (isHq) {
        setSummary(await fetchScoreMonth(month));
        setScores([]);
      } else {
        const found = await Promise.all(partnerIds.map((id) => fetchCompanyScore(id, month).catch(() => null)));
        const seen = new Set<string>();
        setScores(
          found.filter((s): s is OpsCompanyScore => {
            if (!s || seen.has(s.companyId)) return false;
            seen.add(s.companyId);
            return true;
          })
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '점수를 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, [isHq, month, partnerIds]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!isHq || !selectedId) return;
    let alive = true;
    void fetchCompanyScore(selectedId, month)
      .then((s) => {
        if (alive) setScores(s ? [s] : []);
      })
      .catch(() => {
        if (alive) setScores([]);
      });
    return () => {
      alive = false;
    };
  }, [isHq, selectedId, month]);

  const recompute = async () => {
    const isPast = month !== months[0];
    if (isPast) {
      const ok = await appConfirm(
        `${monthLabel(month)} 점수를 지금 기록으로 다시 확정합니다.\n확정 순위와 다음 달 추천순 가중치가 바뀔 수 있어요.`,
        { okLabel: '다시 확정' }
      );
      if (!ok) return;
    }
    setBusy(true);
    setError('');
    try {
      await recomputeScoreMonth(month);
      await load();
      if (selectedId) setScores((await fetchCompanyScore(selectedId, month).then((s) => (s ? [s] : [])).catch(() => [])));
    } catch (err) {
      setError(err instanceof Error ? err.message : '다시 계산하지 못했습니다.');
    } finally {
      setBusy(false);
    }
  };

  const header = (
    <div className="flex flex-col gap-3 bg-neutral-900/40 p-5 rounded-[22px] border border-neutral-900/60 shadow-md">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-gradient-to-br from-amber-400 to-amber-500 rounded-[18px] text-zinc-950 shadow-lg shadow-amber-500/10">
            <Gauge size={24} className="stroke-[2.5]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-[15px] font-black tracking-tight text-white">에어픽 운영 점수</h2>
              {isHq && (
                <span className="text-[12px] bg-amber-500/10 text-amber-500 border border-amber-500/20 px-2 py-0.5 rounded-lg font-black">
                  본사
                </span>
              )}
            </div>
            <p className="text-[13px] text-zinc-500 mt-0.5">
              에어픽 예약을 앱에서 끝까지 잘 처리할수록 손님 목록 맨 위에 더 자주 나와요.
            </p>
          </div>
        </div>
        {isHq && (
          <button
            type="button"
            onClick={() => void recompute()}
            disabled={busy || loading}
            className="shrink-0 inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border border-neutral-700 bg-neutral-900 text-[12px] font-black text-zinc-200 disabled:opacity-50"
          >
            {busy ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
            {month === months[0] ? '지금 다시 계산' : '다시 확정'}
          </button>
        )}
      </div>
      <div className="flex gap-1.5">
        {months.map((m, i) => (
          <button
            key={m}
            type="button"
            onClick={() => {
              setMonth(m);
              setSelectedId(null);
            }}
            className={cn(
              'px-3 py-1.5 rounded-full text-[12px] font-black border',
              month === m ? 'bg-amber-500 text-neutral-950 border-amber-400' : 'bg-neutral-900 text-zinc-400 border-neutral-800'
            )}
          >
            {monthLabel(m)} {i === 0 ? '(진행 중)' : '(확정)'}
          </button>
        ))}
      </div>
    </div>
  );

  const body = (() => {
    if (loading) {
      return (
        <div className="flex items-center justify-center gap-2 py-16 text-zinc-500 text-[15px] font-bold">
          <Loader2 size={16} className="animate-spin" />
          불러오는 중…
        </div>
      );
    }

    if (isHq && selectedId) {
      return (
        <div className="space-y-3">
          <button
            type="button"
            onClick={() => {
              setSelectedId(null);
              setScores([]);
            }}
            className="inline-flex items-center gap-1 text-[13px] font-black text-zinc-400"
          >
            <ChevronLeft size={15} />
            전체 순위
          </button>
          {scores[0] ? (
            <ScoreDetail score={scores[0]} reservationsById={reservationsById} onOpenReservation={onOpenReservation} />
          ) : (
            <div className="flex items-center justify-center gap-2 py-10 text-zinc-500 text-[14px] font-bold">
              <Loader2 size={15} className="animate-spin" />
            </div>
          )}
        </div>
      );
    }

    if (isHq) {
      if (!summary) {
        return (
          <div className="rounded-[22px] border border-neutral-800 bg-[#1C1C1E] px-4 py-10 text-center text-[14px] text-zinc-500 font-bold">
            {monthLabel(month)} 점수가 아직 없어요. 「{month === months[0] ? '지금 다시 계산' : '다시 확정'}」을 누르면 바로 계산해요.
          </div>
        );
      }
      return (
        <div className="space-y-2">
          <p className="text-[12px] text-zinc-500 px-1">
            {computedLabel(summary.computedAt)} 기준
            {summary.final ? ' · 확정' : ' · 진행 중'}
            {summary.trial ? ' · 시험 계산 (추천순에 안 씀)' : ''}
            {` · 최소 기준 ${summary.strict ? '90' : '80'}%`}
          </p>
          <div className="rounded-[22px] border border-neutral-800 bg-[#1C1C1E] divide-y divide-neutral-800 overflow-hidden">
            {summary.companies.map((row) => (
              <button
                key={row.companyId}
                type="button"
                onClick={() => setSelectedId(row.companyId)}
                className="w-full flex items-center gap-3 px-4 py-3 text-left active:bg-neutral-800"
              >
                <span
                  className={cn(
                    'w-14 shrink-0 text-[13px] font-black',
                    row.status === 'ranked' ? 'text-amber-400' : row.status === 'below' ? 'text-rose-300' : 'text-zinc-500'
                  )}
                >
                  {row.status === 'ranked' ? `${row.rank}등` : row.status === 'below' ? '미달' : '순위 없음'}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1 text-[14px] font-black text-white truncate">
                    {row.companyName}
                    {row.badge && <Award size={13} className="text-amber-400 shrink-0" />}
                  </span>
                  <span className="block text-[12px] text-zinc-500">
                    입고 {row.checkedIn}건 · 깎인 예약 {row.missTotal}건 · 가중치 {row.weight}
                  </span>
                </span>
                <span className="shrink-0 text-[17px] font-black text-white">{pts(row.score)}</span>
                <ChevronRight size={15} className="shrink-0 text-zinc-600" />
              </button>
            ))}
          </div>
        </div>
      );
    }

    if (scores.length === 0) {
      return (
        <div className="rounded-[22px] border border-neutral-800 bg-[#1C1C1E] px-4 py-10 text-center text-[14px] text-zinc-500 font-bold leading-relaxed">
          {monthLabel(month)} 점수가 아직 없어요.
          <br />
          매일 오후 1시에 에어픽 예약 기록으로 계산해요.
        </div>
      );
    }

    return (
      <div className="space-y-6">
        {scores.map((s) => (
          <ScoreDetail key={s.companyId} score={s} reservationsById={reservationsById} onOpenReservation={onOpenReservation} />
        ))}
      </div>
    );
  })();

  return (
    <div className="min-h-screen bg-neutral-950 text-white p-4 pb-24 font-sans space-y-5 animate-fade-in">
      {header}
      {error && (
        <div className="flex items-start gap-2 rounded-2xl border border-rose-500/30 bg-rose-500/10 px-3 py-2.5 text-[13px] font-bold text-rose-300">
          <AlertTriangle size={15} className="shrink-0 mt-0.5" />
          {error}
        </div>
      )}
      {body}
    </div>
  );
}
