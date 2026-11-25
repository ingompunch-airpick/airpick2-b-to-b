/**
 * 인천공항(ICN) 항공사 → 터미널 안내, 편명 확인.
 * B2C(airpick-b2c/src/constants/airlines.ts)와 같은 표 — 바꿀 때 양쪽 같이 고친다.
 */
type Terminal = 'T1' | 'T2';

/** 아시아나 인천공항 T2 이전일 */
const ASIANA_ICN_T2_FROM = '2026-01-14';

function ymdLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * 인천공항 터미널 — 출처 확인된 항공사만. 모르면 null (안내하지 않음).
 * - T2: 대한항공·진에어(2023-07~)·에어부산(2025-07~)·에어서울(2025-09~)·아시아나(2026-01-14~),
 *        스카이팀 외항사(델타·에어프랑스·중화항공·가루다)
 * - T1: 제주항공·티웨이·이스타·에어프레미아(국적 LCC 중심 재편, 2026-01), 스카이팀이 아닌 외항사
 * - 베트남항공·중국동방(스카이팀이지만 T1/T2 확인 안 됨)은 null
 * 출처: 인천공항공사 T1·T2 재배치 발표(뉴시스 2025-12-16), 각 항공사 이전 보도. 바뀌면 이 표만 고친다.
 */
const ICN_T2_AIRLINES = new Set([
  '대한항공',
  '진에어',
  '에어부산',
  '에어서울',
  '델타항공',
  '에어프랑스',
  '중화항공',
  '가루다인도네시아',
]);
const ICN_T1_AIRLINES = new Set([
  '제주항공',
  '티웨이항공',
  '이스타항공',
  '에어프레미아',
  '싱가포르항공',
  '일본항공',
  '전일본항공',
  '중국국제항공',
  '중국남방항공',
  '태국항공',
  '캐세이퍼시픽',
  '홍콩항공',
  '에바항공',
  '필리핀항공',
  '세부퍼시픽',
  '말레이시아항공',
  '카타르항공',
  '에미레이트항공',
  '에티하드항공',
  '터키항공',
  '유나이티드항공',
  '아메리칸항공',
  '에어캐나다',
  '루프트한자',
  '영국항공',
]);

export function suggestedIcnTerminalForAirline(
  airlineName: string,
  onDateYmd?: string
): Terminal | null {
  const name = airlineName.trim();
  if (name === '아시아나항공') {
    const day = (onDateYmd && /^\d{4}-\d{2}-\d{2}$/.test(onDateYmd) ? onDateYmd : ymdLocal(new Date())).slice(
      0,
      10
    );
    return day >= ASIANA_ICN_T2_FROM ? 'T2' : 'T1';
  }
  if (ICN_T2_AIRLINES.has(name)) return 'T2';
  if (ICN_T1_AIRLINES.has(name)) return 'T1';
  return null;
}

/** 예약·검색 UI용 짧은 안내. 제안 터미널이 있을 때만. */
export function icnTerminalHintForAirline(airlineName: string, onDateYmd?: string): string | null {
  const name = airlineName.trim();
  const suggested = suggestedIcnTerminalForAirline(name, onDateYmd);
  if (!suggested) return null;
  const n = suggested === 'T2' ? '2' : '1';
  if (name === '아시아나항공') {
    if (suggested === 'T2') {
      return '아시아나항공은 2026년 1월 14일부터 제2터미널입니다. 터미널을 제2터미널로 맞춰 주세요.';
    }
    return '아시아나항공은 2026년 1월 14일 전까지 제1터미널 기준이었습니다. 날짜를 확인해 주세요.';
  }
  return `${name}${topicParticle(name)} 제${n}터미널입니다. 터미널을 제${n}터미널로 맞춰 주세요.`;
}

/** 받침 있으면 '은', 없으면 '는' (한글이 아니면 '은') */
function topicParticle(word: string): string {
  const code = word.charCodeAt(word.length - 1) - 0xac00;
  if (code < 0 || code > 11171) return '은';
  return code % 28 === 0 ? '는' : '은';
}

/** 항공사 → 편명 앞 2글자(IATA). 편명 오타·항공사 선택 실수를 알려 주는 용도 */
const AIRLINE_IATA: Record<string, string> = {
  대한항공: 'KE',
  아시아나항공: 'OZ',
  진에어: 'LJ',
  제주항공: '7C',
  티웨이항공: 'TW',
  에어부산: 'BX',
  에어서울: 'RS',
  이스타항공: 'ZE',
  에어프레미아: 'YP',
  베트남항공: 'VN',
  싱가포르항공: 'SQ',
  일본항공: 'JL',
  전일본항공: 'NH',
  중국국제항공: 'CA',
  중국동방항공: 'MU',
  중국남방항공: 'CZ',
  태국항공: 'TG',
  캐세이퍼시픽: 'CX',
  홍콩항공: 'HX',
  에바항공: 'BR',
  중화항공: 'CI',
  필리핀항공: 'PR',
  세부퍼시픽: '5J',
  말레이시아항공: 'MH',
  가루다인도네시아: 'GA',
  카타르항공: 'QR',
  에미레이트항공: 'EK',
  에티하드항공: 'EY',
  터키항공: 'TK',
  델타항공: 'DL',
  유나이티드항공: 'UA',
  아메리칸항공: 'AA',
  에어캐나다: 'AC',
  에어프랑스: 'AF',
  루프트한자: 'LH',
  영국항공: 'BA',
};

/**
 * 편명 확인 안내 (막지는 않음). 공동운항편은 다른 코드일 수 있어 안내만 한다.
 * 문제가 없으면 null.
 */
export function flightNumberHint(airlineName: string, flight: string): string | null {
  const f = String(flight || '').trim().toUpperCase().replace(/\s+/g, '');
  if (!f) return null;
  if (!/^[A-Z0-9]{2}\d{1,4}[A-Z]?$/.test(f)) {
    return '편명은 영문 2글자 + 숫자예요. 예: KE701';
  }
  const code = AIRLINE_IATA[airlineName.trim()];
  if (code && !f.startsWith(code)) {
    return `${airlineName.trim()} 편명 예: ${code}123. 항공사나 편명을 확인해 주세요. 공동운항편이면 항공권에 적힌 편명 그대로 두세요.`;
  }
  return null;
}
