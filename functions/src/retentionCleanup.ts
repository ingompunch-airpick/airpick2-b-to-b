import * as admin from 'firebase-admin';
import {
  RESERVATION_DATA_RETENTION_DAYS,
  addDaysToIso,
  resolvePurgeSchedule,
} from './retention';
import { deleteReservationSecrets } from './reservations/reservationSecrets';

const BATCH_LIMIT = 200;

/** 예약 문서 + 하위 secrets. Storage 사진은 건드리지 않음. */
async function deleteReservationDocument(reservationId: string): Promise<void> {
  await deleteReservationSecrets(reservationId);
  await admin.firestore().collection('reservations').doc(reservationId).delete();
}

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
 * 정책 변경(예: 90일→40일) 후에도 출차 기준 새 보관 기간 안이면
 * 문서에 박혀 있던 옛 dataPurgeAt을 맞추고 삭제하지 않는다.
 */
function freshDataPurgeAt(scheduleCompletedOutAt: string): string {
  return addDaysToIso(scheduleCompletedOutAt, RESERVATION_DATA_RETENTION_DAYS);
}

function kstTodayMonth(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
  }).format(new Date());
}

function ymd(value: unknown): string {
  const match = String(value ?? '').trim().match(/(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : '';
}

/** 입고월·출차월 합계 문서가 있을 때만 그 예약을 지울 수 있다. */
async function checkoutMonthsSnapshotted(
  data: FirebaseFirestore.DocumentData,
  ready: Map<string, boolean>
): Promise<boolean> {
  const current = kstTodayMonth();
  const months = new Set<string>();
  const intake = ymd(data.departureDate || data.entryDate).slice(0, 7);
  const exit = (ymd(data.actualExitTime) || ymd(data.arrivalDate) || ymd(data.exitDate)).slice(0, 7);
  if (intake) months.add(intake);
  if (exit) months.add(exit);
  if (months.size === 0) return false;

  for (const month of months) {
    if (!/^\d{4}-\d{2}$/.test(month) || month >= current) return false;
    if (ready.has(month)) {
      if (!ready.get(month)) return false;
      continue;
    }
    const snap = await db().collection('hqMonthSnapshots').doc(month).get();
    const frozen = snap.exists;
    ready.set(month, frozen);
    if (!frozen) return false;
  }
  return true;
}

async function purgeReservationsPastData(
  nowIso: string,
  ready: Map<string, boolean>
): Promise<number> {
  const horizon = addDaysToIso(nowIso, 90 - RESERVATION_DATA_RETENTION_DAYS);
  let count = 0;
  let cursor: FirebaseFirestore.QueryDocumentSnapshot | undefined;

  for (let page = 0; page < 8; page += 1) {
    let query = db()
      .collection('reservations')
      .where('dataPurgeAt', '<=', horizon)
      .orderBy('dataPurgeAt')
      .limit(BATCH_LIMIT);
    if (cursor) query = query.startAfter(cursor);
    const snap = await query.get();
    if (snap.empty) break;

    for (const docSnap of snap.docs) {
      const data = docSnap.data();
      if (String(data.status || '') !== 'completed_out') continue;

      const schedule = resolvePurgeSchedule(data);
      if (!schedule) continue;

      const dueAt = freshDataPurgeAt(schedule.completedOutAt);
      if (dueAt > nowIso) {
        if (data.dataPurgeAt !== dueAt) {
          await docSnap.ref.update({ dataPurgeAt: dueAt });
        }
        continue;
      }

      if (!(await checkoutMonthsSnapshotted(data, ready))) continue;

      await deleteReservationDocument(docSnap.id);
      count += 1;
    }

    cursor = snap.docs[snap.docs.length - 1];
    if (snap.size < BATCH_LIMIT) break;
  }
  return count;
}

/** purge 필드 없는 레거시 completed_out — actualExitTime 기준 */
async function purgeLegacyCompletedOut(
  nowIso: string,
  ready: Map<string, boolean>
): Promise<number> {
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
    if (!(await checkoutMonthsSnapshotted(data, ready))) continue;

    // Storage 삭제 금지. 예약 문서만 제거.
    await deleteReservationDocument(docSnap.id);
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
  const ready = new Map<string, boolean>();
  const dataDue = await purgeReservationsPastData(nowIso, ready);
  const legacy = await purgeLegacyCompletedOut(nowIso, ready);

  return { storageQueue, storageDue, dataDue, legacy };
}
