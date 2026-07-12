import { HttpsError } from 'firebase-functions/v2/https';
import type { CallableRequest } from 'firebase-functions/v2/https';
import { PLATFORM_ADMIN_EMAILS } from './constants';

export function assertPlatformAdmin(request: CallableRequest): {
  uid: string;
  email: string;
} {
  const auth = request.auth;
  if (!auth) {
    throw new HttpsError('unauthenticated', '로그인이 필요합니다.');
  }
  const email = typeof auth.token.email === 'string' ? auth.token.email.trim().toLowerCase() : '';
  if (!email || !(PLATFORM_ADMIN_EMAILS as readonly string[]).includes(email)) {
    throw new HttpsError('permission-denied', '본사 관리자만 수행할 수 있습니다.');
  }
  return { uid: auth.uid, email };
}
