import { ALIMTALK_TEMPLATE_CODES, type AlimtalkEventType } from './constants';
import { sendNcpAlimtalkMessage } from './ncpClient';
import { sendNhnAlimtalkMessage } from './nhnClient';
import type {
  AlimtalkButton,
  AlimtalkConfig,
  AlimtalkProvider,
  AlimtalkSendResult,
  NcpAlimtalkConfig,
  NhnAlimtalkConfig,
} from './shared';
import type { AlimtalkTemplateParams } from './types';

export function resolveAlimtalkProvider(): AlimtalkProvider {
  const raw = (process.env.ALIMTALK_PROVIDER || 'nhn').trim().toLowerCase();
  return raw === 'ncp' ? 'ncp' : 'nhn';
}

/**
 * NCP는 콘솔에 등록된 코드만 사용.
 * checkin/checkout 미설정 시 빈 문자열 → 발송 스킵 (reserve만 먼저 검증할 때).
 */
export function resolveTemplateCode(
  eventType: AlimtalkEventType,
  provider: AlimtalkProvider = resolveAlimtalkProvider()
): string {
  if (provider === 'ncp') {
    const envMap: Record<AlimtalkEventType, string | undefined> = {
      reserve: process.env.NCP_ALIMTALK_TEMPLATE_RESERVE?.trim(),
      checkin: process.env.NCP_ALIMTALK_TEMPLATE_CHECKIN?.trim(),
      checkout: process.env.NCP_ALIMTALK_TEMPLATE_CHECKOUT?.trim(),
    };
    const fromEnv = envMap[eventType];
    if (fromEnv) return fromEnv;
    // reserve만 기본값 reservation (콘솔에 등록한 코드)
    if (eventType === 'reserve') return 'reservation';
    return '';
  }
  return ALIMTALK_TEMPLATE_CODES[eventType];
}

/** NCP에서 해당 이벤트 템플릿이 준비됐는지 */
export function isNcpTemplateReady(
  eventType: AlimtalkEventType,
  config: { provider: string; templateCodes?: Partial<Record<AlimtalkEventType, string>> }
): boolean {
  if (config.provider !== 'ncp') return true;
  const code = config.templateCodes?.[eventType]?.trim();
  return Boolean(code);
}

export function buildAlimtalkConfigFromEnv(): AlimtalkConfig | null {
  if (process.env.ALIMTALK_ENABLED !== 'true') return null;

  const provider = resolveAlimtalkProvider();

  if (provider === 'ncp') {
    const accessKey = process.env.NCP_ALIMTALK_ACCESS_KEY?.trim();
    const secretKey = process.env.NCP_ALIMTALK_SECRET_KEY?.trim();
    const serviceId = process.env.NCP_ALIMTALK_SERVICE_ID?.trim();
    const plusFriendId = process.env.NCP_ALIMTALK_PLUS_FRIEND_ID?.trim();

    if (!accessKey || !secretKey || !serviceId || !plusFriendId) return null;

    const config: NcpAlimtalkConfig = {
      provider: 'ncp',
      accessKey,
      secretKey,
      serviceId,
      plusFriendId,
      templateCodes: {
        reserve: resolveTemplateCode('reserve', 'ncp'),
        checkin: resolveTemplateCode('checkin', 'ncp'),
        checkout: resolveTemplateCode('checkout', 'ncp'),
      },
    };
    return config;
  }

  const appKey = process.env.NHN_ALIMTALK_APP_KEY?.trim();
  const secretKey = process.env.NHN_ALIMTALK_SECRET_KEY?.trim();
  const senderKey = process.env.NHN_ALIMTALK_SENDER_KEY?.trim();

  if (!appKey || !secretKey || !senderKey) return null;

  const config: NhnAlimtalkConfig = {
    provider: 'nhn',
    appKey,
    secretKey,
    senderKey,
  };
  return config;
}

export async function sendAlimtalkMessage(
  config: AlimtalkConfig,
  templateCode: string,
  recipientNo: string,
  templateParameter: AlimtalkTemplateParams,
  buttons?: AlimtalkButton[]
): Promise<AlimtalkSendResult> {
  if (config.provider === 'ncp') {
    return sendNcpAlimtalkMessage(
      config,
      templateCode,
      recipientNo,
      templateParameter,
      buttons
    );
  }
  return sendNhnAlimtalkMessage(
    config,
    templateCode,
    recipientNo,
    templateParameter,
    buttons
  );
}
