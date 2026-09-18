import { httpsCallable } from 'firebase/functions';
import { signInWithCustomToken, signOut } from 'firebase/auth';
import { auth, functions } from '../firebase';

export type AffiliateLoginResult = {
  ok: true;
  code: string;
  name: string;
};

function callableErrorMessage(err: unknown): string {
  if (err && typeof err === 'object') {
    const e = err as { message?: string };
    if (typeof e.message === 'string' && e.message.trim()) {
      if (e.message === 'INTERNAL' || e.message.includes('internal')) {
        return '서버 로그인 처리 중 오류가 났습니다. 잠시 후 다시 시도해 주세요.';
      }
      return e.message;
    }
  }
  if (err instanceof Error) return err.message;
  return String(err);
}

/** 제휴 실적 포털 로그인 — custom token → Firebase Auth */
export async function loginAffiliatePortal(input: {
  code: string;
  password: string;
}): Promise<AffiliateLoginResult> {
  const call = httpsCallable<
    { code: string; password: string },
    { ok: true; customToken: string; code: string; name: string }
  >(functions, 'affiliateLogin');

  try {
    const result = await call({
      code: input.code.trim().toLowerCase(),
      password: input.password,
    });
    const data = result.data;
    const token = typeof data.customToken === 'string' ? data.customToken.trim() : '';
    if (!token) {
      throw new Error('로그인 토큰이 없습니다. 본사에 문의해 주세요.');
    }
    await signInWithCustomToken(auth, token);
    return { ok: true, code: data.code, name: data.name };
  } catch (err) {
    throw new Error(callableErrorMessage(err));
  }
}

export async function logoutAffiliatePortal(): Promise<void> {
  try {
    await signOut(auth);
  } catch {
    /* ignore */
  }
}

export async function resolveAffiliateAuthCode(): Promise<string | null> {
  const user = auth.currentUser;
  if (!user) return null;
  try {
    const token = await user.getIdTokenResult();
    if (String(token.claims.role || '') !== 'affiliate') return null;
    const code = String(token.claims.affiliateCode || '')
      .trim()
      .toLowerCase();
    return /^[a-z0-9_]{3,16}$/.test(code) ? code : null;
  } catch {
    return null;
  }
}
