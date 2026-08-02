import { timingSafeEqual } from 'crypto';

/** 클라이언트에 절대 내려보내지 않는 필드 */
const SENSITIVE_FIELDS = [
  'reservationPassword',
  'receiptToken',
  'userId',
  'notifyOnCreate',
  'kakaoSentAt',
  'kakaoTemplateCode',
  'kakaoSendStatus',
  'kakaoSendError',
] as const;

/** 예약 문서에서 민감 필드를 제거한 사본 반환 */
export function sanitizeReservation(
  data: Record<string, unknown>
): Record<string, unknown> {
  const clone: Record<string, unknown> = { ...data };
  for (const field of SENSITIVE_FIELDS) {
    delete clone[field];
  }
  return clone;
}

/** 저장된 예약 비밀번호와 입력값을 타이밍 안전 비교 */
export function reservationPasswordMatches(
  stored: unknown,
  provided: string
): boolean {
  const a = Buffer.from(String(stored ?? '').trim());
  const b = Buffer.from(provided.trim());
  if (a.length === 0 || a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
