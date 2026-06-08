import { useRef, useState } from 'react';
import { Camera, Loader2, ShieldCheck, X } from 'lucide-react';
import type { CompanyInsurance } from '../types';
import {
  getMaxInsuranceCertificates,
  uploadInsuranceCertificate,
} from '../lib/insuranceCertificates';
import { formatCoverageLimitWon } from '../utils/insurance';

interface InsuranceEditorProps {
  value: CompanyInsurance;
  onChange: (next: CompanyInsurance) => void;
  companyId: string;
}

export default function InsuranceEditor({ value, onChange, companyId }: InsuranceEditorProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const certs = value.certificateUrls || [];
  const maxCerts = getMaxInsuranceCertificates();
  const canAdd = certs.length < maxCerts && !!companyId?.trim();

  const update = (patch: Partial<CompanyInsurance>) => {
    onChange({ ...value, ...patch });
  };

  const handleFiles = async (files: FileList | null) => {
    if (!files?.length || !companyId?.trim()) return;

    setUploading(true);
    const next = [...certs];
    try {
      for (const file of Array.from(files)) {
        if (next.length >= maxCerts) break;
        const url = await uploadInsuranceCertificate(companyId, file);
        next.push(url);
      }
      update({ certificateUrls: next });
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const removeCert = (index: number) => {
    update({ certificateUrls: certs.filter((_, i) => i !== index) });
  };

  return (
    <div className="space-y-3">
      <label className="flex items-center gap-2 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={value.enrolled}
          onChange={(e) =>
            update({
              enrolled: e.target.checked,
              ...(e.target.checked ? {} : { certificateUrls: [] }),
            })
          }
          className="w-4 h-4 rounded border-neutral-700 bg-neutral-950 text-amber-500 focus:ring-amber-500/40"
        />
        <span className="text-[12px] font-bold text-white">보험 가입 업체로 표시</span>
      </label>

      {value.enrolled && (
        <div className="space-y-3 pl-1">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
              <label className="text-[11px] text-zinc-500 font-bold block mb-1">보험사</label>
              <input
                type="text"
                value={value.provider || ''}
                onChange={(e) => update({ provider: e.target.value })}
                className="w-full bg-neutral-950 border border-neutral-850 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                placeholder="예: DB손해보험"
              />
            </div>
            <div>
              <label className="text-[11px] text-zinc-500 font-bold block mb-1">상품명</label>
              <input
                type="text"
                value={value.productName || ''}
                onChange={(e) => update({ productName: e.target.value })}
                className="w-full bg-neutral-950 border border-neutral-850 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                placeholder="예: 대리운전(탁송) 종합보험"
              />
            </div>
          </div>

          <div>
            <label className="text-[11px] text-zinc-500 font-bold block mb-1">보장 한도 (원)</label>
            <input
              type="number"
              min={0}
              step={1000000}
              value={value.coverageLimitWon ?? ''}
              onChange={(e) => {
                const raw = e.target.value;
                update({
                  coverageLimitWon: raw === '' ? undefined : Number(raw),
                });
              }}
              className="w-full bg-neutral-950 border border-neutral-850 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500 font-mono"
              placeholder="예: 50000000"
            />
            {value.coverageLimitWon && value.coverageLimitWon > 0 && (
              <p className="text-[10px] text-amber-500/80 mt-1">
                B2C 표시: 보장 {formatCoverageLimitWon(value.coverageLimitWon)}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <label className="text-[11px] text-zinc-500 font-bold block">가입 증명서 (내부 보관용)</label>
            {certs.length > 0 && (
              <div className="grid grid-cols-3 gap-2">
                {certs.map((url, index) => (
                  <div
                    key={`${url}-${index}`}
                    className="relative aspect-[3/4] rounded-lg overflow-hidden border border-neutral-800 bg-neutral-950"
                  >
                    <img
                      src={url}
                      alt={`증명서 ${index + 1}`}
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                    <button
                      type="button"
                      onClick={() => removeCert(index)}
                      className="absolute top-1 right-1 p-1 rounded-md bg-black/70 text-white hover:bg-red-900/80"
                      aria-label="증명서 삭제"
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => void handleFiles(e.target.files)}
            />
            <button
              type="button"
              disabled={!canAdd || uploading}
              onClick={() => inputRef.current?.click()}
              className="w-full py-2.5 rounded-xl border border-dashed border-neutral-700 bg-neutral-950/60 text-[11px] font-bold text-zinc-400 hover:border-amber-500/40 hover:text-amber-400 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
            >
              {uploading ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  업로드 중...
                </>
              ) : (
                <>
                  <Camera size={14} />
                  {certs.length === 0
                    ? '가입증명서·약관 사진 추가'
                    : `증명서 추가 (${certs.length}/${maxCerts})`}
                </>
              )}
            </button>
            {!companyId?.trim() && (
              <p className="text-[10px] text-amber-500/80">업체를 선택·저장한 후 증명서를 업로드할 수 있습니다.</p>
            )}
          </div>

          <p className="text-[10px] text-zinc-500 flex items-start gap-1 leading-relaxed">
            <ShieldCheck size={11} className="shrink-0 mt-0.5" />
            B2C MY·비교 탭에는 보험사·상품·보장한도만 안내됩니다. 증명서는 B2B 마스터에서만 관리됩니다.
          </p>
        </div>
      )}
    </div>
  );
}
