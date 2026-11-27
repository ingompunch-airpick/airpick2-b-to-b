import { useMemo, useRef, useState } from 'react';
import { AlertTriangle, Check, ExternalLink, FileUp, Loader2 } from 'lucide-react';
import type { Company } from '../types';
import {
  analyzeInboxDocuments,
  applyInboxDocuments,
  inboxPreviewUrl,
  MAX_IMPORT_FILES,
  type InboxApplyItem,
  type InboxDocResult,
} from '../lib/documentImportApi';
import { isAirpickHeadquarters } from '../constants/platform';
import { useFileDropPaste } from '../hooks/useFileDropPaste';

/**
 * 본사 「주차 업체 → 서류함」 — 업체 상관없이 서류를 넣으면
 * AI가 종류를 나누고 어느 업체 것인지 맞춘다. 「적용」하면 업체마다 바로 저장된다.
 * 손님에게는 주민등록번호 뒤 7자리만 가린 서류가 나간다.
 */

function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ');
}

function dot(iso?: string): string {
  return iso ? iso.replace(/-/g, '.') : '';
}

const APPLICABLE = new Set(['business_registration', 'insurance_certificate']);

interface DocState {
  include: boolean;
  companyIds: string[];
  maskChecked: boolean;
  previewUrl?: string;
}

export default function HqDocumentInbox({ companies }: { companies: Company[] }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState('');
  const [results, setResults] = useState<InboxDocResult[]>([]);
  const [state, setState] = useState<Record<string, DocState>>({});
  const [saved, setSaved] = useState<Array<{ companyId: string; docType: string; ok: boolean; error?: string }>>(
    []
  );

  const companyOptions = useMemo(
    () =>
      companies
        .filter((c) => c.id && !isAirpickHeadquarters(c.id) && c.id !== 'demo')
        .map((c) => ({ id: c.id, name: String(c.name || c.id) }))
        .sort((a, b) => a.name.localeCompare(b.name, 'ko')),
    [companies]
  );
  const nameOf = (id: string) => companyOptions.find((c) => c.id === id)?.name || id;

  const pick = async (list: FileList | File[] | null) => {
    const files = Array.from(list || []);
    if (!files.length) return;
    setError('');
    setResults([]);
    setState({});
    setSaved([]);
    if (files.length > MAX_IMPORT_FILES) {
      setError(`한 번에 ${MAX_IMPORT_FILES}장까지 읽어요. 앞의 ${MAX_IMPORT_FILES}장만 읽을게요.`);
    }
    setBusy(true);
    try {
      const res = await analyzeInboxDocuments(files);
      const next: Record<string, DocState> = {};
      for (const r of res) {
        const picked = r.candidates.filter((c) => c.selected).map((c) => c.companyId);
        next[r.path] = {
          include: r.ok && APPLICABLE.has(String(r.docType)) && !!r.maskedPath && picked.length > 0,
          companyIds: picked,
          maskChecked: false,
        };
      }
      setResults(res);
      setState(next);
      // 가린 사본 미리보기 주소 (본사만 열람)
      const urls = await Promise.all(
        res.map((r) => (r.maskedPath ? inboxPreviewUrl(r.maskedPath).catch(() => '') : Promise.resolve('')))
      );
      setState((prev) => {
        const copy = { ...prev };
        res.forEach((r, i) => {
          if (urls[i] && copy[r.path]) copy[r.path] = { ...copy[r.path], previewUrl: urls[i] };
        });
        return copy;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : '서류를 읽지 못했어요.');
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const { dragging, dropProps } = useFileDropPaste((files) => void pick(files), !busy && !applying);

  const update = (path: string, patch: Partial<DocState>) =>
    setState((prev) => ({ ...prev, [path]: { ...prev[path], ...patch } }));

  const toggleCompany = (path: string, companyId: string) => {
    const cur = state[path]?.companyIds || [];
    const next = cur.includes(companyId) ? cur.filter((c) => c !== companyId) : [...cur, companyId];
    update(path, { companyIds: next, include: next.length > 0 });
  };

  const ready = results.filter((r) => {
    const s = state[r.path];
    return (
      s?.include &&
      r.ok &&
      APPLICABLE.has(String(r.docType)) &&
      r.maskedPath &&
      s.companyIds.length > 0 &&
      (r.publishable || s.maskChecked)
    );
  });

  const applyAll = async () => {
    if (!ready.length) return;
    setApplying(true);
    setError('');
    try {
      const items: InboxApplyItem[] = ready.map((r) => {
        const s = state[r.path];
        const ins = r.suggestion.insurance;
        return {
          maskedPath: r.maskedPath!,
          docType: r.docType as InboxApplyItem['docType'],
          companyIds: s.companyIds,
          ...(r.docType === 'business_registration' ? { business: r.business } : {}),
          ...(r.docType === 'insurance_certificate'
            ? {
                insurance: {
                  provider: ins?.provider,
                  productName: ins?.productName,
                  coverageLimitText: ins?.coverageLimitText,
                  periodStart: ins?.periodStart,
                  periodEnd: ins?.periodEnd,
                  insuredName: r.insurance?.insuredName,
                  policyNumber: r.insurance?.policyNumber,
                },
              }
            : {}),
        };
      });
      setSaved(await applyInboxDocuments(items));
      setResults((prev) => prev.filter((r) => !ready.includes(r)));
    } catch (err) {
      setError(err instanceof Error ? err.message : '저장하지 못했어요.');
    } finally {
      setApplying(false);
    }
  };

  return (
    <div className="px-4 pt-4 pb-24 space-y-4" {...dropProps}>
      <div>
        <h3 className="text-[17px] font-black text-white">서류함</h3>
        <p className="mt-1 text-[15px] font-semibold leading-relaxed text-zinc-400">
          업체 상관없이 사업자등록증·보험증권을 넣으세요. 종류를 나누고 어느 업체 것인지 찾아요. 손님에게는
          주민등록번호 뒤 7자리만 가린 서류가 보여요.
        </p>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*,application/pdf"
        multiple
        className="hidden"
        onChange={(e) => void pick(e.target.files)}
      />
      <button
        type="button"
        disabled={busy || applying}
        onClick={() => inputRef.current?.click()}
        className={cn(
          'flex w-full flex-col items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed py-8 disabled:opacity-50',
          dragging
            ? 'border-amber-400 bg-amber-500/15 text-amber-200'
            : 'border-neutral-700 bg-neutral-950 text-zinc-200 hover:border-amber-500/60'
        )}
      >
        {busy ? <Loader2 size={22} className="animate-spin" aria-hidden /> : <FileUp size={22} aria-hidden />}
        <span className="text-[16px] font-black">
          {busy ? '읽는 중… 장당 10초쯤 걸려요' : dragging ? '여기에 놓으세요' : '서류를 끌어다 놓거나 눌러서 고르기'}
        </span>
        {!busy ? (
          <span className="text-[14px] font-semibold text-zinc-500">
            캡처한 사진은 ⌘V(Ctrl+V)로 붙여넣어도 돼요 · 사진·PDF {MAX_IMPORT_FILES}장까지
          </span>
        ) : null}
      </button>

      {error ? (
        <p role="alert" className="text-[15px] font-bold text-red-300">
          {error}
        </p>
      ) : null}

      {saved.length ? (
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 space-y-1.5">
          {saved.map((s, i) => (
            <p
              key={`${s.companyId}-${s.docType}-${i}`}
              className={cn('text-[15px] font-bold', s.ok ? 'text-emerald-300' : 'text-red-300')}
            >
              {s.ok ? '✓' : '✕'} {nameOf(s.companyId)} ·{' '}
              {s.docType === 'business_registration' ? '사업자등록증' : '보험'}{' '}
              {s.ok ? '저장했어요' : `실패 — ${s.error || ''}`}
            </p>
          ))}
          <p className="pt-1 text-[14px] font-semibold text-zinc-300">
            「상태」 탭 → 에어픽 확인에서 직접 본 항목을 「확인 완료」 해 주세요.
          </p>
        </div>
      ) : null}

      {results.length ? (
        <ul className="space-y-3">
          {results.map((r) => {
            const s = state[r.path] || { include: false, companyIds: [], maskChecked: false };
            const applicable = r.ok && APPLICABLE.has(String(r.docType)) && !!r.maskedPath;
            const ins = r.insurance;
            const biz = r.business;
            const others = companyOptions.filter(
              (c) => !r.candidates.some((x) => x.companyId === c.id)
            );
            return (
              <li key={r.path} className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4 space-y-2.5">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-[16px] font-black text-white">
                    {r.ok ? r.docTypeLabel : '읽지 못함'}
                  </span>
                  {r.docTitle && r.docTitle !== r.docTypeLabel ? (
                    <span className="text-[14px] font-semibold text-zinc-500">{r.docTitle}</span>
                  ) : null}
                </div>

                {r.error ? <p className="text-[15px] font-bold text-red-300">{r.error}</p> : null}

                {biz && r.docType === 'business_registration' ? (
                  <p className="text-[15px] font-semibold text-zinc-200">
                    {[biz.name, biz.registrationNumber, biz.representative && `대표 ${biz.representative}`]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                ) : null}
                {ins && r.docType !== 'business_registration' ? (
                  <div className="text-[15px] font-semibold leading-relaxed text-zinc-200">
                    <p>{[ins.insurer, ins.productName].filter(Boolean).join(' · ')}</p>
                    {ins.insuredName ? <p className="text-zinc-400">피보험자 {ins.insuredName}</p> : null}
                    {ins.periodStart || ins.periodEnd ? (
                      <p>
                        보험기간 {dot(ins.periodStart)} ~ {dot(ins.periodEnd)}
                      </p>
                    ) : null}
                    {ins.limitSummary ? <p className="text-zinc-400">{ins.limitSummary}</p> : null}
                  </div>
                ) : null}

                {r.notes.map((n) => (
                  <p key={n} className="text-[14px] font-medium text-zinc-400">
                    {n}
                  </p>
                ))}
                {r.warnings.map((w) => (
                  <p key={w} className="flex gap-1.5 text-[14px] font-bold leading-snug text-amber-300">
                    <AlertTriangle size={15} className="mt-0.5 shrink-0" aria-hidden />
                    {w}
                  </p>
                ))}

                {s.previewUrl ? (
                  <a
                    href={s.previewUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-[14px] font-bold text-sky-300 underline underline-offset-2"
                  >
                    손님에게 보일 서류 보기
                    <ExternalLink size={13} aria-hidden />
                  </a>
                ) : null}

                {applicable ? (
                  <div className="space-y-2 border-t border-neutral-900 pt-2.5">
                    <p className="text-[14px] font-bold text-zinc-400">넣을 업체</p>
                    <div className="flex flex-wrap gap-2">
                      {r.candidates.map((c) => {
                        const on = s.companyIds.includes(c.companyId);
                        return (
                          <button
                            key={c.companyId}
                            type="button"
                            aria-pressed={on}
                            onClick={() => toggleCompany(r.path, c.companyId)}
                            className={cn(
                              'rounded-full border px-3 py-1.5 text-[14px] font-bold',
                              on
                                ? 'border-amber-400 bg-amber-500/15 text-amber-200'
                                : 'border-neutral-700 text-zinc-300'
                            )}
                            title={c.reasons.join(' · ')}
                          >
                            {on ? '✓ ' : ''}
                            {c.name}
                            <span className="ml-1 text-[12px] font-semibold text-zinc-500">
                              {c.reasons.join(' · ')}
                            </span>
                          </button>
                        );
                      })}
                      {s.companyIds
                        .filter((id) => !r.candidates.some((c) => c.companyId === id))
                        .map((id) => (
                          <button
                            key={id}
                            type="button"
                            onClick={() => toggleCompany(r.path, id)}
                            className="rounded-full border border-amber-400 bg-amber-500/15 px-3 py-1.5 text-[14px] font-bold text-amber-200"
                          >
                            ✓ {nameOf(id)}
                          </button>
                        ))}
                      <select
                        aria-label="다른 업체 추가"
                        value=""
                        onChange={(e) => e.target.value && toggleCompany(r.path, e.target.value)}
                        className="rounded-full border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-[14px] font-bold text-zinc-300"
                      >
                        <option value="">+ 다른 업체</option>
                        {others
                          .filter((c) => !s.companyIds.includes(c.id))
                          .map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                      </select>
                    </div>
                    {!r.publishable ? (
                      <label className="flex items-start gap-2 text-[14px] font-semibold text-zinc-300">
                        <input
                          type="checkbox"
                          checked={s.maskChecked}
                          onChange={(e) => update(r.path, { maskChecked: e.target.checked })}
                          className="mt-1"
                        />
                        손님에게 보일 서류를 열어 주민등록번호가 가려진 걸 확인했어요
                      </label>
                    ) : null}
                    <label className="flex items-center gap-2 text-[14px] font-semibold text-zinc-300">
                      <input
                        type="checkbox"
                        checked={s.include}
                        disabled={s.companyIds.length === 0}
                        onChange={(e) => update(r.path, { include: e.target.checked })}
                      />
                      이 서류 적용하기
                    </label>
                  </div>
                ) : r.ok ? (
                  <p className="text-[14px] font-semibold text-zinc-500">
                    사업자등록증·보험증권만 업체 정보에 넣어요.
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}

      {results.length ? (
        <button
          type="button"
          disabled={!ready.length || applying}
          onClick={() => void applyAll()}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-amber-500 py-4 text-[16px] font-black text-neutral-950 disabled:opacity-40"
        >
          {applying ? <Loader2 size={18} className="animate-spin" aria-hidden /> : <Check size={18} aria-hidden />}
          {ready.length ? `${ready.length}건 적용` : '적용할 서류를 골라 주세요'}
        </button>
      ) : null}
    </div>
  );
}
