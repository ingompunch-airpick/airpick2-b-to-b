/** 저장·비교용. 010-2556-5746, 821025565746, +82 10… 을 같은 숫자로 맞춘다. */
export function normalizePhoneDigits(phone: unknown): string {
  if (typeof phone !== 'string' || !phone.trim()) return '';
  let digits = phone.replace(/\D/g, '');
  if (digits.startsWith('82') && digits.length >= 11) {
    digits = `0${digits.slice(2)}`;
  }
  if (digits.length === 10 && digits.startsWith('10')) {
    digits = `0${digits}`;
  }
  return digits;
}

export function isMobilePhoneKey(phoneKey: string): boolean {
  return phoneKey.length >= 10 && phoneKey.length <= 11 && phoneKey.startsWith('01');
}

/** Firestore `in` 조회용. 하이픈·공백·82 국가번호를 같이 찾는다. */
export function phoneQueryVariants(phoneKey: string): string[] {
  const set = new Set<string>([phoneKey]);
  if (phoneKey.length === 11) {
    const head = phoneKey.slice(0, 3);
    const mid = phoneKey.slice(3, 7);
    const tail = phoneKey.slice(7);
    set.add(`${head}-${mid}-${tail}`);
    set.add(`${head} ${mid} ${tail}`);
  } else if (phoneKey.length === 10) {
    const head = phoneKey.slice(0, 3);
    const mid = phoneKey.slice(3, 6);
    const tail = phoneKey.slice(6);
    set.add(`${head}-${mid}-${tail}`);
    set.add(`${head} ${mid} ${tail}`);
  }
  if (phoneKey.startsWith('0')) {
    const intl = `82${phoneKey.slice(1)}`;
    set.add(intl);
    set.add(`+${intl}`);
  }
  return [...set].slice(0, 10);
}

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
