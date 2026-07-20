import { NCP_ALIMTALK_API_BASE } from './constants';
import type { AlimtalkEventType } from './constants';
import { buildNcpApiSignature, buildNcpApiTimestamp } from './ncpSignature';
import { renderNcpTemplateContent } from './ncpTemplates';
import type { AlimtalkButton, AlimtalkSendResult, NcpAlimtalkConfig } from './shared';
import type { AlimtalkTemplateParams } from './types';

interface NcpSendResponse {
  requestId?: string;
  statusCode?: string;
  statusName?: string;
  messages?: Array<{
    messageId?: string;
    requestStatusCode?: string;
    requestStatusName?: string;
    requestStatusDesc?: string;
  }>;
}

function resolveEventTypeFromTemplateCode(
  config: NcpAlimtalkConfig,
  templateCode: string
): AlimtalkEventType | null {
  const entries = Object.entries(config.templateCodes) as [AlimtalkEventType, string][];
  const hit = entries.find(([, code]) => code === templateCode);
  return hit?.[0] ?? null;
}

function mapButtons(buttons?: AlimtalkButton[]) {
  if (!buttons?.length) return undefined;
  return buttons.map((btn) => ({
    type: btn.type,
    name: btn.name,
    ...(btn.linkMo ? { linkMobile: btn.linkMo } : {}),
    ...(btn.linkPc ? { linkPc: btn.linkPc } : {}),
  }));
}

export async function sendNcpAlimtalkMessage(
  config: NcpAlimtalkConfig,
  templateCode: string,
  recipientNo: string,
  templateParameter: AlimtalkTemplateParams,
  buttons?: AlimtalkButton[]
): Promise<AlimtalkSendResult> {
  const eventType = resolveEventTypeFromTemplateCode(config, templateCode);
  if (!eventType) {
    return {
      ok: false,
      resultMessage: `unknown NCP template code: ${templateCode}`,
    };
  }

  const rendered = renderNcpTemplateContent(eventType, templateParameter);
  const urlPath = `/alimtalk/v2/services/${config.serviceId}/messages`;
  const timestamp = buildNcpApiTimestamp();
  const signature = buildNcpApiSignature(
    'POST',
    urlPath,
    timestamp,
    config.accessKey,
    config.secretKey
  );

  const response = await fetch(`${NCP_ALIMTALK_API_BASE}${urlPath}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=UTF-8',
      'x-ncp-apigw-timestamp': timestamp,
      'x-ncp-iam-access-key': config.accessKey,
      'x-ncp-apigw-signature-v2': signature,
    },
    body: JSON.stringify({
      plusFriendId: config.plusFriendId,
      templateCode,
      messages: [
        {
          to: recipientNo,
          ...(rendered.title ? { title: rendered.title } : {}),
          content: rendered.content,
          ...(mapButtons(buttons) ? { buttons: mapButtons(buttons) } : {}),
        },
      ],
    }),
  });

  const body = (await response.json()) as NcpSendResponse;
  const msg = body.messages?.[0];
  const requestOk =
    response.status === 202 &&
    (body.statusCode === '202' || body.statusName === 'success' || body.statusName === 'processing');
  const recipientOk = !msg?.requestStatusCode || msg.requestStatusCode === 'A000';

  if (!requestOk || !recipientOk) {
    return {
      ok: false,
      requestId: body.requestId,
      resultCode: msg?.requestStatusCode ?? body.statusCode ?? response.status,
      resultMessage:
        msg?.requestStatusDesc ??
        msg?.requestStatusName ??
        body.statusName ??
        `HTTP ${response.status}`,
    };
  }

  return {
    ok: true,
    requestId: body.requestId,
    resultCode: msg?.requestStatusCode ?? body.statusCode,
    resultMessage: msg?.requestStatusDesc ?? body.statusName,
  };
}
