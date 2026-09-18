import {
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { auth, db } from '../firebase';
import { ensureFirestoreAuth } from './firebaseAuth';
import {
  AFFILIATE_COLLECTION,
  AFFILIATE_SECRETS_COLLECTION,
  DEFAULT_AFFILIATE_MARKETING_BUDGET_WON,
  assertAffiliateBudgetAllocation,
  generateAffiliatePortalPassword,
  normalizeAffiliateCode,
  normalizeAffiliateName,
  normalizeAffiliateRewardWon,
  type AffiliateDoc,
  type AffiliateStatus,
} from '../utils/affiliate';
import type { Reservation } from '../types';

export type AffiliateRow = AffiliateDoc & { id: string };

export type CreateAffiliateResult = AffiliateRow & {
  /** 등록 직후 한 번만 표시용 */
  initialPassword: string;
};


function coerceAffiliateDoc(id: string, raw: Record<string, unknown>): AffiliateRow {
  const customerDiscountWon = normalizeAffiliateRewardWon(raw.customerDiscountWon);
  const referrerCreditWon = normalizeAffiliateRewardWon(raw.referrerCreditWon);
  const hasBudget = raw.marketingBudgetWon !== undefined && raw.marketingBudgetWon !== null;
  const marketingBudgetWon = hasBudget
    ? normalizeAffiliateRewardWon(raw.marketingBudgetWon)
    : Math.max(
        customerDiscountWon + referrerCreditWon,
        DEFAULT_AFFILIATE_MARKETING_BUDGET_WON
      );

  return {
    id,
    code: String(raw.code || id),
    name: String(raw.name || ''),
    status: raw.status === 'suspended' ? 'suspended' : 'active',
    marketingBudgetWon,
    customerDiscountWon,
    referrerCreditWon,
    createdAt: String(raw.createdAt || ''),
    updatedAt: String(raw.updatedAt || ''),
    ...(typeof raw.phone === 'string' && raw.phone.trim()
      ? { phone: raw.phone.trim() }
      : {}),
    ...(typeof raw.memo === 'string' && raw.memo.trim()
      ? { memo: raw.memo.trim() }
      : {}),
    ...(typeof raw.createdByEmail === 'string'
      ? { createdByEmail: raw.createdByEmail }
      : {}),
  };
}

export async function listAffiliates(): Promise<AffiliateRow[]> {
  await ensureFirestoreAuth();
  const snap = await getDocs(
    query(collection(db, AFFILIATE_COLLECTION), orderBy('createdAt', 'desc'))
  );
  return snap.docs.map((d) => coerceAffiliateDoc(d.id, d.data() as Record<string, unknown>));
}

export async function getAffiliate(code: string): Promise<AffiliateRow | null> {
  const id = normalizeAffiliateCode(code);
  if (!id) return null;
  await ensureFirestoreAuth();
  const snap = await getDoc(doc(db, AFFILIATE_COLLECTION, id));
  if (!snap.exists()) return null;
  return coerceAffiliateDoc(snap.id, snap.data() as Record<string, unknown>);
}

export async function createAffiliate(input: {
  code: string;
  name: string;
  phone?: string;
  memo?: string;
  marketingBudgetWon?: number;
  customerDiscountWon?: number;
  referrerCreditWon?: number;
}): Promise<CreateAffiliateResult> {
  const code = normalizeAffiliateCode(input.code);
  if (!code) {
    throw new Error('코드는 영문 소문자·숫자·밑줄 3~16자여야 합니다.');
  }
  const name = normalizeAffiliateName(input.name);
  if (!name) throw new Error('이름을 입력해 주세요.');

  const marketingBudgetWon = normalizeAffiliateRewardWon(
    input.marketingBudgetWon ?? DEFAULT_AFFILIATE_MARKETING_BUDGET_WON
  );
  const customerDiscountWon = normalizeAffiliateRewardWon(input.customerDiscountWon);
  const referrerCreditWon = normalizeAffiliateRewardWon(input.referrerCreditWon);
  assertAffiliateBudgetAllocation({
    marketingBudgetWon,
    customerDiscountWon,
    referrerCreditWon,
  });

  await ensureFirestoreAuth();
  const ref = doc(db, AFFILIATE_COLLECTION, code);
  const existing = await getDoc(ref);
  if (existing.exists()) {
    throw new Error(`이미 있는 코드입니다: ${code}`);
  }

  const now = new Date().toISOString();
  const payload: AffiliateDoc = {
    code,
    name,
    status: 'active',
    marketingBudgetWon,
    customerDiscountWon,
    referrerCreditWon,
    createdAt: now,
    updatedAt: now,
    ...(input.phone?.trim() ? { phone: input.phone.trim().slice(0, 20) } : {}),
    ...(input.memo?.trim() ? { memo: input.memo.trim().slice(0, 200) } : {}),
    ...(auth.currentUser?.email
      ? { createdByEmail: auth.currentUser.email }
      : {}),
  };
  const initialPassword = generateAffiliatePortalPassword();
  await setDoc(ref, payload);
  // 제휴사는 affiliates(+secrets)만 생성 — companies / 업체 Gate 계정은 절대 만들지 않음
  await setDoc(doc(db, AFFILIATE_SECRETS_COLLECTION, code), {
    password: initialPassword,
    updatedAt: now,
  });
  return { id: code, ...payload, initialPassword };
}

/** 제휴 실적 포털 비밀번호 설정·재발급 */
export async function setAffiliatePortalPassword(
  code: string,
  password: string
): Promise<void> {
  const id = normalizeAffiliateCode(code);
  const pw = String(password || '').trim();
  if (!id) throw new Error('잘못된 코드입니다.');
  if (pw.length < 4 || pw.length > 64) {
    throw new Error('비밀번호는 4~64자로 입력해 주세요.');
  }
  await ensureFirestoreAuth();
  const aff = await getDoc(doc(db, AFFILIATE_COLLECTION, id));
  if (!aff.exists()) throw new Error('제휴를 찾을 수 없습니다.');
  await setDoc(
    doc(db, AFFILIATE_SECRETS_COLLECTION, id),
    { password: pw, updatedAt: new Date().toISOString() },
    { merge: true }
  );
}

/** 비밀번호가 설정돼 있는지 (값은 반환하지 않음) */
export async function affiliatePortalPasswordSet(code: string): Promise<boolean> {
  const id = normalizeAffiliateCode(code);
  if (!id) return false;
  await ensureFirestoreAuth();
  const snap = await getDoc(doc(db, AFFILIATE_SECRETS_COLLECTION, id));
  if (!snap.exists()) return false;
  const pw = String((snap.data() as { password?: string }).password || '').trim();
  return pw.length >= 4;
}

export async function updateAffiliate(
  code: string,
  patch: {
    name?: string;
    phone?: string | null;
    memo?: string | null;
    status?: AffiliateStatus;
    marketingBudgetWon?: number;
    customerDiscountWon?: number;
    referrerCreditWon?: number;
  }
): Promise<void> {
  const id = normalizeAffiliateCode(code);
  if (!id) throw new Error('잘못된 코드입니다.');
  await ensureFirestoreAuth();

  const ref = doc(db, AFFILIATE_COLLECTION, id);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error('제휴를 찾을 수 없습니다.');
  const current = coerceAffiliateDoc(snap.id, snap.data() as Record<string, unknown>);

  const marketingBudgetWon =
    patch.marketingBudgetWon !== undefined
      ? normalizeAffiliateRewardWon(patch.marketingBudgetWon)
      : current.marketingBudgetWon;
  const customerDiscountWon =
    patch.customerDiscountWon !== undefined
      ? normalizeAffiliateRewardWon(patch.customerDiscountWon)
      : current.customerDiscountWon;
  const referrerCreditWon =
    patch.referrerCreditWon !== undefined
      ? normalizeAffiliateRewardWon(patch.referrerCreditWon)
      : current.referrerCreditWon;

  assertAffiliateBudgetAllocation({
    marketingBudgetWon,
    customerDiscountWon,
    referrerCreditWon,
  });

  const next: Record<string, unknown> = {
    updatedAt: new Date().toISOString(),
    marketingBudgetWon,
    customerDiscountWon,
    referrerCreditWon,
  };
  if (patch.name !== undefined) {
    const name = normalizeAffiliateName(patch.name);
    if (!name) throw new Error('이름을 입력해 주세요.');
    next.name = name;
  }
  if (patch.status !== undefined) next.status = patch.status;
  if (patch.phone !== undefined) {
    next.phone = patch.phone?.trim()
      ? patch.phone.trim().slice(0, 20)
      : deleteField();
  }
  if (patch.memo !== undefined) {
    next.memo = patch.memo?.trim()
      ? patch.memo.trim().slice(0, 200)
      : deleteField();
  }

  await updateDoc(ref, next);
}

export async function deleteAffiliate(code: string): Promise<void> {
  const id = normalizeAffiliateCode(code);
  if (!id) throw new Error('잘못된 코드입니다.');
  await ensureFirestoreAuth();
  await deleteDoc(doc(db, AFFILIATE_COLLECTION, id));
  try {
    await deleteDoc(doc(db, AFFILIATE_SECRETS_COLLECTION, id));
  } catch {
    // secrets 없으면 무시
  }
}

export type AffiliateStats = {
  bookings: number;
  completedOut: number;
  cancelled: number;
  revenue: number;
};

/** B2C가 affiliateCode 를 남긴 예약을 집계 */
export function computeAffiliateStats(
  reservations: Reservation[],
  code: string,
  opts?: { sinceIso?: string }
): AffiliateStats {
  const id = normalizeAffiliateCode(code);
  const since = opts?.sinceIso ? Date.parse(opts.sinceIso) : 0;
  let bookings = 0;
  let completedOut = 0;
  let cancelled = 0;
  let revenue = 0;

  if (!id) {
    return { bookings, completedOut, cancelled, revenue };
  }

  for (const r of reservations) {
    const codeOnRes = String(r.affiliateCode || '')
      .trim()
      .toLowerCase();
    if (codeOnRes !== id) continue;
    const t = Date.parse(r.createdAt || '');
    if (since && (!Number.isFinite(t) || t < since)) continue;

    bookings += 1;
    if (r.status === 'completed_out') {
      completedOut += 1;
      const price = Number(r.totalPrice);
      if (Number.isFinite(price) && price > 0) revenue += price;
    }
    if (r.status === 'cancelled') cancelled += 1;
  }

  return { bookings, completedOut, cancelled, revenue };
}
