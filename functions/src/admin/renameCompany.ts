import * as admin from 'firebase-admin';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { assertPlatformAdmin } from './assertPlatformAdmin';
import { COMPANY_ID_RE, PROTECTED_COMPANY_IDS } from './constants';
import { rebuildCapacityForCompany } from '../capacityAggregate';
import { recomputeParkingOccupancy } from '../parkingOccupancy';
import { recomputeCompanyRating } from '../reviews/aggregate';

const BATCH = 200;

function db() {
  return admin.firestore();
}

async function rewriteField(collectionName: string, fromId: string, toId: string): Promise<number> {
  let moved = 0;
  while (true) {
    const snap = await db().collection(collectionName).where('companyId', '==', fromId).limit(BATCH).get();
    if (snap.empty) break;
    const batch = db().batch();
    for (const doc of snap.docs) batch.update(doc.ref, { companyId: toId });
    await batch.commit();
    moved += snap.size;
    if (snap.size < BATCH) break;
  }
  return moved;
}

async function rewriteParentCompany(fromId: string, toId: string): Promise<number> {
  let moved = 0;
  while (true) {
    const snap = await db().collection('companies').where('parentCompanyId', '==', fromId).limit(BATCH).get();
    if (snap.empty) break;
    const batch = db().batch();
    for (const doc of snap.docs) batch.update(doc.ref, { parentCompanyId: toId });
    await batch.commit();
    moved += snap.size;
    if (snap.size < BATCH) break;
  }
  return moved;
}

async function deleteWhereCompany(collectionName: string, fromId: string): Promise<void> {
  while (true) {
    const snap = await db().collection(collectionName).where('companyId', '==', fromId).limit(BATCH).get();
    if (snap.empty) break;
    const batch = db().batch();
    for (const doc of snap.docs) batch.delete(doc.ref);
    await batch.commit();
    if (snap.size < BATCH) break;
  }
}

async function moveSubcollection(
  collectionName: string,
  subName: string,
  fromId: string,
  toId: string
): Promise<number> {
  const snap = await db().collection(collectionName).doc(fromId).collection(subName).get();
  if (snap.empty) return 0;
  let pending = db().batch();
  let count = 0;
  let inBatch = 0;
  for (const doc of snap.docs) {
    pending.set(db().collection(collectionName).doc(toId).collection(subName).doc(doc.id), doc.data());
    pending.delete(doc.ref);
    count += 1;
    inBatch += 1;
    if (inBatch >= BATCH) {
      await pending.commit();
      pending = db().batch();
      inBatch = 0;
    }
  }
  if (inBatch > 0) await pending.commit();
  return count;
}

async function rewritePushTokens(fromId: string, toId: string): Promise<void> {
  const byCompany = await db().collection('fcmTokens').where('companyId', '==', fromId).get();
  const byScope = await db().collection('fcmTokens').where('scopeCompanyIds', 'array-contains', fromId).get();
  const seen = new Set<string>();
  const docs = [...byCompany.docs, ...byScope.docs].filter((doc) => {
    if (seen.has(doc.id)) return false;
    seen.add(doc.id);
    return true;
  });
  if (!docs.length) return;
  let pending = db().batch();
  let inBatch = 0;
  for (const doc of docs) {
    const data = doc.data();
    const scope = Array.isArray(data.scopeCompanyIds)
      ? data.scopeCompanyIds.map((id: unknown) => (String(id) === fromId ? toId : id))
      : data.scopeCompanyIds;
    pending.update(doc.ref, {
      ...(String(data.companyId || '') === fromId ? { companyId: toId } : {}),
      ...(Array.isArray(scope) ? { scopeCompanyIds: scope } : {}),
    });
    inBatch += 1;
    if (inBatch >= BATCH) {
      await pending.commit();
      pending = db().batch();
      inBatch = 0;
    }
  }
  if (inBatch > 0) await pending.commit();
}

/**
 * 업체 로그인 아이디를 바꾼다.
 * 예약·하위 업체·후기·장부 파일 연결이 새 아이디를 따른다.
 */
export const adminRenameCompany = onCall(
  {
    region: 'us-central1',
    memory: '512MiB',
    timeoutSeconds: 300,
  },
  async (request) => {
    assertPlatformAdmin(request);
    const data = (request.data ?? {}) as { fromId?: unknown; toId?: unknown };
    const fromId = typeof data.fromId === 'string' ? data.fromId.trim().toLowerCase() : '';
    const toId = typeof data.toId === 'string' ? data.toId.trim().toLowerCase() : '';
    if (!COMPANY_ID_RE.test(fromId) || !COMPANY_ID_RE.test(toId)) {
      throw new HttpsError('invalid-argument', '아이디는 영문 소문자, 숫자, 밑줄만 쓸 수 있습니다.');
    }
    if (fromId === toId) return { ok: true as const, companyId: toId };
    if ((PROTECTED_COMPANY_IDS as readonly string[]).includes(fromId)) {
      throw new HttpsError('permission-denied', '본사 아이디는 바꿀 수 없습니다.');
    }
    if ((PROTECTED_COMPANY_IDS as readonly string[]).includes(toId)) {
      throw new HttpsError('invalid-argument', '그 아이디는 쓸 수 없습니다.');
    }

    const fromRef = db().collection('companies').doc(fromId);
    const toRef = db().collection('companies').doc(toId);
    const [fromSnap, toSnap] = await Promise.all([fromRef.get(), toRef.get()]);
    const continuing = toSnap.exists && toSnap.data()?.renameFrom === fromId;
    if (!fromSnap.exists) {
      if (continuing) {
        await toRef.update({ renameFrom: admin.firestore.FieldValue.delete() });
        return { ok: true as const, companyId: toId };
      }
      throw new HttpsError('not-found', '업체를 찾을 수 없습니다.');
    }
    if (toSnap.exists && !continuing) {
      throw new HttpsError('already-exists', '이미 있는 아이디입니다.');
    }

    const now = new Date().toISOString();
    if (!continuing) {
      await toRef.set({
        ...(fromSnap.data() || {}),
        id: toId,
        renameFrom: fromId,
        updatedAt: now,
      });
    }

    const secrets = await fromRef.collection('secrets').get();
    for (const secret of secrets.docs) {
      await toRef.collection('secrets').doc(secret.id).set(secret.data());
    }

    const reservations = await rewriteField('reservations', fromId, toId);
    const reviews = await rewriteField('reviews', fromId, toId);
    await rewriteField('acquisitionClicks', fromId, toId);
    const children = await rewriteParentCompany(fromId, toId);
    await moveSubcollection('companyMonthSnapshots', 'months', fromId, toId);
    await moveSubcollection('partnerHomepageStats', 'days', fromId, toId);
    await rewritePushTokens(fromId, toId);
    await rebuildCapacityForCompany(toId);
    await deleteWhereCompany('capacity', fromId);
    await recomputeParkingOccupancy(toId);
    await db().collection('parkingOccupancy').doc(fromId).delete();
    await recomputeCompanyRating(db(), toId);
    await db().collection('reviewSummaries').doc(fromId).delete();

    for (const secret of secrets.docs) {
      await secret.ref.delete();
    }
    await fromRef.delete();
    await toRef.update({ renameFrom: admin.firestore.FieldValue.delete() });

    return { ok: true as const, companyId: toId, reservations, reviews, children };
  }
);
