/**
 * 입점업체 마케팅 홈 기본값 — airpick-partner-homepage buildPartnerDefaults 와 계약 맞춤
 */

export type PartnerHomepageConfig = {
  companyId: string;
  name: string;
  tagline: string;
  headline: string;
  themeId: 'sunny' | 'wawa' | string;
  seo: {
    title: string;
    description: string;
    ogImage?: string;
    keywords?: string;
  };
  geo: {
    address: string;
    region: string;
    terminals: Array<'T1' | 'T2'>;
    serviceAreaLabel: string;
  };
  phones: { booking: string; onsite?: string };
  trustItems: Array<{ value: string; label: string }>;
  whyUs: {
    title: string;
    sub: string;
    items: Array<{ title: string; body: string }>;
  };
  highlights: Array<{ title: string; body: string }>;
  homeBanner: { title: string; sub: string };
  pricePreview: {
    headline: string;
    perDayAfter: string;
    notes: string[];
    disclaimer: string;
  };
  /** Firestore 요금 연동 전 fallback */
  pricing: {
    baseDays: number;
    baseFee: number;
    dailyAfter: number;
    nightFee: number;
    nightFromHour: number;
    nightUntilHour: number;
  };
  steps: Array<{ title: string; body: string }>;
  photos: Array<{ src: string; alt: string }>;
  reviews: Array<{ quote: string; author?: string }>;
  business: {
    ceo?: string;
    registrationNumber?: string;
    mailOrderNumber?: string;
  };
  insuranceLabel: string;
  documents: Array<{ src: string; title: string }>;
  faqs: Array<{ question: string; answer: string }>;
  logoSrc?: string;
  kakaoId?: string;
  customerCountLabel: string;
};

export type PartnerHomepageSeed = {
  companyId: string;
  name: string;
  phone: string;
  representative?: string;
  address?: string;
  region?: string;
  insuranceLabel?: string;
  customerCountLabel?: string;
  headline?: string;
  tagline?: string;
  logoSrc?: string;
  photoUrls?: string[];
  registrationNumber?: string;
  mailOrderNumber?: string;
  kakaoId?: string;
  /** 요금 fallback — 보통 Firestore 실요금이 덮어씀 */
  pricing?: Partial<PartnerHomepageConfig['pricing']>;
  /** 서비스 지역 라벨 (기본 '인천공항 주차대행') */
  serviceAreaLabel?: string;
  themeId?: PartnerHomepageConfig['themeId'];
  /**
   * 관리자가 직접 손본 문구. 지정하면 자동 생성값을 덮어쓴다.
   * 미지정(undefined) 항목은 상호·전화 기반 기본값 유지.
   */
  overrides?: {
    whyUs?: PartnerHomepageConfig['whyUs'];
    faqs?: PartnerHomepageConfig['faqs'];
    steps?: PartnerHomepageConfig['steps'];
    highlights?: PartnerHomepageConfig['highlights'];
    trustItems?: PartnerHomepageConfig['trustItems'];
    homeBanner?: PartnerHomepageConfig['homeBanner'];
    seo?: PartnerHomepageConfig['seo'];
  };
};

export type PartnerHomepageDoc = {
  enabled: boolean;
  updatedAt: string;
  updatedBy?: string;
  config: PartnerHomepageConfig;
};

const DEFAULT_PRICING: PartnerHomepageConfig['pricing'] = {
  baseDays: 4,
  baseFee: 45000,
  dailyAfter: 5000,
  nightFee: 10000,
  nightFromHour: 22,
  nightUntilHour: 5,
};

function shortName(name: string) {
  return name.replace(/\s*주차대행\s*$/u, '').trim() || name;
}

function formatWon(n: number) {
  return n.toLocaleString('ko-KR');
}

function nightRange(p: PartnerHomepageConfig['pricing']) {
  const from = `${String(p.nightFromHour).padStart(2, '0')}:00`;
  const until = `${String(p.nightUntilHour).padStart(2, '0')}:00`;
  return `${from}~${until} 직전`;
}

export function buildPartnerHomepageConfig(seed: PartnerHomepageSeed): PartnerHomepageConfig {
  const name = seed.name.trim();
  const nick = shortName(name);
  const phone = seed.phone.trim();
  const pricing = { ...DEFAULT_PRICING, ...seed.pricing };
  const customerCount = seed.customerCountLabel?.trim() || '20,000+';
  const insurance = seed.insuranceLabel?.trim() || '현대해상 책임보험 가입';
  const insuranceShort = insurance.replace(/\s*가입\s*$/u, '');
  const tagline = seed.tagline?.trim() || '인천공항 주차대행';
  const headline =
    seed.headline?.trim() || '여유로운 출국, 검증된 주차부터.';
  const address = seed.address?.trim() || '';
  const region = seed.region?.trim() || '';
  const serviceAreaLabel = seed.serviceAreaLabel?.trim() || '인천공항 주차대행';
  const themeId = seed.themeId || 'sunny';

  const pricePreview = {
    headline: `기본 1~${pricing.baseDays}일 ${formatWon(pricing.baseFee)}원`,
    perDayAfter: `${pricing.baseDays + 1}일부터 1일 ${formatWon(pricing.dailyAfter)}원 추가`,
    notes: [
      '제1·제2터미널 요금 동일',
      `야간할증 ${nightRange(pricing)} ${formatWon(pricing.nightFee)}원`,
      '일정 변경 시 사전 연락 부탁드립니다',
    ],
    disclaimer:
      '홈 예상요금은 안내 금액입니다. 최종 견적·예약은 예약 페이지에서 진행됩니다.',
  };

  const photos = (seed.photoUrls || [])
    .filter(Boolean)
    .map((src, i) => ({ src, alt: `${nick} 주차장 ${i + 1}` }));

  const base: PartnerHomepageConfig = {
    companyId: seed.companyId.trim().toLowerCase(),
    name,
    tagline,
    headline,
    themeId,
    logoSrc: seed.logoSrc,
    kakaoId: seed.kakaoId,
    customerCountLabel: customerCount,
    seo: {
      title: `${name} | 인천공항 주차대행 · ${tagline}`,
      description: `${name} — ${serviceAreaLabel}. ${tagline} ${pricePreview.headline}, ${insurance}·24시간 CCTV. 에어픽 입점 파트너, T1·T2 온라인 예약.`,
      keywords: [
        name,
        nick,
        '인천공항 주차대행',
        '인천공항 발렛',
        '공항 주차대행',
        '장기주차',
        'T1 주차대행',
        'T2 주차대행',
        '에어픽',
        insuranceShort,
      ].join(', '),
    },
    geo: {
      address,
      region,
      terminals: ['T1', 'T2'],
      serviceAreaLabel,
    },
    phones: { booking: phone },
    trustItems: [
      { value: '100%', label: '책임보험 가입' },
      { value: '24h', label: 'CCTV 촬영·모니터링' },
      { value: customerCount, label: '이용 고객' },
      { value: '전용', label: '주차장 안심 보관' },
    ],
    whyUs: {
      title: `왜 ${customerCount.replace(/\+$/, '')} 넘는 고객이 ${nick}를 이용했을까요?`,
      sub: '처음 맡기셔도 안심할 수 있게, 필요한 것만 담았습니다.',
      items: [
        {
          title: '에어픽 입점업체',
          body: '에어픽 검증 업체로 입점되어 있어, 예약·이용 과정에서 신뢰를 더합니다.',
        },
        {
          title: '전용 주차장 보관',
          body: '공항 근처 전용 공간에 보관해, 출국부터 귀국까지 일정이 맞습니다.',
        },
        {
          title: insuranceShort,
          body: '발렛·보관 중에도 책임보험으로 대비해 둡니다.',
        },
        {
          title: '24시간 CCTV',
          body: '주차장 출입·보관을 CCTV로 촬영·모니터링합니다.',
        },
        {
          title: 'T1·T2 동일 요금',
          body: '터미널이 달라도 요금이 같고, 온라인으로 바로 예약할 수 있습니다.',
        },
      ],
    },
    highlights: [
      {
        title: '전용 주차장 안심 보관',
        body: '출국부터 귀국까지 전용 주차장에 안전하게 보관합니다. 일정에 맞춰 인계·반환을 진행합니다.',
      },
      {
        title: '빈틈 없는 보안',
        body: '주차장은 24시간 CCTV로 촬영·모니터링합니다. 불필요한 출입을 최소화합니다.',
      },
      {
        title: insuranceShort,
        body: `발렛 중에도 안심할 수 있도록 ${insuranceShort}에 가입되어 있습니다.`,
      },
    ],
    homeBanner: {
      title: `여행은 설레게, 주차는 ${nick}에게`,
      sub: `${serviceAreaLabel} · ${pricePreview.headline}`,
    },
    pricePreview,
    pricing,
    steps: [
      {
        title: '온라인 예약',
        body: '예약하기에서 일정과 차량 정보를 입력해 신청합니다.',
      },
      {
        title: '도착 전 연락',
        body: `공항 도착 30분전 ${nick}(${phone})로 연락하면 인계 위치를 안내합니다.`,
      },
      {
        title: '차량 인계·보관',
        body: '안내 장소에서 차량을 맡기면 상태 확인 후 전용 주차장에 보관합니다.',
      },
      {
        title: '귀국 후 반환',
        body: '입국 후 연락 주시면 안내에 따라 차량을 반환합니다.',
      },
    ],
    photos,
    reviews: [],
    business: {
      ceo: seed.representative?.trim() || undefined,
      registrationNumber: seed.registrationNumber?.trim() || undefined,
      mailOrderNumber: seed.mailOrderNumber?.trim() || undefined,
    },
    insuranceLabel: insurance,
    documents: [],
    faqs: [
      {
        question: '에어픽 입점업체인가요?',
        answer: `네. ${nick}는 에어픽이 확인한 공식 입점 파트너입니다. 보험·주차장·운영 기준을 통과한 업체만 에어픽 입점으로 안내됩니다.`,
      },
      {
        question: '주차장에 직접 가서 맡기나요?',
        answer: `아니요. 고객님은 주차장으로 직접 이동하지 않으셔도 됩니다. 인천공항 터미널 인근에서 차량을 인계하시면, ${nick}가 전용 주차장으로 이동·보관합니다. 귀국 후에도 안내받은 장소에서 차량을 반환받습니다.`,
      },
      {
        question: '예약은 어떻게 하고, 확인은 어떻게 하나요?',
        answer:
          '홈페이지의 「예약하기」를 누르면 예약 페이지로 이동합니다. 일정·차량 정보를 입력해 신청하세요.',
      },
      {
        question: '차량 인계는 어디서 하나요?',
        answer: `인천공항 제1·제2터미널 모두 이용 가능합니다. 공항 도착 30분 전 ${nick}(${phone})로 연락해 주시면 터미널별 인계 장소를 안내해 드립니다.`,
      },
      {
        question: '도착 후 차량은 어떻게 받나요?',
        answer: `입국 후 ${nick}로 연락해 주세요. 확인되는 대로 차량 출고를 준비하고, 안내받은 장소에서 차량을 반환합니다.`,
      },
      {
        question: '주차 요금은 어떻게 되나요?',
        answer: `제1·제2터미널 요금이 동일합니다. 기본료는 ${pricing.baseDays}일까지 ${formatWon(pricing.baseFee)}원이며, ${pricing.baseDays + 1}일부터는 하루 ${formatWon(pricing.dailyAfter)}원이 추가됩니다. 상세 금액은 예약 페이지에서 확인할 수 있습니다.`,
      },
      {
        question: '보험과 CCTV는 어떻게 되어 있나요?',
        answer: `${insurance} 상태이며, 주차장은 24시간 CCTV로 촬영·모니터링합니다.`,
      },
      {
        question: '일정이 바뀌면 어떻게 하나요?',
        answer: `출·입국 일정이 변경되면 반드시 사전에 전화(${phone})로 연락해 주세요.`,
      },
    ],
  };

  const ov = seed.overrides;
  if (!ov) return base;
  return {
    ...base,
    whyUs: ov.whyUs ?? base.whyUs,
    faqs: ov.faqs ?? base.faqs,
    steps: ov.steps ?? base.steps,
    highlights: ov.highlights ?? base.highlights,
    trustItems: ov.trustItems ?? base.trustItems,
    homeBanner: ov.homeBanner ?? base.homeBanner,
    seo: ov.seo ?? base.seo,
  };
}

export function partnerHomepageBookingUrl(companyId: string) {
  const id = companyId.trim().toLowerCase();
  const external: Record<string, string> = {
    gayu: 'https://www.itcha.co.kr/reserve/gayou/',
    hi: 'https://www.itcha.co.kr/reserve/annyeong',
    annyeong: 'https://www.itcha.co.kr/reserve/annyeong',
    season: 'https://itcha.co.kr/reserve/seasonparking',
    seasonparking: 'https://itcha.co.kr/reserve/seasonparking',
  };
  if (external[id]) return external[id];
  return `https://airpick-reservation.web.app/h/${encodeURIComponent(id)}`;
}

/** 마케팅 홈 공개 URL */
export function partnerMarketingHomeUrl(companyId: string) {
  return `https://airpick-partner-homepage.web.app/?company=${encodeURIComponent(companyId)}`;
}

/** 마케팅 홈 관리 (partner-homepage /admin) */
export function partnerHomepageAdminUrl(companyId: string) {
  const base =
    typeof import.meta !== 'undefined' && import.meta.env?.VITE_PARTNER_HOMEPAGE_ADMIN_BASE
      ? String(import.meta.env.VITE_PARTNER_HOMEPAGE_ADMIN_BASE).replace(/\/$/, '')
      : 'https://airpick-partner-homepage.web.app';
  return `${base}/admin?company=${encodeURIComponent(companyId)}`;
}
