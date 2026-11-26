import { createHmac, timingSafeEqual } from 'crypto';

/**
 * 포트원 V2 웹훅 서명 확인 (Standard Webhooks 규격).
 * 서명 대상 = `${webhook-id}.${webhook-timestamp}.${원문 body}`, HMAC-SHA256, base64.
 * 헤더 webhook-signature = "v1,<base64> v1,<base64> ..." (키 교체 기간엔 여러 개)
 */
const TOLERANCE_SEC = 5 * 60;

function secretKey(secret: string): Buffer {
  const raw = secret.trim().startsWith('whsec_') ? secret.trim().slice(6) : secret.trim();
  return Buffer.from(raw, 'base64');
}

function header(headers: Record<string, unknown>, name: string): string {
  const v = headers[name] ?? headers[name.toLowerCase()];
  if (Array.isArray(v)) return String(v[0] ?? '');
  return typeof v === 'string' ? v : '';
}

export function verifyPortoneWebhook(
  secret: string,
  rawBody: string,
  headers: Record<string, unknown>,
  nowSec = Math.floor(Date.now() / 1000)
): boolean {
  const id = header(headers, 'webhook-id');
  const ts = header(headers, 'webhook-timestamp');
  const sigHeader = header(headers, 'webhook-signature');
  if (!id || !ts || !sigHeader || !secret) return false;
  const tsNum = Number(ts);
  if (!Number.isFinite(tsNum) || Math.abs(nowSec - tsNum) > TOLERANCE_SEC) return false;

  const expected = createHmac('sha256', secretKey(secret))
    .update(`${id}.${ts}.${rawBody}`)
    .digest();
  for (const part of sigHeader.split(' ')) {
    const [version, sig] = part.split(',');
    if (version !== 'v1' || !sig) continue;
    const given = Buffer.from(sig, 'base64');
    if (given.length === expected.length && timingSafeEqual(given, expected)) return true;
  }
  return false;
}
