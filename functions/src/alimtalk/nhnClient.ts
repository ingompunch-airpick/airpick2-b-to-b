import { NHN_ALIMTALK_API_BASE } from './constants';
import type { AlimtalkButton, AlimtalkSendResult, NhnAlimtalkConfig } from './shared';
import type { AlimtalkTemplateParams } from './types';

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

export async function sendNhnAlimtalkMessage(
  config: NhnAlimtalkConfig,
  templateCode: string,
  recipientNo: string,
  templateParameter: AlimtalkTemplateParams,
  buttons?: AlimtalkButton[]
): Promise<AlimtalkSendResult> {
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

// 하위 호환 re-export
export type { AlimtalkButton as NhnAlimtalkButton, NhnAlimtalkConfig };
export type { AlimtalkSendResult as NhnSendResult };
