import { buildReceiptUrl } from '../alimtalk/receiptUrl';
import { bookingSourceLabel, resolveBookingSource } from './bookingSource';
import { SHEET_HEADERS } from './constants';

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

export function buildReservationSheetRow(
  reservationId: string,
  data: Record<string, unknown>
): string[] {
  const source = resolveBookingSource(
    typeof data.createdBy === 'string' ? data.createdBy : null,
    data
  );

  const receiptUrl = buildReceiptUrl({
    id: reservationId,
    receiptToken: typeof data.receiptToken === 'string' ? data.receiptToken : undefined,
    receiptCode: typeof data.receiptCode === 'string' ? data.receiptCode : undefined,
  });

  const row: Record<(typeof SHEET_HEADERS)[number], string> = {
    예약ID: reservationId,
    상태: statusLabel(data.status),
    유입: bookingSourceLabel(source),
    업체ID: str(data.companyId, ''),
    업체명: str(data.companyName, ''),
    고객명: str(data.userName, ''),
    연락처: str(data.phone, ''),
    차량번호: str(data.carNumber, ''),
    차종: str(data.carModel, ''),
    입차예정: formatSchedule(data.departureDate, data.departureTime),
    출차예정: formatSchedule(data.arrivalDate, data.arrivalTime),
    '출국T': str(data.departureTerminal, '-'),
    '입국T': str(data.arrivalTerminal, '-'),
    금액: String(
      typeof data.totalPrice === 'number' ? data.totalPrice : data.totalPrice || 0
    ),
    결제: paymentLabel(data.paymentMethod),
    '실내/실외': data.isIndoor === false ? '실외' : '실내',
    예약일시: str(data.createdAt, '-'),
    입고일시: str(data.actualParkingTime, '-'),
    출차일시: str(data.actualExitTime, '-'),
    접수증링크: receiptUrl || '-',
    최종동기화: new Date().toISOString(),
  };

  return SHEET_HEADERS.map((header) => row[header]);
}

export { SHEET_HEADERS };
