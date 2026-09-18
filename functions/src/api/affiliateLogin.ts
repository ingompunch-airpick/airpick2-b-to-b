import * as admin from 'firebase-admin';
import { onCall, HttpsError } from 'firebase-functions/v2/https';

const CODE_RE = /^[a-z0-9_]{3,16}$/;

async function tryIssueAffiliateToken(code: string): Promise<string> {
  try {
    return await admin.auth().createCustomToken(`affiliate_${code}`, {
      role: 'affiliate',
      affiliateCode: code,
    });
  } catch (err) {
    console.error('[affiliateLogin] createCustomToken failed:', err);
    throw new HttpsError(
      'failed-precondition',
      '제휴 로그인 토큰을 발급하지 못했습니다. 본사에 IAM 설정을 요청해 주세요.'
    );
  }
}

/**
 * 제휴 실적 포털 로그인 — 코드 + 비밀번호 → custom token.
 * 주차 Gate / companies 계정과 무관.
 */
export const affiliateLogin = onCall(
  {
    region: 'us-central1',
    memory: '256MiB',
    timeoutSeconds: 30,
  },
  async (request) => {
    const data = (request.data ?? {}) as { code?: unknown; password?: unknown };
    const code =
      typeof data.code === 'string' ? data.code.trim().toLowerCase() : '';
    const password = typeof data.password === 'string' ? data.password.trim() : '';

    if (!CODE_RE.test(code) || !password) {
      throw new HttpsError('invalid-argument', '코드와 비밀번호를 입력하세요.');
    }

    const db = admin.firestore();
    const [affSnap, secretSnap] = await Promise.all([
      db.doc(`affiliates/${code}`).get(),
      db.doc(`affiliateSecrets/${code}`).get(),
    ]);

    if (!affSnap.exists) {
      throw new HttpsError('not-found', '제휴 코드 또는 비밀번호가 올바르지 않습니다.');
    }

    const aff = affSnap.data() || {};
    if (String(aff.status || '') === 'suspended') {
      throw new HttpsError(
        'permission-denied',
        '이 제휴 계정은 정지되었습니다. 본사에 문의해 주세요.'
      );
    }

    const expected =
      typeof secretSnap.data()?.password === 'string'
        ? String(secretSnap.data()?.password).trim()
        : '';
    if (!expected || expected !== password) {
      throw new HttpsError(
        'permission-denied',
        '제휴 코드 또는 비밀번호가 올바르지 않습니다.'
      );
    }

    const customToken = await tryIssueAffiliateToken(code);
    return {
      ok: true as const,
      customToken,
      code,
      name: String(aff.name || code),
    };
  }
);
