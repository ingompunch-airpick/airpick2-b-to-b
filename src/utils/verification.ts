import type { Company, CompanyVerification, VerificationCheck } from '../types';
import { normalizeIsoDate } from './companyProfile';

/**
 * 본사 「에어픽 확인」 — 사업자·보험·주차장·CCTV.
 * 확인할 때 본 내용의 지문(basis)을 함께 저장해서, 업체가 서류·주소·보험을 바꾸면
 * 손님 앱에서 확인 표시가 자동으로 내려가고 본사 화면에 「다시 확인」이 뜬다.
 * 손님 앱(airpick-b2c/src/utils/verification.ts)과 지문 규칙이 같아야 한다.
 */

export const VERIFICATION_KEYS = ['business', 'insurance', 'parking', 'cctv'] as const;
export type VerificationKey = (typeof VERIFICATION_KEYS)[number];

export const VERIFICATION_LABEL: Record<VerificationKey, string> = {
  business: '사업자',
  insurance: '보험',
  parking: '주차장',
  cctv: 'CCTV',
};

/** 사업자·주차장·CCTV는 확인하고 1년이 지나면 다시 확인 */
export const REVERIFY_DAYS = 365;
/** 보험 만기 이만큼 남으면 본사 화면에 미리 알림 */
export const INSURANCE_WARN_DAYS = 30;

export type VerificationState =
  /** 확인할 서류·정보가 아직 없음 */
  | 'missing'
  /** 확인 전 */
  | 'pending'
  | 'verified'
  /** 확인 뒤 업체가 내용을 바꿈 */
  | 'changed'
  /** 확인한 지 1년 넘음 */
  | 'stale'
  /** 보험 만기 30일 이내 */
  | 'expiring'
  /** 보험 만기 지남 */
  | 'expired';

export interface VerificationItemStatus {
  key: VerificationKey;
  state: VerificationState;
  verifiedAt?: string;
  /** 보험 만기까지 남은 날 (만기일이 있을 때) */
  daysLeft?: number;
  periodStart?: string;
  periodEnd?: string;
}

/** 짧은 지문 — 서류 URL이 길어서 그대로 두지 않는다 (FNV-1a 32bit) */
export function fingerprintText(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/** 한국 날짜 YYYY-MM-DD */
export function kstToday(now: Date = new Date()): string {
  return new Date(now.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function daysBetween(fromIso: string, toIso: string): number {
  const a = Date.parse(`${fromIso}T00:00:00Z`);
  const b = Date.parse(`${toIso}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

function clean(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

/** 주차장 「종류|주소」 목록 — 손님 앱과 같은 규칙 (좌표·이름·사진은 넣지 않음) */
function parkingBasisParts(company: Company): string[] {
  const raw = company as Company & Record<string, unknown>;
  const parts: string[] = [];
  if (Array.isArray(raw.parkingLots)) {
    for (const row of raw.parkingLots as unknown[]) {
      if (!row || typeof row !== 'object') continue;
      const lot = row as Record<string, unknown>;
      const type = lot.type === 'outdoor' ? 'outdoor' : lot.type === 'indoor' ? 'indoor' : null;
      if (!type) continue;
      const addr = clean(lot.parkingAddress || lot.customerAddress || lot.parkingLotAddress);
      if (addr) parts.push(`${type}|${addr}`);
    }
  }
  if (parts.length === 0) {
    const indoor = clean(raw.indoorParkingAddress);
    const outdoor = clean(raw.outdoorParkingAddress);
    if (indoor) parts.push(`indoor|${indoor}`);
    if (outdoor) parts.push(`outdoor|${outdoor}`);
  }
  return parts.sort();
}

/** 지금 업체 정보로 만든 지문. 확인할 내용이 없으면 null */
export function currentVerificationBasis(company: Company, key: VerificationKey): string | null {
  if (key === 'business') {
    const url = clean(company.verificationDocuments?.businessRegistrationUrl);
    return url ? fingerprintText(`business|${url}`) : null;
  }
  if (key === 'insurance') {
    const ins = company.insurance;
    if (!ins?.enrolled) return null;
    const url = clean(ins.certificateUrl);
    if (!url) return null;
    return fingerprintText(
      [
        'insurance',
        url,
        clean(ins.provider),
        clean(ins.productName),
        clean(ins.coverageLimitText),
        normalizeIsoDate(ins.periodStart),
        normalizeIsoDate(ins.periodEnd),
      ].join('|')
    );
  }
  if (key === 'parking') {
    const lots = parkingBasisParts(company);
    return lots.length ? fingerprintText(`parking|${lots.join(';')}`) : null;
  }
  // CCTV는 업체 입력이 없다 — 본사가 현장·영상으로 본 것만 기록
  return fingerprintText('cctv');
}

export function verificationItemStatus(
  company: Company,
  key: VerificationKey,
  today: string = kstToday()
): VerificationItemStatus {
  const check = company.verification?.[key] as
    | (VerificationCheck & { periodStart?: string; periodEnd?: string })
    | undefined;
  const basis = currentVerificationBasis(company, key);
  const periodStart = key === 'insurance' ? normalizeIsoDate(company.insurance?.periodStart) : '';
  const periodEnd = key === 'insurance' ? normalizeIsoDate(company.insurance?.periodEnd) : '';
  const daysLeft = periodEnd ? daysBetween(today, periodEnd) : undefined;
  const base = {
    key,
    verifiedAt: check?.verifiedAt,
    ...(periodStart ? { periodStart } : {}),
    ...(periodEnd ? { periodEnd, daysLeft } : {}),
  };

  if (basis == null) return { ...base, state: 'missing' };
  if (!check?.verifiedAt) return { ...base, state: 'pending' };
  if (check.basis && check.basis !== basis) return { ...base, state: 'changed' };
  if (key === 'insurance' && daysLeft != null) {
    if (daysLeft < 0) return { ...base, state: 'expired' };
    if (daysLeft <= INSURANCE_WARN_DAYS) return { ...base, state: 'expiring' };
    return { ...base, state: 'verified' };
  }
  const checkedDay = check.verifiedAt.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(checkedDay) && daysBetween(checkedDay, today) > REVERIFY_DAYS) {
    return { ...base, state: 'stale' };
  }
  return { ...base, state: 'verified' };
}

export function allVerificationStatuses(
  company: Company,
  today: string = kstToday()
): VerificationItemStatus[] {
  return VERIFICATION_KEYS.map((key) => verificationItemStatus(company, key, today));
}

/** 손님에게 「확인」으로 보여도 되는 상태 */
export function isShownAsVerified(state: VerificationState): boolean {
  return state === 'verified' || state === 'expiring';
}

export interface VerificationSummary {
  verified: number;
  total: number;
  /** 본사가 손봐야 할 것 (확인 전·바뀜·1년 지남·만기 임박·만기) */
  attention: number;
  label: string;
  tone: 'ok' | 'warn' | 'bad' | 'muted';
}

export function summarizeVerification(
  company: Company,
  today: string = kstToday()
): VerificationSummary {
  const items = allVerificationStatuses(company, today);
  const verified = items.filter((i) => isShownAsVerified(i.state)).length;
  const attention = items.filter((i) =>
    ['pending', 'changed', 'stale', 'expiring', 'expired'].includes(i.state)
  ).length;
  const ins = items.find((i) => i.key === 'insurance');
  if (ins?.state === 'expired') {
    return { verified, total: items.length, attention, label: '보험 만기 지남', tone: 'bad' };
  }
  if (ins?.state === 'expiring' && ins.daysLeft != null) {
    return {
      verified,
      total: items.length,
      attention,
      label: `보험 만기 D-${ins.daysLeft}`,
      tone: 'warn',
    };
  }
  if (items.some((i) => i.state === 'changed')) {
    return { verified, total: items.length, attention, label: '다시 확인', tone: 'warn' };
  }
  if (verified === 0) {
    return { verified, total: items.length, attention, label: '확인 전', tone: 'muted' };
  }
  return {
    verified,
    total: items.length,
    attention,
    label: `${verified}/${items.length} 확인`,
    tone: verified === items.length ? 'ok' : 'warn',
  };
}

/** 「확인 완료」를 누를 때 저장할 값 */
/** 업체 문서는 누구나 읽으므로 확인한 사람(이메일)은 남기지 않는다 */
export function buildVerificationCheck(
  company: Company,
  key: VerificationKey,
  now: Date = new Date()
): CompanyVerification[VerificationKey] | null {
  const basis = currentVerificationBasis(company, key);
  if (basis == null) return null;
  const check: VerificationCheck & { periodStart?: string; periodEnd?: string } = {
    verifiedAt: now.toISOString(),
    basis,
  };
  if (key === 'insurance') {
    const start = normalizeIsoDate(company.insurance?.periodStart);
    const end = normalizeIsoDate(company.insurance?.periodEnd);
    if (start) check.periodStart = start;
    if (end) check.periodEnd = end;
  }
  return check;
}

/** 표시용 날짜 2026.11.27 */
export function formatCheckDate(iso?: string): string {
  if (!iso) return '';
  const day = iso.length >= 10 ? (iso.includes('T') ? kstToday(new Date(iso)) : iso.slice(0, 10)) : iso;
  return day.replace(/-/g, '.');
}
