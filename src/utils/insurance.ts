import type { Company, CompanyInsurance } from '../types';
import { normalizeCertificateUrls } from '../lib/insuranceCertificates';

export function createEmptyInsurance(): CompanyInsurance {
  return { enrolled: false, certificateUrls: [] };
}

function parseInsuranceObject(raw: Record<string, unknown>): CompanyInsurance | undefined {
  if (raw.enrolled === false) {
    return { enrolled: false, certificateUrls: [] };
  }
  if (raw.enrolled !== true) return undefined;

  const provider = raw.provider ? String(raw.provider).trim() : undefined;
  const productName = raw.productName ? String(raw.productName).trim() : undefined;
  const limitRaw = raw.coverageLimitWon ?? raw.coverageLimit;
  const coverageLimitWon =
    limitRaw !== undefined && limitRaw !== null && limitRaw !== ''
      ? Number(limitRaw)
      : undefined;
  const certificateUrls = normalizeCertificateUrls(
    Array.isArray(raw.certificateUrls) ? (raw.certificateUrls as string[]) : undefined
  );

  return {
    enrolled: true,
    provider: provider || undefined,
    productName: productName || undefined,
    coverageLimitWon:
      coverageLimitWon !== undefined && !Number.isNaN(coverageLimitWon) && coverageLimitWon > 0
        ? coverageLimitWon
        : undefined,
    certificateUrls,
    updatedAt: raw.updatedAt ? String(raw.updatedAt) : undefined,
  };
}

export function parseInsuranceFromCompany(company?: Partial<Company>): CompanyInsurance {
  if (!company) return createEmptyInsurance();

  if (company.insurance && typeof company.insurance === 'object') {
    return parseInsuranceObject(company.insurance as Record<string, unknown>) ?? createEmptyInsurance();
  }

  if (company.hasInsurance === false) {
    return { enrolled: false, certificateUrls: [] };
  }

  const provider = company.insuranceProvider ? String(company.insuranceProvider).trim() : '';
  const limit = company.insuranceLimit ? Number(company.insuranceLimit) : undefined;
  if (provider || (limit !== undefined && !Number.isNaN(limit))) {
    return {
      enrolled: true,
      provider: provider || undefined,
      coverageLimitWon: limit !== undefined && !Number.isNaN(limit) ? limit : undefined,
      certificateUrls: [],
    };
  }

  return createEmptyInsurance();
}

export function formatCoverageLimitWon(won: number): string {
  if (won >= 100_000_000) {
    const eok = won / 100_000_000;
    return Number.isInteger(eok) ? `${eok}억원` : `${eok.toFixed(1)}억원`;
  }
  if (won >= 10_000_000) {
    return `${Math.round(won / 10_000_000)}천만원`;
  }
  return `${won.toLocaleString()}원`;
}

export function formatInsuranceSummary(insurance: CompanyInsurance): string | undefined {
  if (!insurance.enrolled) return undefined;

  const parts: string[] = [];
  if (insurance.provider) parts.push(insurance.provider);
  if (insurance.productName) parts.push(insurance.productName);
  if (insurance.coverageLimitWon) {
    parts.push(`보장 ${formatCoverageLimitWon(insurance.coverageLimitWon)}`);
  }

  if (parts.length) return parts.join(' · ');
  return '보험 가입';
}

export function normalizeInsuranceForSave(input: CompanyInsurance): CompanyInsurance | undefined {
  if (!input.enrolled) {
    return { enrolled: false, updatedAt: new Date().toISOString() };
  }

  const provider = input.provider?.trim() || undefined;
  const productName = input.productName?.trim() || undefined;
  const coverageLimitWon =
    input.coverageLimitWon !== undefined &&
    !Number.isNaN(input.coverageLimitWon) &&
    input.coverageLimitWon > 0
      ? Math.round(input.coverageLimitWon)
      : undefined;
  const certificateUrls = normalizeCertificateUrls(input.certificateUrls);

  if (!provider && !productName && !coverageLimitWon && certificateUrls.length === 0) {
    return undefined;
  }

  return {
    enrolled: true,
    ...(provider ? { provider } : {}),
    ...(productName ? { productName } : {}),
    ...(coverageLimitWon ? { coverageLimitWon } : {}),
    ...(certificateUrls.length ? { certificateUrls } : {}),
    updatedAt: new Date().toISOString(),
  };
}

export function validateInsurance(input: CompanyInsurance): string | null {
  if (!input.enrolled) return null;

  const hasText =
    !!input.provider?.trim() || !!input.productName?.trim() || !!input.coverageLimitWon;
  const hasCerts = (input.certificateUrls?.length || 0) > 0;

  if (!hasText && !hasCerts) {
    return '보험 가입으로 설정한 경우 보험사·상품명·보장한도 또는 증명서 중 하나 이상을 입력해주세요.';
  }

  if (
    input.coverageLimitWon !== undefined &&
    (Number.isNaN(input.coverageLimitWon) || input.coverageLimitWon < 0)
  ) {
    return '보장 한도는 0 이상의 숫자로 입력해주세요.';
  }

  return null;
}
