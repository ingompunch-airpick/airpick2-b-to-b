import { useRef, useState } from 'react';
import { AlertTriangle, Check, ExternalLink, FileUp, Loader2 } from 'lucide-react';
import type { PartnerProfileInput } from '../utils/companyProfile';
import {
  importCompanyDocuments,
  MAX_IMPORT_FILES,
  type ImportedDocResult,
} from '../lib/documentImportApi';

/**
 * 「서류 한 번에 올리기」 — 사업자등록증·보험증권을 섞어 올리면 서버가 종류를 나누고 값을 읽는다.
 * 주민등록번호 뒤 7자리는 가린 사본이 손님 「원본 보기」로 나간다. 원본은 본사·업체만.
 * 결과는 바로 저장하지 않는다 — 「넣기」로 아래 입력칸을 채우고, 화면의 저장 버튼으로 저장.
 */

function dot(iso?: string): string {
  return iso ? iso.replace(/-/g, '.') : '';
}

function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ');
}

export default function DocumentAutoImport({
  companyId,
  profile,
  onChange,
  variant = 'dark',
}: {
  companyId?: string;
  profile: PartnerProfileInput;
  onChange: (next: PartnerProfileInput) => void;
  variant?: 'light' | 'dark';
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const profileRef = useRef(profile);
  profileRef.current = profile;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [results, setResults] = useState<ImportedDocResult[]>([]);
  const [applied, setApplied] = useState<Record<string, boolean>>({});
  const [checked, setChecked] = useState<Record<string, boolean>>({});

  const dark = variant === 'dark';
  const id = String(companyId || '').trim().toLowerCase();
  const ready = /^[a-z0-9_]{1,64}$/.test(id);

  const pick = async (list: FileList | null) => {
    const files = Array.from(list || []);
    if (!files.length) return;
    setError('');
    setResults([]);
    setApplied({});
    setChecked({});
    if (files.length > MAX_IMPORT_FILES) {
      setError(`한 번에 ${MAX_IMPORT_FILES}장까지 올릴 수 있어요. 앞의 ${MAX_IMPORT_FILES}장만 읽을게요.`);
    }
    setBusy(true);
    try {
      setResults(await importCompanyDocuments(id, files));
    } catch (err) {
      setError(err instanceof Error ? err.message : '서류를 읽지 못했어요.');
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const apply = (r: ImportedDocResult) => {
    const cur = profileRef.current;
    if (r.docType === 'business_registration' && r.publicUrl) {
      onChange({ ...cur, businessRegistrationUrl: r.publicUrl });
    } else if (r.docType === 'insurance_certificate') {
      const s = r.suggestion.insurance || {};
      onChange({
        ...cur,
        insuranceEnrolled: true,
        insuranceProvider: s.provider || cur.insuranceProvider,
        insuranceProductName: s.productName || cur.insuranceProductName,
        insuranceCoverageLimitText: s.coverageLimitText || cur.insuranceCoverageLimitText,
        insurancePeriodStart: s.periodStart || cur.insurancePeriodStart,
        insurancePeriodEnd: s.periodEnd || cur.insurancePeriodEnd,
        insuranceCertificateUrl: r.publicUrl || cur.insuranceCertificateUrl,
      });
    } else {
      return;
    }
    setApplied((prev) => ({ ...prev, [r.path]: true }));
  };

  const box = dark
    ? 'rounded-xl border border-amber-500/25 bg-amber-500/[0.06] p-3 space-y-3'
    : 'rounded-xl border border-indigo-200 bg-indigo-50/60 p-3 space-y-3';
  const card = dark
    ? 'rounded-xl border border-neutral-800 bg-[#141416] p-3 space-y-2'
    : 'rounded-xl border border-slate-200 bg-white p-3 space-y-2';
  const strong = dark ? 'text-zinc-100' : 'text-slate-900';
  const muted = dark ? 'text-zinc-400' : 'text-slate-500';
  const btn = dark
    ? 'bg-amber-500 text-neutral-950 disabled:opacity-40'
    : 'bg-indigo-600 text-white disabled:opacity-40';

  return (
    <div className={box}>
      <div>
        <p className={cn('text-[15px] font-black', strong)}>서류 한 번에 올리기</p>
        <p className={cn('mt-0.5 text-[13px] font-medium leading-snug', muted)}>
          사업자등록증·보험증권을 섞어서 올리면 알아서 나눠 읽어요(사진·PDF, {MAX_IMPORT_FILES}장까지).
          손님에게는 주민등록번호 뒤 7자리만 가린 서류가 보여요.
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
        disabled={!ready || busy}
        onClick={() => inputRef.current?.click()}
        className={cn('flex w-full items-center justify-center gap-2 rounded-xl py-3 text-[15px] font-black', btn)}
      >
        {busy ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <FileUp size={16} aria-hidden />}
        {busy ? '읽는 중… 장당 10초쯤 걸려요' : '서류 고르기'}
      </button>
      {!ready ? (
        <p className={cn('text-[13px] font-medium', muted)}>업체 아이디를 먼저 정하면 쓸 수 있어요.</p>
      ) : null}
      {error ? (
        <p role="alert" className="text-[13px] font-bold text-red-400">
          {error}
        </p>
      ) : null}

      {results.length ? (
        <ul className="space-y-2">
          {results.map((r) => {
            const canApply =
              r.ok &&
              ((r.docType === 'business_registration' && !!r.publicUrl) ||
                r.docType === 'insurance_certificate');
            const needsCheck = canApply && !!r.publicUrl && !r.publishable;
            const done = applied[r.path];
            const ins = r.insurance;
            const biz = r.business;
            return (
              <li key={r.path} className={card}>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className={cn('text-[15px] font-black', strong)}>
                    {r.ok ? r.docTypeLabel : '읽지 못함'}
                  </span>
                  {r.docTitle && r.docTitle !== r.docTypeLabel ? (
                    <span className={cn('text-[13px] font-semibold', muted)}>{r.docTitle}</span>
                  ) : null}
                </div>

                {r.error ? <p className="text-[13px] font-bold text-red-400">{r.error}</p> : null}

                {biz && r.docType === 'business_registration' ? (
                  <p className={cn('text-[13px] font-semibold leading-relaxed', strong)}>
                    {[biz.name, biz.registrationNumber, biz.representative && `대표 ${biz.representative}`]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                ) : null}
                {ins && r.docType !== 'business_registration' ? (
                  <div className={cn('text-[13px] font-semibold leading-relaxed', strong)}>
                    <p>{[ins.insurer, ins.productName].filter(Boolean).join(' · ')}</p>
                    {ins.insuredName ? <p className={muted}>피보험자 {ins.insuredName}</p> : null}
                    {ins.periodStart || ins.periodEnd ? (
                      <p>
                        보험기간 {dot(ins.periodStart)} ~ {dot(ins.periodEnd)}
                      </p>
                    ) : null}
                    {ins.limitSummary ? <p className={muted}>{ins.limitSummary}</p> : null}
                  </div>
                ) : null}

                {r.notes.map((n) => (
                  <p key={n} className={cn('text-[13px] font-medium', muted)}>
                    {n}
                  </p>
                ))}
                {r.warnings.map((w) => (
                  <p key={w} className="flex gap-1.5 text-[13px] font-bold leading-snug text-amber-400">
                    <AlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden />
                    {w}
                  </p>
                ))}

                <div className="flex flex-wrap items-center gap-3 pt-1">
                  {r.publicUrl ? (
                    <a
                      href={r.publicUrl}
                      target="_blank"
                      rel="noreferrer"
                      className={cn(
                        'inline-flex items-center gap-1 text-[13px] font-bold underline underline-offset-2',
                        dark ? 'text-sky-300' : 'text-indigo-600'
                      )}
                    >
                      손님에게 보일 서류 보기
                      <ExternalLink size={12} aria-hidden />
                    </a>
                  ) : null}
                  {canApply ? (
                    done ? (
                      <span className="inline-flex items-center gap-1 text-[13px] font-black text-emerald-400">
                        <Check size={14} aria-hidden /> 넣었어요
                      </span>
                    ) : (
                      <button
                        type="button"
                        disabled={needsCheck && !checked[r.path]}
                        onClick={() => apply(r)}
                        className={cn('ml-auto rounded-lg px-3.5 py-2 text-[13px] font-black', btn)}
                      >
                        {r.docType === 'business_registration' ? '사업자등록증으로 넣기' : '보험 칸에 넣기'}
                      </button>
                    )
                  ) : null}
                </div>
                {needsCheck && !done ? (
                  <label className={cn('flex items-start gap-2 text-[13px] font-semibold', muted)}>
                    <input
                      type="checkbox"
                      checked={!!checked[r.path]}
                      onChange={(e) => setChecked((prev) => ({ ...prev, [r.path]: e.target.checked }))}
                      className="mt-0.5"
                    />
                    손님에게 보일 서류를 열어 주민등록번호가 가려진 걸 확인했어요
                  </label>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}

      {Object.keys(applied).length ? (
        <p className={cn('text-[13px] font-bold', dark ? 'text-amber-300' : 'text-indigo-700')}>
          아래 칸에 넣었어요. 내용을 확인하고 저장을 눌러야 반영돼요.
        </p>
      ) : null}
    </div>
  );
}
