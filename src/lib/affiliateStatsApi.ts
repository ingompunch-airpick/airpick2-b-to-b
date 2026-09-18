import { auth } from '../firebase';

export type AffiliateStatsPublicDto = {
  code: string;
  name: string;
  status: string;
  days: number;
  bookings: number;
  completedOut: number;
  cancelled: number;
  customerDiscountWon: number;
  referrerCreditWon: number;
  creditEarnedWon: number;
};

const AFFILIATE_STATS_API =
  'https://asia-northeast3-airpick-reservation.cloudfunctions.net/getAffiliateStats';

export async function fetchAffiliateStatsPublic(input: {
  days?: number;
}): Promise<AffiliateStatsPublicDto> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('로그인이 필요합니다.');
  }
  const idToken = await user.getIdToken();

  const qs = new URLSearchParams();
  if (input.days != null) qs.set('days', String(input.days));
  const url = qs.toString()
    ? `${AFFILIATE_STATS_API}?${qs.toString()}`
    : AFFILIATE_STATS_API;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${idToken}` },
  });
  const body = (await res.json().catch(() => ({}))) as {
    error?: string;
  } & Partial<AffiliateStatsPublicDto>;

  if (!res.ok) {
    const err = body.error || `http_${res.status}`;
    if (err === 'unauthorized') {
      throw new Error('로그인이 만료되었습니다. 다시 로그인해 주세요.');
    }
    if (err === 'suspended') {
      throw new Error(
        '이 제휴 코드는 정지되었습니다. 본사에 문의해 주세요. (주차 업체 로그인으로는 열 수 없습니다.)'
      );
    }
    if (err === 'not_found') {
      throw new Error('제휴 정보를 찾을 수 없습니다.');
    }
    throw new Error('실적을 불러오지 못했습니다.');
  }

  return body as AffiliateStatsPublicDto;
}
