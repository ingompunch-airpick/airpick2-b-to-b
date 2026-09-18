import * as admin from 'firebase-admin';

import type { BookingSource } from '../sheets/bookingSource';
import { DEFAULT_COMPANY_PHONE, type AlimtalkEventType } from './constants';
import type { AlimtalkConfig } from './shared';
import {
  WAWA_RESERVE_TEMPLATE_BODY,
  WAWA_RESERVE_TEMPLATE_CODE,
} from './wawaReserveTemplate';

/** 콘솔 코드 → 리포에 고정한 본문. Firestore body 가 있으면 그쪽이 우선. */
const KNOWN_TEMPLATE_BODIES: Record<string, string> = {
  [WAWA_RESERVE_TEMPLATE_CODE]: WAWA_RESERVE_TEMPLATE_BODY,
};

const ALL_EVENTS: AlimtalkEventType[] = ['reserve', 'checkin', 'checkout'];
const ALL_SOURCES: BookingSource[] = ['airpick-b2c', 'homepage', 'b2b'];

/**
 * 업체 문서에 alimtalk 설정이 없을 때의 기본값 — 기존 동작(에어픽 B2C 예약만 발송)과 동일.
 * 홈페이지 업체를 추가할 때는 코드가 아니라 companies/{id}.alimtalk 만 켜면 된다.
 *
 * companies/{id}.alimtalk = {
 *   enabled: true,
 *   sources: ['airpick-b2c', 'homepage'],
 *   events: ['reserve', 'checkin', 'checkout'],
 *   channel: { plusFriendId: '@업체채널' },  // 없으면 에어픽 공용 채널
 *   templates: {                             // 홈페이지·현장만. B2C는 항상 공용
 *     reserve: { code: 'wawareserve', body: '...' }
 *   }
 * }
 */
const DEFAULT_SOURCES: BookingSource[] = ['airpick-b2c'];

export interface CompanyAlimtalkChannel {
  plusFriendId?: string;
  senderKey?: string;
}

/**
 * 업체 전용 템플릿. 업체마다 양식이 달라서 본문을 코드에 두지 않고
 * Firestore 에 둔다. body 는 NCP 콘솔에 검수 승인된 본문과 글자 하나까지
 * 같아야 한다(다르면 발송 시 3028).
 */
export interface CompanyAlimtalkTemplate {
  code: string;
  title?: string;
  body: string;
  /** 콘솔에 등록한 버튼명 — 다르면 발송 거부된다 */
  buttonName?: string;
}

export interface CompanyAlimtalkSettings {
  enabled: boolean;
  sources: BookingSource[];
  events: AlimtalkEventType[];
  phone: string;
  /** 업체 전용 카카오 채널 — 미설정이면 전역 발신프로필 사용 */
  channel?: CompanyAlimtalkChannel;
  /** 업체 전용 템플릿 — 미설정이면 에어픽 공용 템플릿 사용 */
  templates?: Partial<Record<AlimtalkEventType, CompanyAlimtalkTemplate>>;
}

function parseStringList<T extends string>(raw: unknown, allowed: T[], fallback: T[]): T[] {
  if (!Array.isArray(raw)) return fallback;
  const picked = raw
    .map((v) => String(v ?? '').trim().toLowerCase())
    .filter((v): v is T => (allowed as string[]).includes(v));
  return picked.length > 0 ? picked : fallback;
}

function parseChannel(raw: unknown): CompanyAlimtalkChannel | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const obj = raw as Record<string, unknown>;
  const plusFriendId = String(obj.plusFriendId ?? '').trim();
  const senderKey = String(obj.senderKey ?? '').trim();
  if (!plusFriendId && !senderKey) return undefined;
  return {
    ...(plusFriendId ? { plusFriendId } : {}),
    ...(senderKey ? { senderKey } : {}),
  };
}

function parseTemplates(
  raw: unknown
): Partial<Record<AlimtalkEventType, CompanyAlimtalkTemplate>> | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const obj = raw as Record<string, unknown>;
  const out: Partial<Record<AlimtalkEventType, CompanyAlimtalkTemplate>> = {};

  for (const event of ALL_EVENTS) {
    const entry = obj[event];
    if (!entry || typeof entry !== 'object') continue;
    const e = entry as Record<string, unknown>;
    const code = String(e.code ?? '').trim();
    const body = String(e.body ?? '').trim() || KNOWN_TEMPLATE_BODIES[code] || '';
    if (!code || !body) continue;
    const title = String(e.title ?? '').trim();
    const buttonName = String(e.buttonName ?? '').trim();
    out[event] = {
      code,
      body,
      ...(title ? { title } : {}),
      ...(buttonName ? { buttonName } : {}),
    };
  }

  return Object.keys(out).length > 0 ? out : undefined;
}

export function parseCompanyAlimtalkSettings(
  data: Record<string, unknown> | undefined
): CompanyAlimtalkSettings {
  const phoneRaw = data?.phone;
  const phone =
    typeof phoneRaw === 'string' && phoneRaw.trim() ? phoneRaw.trim() : DEFAULT_COMPANY_PHONE;

  const raw = data?.alimtalk;
  if (!raw || typeof raw !== 'object') {
    return { enabled: true, sources: DEFAULT_SOURCES, events: ALL_EVENTS, phone };
  }

  const obj = raw as Record<string, unknown>;
  return {
    enabled: obj.enabled !== false,
    sources: parseStringList(obj.sources, ALL_SOURCES, DEFAULT_SOURCES),
    events: parseStringList(obj.events, ALL_EVENTS, ALL_EVENTS),
    phone,
    channel: parseChannel(obj.channel),
    templates: parseTemplates(obj.templates),
  };
}

export async function fetchCompanyAlimtalkSettings(
  companyId: string | undefined
): Promise<CompanyAlimtalkSettings> {
  if (!companyId) return parseCompanyAlimtalkSettings(undefined);
  try {
    const snap = await admin.firestore().doc(`companies/${companyId}`).get();
    return parseCompanyAlimtalkSettings(snap.data());
  } catch (err) {
    console.warn('[alimtalk] company settings read failed — using defaults', {
      companyId,
      err: err instanceof Error ? err.message : String(err),
    });
    return parseCompanyAlimtalkSettings(undefined);
  }
}

/** 업체 전용 채널이 있으면 발신 프로필만 갈아끼운다 (없으면 전역 설정 그대로) */
export function applyCompanyChannel<T extends AlimtalkConfig>(
  config: T,
  channel?: CompanyAlimtalkChannel
): T {
  if (!channel) return config;
  if (config.provider === 'ncp' && channel.plusFriendId) {
    return { ...config, plusFriendId: channel.plusFriendId };
  }
  if (config.provider === 'nhn' && channel.senderKey) {
    return { ...config, senderKey: channel.senderKey };
  }
  return config;
}
