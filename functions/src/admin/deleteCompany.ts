import * as admin from 'firebase-admin';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { assertPlatformAdmin } from './assertPlatformAdmin';
import { COMPANY_ID_RE, PROTECTED_COMPANY_IDS } from './constants';

/**
 * 본사 — companies 문서 삭제 (대표·하위 공통).
 */
export const adminDeleteCompany = onCall(
  {
    memory: '256MiB',
    timeoutSeconds: 30,
  },
  async (request) => {
    assertPlatformAdmin(request);
    const data = (request.data ?? {}) as { companyId?: unknown };

    const companyId =
      typeof data.companyId === 'string' ? data.companyId.trim().toLowerCase() : '';
    if (!COMPANY_ID_RE.test(companyId)) {
      throw new HttpsError('invalid-argument', 'companyId 형식이 올바르지 않습니다.');
    }
    if ((PROTECTED_COMPANY_IDS as readonly string[]).includes(companyId)) {
      throw new HttpsError('permission-denied', '플랫폼 본사 문서는 삭제할 수 없습니다.');
    }

    const ref = admin.firestore().collection('companies').doc(companyId);
    const snap = await ref.get();
    if (!snap.exists) {
      throw new HttpsError('not-found', `companies/${companyId} 문서가 없습니다.`);
    }

    await ref.delete();
    try {
      await admin
        .firestore()
        .collection('companies')
        .doc(companyId)
        .collection('secrets')
        .doc('login')
        .delete();
    } catch {
      // secrets 없으면 무시
    }

    return { ok: true as const, companyId };
  }
);
