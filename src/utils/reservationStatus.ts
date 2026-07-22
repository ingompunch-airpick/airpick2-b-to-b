import { ReservationStatus } from '../types';

/** 외부(홈페이지·옛 데이터)에서 들어올 수 있는 한글/별칭 → 표준 영문 코드 */
const STATUS_ALIASES: Record<string, ReservationStatus> = {
  pending: 'pending',
  '입고예정': 'pending',
  '예약완료': 'pending',
  '접수': 'pending',
  '입고대기': 'pending',

  pending_in: 'pending_in',
  '입고요청': 'pending_in',

  request_out: 'request_out',
  '출고요청': 'request_out',

  completed_in: 'completed_in',
  '주차완료': 'completed_in',
  '출고예정': 'completed_in',

  completed_out: 'completed_out',
  '인도완료': 'completed_out',
  '출차완료': 'completed_out',

  cancelled: 'cancelled',
  '취소': 'cancelled',
};

const DRIVER_LABELS: Record<ReservationStatus, string> = {
  pending: '입고예정',
  pending_in: '입고요청',
  request_out: '출고요청',
  completed_in: '주차완료',
  completed_out: '인도완료',
  cancelled: '취소',
};

const ADMIN_LABELS: Record<ReservationStatus, string> = {
  pending: '접수대기',
  pending_in: '입고대기',
  request_out: '출고요청',
  completed_in: '주차완료',
  completed_out: '출고완료',
  cancelled: '취소',
};

const BADGE_COLOR_CLASS: Record<ReservationStatus, string> = {
  pending: 'bg-amber-500/10 text-amber-500',
  pending_in: 'bg-sky-500/10 text-sky-450',
  request_out: 'bg-rose-500/10 text-rose-450',
  completed_in: 'bg-emerald-500/10 text-emerald-450',
  completed_out: 'bg-[#2C2C2E] text-neutral-400',
  cancelled: 'bg-neutral-800 text-neutral-400',
};

const ADMIN_BADGE_CLASS: Record<ReservationStatus, string> = {
  pending: 'bg-[#1C1C1E] text-amber-500 border-amber-500/20',
  pending_in: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  request_out: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
  completed_in: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  completed_out: 'bg-zinc-800 text-zinc-400 border-zinc-700',
  cancelled: 'bg-neutral-800 text-neutral-400 border-neutral-800',
};

const VALID_STATUSES = new Set<ReservationStatus>([
  'pending', 'pending_in', 'request_out', 'completed_in', 'completed_out', 'cancelled',
]);

/** Firestore·홈페이지·localStorage 등 어떤 값이 와도 표준 ReservationStatus로 변환 */
export function normalizeReservationStatus(raw: unknown): ReservationStatus {
  const s = String(raw ?? '').trim();
  if (STATUS_ALIASES[s]) return STATUS_ALIASES[s];
  if (VALID_STATUSES.has(s as ReservationStatus)) return s as ReservationStatus;
  return 'pending';
}

export type StatusLabelContext = 'driver' | 'admin';

/** 화면 표시용 한글 라벨 (저장값은 항상 영문) */
export function statusToLabel(
  status: ReservationStatus | string,
  context: StatusLabelContext = 'driver'
): string {
  const norm = normalizeReservationStatus(status);
  const labels = context === 'admin' ? ADMIN_LABELS : DRIVER_LABELS;
  return labels[norm] ?? String(status);
}

export function isPending(status: ReservationStatus | string): boolean {
  return normalizeReservationStatus(status) === 'pending';
}

export function isPendingIn(status: ReservationStatus | string): boolean {
  return normalizeReservationStatus(status) === 'pending_in';
}

export function isRequestOut(status: ReservationStatus | string): boolean {
  return normalizeReservationStatus(status) === 'request_out';
}

export function isCompletedIn(status: ReservationStatus | string): boolean {
  return normalizeReservationStatus(status) === 'completed_in';
}

export function isCompletedOut(status: ReservationStatus | string): boolean {
  return normalizeReservationStatus(status) === 'completed_out';
}

export function isCancelled(status: ReservationStatus | string): boolean {
  return normalizeReservationStatus(status) === 'cancelled';
}

/** 입고 처리 완료 이후(주차 중·출고요청·출차완료) */
export function isAdmitted(status: ReservationStatus | string): boolean {
  const norm = normalizeReservationStatus(status);
  return norm === 'completed_in' || norm === 'request_out' || norm === 'completed_out';
}

/** 현재 주차 중(아직 출차 전) */
export function isParked(status: ReservationStatus | string): boolean {
  const norm = normalizeReservationStatus(status);
  return norm === 'completed_in' || norm === 'request_out';
}

/** 기사 타임라인에서 숨기는 종료 상태 */
export function isDriverTimelineHidden(status: ReservationStatus | string): boolean {
  const norm = normalizeReservationStatus(status);
  return norm === 'completed_out' || norm === 'cancelled';
}

/** 아직 입고(주차) 처리 전 — 출고예정 탭에서 예정만 표시할 때 사용 */
export function isNotYetAdmitted(status: ReservationStatus | string): boolean {
  const norm = normalizeReservationStatus(status);
  return norm === 'pending' || norm === 'pending_in';
}

/** 기사 타임라인 상단 탭과 상태 매칭 */
export function matchesDriverTab(
  status: ReservationStatus | string,
  tab: ReservationStatus
): boolean {
  const norm = normalizeReservationStatus(status);
  if (tab === 'pending') return norm === 'pending';
  // 출고예정: 주차완료 + 아직 미입고(예약만 된 차) — arrivalDate로 물량 미리 보기
  if (tab === 'completed_in') {
    return norm === 'completed_in' || norm === 'pending' || norm === 'pending_in';
  }
  return norm === tab;
}

/** ReservationCard 뱃지 색상 */
export function statusBadgeColorClass(status: ReservationStatus | string): string {
  return BADGE_COLOR_CLASS[normalizeReservationStatus(status)] ?? 'bg-[#2C2C2E] text-neutral-400';
}

/** 관리자 CRM 뱃지 className (border 포함) */
export function adminStatusBadgeClass(status: ReservationStatus | string): string {
  return ADMIN_BADGE_CLASS[normalizeReservationStatus(status)] ?? 'bg-neutral-800 text-neutral-400 border-neutral-800';
}
