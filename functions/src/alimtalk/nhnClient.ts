import { NHN_ALIMTALK_API_BASE } from './constants';
import type { AlimtalkTemplateParams } from './types';

export interface NhnAlimtalkConfig {
  appKey: string;
  secretKey: string;
  senderKey: string;
}

export interface NhnAlimtalkButton {
  ordering: number;
  type: 'WL' | 'AC' | 'AL' | 'DS' | 'BK' | 'MD' | 'BC' | 'BT';
  name: string;
  linkMo?: string;
  linkPc?: string;
}

export interface NhnSendResult {
  ok: boolean;
  requestId?: string;
  resultCode?: number;
  resultMessage?: string;
  recipientSeq?: number;
}

interface NhnResponseBody {
  header?: {
    isSuccessful?: boolean;
    resultCode?: number;
    resultMessage?: string;
  };
  message?: {
    requestId?: string;
    sendResults?: Array<{
      recipientSeq?: number;
      resultCode?: number;
      resultMessage?: string;
    }>;
  };
}

export async function sendAlimtalkMessage(
  config: NhnAlimtalkConfig,
  templateCode: string,
  recipientNo: string,
  templateParameter: AlimtalkTemplateParams,
  buttons?: NhnAlimtalkButton[]
): Promise<NhnSendResult> {
  const url = `${NHN_ALIMTALK_API_BASE}/appkeys/${config.appKey}/messages`;

  const recipient: Record<string, unknown> = {
    recipientNo,
    templateParameter,
  };
  if (buttons && buttons.length > 0) {
    recipient.buttons = buttons;
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json;charset=UTF-8',
      'X-Secret-Key': config.secretKey,
    },
    body: JSON.stringify({
      senderKey: config.senderKey,
      templateCode,
      recipientList: [recipient],
    }),
  });

  const body = (await response.json()) as NhnResponseBody;
  const header = body.header;
  const sendResult = body.message?.sendResults?.[0];

  // header 성공이어도 recipient 단위 실패 가능
  const recipientFailed =
    typeof sendResult?.resultCode === 'number' && sendResult.resultCode !== 0;

  if (!response.ok || !header?.isSuccessful || recipientFailed) {
    return {
      ok: false,
      requestId: body.message?.requestId,
      resultCode: sendResult?.resultCode ?? header?.resultCode,
      resultMessage: sendResult?.resultMessage ?? header?.resultMessage ?? `HTTP ${response.status}`,
    };
  }

  return {
    ok: true,
    requestId: body.message?.requestId,
    resultCode: sendResult?.resultCode ?? header?.resultCode,
    resultMessage: sendResult?.resultMessage ?? header?.resultMessage,
    recipientSeq: sendResult?.recipientSeq,
  };
}
