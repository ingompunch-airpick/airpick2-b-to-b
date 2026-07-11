/** 공개 접수증 URL용 비밀 토큰 */
export function createReceiptToken(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID().replace(/-/g, '');
  }
  return `rt${Date.now()}${Math.random().toString(36).slice(2, 14)}`;
}
