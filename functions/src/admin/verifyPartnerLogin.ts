import * as admin from 'firebase-admin';
import { onCall, HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import { COMPANY_ID_RE, PLATFORM_ADMIN_EMAILS } from './constants';
import {
  resolveEmployeeForVerify,
  resolveLoginPasswordForVerify,
} from './companySecrets';

function isPlatformAdminToken(request: CallableRequest): boolean {
  const email =
    typeof request.auth?.token?.email === 'string'
      ? request.auth.token.email.trim().toLowerCase()
      : '';
  return !!email && (PLATFORM_ADMIN_EMAILS as readonly string[]).includes(email);
}

async function tryIssueCustomToken(input: {
  uid: string;
  companyId: string;
  partnerRole: 'master' | 'admin' | 'driver';
  employeeId?: string;
  employeeName?: string;
}): Promise<string | null> {
  try {
    const claims: Record<string, string> = {
      partnerCompanyId: input.companyId,
      partnerRole: input.partnerRole,
    };
    if (input.employeeId) claims.employeeId = input.employeeId;
    if (input.employeeName) claims.employeeName = input.employeeName;
    return await admin.auth().createCustomToken(input.uid, claims);
  } catch (err) {
    // 기본 Compute SA에 iam.serviceAccounts.signBlob 없으면 실패 — 로그인은 계속 가능하게
    console.warn('[verifyPartnerLogin] createCustomToken skipped:', err);
    return null;
  }
}

function companyPublicFields(companyId: string, company: Record<string, unknown>) {
  return {
    companyId,
    name: String(company.name || companyId),
    phone: typeof company.phone === 'string' ? company.phone : '',
    representative:
      typeof company.representative === 'string' ? company.representative : '',
    status: company.status === 'suspended' ? ('suspended' as const) : ('active' as const),
    is_indoor: company.is_indoor !== false,
    supports_indoor: company.supports_indoor !== false,
    supports_outdoor: company.supports_outdoor === true,
    image_url: typeof company.image_url === 'string' ? company.image_url : '',
  };
}

/**
 * Gate 로그인: 업체 마스터 또는 직원.
 * customToken 은 IAM 허용 시만 발급 (없어도 로그인 성공).
 */
export const verifyPartnerLogin = onCall(
  {
    memory: '512MiB',
    timeoutSeconds: 60,
  },
  async (request) => {
    const data = (request.data ?? {}) as { loginId?: unknown; password?: unknown };
    const loginId =
      typeof data.loginId === 'string' ? data.loginId.trim().toLowerCase() : '';
    const password = typeof data.password === 'string' ? data.password.trim() : '';

    if (!loginId || !password) {
      throw new HttpsError('invalid-argument', '아이디와 비밀번호를 입력하세요.');
    }

    const db = admin.firestore();

    // 1) 업체 마스터 (companyId 또는 업체명)
    let companyId = loginId;
    let snap = COMPANY_ID_RE.test(companyId)
      ? await db.collection('companies').doc(companyId).get()
      : null;

    if (!snap || !snap.exists) {
      const all = await db.collection('companies').get();
      const matched = all.docs.find((d) => {
        const name = String(d.data()?.name || '')
          .trim()
          .toLowerCase();
        return name === loginId || d.id.toLowerCase() === loginId;
      });
      if (matched) {
        companyId = matched.id;
        snap = matched;
      }
    }

    if (snap?.exists) {
      const company = snap.data() || {};
      if (!(company.isOperatorPrimary === false && company.parentCompanyId)) {
        if (company.status === 'suspended') {
          throw new HttpsError(
            'permission-denied',
            '해당 제휴업체 계정은 최고관리자에 의해 [정지] 처리되었습니다.'
          );
        }
        const expected = await resolveLoginPasswordForVerify(companyId);
        if (expected && expected === password) {
          const customToken = await tryIssueCustomToken({
            uid: `partner_${companyId}`,
            companyId,
            partnerRole: 'master',
          });
          return {
            ok: true as const,
            kind: 'master' as const,
            customToken,
            ...companyPublicFields(companyId, company as Record<string, unknown>),
          };
        }
      }
    }

    // 2) 직원
    const all = await db.collection('companies').get();
    for (const docSnap of all.docs) {
      const cid = docSnap.id;
      const company = docSnap.data() || {};
      if (company.status === 'suspended') continue;
      if (company.isOperatorPrimary === false && company.parentCompanyId) continue;

      const emp = await resolveEmployeeForVerify(cid, loginId);
      if (!emp) continue;
      if (emp.password !== password) {
        throw new HttpsError('permission-denied', '보안 비밀번호가 일치하지 않습니다.');
      }

      const customToken = await tryIssueCustomToken({
        uid: `emp_${cid}_${emp.id}`.replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 128),
        companyId: cid,
        partnerRole: emp.role,
        employeeId: emp.id,
        employeeName: emp.name,
      });

      return {
        ok: true as const,
        kind: 'employee' as const,
        customToken,
        ...companyPublicFields(cid, company as Record<string, unknown>),
        employeeId: emp.id,
        employeeName: emp.name,
        employeeRole: emp.role,
      };
    }

    throw new HttpsError('not-found', '일치하는 업체가 없거나 비밀번호가 다릅니다.');
  }
);

export async function assertCanManageEmployees(
  request: CallableRequest,
  companyId: string,
  masterPassword?: string
): Promise<void> {
  if (isPlatformAdminToken(request)) return;

  const token = request.auth?.token;
  const tokenCompany =
    typeof token?.partnerCompanyId === 'string' ? token.partnerCompanyId : '';
  const role = typeof token?.partnerRole === 'string' ? token.partnerRole : '';
  if (tokenCompany === companyId && (role === 'master' || role === 'admin')) return;

  // custom token 미발급 환경: 마스터 비밀번호로 대체 인증
  const pw = typeof masterPassword === 'string' ? masterPassword.trim() : '';
  if (pw) {
    const expected = await resolveLoginPasswordForVerify(companyId);
    if (expected && expected === pw) return;
  }

  throw new HttpsError(
    'permission-denied',
    '직원 관리 권한이 없습니다. 업체 마스터로 Gate 로그인했거나, 마스터 비밀번호를 확인하세요.'
  );
}
