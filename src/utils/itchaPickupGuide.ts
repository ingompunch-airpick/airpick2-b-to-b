/**
 * 가유·시즌·안녕(itcha 계열) 공통 만남 장소.
 * 접수증에는 해당 터미널의 출국(차량 인도) 안내만 표시.
 * 출고 완료 확인증에는 입국 안내를 쓴다.
 */

export type ItchaPickupLeg = {
  place: string;
  videoUrl: string;
  videoLabel: string;
};

const T1 = {
  departure: {
    place: '1터미널 지하2층 H26',
    videoUrl: 'https://youtu.be/1rMJdalTz2o?si=VRNZlmp_41Khn6b5',
    videoLabel: '가는 길 보기',
  },
  arrival: {
    place: '1터미널 지하2층 H26',
    videoUrl: 'https://youtu.be/A6KbdA_Wo4w?si=88QUKPI3sirvZwFv',
    videoLabel: '가는 길 보기',
  },
} as const satisfies Record<'departure' | 'arrival', ItchaPickupLeg>;

const T2 = {
  departure: {
    place: '2터미널 2층 서편 146',
    videoUrl: 'https://youtu.be/9TQLX_51n6o?si=m2bJGlxpFnMvmht5',
    videoLabel: '가는 길 보기',
  },
  arrival: {
    place: '2터미널 2층 서편 146',
    videoUrl: 'https://youtu.be/Jrd5I7TXe9U?si=kLc6D29WI-o6HKKw',
    videoLabel: '가는 길 보기',
  },
} as const satisfies Record<'departure' | 'arrival', ItchaPickupLeg>;

/** 동일 만남 장소·영상을 쓰는 업체 ID */
const ITCHA_PICKUP_COMPANY_IDS = new Set(['gayu', 'season', 'hi', 'annyeong']);

export function usesItchaPickupGuide(companyId?: string | null): boolean {
  const id = String(companyId || '')
    .trim()
    .toLowerCase();
  return ITCHA_PICKUP_COMPANY_IDS.has(id);
}

function normalizeItchaTerminal(raw?: string | null): 'T1' | 'T2' | null {
  const t = String(raw || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '');
  if (t === 'T1' || t === '1' || t.includes('제1') || t.includes('1터미널')) return 'T1';
  if (t === 'T2' || t === '2' || t.includes('제2') || t.includes('2터미널')) return 'T2';
  return null;
}

export type ItchaPickupGuideView = ItchaPickupLeg & {
  terminal: 'T1' | 'T2';
  kind: 'departure' | 'arrival';
  /** 접수증 본문 — 장소 + 안내 */
  displayText: string;
};

/**
 * @param kind departure = 접수·입고(출국), arrival = 출고 완료(입국)
 */
export function resolveItchaPickupGuide(
  terminalRaw: string | undefined | null,
  kind: 'departure' | 'arrival'
): ItchaPickupGuideView | null {
  const terminal = normalizeItchaTerminal(terminalRaw);
  if (!terminal) return null;
  const leg = (terminal === 'T1' ? T1 : T2)[kind];
  return {
    ...leg,
    terminal,
    kind,
    displayText: leg.place,
  };
}
