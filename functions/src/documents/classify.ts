/**
 * 서류 분석 결과 정리 — AI가 돌려준 JSON을 검사하고, 본사가 봐야 할 경고를 만든다.
 * 순수 함수 — 테스트: functions/test/documents.test.js
 */

export const DOC_TYPES = [
  'business_registration',
  'insurance_certificate',
  'insurance_other',
  'other',
] as const;
export type DocType = (typeof DOC_TYPES)[number];

export const DOC_TYPE_LABEL: Record<DocType, string> = {
  business_registration: '사업자등록증',
  insurance_certificate: '보험증권·가입증명서',
  insurance_other: '보험 관련 서류(증권 아님)',
  other: '기타 서류',
};

export interface ExtractedBusiness {
  name?: string;
  registrationNumber?: string;
  representative?: string;
  address?: string;
}

export interface ExtractedInsurance {
  insurer?: string;
  productName?: string;
  insuredName?: string;
  insuredBusinessNumber?: string;
  /** 증권번호·계약번호 — 갱신 서류를 같은 업체에 붙일 때 */
  policyNumber?: string;
  periodStart?: string;
  periodEnd?: string;
  /** 담보 유효기간 끝 — 분납 등으로 보험기간보다 짧을 때 */
  coverageEnd?: string;
  /** 「대인 무한 · 대물 2억 · 자차 1천만」 */
  limitSummary?: string;
}

export interface ExtractedDoc {
  docType: DocType;
  /** 서류 제목 그대로 (예: 계약변경신청서) */
  docTitle: string;
  business?: ExtractedBusiness;
  insurance?: ExtractedInsurance;
  /** AI가 본 「가려지지 않은 주민등록번호」 개수 */
  unmaskedRrnCount: number;
  /** 서류에 나온 상호·사람 이름(계약자·피보험자·운전자·대표자) — 업체 찾기용 */
  relatedNames: string[];
}

/** 업체 정보 입력칸에 넣을 값 */
export interface DocSuggestion {
  businessRegistration?: { name?: string; registrationNumber?: string; representative?: string };
  insurance?: {
    provider?: string;
    productName?: string;
    coverageLimitText?: string;
    periodStart?: string;
    periodEnd?: string;
  };
}

function str(v: unknown, max = 200): string | undefined {
  const s = String(v ?? '').replace(/\s+/g, ' ').trim();
  return s ? s.slice(0, max) : undefined;
}

/** 2026.07.03 · 2026-07-03 · 2026년 07월 03일 → 2026-07-03 */
export function normalizeDate(v: unknown): string | undefined {
  const s = String(v ?? '').trim();
  const m = s.match(/(20\d{2})\s*[.\-/년]\s*(\d{1,2})\s*[.\-/월]\s*(\d{1,2})/);
  if (!m) return undefined;
  const iso = `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  const d = new Date(`${iso}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === iso ? iso : undefined;
}

function businessNumber(v: unknown): string | undefined {
  const digits = String(v ?? '').replace(/\D/g, '');
  return digits.length === 10 ? `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}` : undefined;
}

function stripFences(text: string): string {
  return text.replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '');
}

/** AI 응답(JSON 문자열) → 검사한 결과. 모양이 이상하면 「기타 서류」로 */
export function parseExtraction(text: string): ExtractedDoc {
  let raw: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(stripFences(text));
    if (parsed && typeof parsed === 'object') raw = parsed as Record<string, unknown>;
  } catch {
    /* 아래에서 기타 서류로 */
  }
  const docType = (DOC_TYPES as readonly string[]).includes(String(raw.docType))
    ? (raw.docType as DocType)
    : 'other';
  const b = (raw.business && typeof raw.business === 'object' ? raw.business : {}) as Record<string, unknown>;
  const i = (raw.insurance && typeof raw.insurance === 'object' ? raw.insurance : {}) as Record<string, unknown>;
  const business: ExtractedBusiness = {
    name: str(b.name, 80),
    registrationNumber: businessNumber(b.registrationNumber),
    representative: str(b.representative, 40),
    address: str(b.address, 160),
  };
  const insurance: ExtractedInsurance = {
    insurer: str(i.insurer, 60),
    productName: str(i.productName, 80),
    insuredName: str(i.insuredName, 80),
    insuredBusinessNumber: businessNumber(i.insuredBusinessNumber),
    policyNumber: str(i.policyNumber, 60),
    periodStart: normalizeDate(i.periodStart),
    periodEnd: normalizeDate(i.periodEnd),
    coverageEnd: normalizeDate(i.coverageEnd),
    limitSummary: str(i.limitSummary, 120),
  };
  const count = Number(raw.unmaskedRrnCount);
  const relatedNames = Array.from(
    new Set(
      (Array.isArray(raw.relatedNames) ? raw.relatedNames : [])
        .map((n) => str(n, 60))
        .filter((n): n is string => !!n)
    )
  ).slice(0, 12);
  return {
    docType,
    docTitle: str(raw.docTitle, 60) || DOC_TYPE_LABEL[docType],
    ...(Object.values(business).some(Boolean) ? { business } : {}),
    ...(Object.values(insurance).some(Boolean) ? { insurance } : {}),
    unmaskedRrnCount: Number.isFinite(count) && count > 0 ? Math.floor(count) : 0,
    relatedNames,
  };
}

/** 상호 비교용 — (주)·주식회사·띄어쓰기·「주차대행」 같은 꼬리 빼기 */
export function normalizeBizName(name?: string): string {
  return String(name || '')
    .replace(/\(주\)|㈜|주식회사|\(유\)|유한회사/g, '')
    .replace(/주차대행|발렛|파킹|서비스/g, '')
    .replace(/[\s·.,()-]/g, '')
    .toLowerCase();
}

function dot(iso?: string): string {
  return iso ? iso.replace(/-/g, '.') : '';
}

export interface AnalyzedDocInput {
  extracted: ExtractedDoc;
  /** OCR로 찾아 가린 주민번호 개수 */
  rrnMasked: number;
  /** PDF는 자동으로 가리지 못한다 */
  isPdf: boolean;
}

export interface DocReview {
  warnings: string[];
  notes: string[];
  suggestion: DocSuggestion;
  /** 손님에게 공개해도 되는 사본이 있는지 (주민번호가 남아 있을 수 있으면 false) */
  publishable: boolean;
}

/**
 * 한 번에 올린 서류 묶음을 함께 보고 경고를 만든다.
 * (보험 피보험자 ↔ 사업자등록증 상호·번호 비교는 같은 묶음 안에서, 없으면 업체 이름과)
 */
export function reviewDocuments(
  docs: AnalyzedDocInput[],
  today: string,
  companyName?: string
): DocReview[] {
  const biz = docs.find((d) => d.extracted.docType === 'business_registration')?.extracted.business;

  return docs.map(({ extracted, rrnMasked, isPdf }) => {
    const warnings: string[] = [];
    const notes: string[] = [];
    const suggestion: DocSuggestion = {};
    let publishable = true;

    const rrnLeft = Math.max(0, extracted.unmaskedRrnCount - rrnMasked);
    if (isPdf && extracted.unmaskedRrnCount > 0) {
      warnings.push('주민등록번호가 보여요. PDF는 자동으로 가릴 수 없어요 — 사진(JPG)으로 다시 올려 주세요.');
      publishable = false;
    } else if (rrnLeft > 0) {
      warnings.push(`가리지 못한 주민등록번호가 ${rrnLeft}곳 있을 수 있어요. 공개 전에 사본을 꼭 확인해 주세요.`);
      publishable = false;
    }
    if (rrnMasked > 0) notes.push(`주민등록번호 ${rrnMasked}곳을 가렸어요.`);

    if (extracted.docType === 'business_registration' && extracted.business) {
      const b = extracted.business;
      suggestion.businessRegistration = {
        name: b.name,
        registrationNumber: b.registrationNumber,
        representative: b.representative,
      };
      if (!b.registrationNumber) warnings.push('사업자등록번호를 읽지 못했어요.');
    }

    if (extracted.docType === 'insurance_other') {
      warnings.push(
        `보험증권이 아니라 「${extracted.docTitle}」이에요. 보험증권이나 가입증명서를 받아 주세요.`
      );
    }

    if (
      (extracted.docType === 'insurance_certificate' || extracted.docType === 'insurance_other') &&
      extracted.insurance
    ) {
      const ins = extracted.insurance;
      let periodEnd = ins.periodEnd;
      if (ins.coverageEnd && periodEnd && ins.coverageEnd < periodEnd) {
        notes.push(
          `담보 유효기간이 ${dot(ins.coverageEnd)}까지예요(분납 등). 만기일을 이 날짜로 넣었어요.`
        );
        periodEnd = ins.coverageEnd;
      }
      if (periodEnd && periodEnd < today) {
        warnings.push(`보험 만기가 지났어요 (${dot(periodEnd)}). 갱신한 증권을 받아 주세요.`);
      }
      if (!ins.periodStart || !ins.periodEnd) warnings.push('보험기간을 읽지 못했어요. 직접 넣어 주세요.');

      const insured = normalizeBizName(ins.insuredName);
      const bizName = normalizeBizName(biz?.name || companyName);
      if (insured && bizName && !insured.includes(bizName) && !bizName.includes(insured)) {
        warnings.push(
          `피보험자 「${ins.insuredName}」가 ${biz?.name ? `사업자등록증 상호 「${biz.name}」` : `업체 이름 「${companyName}」`}와 달라요.`
        );
      }
      if (
        ins.insuredBusinessNumber &&
        biz?.registrationNumber &&
        ins.insuredBusinessNumber !== biz.registrationNumber
      ) {
        warnings.push(
          `피보험자 사업자번호(${ins.insuredBusinessNumber})가 사업자등록증(${biz.registrationNumber})과 달라요.`
        );
      }

      if (extracted.docType === 'insurance_certificate') {
        suggestion.insurance = {
          provider: ins.insurer,
          productName: ins.productName,
          coverageLimitText: ins.limitSummary,
          periodStart: ins.periodStart,
          periodEnd,
        };
      }
    }

    if (extracted.docType === 'other') {
      notes.push('사업자등록증·보험 서류가 아니라서 입력칸에는 넣지 않았어요.');
    }

    return { warnings, notes, suggestion, publishable };
  });
}
