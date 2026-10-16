import * as admin from 'firebase-admin';
import { onCall, HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import { isMobilePhoneKey, normalizePhoneDigits, phoneQueryVariants } from '../utils/phone';
import { isUnownedUserId, newestReservationIds } from './reservationIds';

type ClaimResult = {
  alreadyClaimed: boolean;
  claimedReservationIds: string[];
  reservationIds: string[];
};

function tokenPhone(token: admin.auth.DecodedIdToken): string {
  const bag = token as admin.auth.DecodedIdToken & {
    phone_number?: unknown;
    phone?: unknown;
    firebase?: {
      identities?: { phone?: unknown };
      sign_in_attributes?: Record<string, unknown>;
    };
  };
  const candidates: unknown[] = [bag.phone_number, bag.phone];
  const identities = bag.firebase?.identities?.phone;
  if (Array.isArray(identities)) candidates.push(...identities);
  const attrs = bag.firebase?.sign_in_attributes;
  if (attrs) {
    candidates.push(attrs.phone_number, attrs.phoneNumber, attrs.phone);
  }
  for (const value of candidates) {
    const digits = normalizePhoneDigits(value);
    if (isMobilePhoneKey(digits)) return digits;
  }
  return '';
}

async function verifiedKakaoPhone(request: CallableRequest): Promise<{ uid: string; phoneKey: string }> {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', '로그인이 필요합니다.');
  }
  if (request.auth.token.firebase?.sign_in_provider !== 'oidc.kakao') {
    throw new HttpsError('permission-denied', '카카오 계정으로만 예약을 붙일 수 있습니다.');
  }
  const uid = request.auth.uid;
  let phoneKey = tokenPhone(request.auth.token);
  if (!phoneKey) {
    const user = await admin.auth().getUser(uid);
    phoneKey = normalizePhoneDigits(user.phoneNumber || '');
  }
  if (!isMobilePhoneKey(phoneKey)) {
    throw new HttpsError(
      'failed-precondition',
      '카카오에서 인증된 전화번호가 없어 예약을 붙일 수 없습니다.'
    );
  }
  return { uid, phoneKey };
}

async function linkReservation(
  reservationId: string,
  uid: string,
  phoneKey: string
): Promise<boolean> {
  const db = admin.firestore();
  const ref = db.doc(`reservations/${reservationId}`);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return false;
    const data = snap.data() || {};
    if (normalizePhoneDigits(data.phone) !== phoneKey) return false;
    if (data.userIdLocked === true) return false;
    if (!isUnownedUserId(data.userId)) return false;
    tx.update(ref, {
      userId: uid,
      memberProvider: 'kakao',
      userIdLocked: true,
    });
    return true;
  });
}

/**
 * 비회원 예약을 같은 번호의 카카오 계정에 한 번만 붙인다.
 * 요청 본문의 전화번호는 쓰지 않는다. 상태는 바꾸지 않는다.
 */
export const claimGuestReservations = onCall(
  { region: 'asia-northeast3', timeoutSeconds: 120, memory: '512MiB' },
  async (request): Promise<ClaimResult> => {
    const { uid, phoneKey } = await verifiedKakaoPhone(request);
    const db = admin.firestore();
    const memberRef = db.doc(`members/${uid}`);
    const memberSnap = await memberRef.get();
    if (!memberSnap.exists) {
      throw new HttpsError('failed-precondition', '회원 정보가 없습니다.');
    }
    const member = memberSnap.data() || {};
    if (String(member.provider || '') !== 'kakao') {
      throw new HttpsError('permission-denied', '카카오 회원만 예약을 붙일 수 있습니다.');
    }

    const existingIds = Array.isArray(member.reservationIds)
      ? member.reservationIds.filter((id): id is string => typeof id === 'string')
      : [];
    const claimedPhone = normalizePhoneDigits(member.guestPhoneClaimed);
    if (claimedPhone) {
      return {
        alreadyClaimed: true,
        claimedReservationIds: [],
        reservationIds: existingIds,
      };
    }

    const memberPhone = normalizePhoneDigits(member.phone);
    if (!isMobilePhoneKey(memberPhone) || memberPhone !== phoneKey) {
      throw new HttpsError(
        'failed-precondition',
        '회원 전화번호가 카카오 인증 번호와 다릅니다.'
      );
    }

    const snap = await db
      .collection('reservations')
      .where('phone', 'in', phoneQueryVariants(phoneKey))
      .get();

    const claimedReservationIds: string[] = [];
    const createdAt = new Map<string, string>();
    for (const doc of snap.docs) {
      createdAt.set(doc.id, String(doc.data().createdAt || ''));
      const linked = await linkReservation(doc.id, uid, phoneKey);
      if (linked) claimedReservationIds.push(doc.id);
    }

    const reservationIds = await db.runTransaction(async (tx) => {
      const fresh = await tx.get(memberRef);
      const data = fresh.data() || {};
      const already = normalizePhoneDigits(data.guestPhoneClaimed);
      const prior = Array.isArray(data.reservationIds)
        ? data.reservationIds.filter((id): id is string => typeof id === 'string')
        : [];
      if (already) return prior;

      if (already && already !== phoneKey) return prior;

      const dates = new Map<string, string>();
      for (const id of prior) {
        if (!createdAt.has(id)) {
          const row = await tx.get(db.doc(`reservations/${id}`));
          dates.set(id, row.exists ? String(row.data()?.createdAt || '') : '');
        }
      }
      const entries = [
        ...prior.map((id) => ({ id, createdAt: createdAt.get(id) || dates.get(id) || '' })),
        ...claimedReservationIds.map((id) => ({ id, createdAt: createdAt.get(id) || '' })),
      ];
      const nextIds = newestReservationIds(entries);
      const patch: FirebaseFirestore.UpdateData<FirebaseFirestore.DocumentData> = {
        reservationIds: nextIds,
      };
      if (!already) {
        patch.guestPhoneClaimed = phoneKey;
        patch.guestPhoneClaimedAt = new Date().toISOString();
      }
      tx.update(memberRef, patch);
      return nextIds;
    });

    console.log('[claimGuestReservations]', {
      uid,
      linked: claimedReservationIds.length,
      kept: reservationIds.length,
    });

    return {
      alreadyClaimed: false,
      claimedReservationIds: claimedReservationIds.filter((id) => reservationIds.includes(id)),
      reservationIds,
    };
  }
);
