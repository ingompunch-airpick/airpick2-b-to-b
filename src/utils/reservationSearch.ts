import { normalizePhoneDigits } from './phone';

/** 차량번호 검색용 — 공백·하이픈 제거 */
export function normalizePlateForSearch(plate: string | undefined | null): string {
  return String(plate || '')
    .toLowerCase()
    .replace(/[\s-]/g, '');
}

/** 예약 목록 검색 (이름·번호·전화·모델·영수증) */
export function reservationMatchesKeyword(
  res: {
    userName?: string;
    carNumber?: string;
    carModel?: string;
    phone?: string;
    companyName?: string;
    receiptCode?: string;
  },
  keyword: string
): boolean {
  const q = keyword.trim().toLowerCase();
  if (!q) return true;
  const qDigits = normalizePhoneDigits(q);
  const qPlate = normalizePlateForSearch(q);

  if (res.userName?.toLowerCase().includes(q)) return true;
  if (res.carModel?.toLowerCase().includes(q)) return true;
  if (res.companyName?.toLowerCase().includes(q)) return true;
  if (res.receiptCode?.toLowerCase().includes(q)) return true;

  const plate = normalizePlateForSearch(res.carNumber);
  if (qPlate && plate.includes(qPlate)) return true;

  const phone = normalizePhoneDigits(res.phone);
  if (qDigits && phone.includes(qDigits)) return true;
  if (res.phone?.toLowerCase().includes(q)) return true;

  return false;
}
