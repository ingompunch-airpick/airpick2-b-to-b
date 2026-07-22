/** 출차 후 Firestore 예약 문서 보관 일수 */
export const RESERVATION_DATA_RETENTION_DAYS = 90;

/** 출차 후 Storage 차량 사진 보관 일수 */
/** 출차 후 Storage 차량 사진 — 자동 삭제 금지(운영 지시). 스케줄 필드만 기록될 수 있음. */
export const PHOTO_STORAGE_RETENTION_DAYS = 30;

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
