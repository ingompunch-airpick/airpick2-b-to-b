import * as admin from 'firebase-admin';
import {
  RESERVATION_DATA_RETENTION_DAYS,
  addDaysToIso,
  resolvePurgeSchedule,
  safeStorageCompanyId,
} from './retention';

const BATCH_LIMIT = 200;

function db() {
  return admin.firestore();
}

function bucket() {
  return admin.storage().bucket();
}

async function deleteReservationStorage(companyId: unknown, reservationId: string): Promise<void> {
  const prefix = `reservations/${safeStorageCompanyId(companyId)}/${reservationId}/`;
  try {
    await bucket().deleteFiles({ prefix });
  } catch (err) {
    console.warn(`[retention] storage delete failed prefix=${prefix}`, err);
  }
}

async function purgeStorageRetentionQueue(nowIso: string): Promise<number> {
  const snap = await db()
    .collection('storage_retention')
    .where('storagePurgeAt', '<=', nowIso)
    .limit(BATCH_LIMIT)
    .get();

  let count = 0;
  for (const docSnap of snap.docs) {
    const data = docSnap.data();
    await deleteReservationStorage(data.companyId, docSnap.id);
    await docSnap.ref.delete();
    count += 1;
  }
  return count;
}

async function purgeReservationsPastStorage(nowIso: string): Promise<number> {
  const snap = await db()
    .collection('reservations')
    .where('storagePurgeAt', '<=', nowIso)
    .limit(BATCH_LIMIT)
    .get();

  let count = 0;
  for (const docSnap of snap.docs) {
    const data = docSnap.data();
    await deleteReservationStorage(data.companyId, docSnap.id);

    const schedule = resolvePurgeSchedule(data);
    const extendedPurgeAt = schedule
      ? freshDataPurgeAt(schedule.completedOutAt)
      : null;
    // 사진은 만료됐지만 예약 문서는 현재 정책상 아직 보관이면 파일만 지움
    if (extendedPurgeAt && extendedPurgeAt > nowIso) {
      await docSnap.ref.update({
        images: [],
        storagePurgedAt: nowIso,
        storagePurgeAt: admin.firestore.FieldValue.delete(),
        dataPurgeAt: extendedPurgeAt,
      });
      count += 1;
      continue;
    }

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
      await docSnap.ref.delete();
      count += 1;
      continue;
    }

    const extendedPurgeAt = freshDataPurgeAt(schedule.completedOutAt);
    if (extendedPurgeAt > nowIso) {
      await docSnap.ref.update({ dataPurgeAt: extendedPurgeAt });
      continue;
    }

    if (schedule.storagePurgeAt <= nowIso) {
      await deleteReservationStorage(data.companyId, docSnap.id);
      await docSnap.ref.delete();
      count += 1;
      continue;
    }

    await db()
      .collection('storage_retention')
      .doc(docSnap.id)
      .set({
        companyId: data.companyId || 'unknown',
        storagePurgeAt: schedule.storagePurgeAt,
        completedOutAt: schedule.completedOutAt,
      });
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

    if (schedule.storagePurgeAt <= nowIso) {
      await deleteReservationStorage(data.companyId, docSnap.id);
      await docSnap.ref.delete();
      count += 1;
      continue;
    }

    await db()
      .collection('storage_retention')
      .doc(docSnap.id)
      .set({
        companyId: data.companyId || 'unknown',
        storagePurgeAt: schedule.storagePurgeAt,
        completedOutAt: schedule.completedOutAt,
      });
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

  const storageQueue = await purgeStorageRetentionQueue(nowIso);
  const storageDue = await purgeReservationsPastStorage(nowIso);
  const dataDue = await purgeReservationsPastData(nowIso);
  const legacy = await purgeLegacyCompletedOut(nowIso);

  return { storageQueue, storageDue, dataDue, legacy };
}
