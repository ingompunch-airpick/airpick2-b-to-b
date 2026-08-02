/** 휴대폰 → 알림톡 API용 (82xxxxxxxxxx) */
export function normalizeKoreanPhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, '');
  if (!digits) return null;

  if (digits.startsWith('82') && digits.length >= 11 && digits.length <= 13) {
    return digits;
  }
  if (digits.startsWith('0') && digits.length >= 10 && digits.length <= 11) {
    return `82${digits.slice(1)}`;
  }
  if (digits.length === 10 || digits.length === 11) {
    return digits.startsWith('0') ? `82${digits.slice(1)}` : digits;
  }
  return null;
}
