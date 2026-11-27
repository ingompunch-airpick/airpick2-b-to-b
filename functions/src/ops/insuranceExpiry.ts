import * as admin from 'firebase-admin';
import { recordServerError } from './errorReports';

/**
 * 입점업체 보험 만기 알림 — 본사 오류 메일(평일 09:00)에 「서버 작업」으로 함께 간다.
 * 만기 30·7·1일 전, 당일, 다음 날(지남) 한 번씩만 남긴다. 손님 앱은 만기가 지나면
 * 스스로 「보험 갱신 확인 중」으로 바꾸므로 여기서는 업체 문서를 고치지 않는다.
 */
export const INSURANCE_NOTICE_DAYS = [30, 7, 1, 0, -1] as const;

export interface InsuranceNotice {
  companyId: string;
  message: string;
}

function isoDate(raw: unknown): string {
  const s = String(raw ?? '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) ? s : '';
}

export function kstToday(now: Date = new Date()): string {
  return new Date(now.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function daysBetween(fromIso: string, toIso: string): number {
  return Math.round(
    (Date.parse(`${toIso}T00:00:00Z`) - Date.parse(`${fromIso}T00:00:00Z`)) / 86_400_000
  );
}

/** 순수 계산 — 테스트용 */
export function insuranceExpiryNotices(
  companies: Array<{ id: string; data: Record<string, unknown> }>,
  today: string
): InsuranceNotice[] {
  const out: InsuranceNotice[] = [];
  for (const { id, data } of companies) {
    if (id === 'demo' || id === 'airpick' || data.status === 'suspended') continue;
    const ins = data.insurance as { enrolled?: boolean; periodEnd?: unknown } | undefined;
    if (!ins?.enrolled) continue;
    const end = isoDate(ins.periodEnd);
    if (!end) continue;
    const days = daysBetween(today, end);
    if (!(INSURANCE_NOTICE_DAYS as readonly number[]).includes(days)) continue;
    const name = String(data.name || id).trim() || id;
    const when =
      days > 0 ? `${days}일 전` : days === 0 ? '오늘' : '지남 — 손님 앱에 「보험 갱신 확인 중」';
    out.push({
      companyId: id,
      message: `보험 만기 ${when}: ${name} (${end}). 새 증권을 받아 업체 정보·에어픽 확인을 갱신해 주세요.`,
    });
  }
  return out;
}

export async function runInsuranceExpiryCheck(now: Date = new Date()): Promise<{ notices: number }> {
  const snap = await admin.firestore().collection('companies').get();
  const notices = insuranceExpiryNotices(
    snap.docs.map((d) => ({ id: d.id, data: d.data() })),
    kstToday(now)
  );
  for (const n of notices) {
    await recordServerError('insurance-expiry', n.message, [n.companyId]);
  }
  return { notices: notices.length };
}
