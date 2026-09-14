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
  code: string;
  token: string;
  days?: number;
}): Promise<AffiliateStatsPublicDto> {
  const qs = new URLSearchParams({
    code: input.code,
    t: input.token,
  });
  if (input.days != null) qs.set('days', String(input.days));

  const res = await fetch(`${AFFILIATE_STATS_API}?${qs.toString()}`);
  const body = (await res.json().catch(() => ({}))) as {
    error?: string;
  } & Partial<AffiliateStatsPublicDto>;

  if (!res.ok) {
    const err = body.error || `http_${res.status}`;
    if (err === 'suspended') throw new Error('이 제휴 코드는 정지되었습니다.');
    if (err === 'invalid_token' || err === 'not_found') {
      throw new Error('링크가 올바르지 않거나 만료되었습니다.');
    }
    throw new Error('실적을 불러오지 못했습니다.');
  }

  return body as AffiliateStatsPublicDto;
}
