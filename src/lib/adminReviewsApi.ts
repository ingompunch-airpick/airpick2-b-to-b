import { auth } from '../firebase';
import { ensurePlatformAdminAuth } from './firebaseAuth';

const LIST_URL =
  'https://asia-northeast3-airpick-reservation.cloudfunctions.net/listAdminReviews';
const MODERATE_URL =
  'https://asia-northeast3-airpick-reservation.cloudfunctions.net/moderateReview';

export type AdminReview = {
  id: string;
  companyId: string;
  companyName: string;
  reservationId: string;
  rating: number;
  body?: string;
  authorMask: string;
  carMask?: string;
  status: string;
  createdAt: string;
  photoUrls?: string[];
};

async function platformAdminHeaders(): Promise<HeadersInit> {
  await ensurePlatformAdminAuth();
  const user = auth.currentUser;
  if (!user) throw new Error('본사 Firebase 로그인이 필요합니다.');
  const token = await user.getIdToken();
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
}

async function readError(res: Response): Promise<string> {
  try {
    const json = (await res.json()) as { error?: string };
    if (json.error === 'forbidden') return '본사 권한이 없습니다. 관리자 이메일로 다시 로그인해 주세요.';
    if (json.error === 'unauthenticated') return '본사 세션이 만료되었습니다. 다시 로그인해 주세요.';
    if (json.error === 'already_hidden') return '이미 숨긴 후기입니다.';
    if (json.error === 'not_found') return '후기를 찾을 수 없습니다.';
    if (json.error) return json.error;
  } catch {
    /* ignore */
  }
  return `요청 실패 (${res.status})`;
}

export async function listAdminReviews(): Promise<AdminReview[]> {
  const headers = await platformAdminHeaders();
  const res = await fetch(LIST_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify({}),
  });
  if (!res.ok) throw new Error(await readError(res));
  const json = (await res.json()) as { reviews?: AdminReview[] };
  return Array.isArray(json.reviews) ? json.reviews : [];
}

export async function moderateReview(
  id: string,
  action: 'hide' | 'delete'
): Promise<{ ok: true; action: string; aggregate: { rating: number; reviews_count: number } }> {
  const headers = await platformAdminHeaders();
  const res = await fetch(MODERATE_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify({ id, action }),
  });
  if (!res.ok) throw new Error(await readError(res));
  return (await res.json()) as {
    ok: true;
    action: string;
    aggregate: { rating: number; reviews_count: number };
  };
}
