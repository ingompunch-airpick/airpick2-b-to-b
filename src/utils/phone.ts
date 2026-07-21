/** 저장·카운트 키용 — 하이픈/공백 제거, 국내 휴대폰 정규화 */
export function normalizePhoneDigits(phone: string | undefined | null): string {
  if (!phone?.trim()) return '';

  let digits = phone.replace(/\D/g, '');
  if (digits.startsWith('82') && digits.length >= 11) {
    digits = `0${digits.slice(2)}`;
  }
  // 1012345678 (0 누락) → 01012345678
  if (digits.length === 10 && digits.startsWith('10')) {
    digits = `0${digits}`;
  }
  return digits;
}

/** 화면 표시용 010-1234-5678 */
export function formatPhoneDisplay(phone: string | undefined | null): string {
  const digits = normalizePhoneDigits(phone);
  if (digits.length === 11) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return (phone || '').trim() || '-';
}

export function isValidMobilePhone(phone: string | undefined | null): boolean {
  const d = normalizePhoneDigits(phone);
  return d.length >= 10 && d.length <= 11 && d.startsWith('01');
}
