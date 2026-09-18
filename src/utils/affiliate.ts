/**
 * B2C(에어픽.kr) 추천·제휴 유입.
 * 업체 홈(/h/) 명함 QR(acquisition*) 과 분리한다.
 *
 * B2C 정상가 = 업체 기준가 + 마케팅 버짓.
 * 링크마다 버짓을 고객 할인 / 제휴 페이백 / 본사 잔여로 나눈다.
 * 고객 + 제휴 ≤ 버짓. 본사 잔여 = 버짓 − 고객 − 제휴.
 */

export const AFFILIATE_COLLECTION = 'affiliates';

/** 실적 포털용 비밀번호 — 공개 affiliates 문서와 분리 */
export const AFFILIATE_SECRETS_COLLECTION = 'affiliateSecrets';

/** 손님 앱 기본 랜딩 (B2C) */
export const B2C_PUBLIC_ORIGIN = 'https://www.에어픽.kr';

/** 제휴 실적 포털 — B2B Hosting `/a` 로그인 */
export const AFFILIATE_STATS_PUBLIC_ORIGIN = 'https://airpick-reservation.web.app';

/** 문서 ID = code. 3~16자 소문자·숫자·밑줄 */
export const AFFILIATE_CODE_RE = /^[a-z0-9_]{3,16}$/;

/** 등록 폼 기본값 — 만원 버짓, 5천/5천 배분(본사 잔여 0) */
export const DEFAULT_AFFILIATE_MARKETING_BUDGET_WON = 10_000;
export const DEFAULT_AFFILIATE_CUSTOMER_DISCOUNT_WON = 5_000;
export const DEFAULT_AFFILIATE_REFERRER_CREDIT_WON = 5_000;

export type AffiliateStatus = 'active' | 'suspended';

export type AffiliateDoc = {
  code: string;
  name: string;
  phone?: string;
  memo?: string;
  status: AffiliateStatus;
  /**
   * 이 링크에 쓸 수 있는 마케팅 버짓(원).
   * B2C 정상가에 올려 둔 금액 중 이 코드에 배정한 한도.
   */
  marketingBudgetWon: number;
  /** 손님 할인(원). 버짓에서 차감. */
  customerDiscountWon: number;
  /** 제휴 페이백·크레딧(원). 버짓에서 차감. */
  referrerCreditWon: number;
  createdAt: string;
  updatedAt: string;
  createdByEmail?: string;
};

/** 0 ~ 100만원. 빈값·NaN → 0 */
export function normalizeAffiliateRewardWon(raw: unknown): number {
  const n = typeof raw === 'number' ? raw : Number(String(raw ?? '').replace(/,/g, ''));
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(Math.round(n), 1_000_000);
}

export function formatAffiliateRewardWon(n: number): string {
  return `${normalizeAffiliateRewardWon(n).toLocaleString('ko-KR')}원`;
}

/** 본사 잔여 = 버짓 − 고객 − 제휴 (음수면 배분 초과) */
export function affiliateHqRemainderWon(input: {
  marketingBudgetWon: number;
  customerDiscountWon: number;
  referrerCreditWon: number;
}): number {
  return (
    normalizeAffiliateRewardWon(input.marketingBudgetWon) -
    normalizeAffiliateRewardWon(input.customerDiscountWon) -
    normalizeAffiliateRewardWon(input.referrerCreditWon)
  );
}

export function assertAffiliateBudgetAllocation(input: {
  marketingBudgetWon: number;
  customerDiscountWon: number;
  referrerCreditWon: number;
}): void {
  const budget = normalizeAffiliateRewardWon(input.marketingBudgetWon);
  const customer = normalizeAffiliateRewardWon(input.customerDiscountWon);
  const referrer = normalizeAffiliateRewardWon(input.referrerCreditWon);
  if (customer + referrer > budget) {
    throw new Error(
      `고객 할인+제휴 페이백(${(customer + referrer).toLocaleString('ko-KR')}원)이 마케팅 버짓(${budget.toLocaleString('ko-KR')}원)을 넘습니다.`
    );
  }
}

export function normalizeAffiliateCode(raw: string): string | null {
  const code = String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_');
  if (!AFFILIATE_CODE_RE.test(code)) return null;
  return code;
}

export function normalizeAffiliateName(raw: string): string {
  return String(raw || '')
    .trim()
    .slice(0, 80);
}

export function buildB2cAffiliateUrl(
  code: string,
  opts?: { origin?: string }
): string {
  const normalized = normalizeAffiliateCode(code);
  if (!normalized) return '';
  const origin = (opts?.origin || B2C_PUBLIC_ORIGIN).replace(/\/$/, '');
  return `${origin}/?ref=${encodeURIComponent(normalized)}`;
}

export function buildB2cAffiliateShortPath(code: string): string {
  const normalized = normalizeAffiliateCode(code);
  if (!normalized) return '';
  return `/r/${normalized}`;
}

const AFFILIATE_STATS_PATH_RE = /^\/a\/([^/?#]+)\/?$/i;
const AFFILIATE_STATS_ROOT_RE = /^\/a\/?$/i;

/** `/a` 또는 `/a/{code}` 실적 포털 여부 */
export function parseAffiliateStatsPortal(pathname: string): {
  active: boolean;
  code: string | null;
} {
  if (AFFILIATE_STATS_ROOT_RE.test(pathname)) {
    return { active: true, code: null };
  }
  const match = pathname.match(AFFILIATE_STATS_PATH_RE);
  if (!match?.[1]) return { active: false, code: null };
  try {
    return {
      active: true,
      code: normalizeAffiliateCode(decodeURIComponent(match[1])),
    };
  } catch {
    return { active: true, code: normalizeAffiliateCode(match[1]) };
  }
}

/** @deprecated parseAffiliateStatsPortal 사용 */
export function parseAffiliateCodeFromStatsPath(pathname: string): string | null {
  return parseAffiliateStatsPortal(pathname).code;
}

/** 본사·제휴사 안내용 포털 주소 (`/a` 또는 `/a/{code}`) */
export function buildAffiliatePortalUrl(
  code?: string,
  opts?: { origin?: string }
): string {
  const origin = (opts?.origin || AFFILIATE_STATS_PUBLIC_ORIGIN).replace(/\/$/, '');
  const normalized = code ? normalizeAffiliateCode(code) : '';
  return normalized
    ? `${origin}/a/${encodeURIComponent(normalized)}`
    : `${origin}/a`;
}

/** 제휴 포털 초기 비밀번호 (8자, 혼동 문자 제외) */
export function generateAffiliatePortalPassword(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
}
