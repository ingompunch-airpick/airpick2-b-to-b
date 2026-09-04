import { buildReceiptUrl } from '../alimtalk/receiptUrl';
import { bookingSourceLabel, resolveBookingSource } from './bookingSource';
import { SHEET_HEADERS } from './constants';

export type SheetRowExtras = {
  visitCount?: number | null;
};

const STORE_LABEL_BY_ID: Record<string, string> = {
  gayu: '가유',
  gayu_partner: '가유',
  hi: '안녕',
  annyeong: '안녕',
  season: '시즌',
  wawa: '와와',
  wawa_valet: '와와',
};

function statusLabel(status: unknown): string {
  switch (status) {
    case 'pending':
      return '예약';
    case 'pending_in':
      return '입고요청';
    case 'completed_in':
      return '입고';
    case 'request_out':
      return '출고요청';
    case 'completed_out':
      return '출차';
    case 'cancelled':
      return '취소';
    default:
      return typeof status === 'string' ? status : '미확인';
  }
}

function paymentLabel(method: unknown): string {
  switch (method) {
    case 'cash':
      return '현금';
    case 'account':
      return '계좌';
    case 'card':
      return '카드';
    case 'prepaid':
      return '선불';
    case 'paid':
      return '결제완료';
    case 'unpaid':
      return '미결제';
    default:
      return typeof method === 'string' ? method : '-';
  }
}

function formatSchedule(date?: unknown, time?: unknown): string {
  const d = typeof date === 'string' ? date.trim() : '';
  const t = typeof time === 'string' ? time.trim() : '';
  if (!d) return '-';
  return t ? `${d} ${t}` : d;
}

function str(value: unknown, fallback = '-'): string {
  if (value === null || value === undefined) return fallback;
  const s = String(value).trim();
  return s || fallback;
}

function firstStr(...values: unknown[]): string {
  for (const value of values) {
    const s = String(value ?? '').trim();
    if (s) return s;
  }
  return '';
}

function resolveStoreLabel(companyId: unknown, companyName: unknown): string {
  const id = String(companyId || '').trim().toLowerCase();
  if (id && STORE_LABEL_BY_ID[id]) return STORE_LABEL_BY_ID[id];

  const name = String(companyName || '').trim();
  if (name.includes('가유')) return '가유';
  if (name.includes('안녕')) return '안녕';
  if (name.includes('시즌')) return '시즌';
  if (name.includes('와와')) return '와와';
  return name || id || '-';
}

function resolveCustomerRequest(data: Record<string, unknown>): string {
  return firstStr(data.userRequest, data.customerNotes) || '-';
}

export function buildReservationSheetRow(
  reservationId: string,
  data: Record<string, unknown>,
  extras?: SheetRowExtras
): string[] {
  const source = resolveBookingSource(
    typeof data.createdBy === 'string' ? data.createdBy : null,
    data
  );

  const receiptUrl = buildReceiptUrl({
    id: reservationId,
    receiptToken: typeof data.receiptToken === 'string' ? data.receiptToken : undefined,
    receiptCode: typeof data.receiptCode === 'string' ? data.receiptCode : undefined,
    receiptLinkCode:
      typeof data.receiptLinkCode === 'string' ? data.receiptLinkCode : undefined,
  });

  const visitCount =
    typeof extras?.visitCount === 'number' && Number.isFinite(extras.visitCount)
      ? String(extras.visitCount)
      : '-';

  const row: Record<(typeof SHEET_HEADERS)[number], string> = {
    예약ID: reservationId,
    상태: statusLabel(data.status),
    유입: bookingSourceLabel(source),
    업체ID: str(data.companyId, ''),
    업체명: str(data.companyName, ''),
    매장: resolveStoreLabel(data.companyId, data.companyName),
    고객명: str(data.userName, ''),
    연락처: str(data.phone, ''),
    차량번호: str(data.carNumber, ''),
    차종: str(data.carModel, ''),
    입차예정: formatSchedule(data.departureDate, data.departureTime),
    출차예정: formatSchedule(data.arrivalDate, data.arrivalTime),
    '출국T': str(data.departureTerminal, '-'),
    '입국T': str(data.arrivalTerminal, '-'),
    출국편: str(firstStr(data.departureFlight, data.entryFlight).toUpperCase(), '-'),
    입국편: str(firstStr(data.arrivalFlight, data.exitFlight).toUpperCase(), '-'),
    출국항공사: str(firstStr(data.departureAirline, data.entryAirline), '-'),
    입국항공사: str(firstStr(data.arrivalAirline, data.exitAirline), '-'),
    여행지: str(data.destination, '-'),
    이용횟수: visitCount,
    금액: String(
      typeof data.totalPrice === 'number' ? data.totalPrice : data.totalPrice || 0
    ),
    결제: paymentLabel(data.paymentMethod),
    '실내/실외': data.isIndoor === false ? '실외' : '실내',
    예약일시: str(data.createdAt, '-'),
    입고일시: str(data.actualParkingTime, '-'),
    출차일시: str(data.actualExitTime, '-'),
    고객요청: resolveCustomerRequest(data),
    관리자메모: str(data.adminMemo, '-'),
    접수증링크: receiptUrl || '-',
    최종동기화: new Date().toISOString(),
  };

  return SHEET_HEADERS.map((header) => row[header]);
}

export { SHEET_HEADERS };
