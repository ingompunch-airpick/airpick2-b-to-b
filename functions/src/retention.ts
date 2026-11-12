/** false면 예약 문서는 삭제하지 않는다. 사진만 PHOTO 일수로 지운다. */
export const PURGE_RESERVATION_DOCUMENTS = false;

/** 문서 삭제를 다시 켤 때만 사용. 지금은 무기한 보관. */
export const RESERVATION_DATA_RETENTION_DAYS = 365;

/** 출차 후 Storage 차량·스크래치 사진 보관 일수. 이 날이 지나면 파일과 URL을 지운다. */
export const PHOTO_STORAGE_RETENTION_DAYS = 14;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function addDaysToIso(base: Date | string, days: number): string {
  const ms = typeof base === 'string' ? new Date(base).getTime() : base.getTime();
  return new Date(ms + days * MS_PER_DAY).toISOString();
}

export function parseKstDateTimeString(kst: string): Date {
  const trimmed = kst.trim();
  const isoLike = trimmed.includes('T') ? trimmed : trimmed.replace(' ', 'T');
  return new Date(`${isoLike}+09:00`);
}

export function safeStorageCompanyId(companyId: unknown): string {
  return String(companyId || 'unknown').replace(/[^\w-]/g, '_');
}

export interface PurgeSchedule {
  completedOutAt: string;
  dataPurgeAt: string;
  storagePurgeAt: string;
}

export function resolvePurgeSchedule(data: FirebaseFirestore.DocumentData): PurgeSchedule | null {
  if (typeof data.dataPurgeAt === 'string' && typeof data.storagePurgeAt === 'string') {
    return {
      completedOutAt:
        typeof data.completedOutAt === 'string'
          ? data.completedOutAt
          : data.dataPurgeAt,
      dataPurgeAt: data.dataPurgeAt,
      storagePurgeAt: data.storagePurgeAt,
    };
  }

  if (data.status !== 'completed_out') return null;

  let checkout: Date | null = null;
  if (typeof data.completedOutAt === 'string') {
    checkout = new Date(data.completedOutAt);
  } else if (typeof data.actualExitTime === 'string' && data.actualExitTime.trim()) {
    checkout = parseKstDateTimeString(data.actualExitTime);
  } else if (typeof data.updatedAt === 'string') {
    checkout = new Date(data.updatedAt);
  }

  if (!checkout || Number.isNaN(checkout.getTime())) return null;

  return {
    completedOutAt: checkout.toISOString(),
    dataPurgeAt: addDaysToIso(checkout, RESERVATION_DATA_RETENTION_DAYS),
    storagePurgeAt: addDaysToIso(checkout, PHOTO_STORAGE_RETENTION_DAYS),
  };
}

/** 출차 완료이고, 출차 시각으로부터 사진 보관 일수가 지났으면 true. 주차 중인 차량은 false. */
export function checkoutPhotosDue(
  data: FirebaseFirestore.DocumentData | undefined,
  nowMs = Date.now()
): boolean {
  if (!data || String(data.status ?? '') !== 'completed_out') return false;
  // 정책 변경(예: 30→14일)이 바로 먹도록 저장된 storagePurgeAt 대신 현재 일수로 계산
  const schedule = resolvePurgeSchedule(data);
  if (!schedule) return false;
  const dueMs = new Date(
    addDaysToIso(schedule.completedOutAt, PHOTO_STORAGE_RETENTION_DAYS)
  ).getTime();
  return Number.isFinite(dueMs) && dueMs <= nowMs;
}
