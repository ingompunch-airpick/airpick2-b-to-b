import { httpsCallable } from 'firebase/functions';
import { signInWithCustomToken } from 'firebase/auth';
import { auth, functions } from '../firebase';
import type { Employee } from '../types';

export interface VerifyPartnerLoginResult {
  ok: true;
  kind: 'master' | 'employee';
  customToken?: string | null;
  companyId: string;
  name: string;
  phone: string;
  representative: string;
  status: 'active' | 'suspended';
  is_indoor: boolean;
  supports_indoor: boolean;
  supports_outdoor: boolean;
  image_url: string;
  employeeId?: string;
  employeeName?: string;
  employeeRole?: 'admin' | 'driver';
}

const PARTNER_SESSION_KEY = 'b2b_partner_gate_session';

export function rememberPartnerGateSession(companyId: string, masterPassword: string): void {
  try {
    sessionStorage.setItem(
      PARTNER_SESSION_KEY,
      JSON.stringify({ companyId, masterPassword, at: Date.now() })
    );
  } catch {
    /* ignore */
  }
}

export function readPartnerGateMasterPassword(companyId: string): string {
  try {
    const raw = sessionStorage.getItem(PARTNER_SESSION_KEY);
    if (!raw) return '';
    const parsed = JSON.parse(raw) as { companyId?: string; masterPassword?: string };
    if (parsed.companyId === companyId && typeof parsed.masterPassword === 'string') {
      return parsed.masterPassword;
    }
  } catch {
    /* ignore */
  }
  return '';
}

function callableErrorMessage(err: unknown): string {
  if (err && typeof err === 'object') {
    const e = err as { message?: string };
    if (typeof e.message === 'string' && e.message.trim()) {
      // Firebase INTERNAL 래핑 메시지 정리
      if (e.message === 'INTERNAL' || e.message.includes('internal')) {
        return '서버 로그인 처리 중 오류가 났습니다. 잠시 후 다시 시도해 주세요.';
      }
      return e.message;
    }
  }
  if (err instanceof Error) return err.message;
  return String(err);
}

/** 가맹점 마스터·직원 Gate 로그인 (+ 가능하면 custom token) */
export async function verifyPartnerLogin(input: {
  loginId: string;
  password: string;
}): Promise<VerifyPartnerLoginResult> {
  const call = httpsCallable<
    { loginId: string; password: string },
    VerifyPartnerLoginResult
  >(functions, 'verifyPartnerLogin');
  try {
    const result = await call({
      loginId: input.loginId.trim(),
      password: input.password,
    });
    const data = result.data;
    if (data.customToken) {
      try {
        await signInWithCustomToken(auth, data.customToken);
      } catch (tokenErr) {
        console.warn('signInWithCustomToken failed (login still ok):', tokenErr);
      }
    }
    if (data.kind === 'master') {
      rememberPartnerGateSession(data.companyId, input.password);
    }
    return data;
  } catch (err) {
    throw new Error(callableErrorMessage(err));
  }
}

/** 직원 목록 저장 (비밀번호 → secrets) */
export async function upsertCompanyEmployees(input: {
  companyId: string;
  employees: Employee[];
  masterPassword?: string;
}): Promise<{ ok: true; companyId: string; count: number }> {
  const masterPassword =
    input.masterPassword?.trim() || readPartnerGateMasterPassword(input.companyId);
  const call = httpsCallable<
    { companyId: string; employees: Employee[]; masterPassword?: string },
    { ok: true; companyId: string; count: number }
  >(functions, 'upsertCompanyEmployees');
  try {
    const result = await call({
      companyId: input.companyId,
      masterPassword: masterPassword || undefined,
      employees: input.employees.map((e) => ({
        id: e.id,
        name: e.name,
        loginId: e.loginId,
        password: e.password || '',
        role: e.role || 'driver',
      })),
    });
    return result.data;
  } catch (err) {
    throw new Error(callableErrorMessage(err));
  }
}
