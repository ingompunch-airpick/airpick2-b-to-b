import * as admin from 'firebase-admin';
import {
  RESERVATION_DATA_RETENTION_DAYS,
  addDaysToIso,
  resolvePurgeSchedule,
} from './retention';

const BATCH_LIMIT = 200;

/**
 * 차량 사진 Storage는 절대 삭제하지 않는다.
 * (운영 지시: 사진 저장소는 무슨 일이 있어도 건드리지 않음)
 */
function db() {
  return admin.firestore();
}

async function clearDueStoragePurgeMarkers(nowIso: string): Promise<number> {
  const snap = await db()
    .collection('reservations')
    .where('storagePurgeAt', '<=', nowIso)
    .limit(BATCH_LIMIT)
    .get();

  let count = 0;
  for (const docSnap of snap.docs) {
    const data = docSnap.data();
    const schedule = resolvePurgeSchedule(data);
    const extendedPurgeAt = schedule
      ? freshDataPurgeAt(schedule.completedOutAt)
      : null;

    // 사진 파일·images 필드는 유지. 만료 마커만 정리.
    if (extendedPurgeAt && extendedPurgeAt > nowIso) {
      await docSnap.ref.update({
        storagePurgeAt: admin.firestore.FieldValue.delete(),
        dataPurgeAt: extendedPurgeAt,
      });
    } else {
      await docSnap.ref.update({
        storagePurgeAt: admin.firestore.FieldValue.delete(),
      });
    }
    count += 1;
  }
  return count;
}

/** storage_retention 큐도 파일 삭제 없이 문서만 비움 */
async function drainStorageRetentionQueue(): Promise<number> {
  const snap = await db().collection('storage_retention').limit(BATCH_LIMIT).get();
  let count = 0;
  for (const docSnap of snap.docs) {
    await docSnap.ref.delete();
    count += 1;
  }
  return count;
}

/**
 * 정책 변경(예: 7일→90일) 후에도 출차 기준 새 보관 기간 안이면
 * 문서에 박혀 있던 옛 dataPurgeAt을 연장하고 삭제하지 않는다.
 */
function freshDataPurgeAt(scheduleCompletedOutAt: string): string {
  return addDaysToIso(scheduleCompletedOutAt, RESERVATION_DATA_RETENTION_DAYS);
}

async function purgeReservationsPastData(nowIso: string): Promise<number> {
  const snap = await db()
    .collection('reservations')
    .where('dataPurgeAt', '<=', nowIso)
    .limit(BATCH_LIMIT)
    .get();

  let count = 0;
  for (const docSnap of snap.docs) {
    const data = docSnap.data();
    const schedule = resolvePurgeSchedule(data);
    if (!schedule) {
      // 예약 문서만 삭제. Storage 사진은 절대 삭제하지 않음.
      await docSnap.ref.delete();
      count += 1;
      continue;
    }

    const extendedPurgeAt = freshDataPurgeAt(schedule.completedOutAt);
    if (extendedPurgeAt > nowIso) {
      await docSnap.ref.update({ dataPurgeAt: extendedPurgeAt });
      continue;
    }

    // 예전엔 여기서 Storage도 지웠음 — 금지. Firestore 예약 문서만 제거.
    await docSnap.ref.delete();
    count += 1;
  }
  return count;
}

/** purge 필드 없는 레거시 completed_out — actualExitTime 기준 */
async function purgeLegacyCompletedOut(nowIso: string): Promise<number> {
  const snap = await db()
    .collection('reservations')
    .where('status', '==', 'completed_out')
    .limit(BATCH_LIMIT)
    .get();

  let count = 0;
  for (const docSnap of snap.docs) {
    const data = docSnap.data();
    if (typeof data.dataPurgeAt === 'string') continue;

    const schedule = resolvePurgeSchedule(data);
    if (!schedule) continue;
    if (schedule.dataPurgeAt > nowIso) continue;

    // Storage 삭제 금지. 예약 문서만 제거.
    await docSnap.ref.delete();
    count += 1;
  }
  return count;
}

export async function runRetentionCleanup(): Promise<{
  storageQueue: number;
  storageDue: number;
  dataDue: number;
  legacy: number;
}> {
  const nowIso = new Date().toISOString();

  const storageQueue = await drainStorageRetentionQueue();
  const storageDue = await clearDueStoragePurgeMarkers(nowIso);
  const dataDue = await purgeReservationsPastData(nowIso);
  const legacy = await purgeLegacyCompletedOut(nowIso);

  return { storageQueue, storageDue, dataDue, legacy };
}
