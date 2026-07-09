import * as admin from 'firebase-admin';
import { resolvePurgeSchedule, safeStorageCompanyId } from './retention';

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
    await docSnap.ref.delete();
    count += 1;
  }
  return count;
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
