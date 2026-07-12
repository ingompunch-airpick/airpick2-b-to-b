import {
  signInAnonymously,
  signInWithEmailAndPassword,
  type User,
} from 'firebase/auth';
import { auth } from '../firebase';

/** Firestore / Storage rules `isPlatformAdmin()` 과 동일 목록 */
export const PLATFORM_ADMIN_EMAILS = [
  'drive5746@gmail.com',
  'ingompunch@gmail.com',
] as const;

export function isPlatformAdminEmail(email: string | null | undefined): boolean {
  const normalized = email?.trim().toLowerCase() || '';
  return !!normalized && (PLATFORM_ADMIN_EMAILS as readonly string[]).includes(normalized);
}

export function isPlatformAdminUser(user: User | null | undefined): boolean {
  return isPlatformAdminEmail(user?.email);
}

export function formatPlatformAdminAuthError(err: unknown): string {
  const code = (err as { code?: string })?.code || '';
  if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found') {
    return '본사 Firebase 이메일 또는 비밀번호가 올바르지 않습니다.';
  }
  if (code === 'auth/too-many-requests') {
    return '로그인 시도가 너무 많습니다. 잠시 후 다시 시도하세요.';
  }
  if (code === 'auth/network-request-failed') {
    return '네트워크 오류로 로그인하지 못했습니다.';
  }
  if (err instanceof Error && err.message.trim()) return err.message;
  return '본사 Firebase 로그인에 실패했습니다.';
}

/**
 * 본사 Firebase Auth 로그인 (Gate / 관리자 모달).
 * `.env` 비밀번호는 사용하지 않습니다.
 */
export async function signInPlatformAdminWithPassword(
  email: string,
  password: string
): Promise<User> {
  const normalized = email.trim().toLowerCase();
  if (!isPlatformAdminEmail(normalized)) {
    throw new Error(
      `본사 계정이 아닙니다. 등록된 관리자 이메일로 로그인하세요.`
    );
  }
  if (!password.trim()) {
    throw new Error('비밀번호를 입력하세요.');
  }
  const cred = await signInWithEmailAndPassword(auth, normalized, password.trim());
  return cred.user;
}

/**
 * 예약·업체 운영 필드 등 — Anonymous(홈페이지·B2C·B2B 공통).
 * Firebase Console → Authentication → Anonymous 활성화 필요.
 */
export async function ensureFirestoreAuth(): Promise<void> {
  if (auth.currentUser) return;
  await signInAnonymously(auth);
}

/**
 * 본사 Callable / Storage / HQ blockedDates 등.
 * Gate에서 Firebase 관리자 이메일로 로그인한 세션이 있어야 합니다.
 */
export async function ensurePlatformAdminAuth(): Promise<void> {
  if (isPlatformAdminUser(auth.currentUser)) return;
  throw new Error(
    `본사 Firebase 로그인이 필요합니다. Gate에서 관리자 이메일로 로그인하세요.`
  );
}
