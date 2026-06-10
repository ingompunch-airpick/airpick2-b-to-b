import { signInAnonymously, signInWithEmailAndPassword, type User } from 'firebase/auth';
import { auth } from '../firebase';

/** Firestore rules `isPlatformAdmin()` 과 동일 목록 */
export const PLATFORM_ADMIN_EMAILS = [
  'drive5746@gmail.com',
  'ingompunch@gmail.com',
] as const;

export function getPlatformAdminCredentials(): { email: string; password: string } | null {
  const email = import.meta.env.VITE_FIREBASE_ADMIN_EMAIL?.trim().toLowerCase();
  const password = import.meta.env.VITE_FIREBASE_ADMIN_PASSWORD?.trim();
  if (!email || !password) return null;
  return { email, password };
}

export function isPlatformAdminUser(user: User | null | undefined): boolean {
  const email = user?.email?.trim().toLowerCase();
  return !!email && (PLATFORM_ADMIN_EMAILS as readonly string[]).includes(email);
}

async function signInWithPlatformAdminCredentials(): Promise<void> {
  const creds = getPlatformAdminCredentials();
  if (!creds) {
    throw new Error(
      'Firebase 관리자 인증 정보가 없습니다. .env에 VITE_FIREBASE_ADMIN_EMAIL / VITE_FIREBASE_ADMIN_PASSWORD 를 설정하세요.'
    );
  }
  await signInWithEmailAndPassword(auth, creds.email, creds.password);
}

/**
 * 예약·업체 수정 등 — Anonymous(홈페이지·B2C·B2B 공통) 또는 관리자 이메일 fallback.
 * Firebase Console → Authentication → Anonymous 활성화 필요.
 */
export async function ensureFirestoreAuth(): Promise<void> {
  if (auth.currentUser) return;

  try {
    await signInAnonymously(auth);
    return;
  } catch (e: unknown) {
    const code = (e as { code?: string })?.code;
    if (code === 'auth/admin-restricted-operation') {
      await signInWithPlatformAdminCredentials();
      return;
    }
    throw e;
  }
}

/**
 * companies 생성/삭제, system_settings — Firestore rules `isPlatformAdmin()` 과 일치해야 함.
 */
export async function ensurePlatformAdminAuth(): Promise<void> {
  if (isPlatformAdminUser(auth.currentUser)) return;
  await signInWithPlatformAdminCredentials();
}

export async function tryPlatformAdminAuthFallback(): Promise<boolean> {
  try {
    await signInWithPlatformAdminCredentials();
    return true;
  } catch {
    return false;
  }
}
