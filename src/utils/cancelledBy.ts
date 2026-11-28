import type { CancelledBy } from '../types';

/** B2B 에서 업체·본사가 취소할 때 고르는 항목 (손님 앱 직접 취소·결제 초과는 서버가 따로 남김) */
export const STAFF_CANCEL_CHOICES: { by: Extract<CancelledBy, 'customer_request' | 'partner' | 'void'>; label: string; hint: string }[] = [
  { by: 'customer_request', label: '손님 요청', hint: '손님이 전화·문자로 취소를 부탁함' },
  { by: 'partner', label: '업체 사정', hint: '자리 부족·기사 부족 등 업체 사정' },
  { by: 'void', label: '테스트·잘못 등록', hint: '실제 예약이 아님' },
];

export function cancelledByLabel(by: string | undefined | null): string | null {
  switch (by) {
    case 'customer':
      return '손님 직접 취소';
    case 'customer_request':
      return '손님 요청';
    case 'partner':
      return '업체 사정';
    case 'void':
      return '테스트·잘못 등록';
    case 'payment_timeout':
    case 'payment_late_full':
      return '결제 시간 초과';
    default:
      return null;
  }
}
