import * as admin from 'firebase-admin';
import { checkoutPhotosDue } from './retention';

const MEDIA_FOLDERS = new Set(['images', 'scratch']);

/**
 * reservations/{업체}/{예약}/images|scratch 만 지운다.
 * 주차 중이거나 출차 후 30일이 안 된 예약은 남긴다.
 * 예약 문서가 이미 없으면(출차 40일 삭제) 그 폴더의 사진만 고아로 지운다.
 */
export async function purgeCheckoutPhotos(
  nowMs = Date.now()
): Promise<{ files: number; docs: number; orphans: number }> {
  const bucket = admin.storage().bucket('airpick-reservation.firebasestorage.app');
  const [files] = await bucket.getFiles({ prefix: 'reservations/' });
  const groups = new Map<string, typeof files>();

  for (const file of files) {
    const parts = file.name.split('/');
    if (parts.length < 5 || parts[0] !== 'reservations') continue;
    if (!MEDIA_FOLDERS.has(parts[3])) continue;
    const reservationId = parts[2];
    if (!reservationId || reservationId.includes('..')) continue;
    const group = groups.get(reservationId);
    if (group) group.push(file);
    else groups.set(reservationId, [file]);
  }

  const db = admin.firestore();
  const ids = Array.from(groups.keys());
  let filesDeleted = 0;
  let docsCleared = 0;
  let orphans = 0;

  for (let offset = 0; offset < ids.length; offset += 100) {
    const slice = ids.slice(offset, offset + 100);
    const refs = slice.map((id) => db.collection('reservations').doc(id));
    const snaps = refs.length ? await db.getAll(...refs) : [];

    for (const snap of snaps) {
      const group = groups.get(snap.id) || [];
      const exists = snap.exists;
      const due = !exists || checkoutPhotosDue(snap.data(), nowMs);
      if (!due) continue;

      await Promise.all(group.map((file) => file.delete({ ignoreNotFound: true })));
      filesDeleted += group.length;
      if (!exists) {
        orphans += 1;
        continue;
      }
      await snap.ref.update({
        images: admin.firestore.FieldValue.delete(),
        scratchPhotos: admin.firestore.FieldValue.delete(),
        photosPurgedAt: new Date(nowMs).toISOString(),
      });
      docsCleared += 1;
    }
  }

  return { files: filesDeleted, docs: docsCleared, orphans };
}
