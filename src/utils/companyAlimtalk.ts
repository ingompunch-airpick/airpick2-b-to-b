/** companies/{id}.alimtalk — 홈페이지·현장 예약 알림톡 (NCP 콘솔 템플릿과 코드 일치) */

export type CompanyAlimtalkSource = 'homepage' | 'b2b' | 'airpick-b2c';
export type CompanyAlimtalkEvent = 'reserve' | 'checkin' | 'checkout';

export type CompanyAlimtalkSettings = {
  enabled: boolean;
  channel?: { plusFriendId?: string; senderKey?: string };
  sources: CompanyAlimtalkSource[];
  events: CompanyAlimtalkEvent[];
  templates?: {
    reserve?: { code: string; body?: string; buttonName?: string; title?: string };
    checkin?: { code: string; body?: string; buttonName?: string; title?: string };
    checkout?: { code: string; body?: string; buttonName?: string; title?: string };
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

/** Firestore patch 용 — 코드·채널이 비면 enabled false 로 저장 */
export function buildAlimtalkSettingsPatch(
  form: CompanyAlimtalkEditForm
): CompanyAlimtalkSettings {
  const code = form.reserveCode.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  const plusFriendId = form.plusFriendId.trim();
  const buttonName = form.reserveButtonName.trim() || '접수증보기';
  const sources: CompanyAlimtalkSource[] = [];
  if (form.sourceHomepage) sources.push('homepage');
  if (form.sourceB2b) sources.push('b2b');
  if (sources.length === 0) sources.push('homepage');

  const enabled = form.enabled && Boolean(code && plusFriendId);

  return {
    enabled,
    channel: plusFriendId ? { plusFriendId } : {},
    sources,
    events: ['reserve', 'checkout'],
    templates: code
      ? {
          reserve: {
            code,
            buttonName,
          },
        }
      : {},
  };
}
