/** NHN recipientNo — 숫자만, 국내 010xxxxxxxx */
export function normalizeRecipientPhone(phone: string | undefined): string | null {
  if (!phone?.trim()) return null;

  let digits = phone.replace(/\D/g, '');
  if (digits.startsWith('82') && digits.length >= 11) {
    digits = `0${digits.slice(2)}`;
  }
  if (digits.startsWith('010') && digits.length === 11) return digits;
  if (digits.startsWith('01') && digits.length === 10) return `0${digits}`;
  if (digits.length >= 10 && digits.length <= 11 && digits.startsWith('0')) return digits;

  return null;
}
