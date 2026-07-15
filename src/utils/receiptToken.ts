/** NHN 알림톡 변수 14자 제한에 맞춤 — 접수증 URL `/r/{token}` 용 */
export const RECEIPT_TOKEN_LEN = 12;

/** 공개 접수증 URL용 비밀 토큰 (12 hex) */
export function createReceiptToken(): string {
  const bytes = new Uint8Array(Math.ceil(RECEIPT_TOKEN_LEN / 2));
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, RECEIPT_TOKEN_LEN);
}
