import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { COMPANY_ID_RE } from './constants';
import { writeCompanyEmployees, readSecretEmployees, type SecretEmployee } from './companySecrets';
import { assertCanManageEmployees } from './verifyPartnerLogin';

/**
 * 업체 직원 목록 저장 — 비밀번호는 secrets, 공개 문서에는 id/name/loginId/role 만.
 */
export const upsertCompanyEmployees = onCall(
  {
    memory: '256MiB',
    timeoutSeconds: 60,
  },
  async (request) => {
    const data = (request.data ?? {}) as {
      companyId?: unknown;
      employees?: unknown;
      masterPassword?: unknown;
    };
    const companyId =
      typeof data.companyId === 'string' ? data.companyId.trim().toLowerCase() : '';
    if (!COMPANY_ID_RE.test(companyId)) {
      throw new HttpsError('invalid-argument', 'companyId 형식이 올바르지 않습니다.');
    }

    const masterPassword =
      typeof data.masterPassword === 'string' ? data.masterPassword : undefined;
    await assertCanManageEmployees(request, companyId, masterPassword);

    if (!Array.isArray(data.employees)) {
      throw new HttpsError('invalid-argument', 'employees 배열이 필요합니다.');
    }

    const existingSecrets = await readSecretEmployees(companyId);
    const byLogin = new Map(existingSecrets.map((e) => [e.loginId, e]));

    const employees: SecretEmployee[] = [];
    for (const row of data.employees) {
      if (!row || typeof row !== 'object') continue;
      const r = row as Record<string, unknown>;
      const loginId = typeof r.loginId === 'string' ? r.loginId.trim().toLowerCase() : '';
      const incomingPassword = typeof r.password === 'string' ? r.password.trim() : '';
      const id = typeof r.id === 'string' && r.id.trim() ? r.id.trim() : `emp_${loginId}`;
      const name = typeof r.name === 'string' ? r.name.trim() : loginId;
      const role = r.role === 'admin' ? 'admin' : 'driver';
      if (!loginId) {
        throw new HttpsError('invalid-argument', '직원 loginId가 필요합니다.');
      }
      const password = incomingPassword || byLogin.get(loginId)?.password || '';
      if (!password) {
        throw new HttpsError(
          'invalid-argument',
          `직원 [${loginId}] 비밀번호가 없습니다. 신규 등록이거나 비밀번호를 다시 입력해 주세요.`
        );
      }
      employees.push({ id, loginId, password, name, role });
    }

    // loginId 중복 검사
    const seen = new Set<string>();
    for (const e of employees) {
      if (seen.has(e.loginId)) {
        throw new HttpsError('invalid-argument', `중복 loginId: ${e.loginId}`);
      }
      seen.add(e.loginId);
    }

    await writeCompanyEmployees(companyId, employees);
    return { ok: true as const, companyId, count: employees.length };
  }
);
