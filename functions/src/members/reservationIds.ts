import * as admin from 'firebase-admin';

/** members.reservationIds 규칙 한도. 넘치면 최근 접수만 남긴다. */
export const MEMBER_RESERVATION_CAP = 20;

const UNOWNED_USER_IDS = new Set(['guest', 'anonymous_guest']);

export function isUnownedUserId(userId: unknown): boolean {
  const id = String(userId || '').trim();
  return !id || UNOWNED_USER_IDS.has(id);
}

export function newestReservationIds(
  entries: { id: string; createdAt: string }[],
  cap = MEMBER_RESERVATION_CAP
): string[] {
  const byId = new Map<string, string>();
  for (const entry of entries) {
    const id = entry.id.trim();
    if (!id) continue;
    const prev = byId.get(id);
    if (prev == null || entry.createdAt > prev) byId.set(id, entry.createdAt);
  }
  return [...byId.entries()]
    .sort((a, b) => {
      if (a[1] !== b[1]) return a[1] < b[1] ? 1 : -1;
      return a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0;
    })
    .slice(0, cap)
    .map(([id]) => id);
}

/** 내 예약 목록에 넣는다. 손님 앱은 이 필드를 고치지 못한다. */
export async function mergeMemberReservationId(
  uid: string,
  reservationId: string,
  createdAt: string
): Promise<string[] | null> {
  const db = admin.firestore();
  const memberRef = db.doc(`members/${uid}`);

  return db.runTransaction(async (tx) => {
    const fresh = await tx.get(memberRef);
    if (!fresh.exists) return null;
    const member = fresh.data() || {};
    if (String(member.provider || '') !== 'kakao') return null;

    const existing = Array.isArray(member.reservationIds)
      ? member.reservationIds.filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
      : [];
    const ids = existing.includes(reservationId) ? existing : [...existing, reservationId];
    const entries: { id: string; createdAt: string }[] = [];
    for (const id of ids) {
      if (id === reservationId) {
        entries.push({ id, createdAt });
        continue;
      }
      const row = await tx.get(db.doc(`reservations/${id}`));
      entries.push({
        id,
        createdAt: row.exists ? String(row.data()?.createdAt || '') : '',
      });
    }
    const reservationIds = newestReservationIds(entries);
    tx.update(memberRef, { reservationIds });
    return reservationIds;
  });
}

/**
 * 카카오 회원으로 이미 접수된 예약에 제공자와 잠금을 남긴다.
 * 상태는 건드리지 않는다. 포인트는 출고로 바뀔 때만 쌓인다.
 */
export async function stampKakaoOwner(
  reservationId: string,
  data: FirebaseFirestore.DocumentData
): Promise<FirebaseFirestore.DocumentData | null> {
  const uid = String(data.userId || '').trim();
  if (isUnownedUserId(uid)) return null;
  if (data.memberProvider === 'kakao' && data.userIdLocked === true) return null;

  const db = admin.firestore();
  const memberSnap = await db.doc(`members/${uid}`).get();
  if (!memberSnap.exists || String(memberSnap.data()?.provider || '') !== 'kakao') return null;

  const ref = db.doc(`reservations/${reservationId}`);
  await ref.update({
    memberProvider: 'kakao',
    userIdLocked: true,
  });
  return { ...data, memberProvider: 'kakao', userIdLocked: true };
}
