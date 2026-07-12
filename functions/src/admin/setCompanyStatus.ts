import * as admin from 'firebase-admin';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { assertPlatformAdmin } from './assertPlatformAdmin';
import { COMPANY_ID_RE } from './constants';

/**
 * 본사 — 업체 active / suspended 토글.
 */
export const adminSetCompanyStatus = onCall(
  {
    memory: '256MiB',
    timeoutSeconds: 30,
  },
  async (request) => {
    const adminUser = assertPlatformAdmin(request);
    const data = (request.data ?? {}) as { companyId?: unknown; status?: unknown };

    const companyId =
      typeof data.companyId === 'string' ? data.companyId.trim().toLowerCase() : '';
    if (!COMPANY_ID_RE.test(companyId)) {
      throw new HttpsError('invalid-argument', 'companyId 형식이 올바르지 않습니다.');
    }

    const status = data.status === 'suspended' ? 'suspended' : data.status === 'active' ? 'active' : null;
    if (!status) {
      throw new HttpsError('invalid-argument', 'status는 active 또는 suspended 여야 합니다.');
    }

    const ref = admin.firestore().collection('companies').doc(companyId);
    const snap = await ref.get();
    if (!snap.exists) {
      throw new HttpsError('not-found', `companies/${companyId} 문서가 없습니다.`);
    }

    const now = new Date().toISOString();
    await ref.set(
      {
        status,
        updatedAt: now,
        updatedBy: { uid: adminUser.uid, email: adminUser.email },
      },
      { merge: true }
    );

    return { ok: true as const, companyId, status };
  }
);
