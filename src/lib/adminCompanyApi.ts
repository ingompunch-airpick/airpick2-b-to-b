import { httpsCallable, type HttpsCallableResult } from 'firebase/functions';
import { functions } from '../firebase';
import { ensurePlatformAdminAuth } from './firebaseAuth';

export interface AdminUpsertCompanyPatch {
  name?: string;
  phone?: string;
  representative?: string;
  password?: string;
  settlementMemo?: string;
  status?: string;
  isOperatorPrimary?: boolean;
  parentCompanyId?: string;
  [key: string]: unknown;
}

export interface AdminUpsertCompanyResult {
  ok: true;
  companyId: string;
  mode?: 'create' | 'update';
}

/** Callable 호출 전 본사 Auth 세션 확인 */
export async function ensureAdminCallableAuth(): Promise<void> {
  await ensurePlatformAdminAuth();
}

function callableErrorMessage(err: unknown): string {
  if (err && typeof err === 'object') {
    const e = err as { message?: string; code?: string; details?: unknown };
    if (typeof e.message === 'string' && e.message.trim()) return e.message;
  }
  if (err instanceof Error) return err.message;
  return String(err);
}

async function callAdmin<Req, Res>(name: string, data: Req): Promise<Res> {
  await ensureAdminCallableAuth();
  const call = httpsCallable<Req, Res>(functions, name);
  try {
    const result: HttpsCallableResult<Res> = await call(data);
    return result.data;
  } catch (err) {
    throw new Error(callableErrorMessage(err));
  }
}

/** 본사 companies 문서 수정 */
export async function adminUpsertCompany(input: {
  companyId: string;
  patch: AdminUpsertCompanyPatch;
}): Promise<AdminUpsertCompanyResult> {
  return callAdmin('adminUpsertCompany', {
    mode: 'update' as const,
    companyId: input.companyId,
    patch: input.patch,
  });
}

/** 본사 companies 문서 신규 생성 */
export async function adminCreateCompany(input: {
  companyId: string;
  document: AdminUpsertCompanyPatch;
}): Promise<AdminUpsertCompanyResult> {
  return callAdmin('adminUpsertCompany', {
    mode: 'create' as const,
    companyId: input.companyId,
    document: input.document,
  });
}

export async function adminSetCompanyStatus(input: {
  companyId: string;
  status: 'active' | 'suspended';
}): Promise<{ ok: true; companyId: string; status: 'active' | 'suspended' }> {
  return callAdmin('adminSetCompanyStatus', input);
}

export async function adminDeleteCompany(input: {
  companyId: string;
}): Promise<{ ok: true; companyId: string }> {
  return callAdmin('adminDeleteCompany', input);
}
