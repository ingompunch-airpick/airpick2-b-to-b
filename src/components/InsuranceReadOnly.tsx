import { ShieldCheck } from 'lucide-react';
import type { CompanyInsurance } from '../types';
import { formatInsuranceSummary } from '../utils/insurance';

interface InsuranceReadOnlyProps {
  insurance: CompanyInsurance;
}

export default function InsuranceReadOnly({ insurance }: InsuranceReadOnlyProps) {
  if (!insurance.enrolled) {
    return (
      <p className="text-[12px] text-white/50 py-2">
        등록된 보험 정보가 없습니다. 에어픽 본사에서 관리합니다.
      </p>
    );
  }

  const summary = formatInsuranceSummary(insurance);
  const certs = insurance.certificateUrls || [];

  return (
    <div className="space-y-3">
      <div className="p-3 bg-[#131315] border border-neutral-850 rounded-xl space-y-1">
        <p className="text-[12px] font-bold text-white/90">{summary || '보험 가입'}</p>
        {insurance.productName && insurance.provider && (
          <p className="text-[11px] text-white/60">{insurance.productName}</p>
        )}
      </div>
      {certs.length > 0 && (
        <div>
          <p className="text-[11px] text-zinc-500 font-bold mb-2">등록된 증명서 ({certs.length}장)</p>
          <div className="grid grid-cols-3 gap-2">
            {certs.map((url, index) => (
              <a
                key={`${url}-${index}`}
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="block aspect-[3/4] rounded-lg overflow-hidden border border-neutral-800 bg-neutral-950"
              >
                <img
                  src={url}
                  alt={`보험 증명서 ${index + 1}`}
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                />
              </a>
            ))}
          </div>
        </div>
      )}
      <p className="text-[10px] text-white/40 flex items-center gap-1">
        <ShieldCheck size={11} />
        보험 정보는 에어픽 본사만 수정할 수 있습니다.
      </p>
    </div>
  );
}
