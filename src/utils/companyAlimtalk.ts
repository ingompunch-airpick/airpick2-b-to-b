/** companies/{id}.alimtalk — 홈페이지·현장 예약 알림톡 (NCP 콘솔 템플릿과 코드 일치) */

export type CompanyAlimtalkSource = 'homepage' | 'b2b' | 'airpick-b2c';
export type CompanyAlimtalkEvent = 'reserve' | 'checkin' | 'checkout';

export type CompanyAlimtalkTemplatePatch = {
  code: string;
  body?: string;
  buttonName?: string;
  title?: string;
};

export type CompanyAlimtalkSettings = {
  enabled: boolean;
  channel?: { plusFriendId?: string; senderKey?: string };
  sources: CompanyAlimtalkSource[];
  events: CompanyAlimtalkEvent[];
  templates?: {
    reserve?: CompanyAlimtalkTemplatePatch;
    checkin?: CompanyAlimtalkTemplatePatch;
    checkout?: CompanyAlimtalkTemplatePatch;
  };
};

export type CompanyAlimtalkEditForm = {
  enabled: boolean;
  plusFriendId: string;
  reserveCode: string;
  reserveButtonName: string;
  sourceHomepage: boolean;
  sourceB2b: boolean;
};

export const EMPTY_ALIMTALK_EDIT_FORM: CompanyAlimtalkEditForm = {
  enabled: false,
  plusFriendId: '',
  reserveCode: '',
  reserveButtonName: '접수증보기',
  sourceHomepage: true,
  sourceB2b: true,
};

const ALL_EVENTS: CompanyAlimtalkEvent[] = ['reserve', 'checkin', 'checkout'];

function normalizeTemplateCode(raw: string): string {
  return raw.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

function readTemplateEntry(raw: unknown): CompanyAlimtalkTemplatePatch | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const e = raw as Record<string, unknown>;
  const code = String(e.code || '').trim();
  if (!code) return undefined;
  const body = String(e.body || '').trim();
  const buttonName = String(e.buttonName || '').trim();
  const title = String(e.title || '').trim();
  return {
    code,
    ...(body ? { body } : {}),
    ...(buttonName ? { buttonName } : {}),
    ...(title ? { title } : {}),
  };
}

export function readAlimtalkEditForm(raw: unknown): CompanyAlimtalkEditForm {
  if (!raw || typeof raw !== 'object') return { ...EMPTY_ALIMTALK_EDIT_FORM };
  const o = raw as Record<string, unknown>;
  const channel =
    o.channel && typeof o.channel === 'object'
      ? (o.channel as Record<string, unknown>)
      : {};
  const templates =
    o.templates && typeof o.templates === 'object'
      ? (o.templates as Record<string, unknown>)
      : {};
  const reserve =
    templates.reserve && typeof templates.reserve === 'object'
      ? (templates.reserve as Record<string, unknown>)
      : {};
  const sources = Array.isArray(o.sources)
    ? o.sources.map((s) => String(s || '').trim().toLowerCase())
    : [];

  return {
    enabled: o.enabled !== false && Boolean(reserve.code || channel.plusFriendId),
    plusFriendId: String(channel.plusFriendId || '').trim(),
    reserveCode: String(reserve.code || '').trim(),
    reserveButtonName: String(reserve.buttonName || '접수증보기').trim() || '접수증보기',
    sourceHomepage: sources.length === 0 ? true : sources.includes('homepage'),
    sourceB2b: sources.length === 0 ? true : sources.includes('b2b'),
  };
}

/**
 * Firestore patch 용.
 * HQ UI는 예약완료(채널·코드·버튼)만 편집하므로, 기존 checkin/checkout·body·events는 유지한다.
 */
export function buildAlimtalkSettingsPatch(
  form: CompanyAlimtalkEditForm,
  existingRaw?: unknown
): CompanyAlimtalkSettings {
  const existing =
    existingRaw && typeof existingRaw === 'object'
      ? (existingRaw as Record<string, unknown>)
      : {};
  const existingChannel =
    existing.channel && typeof existing.channel === 'object'
      ? (existing.channel as Record<string, unknown>)
      : {};
  const existingTemplates =
    existing.templates && typeof existing.templates === 'object'
      ? (existing.templates as Record<string, unknown>)
      : {};

  const prevReserve = readTemplateEntry(existingTemplates.reserve);
  const prevCheckin = readTemplateEntry(existingTemplates.checkin);
  const prevCheckout = readTemplateEntry(existingTemplates.checkout);

  const code = normalizeTemplateCode(form.reserveCode);
  const plusFriendId = form.plusFriendId.trim();
  const buttonName = form.reserveButtonName.trim() || '접수증보기';
  const senderKey = String(existingChannel.senderKey || '').trim();

  const sources: CompanyAlimtalkSource[] = ['airpick-b2c'];
  if (form.sourceHomepage) sources.push('homepage');
  if (form.sourceB2b) sources.push('b2b');

  const enabled = form.enabled && Boolean(code && plusFriendId);

  const existingEvents = Array.isArray(existing.events)
    ? (existing.events
        .map((v) => String(v || '').trim().toLowerCase())
        .filter((v): v is CompanyAlimtalkEvent =>
          (ALL_EVENTS as string[]).includes(v)
        ) as CompanyAlimtalkEvent[])
    : [];
  let events: CompanyAlimtalkEvent[] =
    existingEvents.length > 0 ? existingEvents : [...ALL_EVENTS];
  if (enabled && !events.includes('reserve')) {
    events = ['reserve', ...events];
  }

  const templates: NonNullable<CompanyAlimtalkSettings['templates']> = {};
  if (code) {
    const sameCode =
      prevReserve && normalizeTemplateCode(prevReserve.code) === code;
    templates.reserve = {
      code,
      buttonName,
      ...(sameCode && prevReserve?.body ? { body: prevReserve.body } : {}),
      ...(sameCode && prevReserve?.title ? { title: prevReserve.title } : {}),
    };
  }
  if (prevCheckin) templates.checkin = prevCheckin;
  if (prevCheckout) templates.checkout = prevCheckout;

  return {
    enabled,
    channel: {
      ...(plusFriendId ? { plusFriendId } : {}),
      ...(senderKey ? { senderKey } : {}),
    },
    sources,
    events,
    templates,
  };
}

/** 본사 상태판용 — 업체 한 줄 요약 */
export type CompanyAlimtalkBoardKind = 'partner' | 'airpick' | 'incomplete' | 'off';

export type CompanyAlimtalkBoardSummary = {
  kind: CompanyAlimtalkBoardKind;
  /** 짧은 배지 문구 */
  label: string;
  /** title / 보조 설명 */
  detail: string;
};

export function summarizeCompanyAlimtalkForBoard(
  raw: unknown
): CompanyAlimtalkBoardSummary {
  if (!raw || typeof raw !== 'object') {
    return {
      kind: 'airpick',
      label: '에어픽 공용',
      detail: 'B2C 예약만 @airpickup',
    };
  }

  const o = raw as Record<string, unknown>;
  if (o.enabled === false) {
    return {
      kind: 'off',
      label: '알림톡 OFF',
      detail: '발송 안 함',
    };
  }

  const channel =
    o.channel && typeof o.channel === 'object'
      ? (o.channel as Record<string, unknown>)
      : {};
  const plusFriendId = String(channel.plusFriendId || '').trim();
  const templates =
    o.templates && typeof o.templates === 'object'
      ? (o.templates as Record<string, unknown>)
      : {};
  const reserve =
    templates.reserve && typeof templates.reserve === 'object'
      ? (templates.reserve as Record<string, unknown>)
      : {};
  const code = String(reserve.code || '').trim();

  if (plusFriendId && code) {
    return {
      kind: 'partner',
      label: `ON · ${plusFriendId} · ${code}`,
      detail: '홈/현장은 업체 채널 · B2C는 에어픽 공용',
    };
  }

  if (plusFriendId || code) {
    return {
      kind: 'incomplete',
      label: '알림톡 미완',
      detail: '채널 ID와 예약완료 코드를 등록·편집에서 보완',
    };
  }

  return {
    kind: 'airpick',
    label: '에어픽 공용',
    detail: 'B2C 예약만 @airpickup',
  };
}
