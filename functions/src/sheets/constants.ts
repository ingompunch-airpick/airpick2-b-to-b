/** Google Sheets — 예약 장부 */
export const DEFAULT_SPREADSHEET_ID = '1zxxMHH7cJDz_nyCQbPOt2GCHdBtAVY9mzBDnUVV6lTs';

export const SHEET_HEADERS = [
  '예약ID',
  '상태',
  '유입',
  '업체ID',
  '업체명',
  '매장',
  '고객명',
  '연락처',
  '차량번호',
  '차종',
  '입차예정',
  '출차예정',
  '출국T',
  '입국T',
  '출국편',
  '입국편',
  '출국항공사',
  '입국항공사',
  '여행지',
  '이용횟수',
  '금액',
  '결제',
  '실내/실외',
  '예약일시',
  '입고일시',
  '출차일시',
  '고객요청',
  '관리자메모',
  '접수증링크',
  '최종동기화',
] as const;

function columnIndexToLetter(index: number): string {
  let n = index;
  let result = '';
  while (n > 0) {
    n -= 1;
    result = String.fromCharCode(65 + (n % 26)) + result;
    n = Math.floor(n / 26);
  }
  return result || 'A';
}

/** 시트 데이터 열 끝 (A=1 …) — 헤더 개수에 맞춰 자동 */
export const SHEET_LAST_COLUMN = columnIndexToLetter(SHEET_HEADERS.length);

/** B2C 에어픽 유입 전용 탭 */
export const TAB_AIRPICK_B2C = '에어픽';

/** companyId → 현장·B2B 탭 (에어픽 B2C·홈페이지 제외) */
export const COMPANY_TAB_BY_ID: Record<string, string> = {
  wawa: '와와',
  wawa_valet: '와와',
  gayu: '가유',
  gayu_partner: '가유',
  season: '시즌',
  hi: '안녕',
  annyeong: '안녕',
  airpick: '에어픽본사',
};

export const FALLBACK_TAB = '기타';

/** 업체 홈페이지 유입 → 「와와홈」「가유홈」 형태로 현장 탭과 분리 */
export function homepageTabFromCompanyTab(companyTab: string): string {
  const base = companyTab.replace(/홈$/, '').trim() || FALLBACK_TAB;
  return `${base}홈`;
}
