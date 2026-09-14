import type { AlimtalkTemplateParams, ReservationSnapshot } from './types';
import { buildReceiptUrl, resolveReceiptPathCode } from './receiptUrl';

/**
 * NHN 신규 계정 제한(-1028): 변수 치환 시 14자 초과 불가.
 * 접수증 경로는 `#{토큰}`(≤12) + 템플릿 버튼 URL 조합.
 * 본문 `#{접수증링크}` 에는 짧은 안내 문구만 넣는다.
 */
const MAX_VAR_LEN = 14;

export function clampAlimtalkValue(value: string, max = MAX_VAR_LEN): string {
  const trimmed = value.trim();
  if (trimmed.length <= max) return trimmed;
  return trimmed.slice(0, max);
}

function baseParams(reservation: ReservationSnapshot): Pick<
  AlimtalkTemplateParams,
  '고객명' | '차량번호' | '토큰'
> {
  const pathCode = resolveReceiptPathCode(reservation);
  return {
    고객명: clampAlimtalkValue(reservation.userName?.trim() || '고객'),
    차량번호: clampAlimtalkValue((reservation.carNumber || '-').replace(/\s+/g, '')),
    ...(pathCode ? { 토큰: clampAlimtalkValue(pathCode) } : {}),
  };
}

/** 본문 변수용 — 긴 URL 대신 짧은 문구 (실제 URL은 WL 버튼) */
const RECEIPT_LINK_PLACEHOLDER = '버튼확인';
const REVIEW_LINK_PLACEHOLDER = '후기작성';

export function buildReserveParams(
  reservation: ReservationSnapshot,
  _receiptUrl: string = buildReceiptUrl(reservation)
): AlimtalkTemplateParams {
  return {
    ...baseParams(reservation),
    접수증링크: RECEIPT_LINK_PLACEHOLDER,
  };
}

export function buildCheckinParams(
  reservation: ReservationSnapshot,
  _receiptUrl: string = buildReceiptUrl(reservation)
): AlimtalkTemplateParams {
  return {
    ...baseParams(reservation),
    접수증링크: RECEIPT_LINK_PLACEHOLDER,
  };
}

const TERMINAL_LABELS: Record<string, string> = {
  T1: '제1여객터미널',
  T2: '제2여객터미널',
  DOM: '국내선',
  INT: '국제선',
};

function terminalLabel(raw?: string): string {
  const key = (raw || '').trim().toUpperCase();
  if (!key) return '-';
  return TERMINAL_LABELS[key] || raw!.trim();
}

/** "2026-09-24" + "07:00" → "2026년 9월 24일 07:00분" */
function dateTimeLabel(date?: string, time?: string): string {
  const d = (date || '').trim();
  const t = (time || '').trim();
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(d);
  const datePart = m ? `${m[1]}년 ${Number(m[2])}월 ${Number(m[3])}일` : d;
  if (!datePart) return t || '-';
  return t ? `${datePart} ${t}분` : datePart;
}

function priceLabel(value?: number): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return '-';
  return `${n.toLocaleString('ko-KR')}원`;
}

function firstFilled(...values: (string | undefined)[]): string {
  for (const v of values) {
    const t = (v || '').trim();
    if (t) return t;
  }
  return '-';
}

/**
 * 업체 전용 상세 템플릿용 변수.
 *
 * NHN 신규 계정의 14자 제한은 NCP 에 없어서 여기서는 클램프하지 않는다.
 * 자르면 "2026년 9월 24일 07:00분" 같은 값이 뭉개진다.
 *
 * 업체명·계좌·연락처는 업체 전용 채널·템플릿에 고정 문구로 들어가므로
 * 변수로 넘기지 않는다.
 */
export function buildPartnerDetailParams(
  reservation: ReservationSnapshot
): AlimtalkTemplateParams {
  return {
    ...baseParams(reservation),
    고객명: (reservation.userName || '').trim() || '고객',
    차량번호: (reservation.carNumber || '-').replace(/\s+/g, ''),
    차종: firstFilled(reservation.carModel),
    업체명: firstFilled(reservation.companyName),
    출발터미널: terminalLabel(reservation.departureTerminal),
    도착터미널: terminalLabel(reservation.arrivalTerminal),
    인도일시: dateTimeLabel(reservation.departureDate, reservation.departureTime),
    도착일시: dateTimeLabel(reservation.arrivalDate, reservation.arrivalTime),
    출발편명: firstFilled(reservation.departureFlight, reservation.entryFlight),
    출발항공사: firstFilled(reservation.departureAirline, reservation.entryAirline),
    도착편명: firstFilled(reservation.arrivalFlight, reservation.exitFlight),
    도착항공사: firstFilled(reservation.arrivalAirline, reservation.exitAirline),
    여행지: firstFilled(reservation.destination),
    차량위치: reservation.isIndoor ? '실내주차' : '실외주차',
    금액: priceLabel(reservation.totalPrice),
    접수증링크: RECEIPT_LINK_PLACEHOLDER,
  };
}

export function buildCheckoutParams(
  reservation: ReservationSnapshot,
  companyPhone: string,
  _receiptUrl: string = buildReceiptUrl(reservation)
): AlimtalkTemplateParams {
  return {
    ...baseParams(reservation),
    예약ID: clampAlimtalkValue(String(reservation.id || '').trim(), 40),
    접수증링크: REVIEW_LINK_PLACEHOLDER,
    업체연락처: clampAlimtalkValue(companyPhone.replace(/\s+/g, '')),
  };
}
