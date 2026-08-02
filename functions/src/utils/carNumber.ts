/** 차량번호 저장·조회용 — 공백 제거 */
export function normalizeCarNumber(raw: string): string {
  return raw.trim().replace(/\s+/g, '');
}

/** 끝 숫자 4자리 — 조회 보조 키 (61소0272 → 0272) */
export function carNumberTail(raw: string): string | null {
  const digits = normalizeCarNumber(raw).replace(/\D/g, '');
  if (digits.length < 4) return null;
  return digits.slice(-4);
}

/** 손님 입력이 끝 4자리만인지 (공백 무시, 숫자만 4자) */
export function isCarNumberSuffixQuery(raw: string): boolean {
  return /^\d{4}$/.test(normalizeCarNumber(raw));
}

/** 조회 시 carNumber 필드 매칭 후보 (원문 + 공백제거) */
export function carNumberLookupNeedles(raw: string): string[] {
  const trimmed = raw.trim();
  const compact = normalizeCarNumber(raw);
  return [...new Set([trimmed, compact].filter(Boolean))];
}

/**
 * 후기 공개용 차량번호 마스킹 — 앞은 두고 끝 2자리만 **
 * 예: 31소3456 → 31소34**
 */
export function maskCarNumber(raw: string): string {
  const t = normalizeCarNumber(raw);
  if (!t) return '';
  if (t.length <= 2) return '*'.repeat(t.length);
  if (t.length <= 4) return `${t[0]}${'*'.repeat(t.length - 1)}`;
  return `${t.slice(0, -2)}**`;
}
