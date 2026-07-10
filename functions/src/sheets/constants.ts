/** Google Sheets — 예약 장부 */
export const DEFAULT_SPREADSHEET_ID = '1zxxMHH7cJDz_nyCQbPOt2GCHdBtAVY9mzBDnUVV6lTs';

export const SHEET_HEADERS = [
  '예약ID',
  '상태',
  '유입',
  '업체ID',
  '업체명',
  '고객명',
  '연락처',
  '차량번호',
  '차종',
  '입차예정',
  '출차예정',
  '출국T',
  '입국T',
  '금액',
  '결제',
  '실내/실외',
  '예약일시',
  '입고일시',
  '출차일시',
  '접수증링크',
  '최종동기화',
] as const;

/** B2C 에어픽 유입 전용 탭 */
export const TAB_AIRPICK_B2C = '에어픽';

/** companyId → 시트 탭 (에어픽 B2C 제외) */
export const COMPANY_TAB_BY_ID: Record<string, string> = {
  wawa: '와와',
  wawa_valet: '와와',
  gayu: '가유',
  gayu_partner: '가유',
  airpick: '에어픽본사',
};

export const FALLBACK_TAB = '기타';
