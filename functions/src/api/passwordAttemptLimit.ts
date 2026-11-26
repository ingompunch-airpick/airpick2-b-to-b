import * as admin from 'firebase-admin';
import { createHash } from 'crypto';

export const RATE_LIMITED = 'rate_limited' as const;

const COLLECTION = 'passwordAttemptLimits';
const MAX_FAILS = 10;
const BLOCK_MS = 5 * 60 * 1000;

/** lookup·cancel: 손님 / partner_login: 업체 앱 로그인 */
export type PasswordAttemptAction = 'lookup' | 'cancel' | 'partner_login';

export class RateLimitedError extends Error {
  readonly code = RATE_LIMITED;
  readonly retryAfterSec: number;
  constructor(retryAfterSec: number) {
    super(RATE_LIMITED);
    this.name = 'RateLimitedError';
    this.retryAfterSec = Math.max(1, retryAfterSec);
  }
}

function docId(scope: string, key: string): string {
  const digest = createHash('sha256')
    .update(`${scope}|${key}`)
    .digest('hex')
    .slice(0, 40);
  return `${scope}_${digest}`;
}

function normalizeKey(raw: string): string {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
    .slice(0, 80);
}

/** X-Forwarded-For 첫 주소 · 없으면 unknown */
export function clientIpFromRequest(req: {
  headers?: Record<string, string | string[] | undefined>;
  ip?: string;
}): string {
  const raw = req.headers?.['x-forwarded-for'] ?? req.headers?.['X-Forwarded-For'];
  const ff = Array.isArray(raw) ? raw[0] : raw;
  if (typeof ff === 'string' && ff.trim()) {
    return ff.split(',')[0].trim().slice(0, 64);
  }
  if (typeof req.ip === 'string' && req.ip.trim()) return req.ip.trim().slice(0, 64);
  return 'unknown';
}

type LimitDoc = {
  fails?: number;
  blockedUntilMs?: number;
  updatedAt?: string;
};

function remainingBlockSec(blockedUntilMs: number, now: number): number {
  return Math.ceil((blockedUntilMs - now) / 1000);
}

/**
 * IP·조회값(또는 예약 id) 버킷이 이미 차단이면 RateLimitedError.
 * 차단이 아니면 통과 (실패 기록은 recordPasswordFailure 에서).
 */
export async function assertPasswordAttemptAllowed(args: {
  action: PasswordAttemptAction;
  ip: string;
  valueKey: string;
}): Promise<void> {
  const db = admin.firestore();
  const now = Date.now();
  const keys = [
    { scope: `${args.action}_ip`, key: normalizeKey(args.ip) || 'unknown' },
    { scope: `${args.action}_val`, key: normalizeKey(args.valueKey) || 'empty' },
  ];

  await db.runTransaction(async (tx) => {
    const snaps = await Promise.all(
      keys.map(({ scope, key }) =>
        tx.get(db.collection(COLLECTION).doc(docId(scope, key)))
      )
    );
    for (const snap of snaps) {
      const data = snap.exists ? ((snap.data() || {}) as LimitDoc) : {};
      const until = Number(data.blockedUntilMs) || 0;
      if (until > now) {
        throw new RateLimitedError(remainingBlockSec(until, now));
      }
    }
  });
}

/** 비밀번호 실패 1회 기록. 10회 도달 시 5분 차단. */
export async function recordPasswordFailure(args: {
  action: PasswordAttemptAction;
  ip: string;
  valueKey: string;
}): Promise<void> {
  const db = admin.firestore();
  const now = Date.now();
  const keys = [
    { scope: `${args.action}_ip`, key: normalizeKey(args.ip) || 'unknown' },
    { scope: `${args.action}_val`, key: normalizeKey(args.valueKey) || 'empty' },
  ];

  await db.runTransaction(async (tx) => {
    const refs = keys.map(({ scope, key }) =>
      db.collection(COLLECTION).doc(docId(scope, key))
    );
    const snaps = await Promise.all(refs.map((ref) => tx.get(ref)));
    for (let i = 0; i < refs.length; i++) {
      const data = snaps[i].exists ? ((snaps[i].data() || {}) as LimitDoc) : {};
      const until = Number(data.blockedUntilMs) || 0;
      let fails = Math.max(0, Math.floor(Number(data.fails) || 0));
      if (until > now) continue;
      if (until > 0 && until <= now) fails = 0;
      fails += 1;
      const next: LimitDoc = {
        fails,
        updatedAt: new Date().toISOString(),
      };
      if (fails >= MAX_FAILS) {
        next.blockedUntilMs = now + BLOCK_MS;
        next.fails = 0;
      }
      tx.set(refs[i], next, { merge: true });
    }
  });
}

export function sendRateLimited(
  res: {
    set: (k: string, v: string) => unknown;
    status: (n: number) => { json: (b: unknown) => unknown };
  },
  err: RateLimitedError
): void {
  res.set('Retry-After', String(err.retryAfterSec));
  res.set('Cache-Control', 'private, no-store');
  res.status(429).json({
    error: RATE_LIMITED,
    retryAfterSec: err.retryAfterSec,
  });
}
