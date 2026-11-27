/**
 * 서류함 — 서류가 어느 업체 것인지 맞춘다. 순수 함수 (테스트: functions/test/documents.test.js)
 *
 * 점수: 사업자번호 같음 100 · 증권번호 같음 90 · 상호 같음 70 · 대표자 이름 같음 40
 * 70점 이상이면 미리 체크. 없으면 40점짜리가 하나뿐일 때만 체크.
 * 보험은 같은 운영자(parentCompanyId) 업체도 후보로 보여준다 — 가유·안녕·시즌처럼 증권을 같이 쓴다.
 */
import { normalizeBizName, type ExtractedDoc } from './classify';

export interface CompanyForMatch {
  id: string;
  name: string;
  representative?: string;
  parentCompanyId?: string;
  /** 사업자등록증에서 읽어 저장해 둔 값 */
  businessNumber?: string;
  businessName?: string;
  /** 보험 서류에서 읽어 저장해 둔 값 */
  insuredName?: string;
  policyNumber?: string;
  insuranceProvider?: string;
}

export interface MatchCandidate {
  companyId: string;
  name: string;
  score: number;
  reasons: string[];
  selected: boolean;
}

function samePerson(a?: string, b?: string): boolean {
  const x = String(a || '').replace(/\s/g, '');
  const y = String(b || '').replace(/\s/g, '');
  return x.length >= 2 && x === y;
}

function sameBizName(a?: string, b?: string): boolean {
  const x = normalizeBizName(a);
  const y = normalizeBizName(b);
  if (x.length < 2 || y.length < 2) return false;
  return x === y || (Math.min(x.length, y.length) >= 3 && (x.includes(y) || y.includes(x)));
}

function digits(v?: string): string {
  return String(v || '').replace(/\D/g, '');
}

export function matchCompanies(doc: ExtractedDoc, companies: CompanyForMatch[]): MatchCandidate[] {
  const bizNumbers = [doc.business?.registrationNumber, doc.insurance?.insuredBusinessNumber]
    .map(digits)
    .filter((d) => d.length === 10);
  const policy = digits(doc.insurance?.policyNumber);
  const names = [
    doc.business?.name,
    doc.insurance?.insuredName,
    ...doc.relatedNames,
  ].filter((n): n is string => !!n);
  const people = [doc.business?.representative, ...doc.relatedNames].filter(
    (n): n is string => !!n
  );

  const scored = companies.map((c) => {
    let score = 0;
    const reasons: string[] = [];
    if (c.businessNumber && bizNumbers.includes(digits(c.businessNumber))) {
      score += 100;
      reasons.push('사업자번호 같음');
    }
    if (policy.length >= 6 && c.policyNumber && digits(c.policyNumber) === policy) {
      score += 90;
      reasons.push('증권번호 같음');
    }
    const companyNames = [c.name, c.businessName, c.insuredName];
    if (names.some((n) => companyNames.some((cn) => sameBizName(n, cn)))) {
      score += 70;
      reasons.push('상호 같음');
    }
    if (c.representative && people.some((p) => samePerson(p, c.representative))) {
      score += 40;
      reasons.push(`대표 ${c.representative}`);
    }
    return { companyId: c.id, name: c.name, score, reasons, selected: false };
  });

  const strong = scored.filter((s) => s.score >= 70);
  if (strong.length) {
    for (const s of strong) s.selected = true;
  } else {
    const weak = scored.filter((s) => s.score >= 40);
    if (weak.length === 1) weak[0].selected = true;
  }

  // 보험: 고른 업체와 같은 운영자 묶음도 후보로 (증권을 같이 쓰는 경우)
  const isInsurance =
    doc.docType === 'insurance_certificate' || doc.docType === 'insurance_other';
  if (isInsurance) {
    const byId = new Map(companies.map((c) => [c.id, c]));
    const groupOf = (id: string) => byId.get(id)?.parentCompanyId || id;
    const groups = new Set(scored.filter((s) => s.selected).map((s) => groupOf(s.companyId)));
    for (const s of scored) {
      if (s.score > 0 || !groups.has(groupOf(s.companyId))) continue;
      s.reasons.push('같은 운영자');
      s.score = 10;
    }
  }

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, 'ko'));
}
