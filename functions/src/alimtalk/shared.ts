import type { AlimtalkTemplateParams } from './types';

export interface AlimtalkButton {
  ordering?: number;
  type: 'WL' | 'AC' | 'AL' | 'DS' | 'BK' | 'MD' | 'BC' | 'BT';
  name: string;
  linkMo?: string;
  linkPc?: string;
}

/**
 * 업체 전용 템플릿처럼 본문이 코드 밖에 있을 때, 치환까지 끝낸 결과를
 * 그대로 넘기기 위한 형태. 없으면 공용 템플릿에서 렌더한다.
 */
export interface RenderedAlimtalkContent {
  title?: string;
  content: string;
}

export interface AlimtalkSendResult {
  ok: boolean;
  requestId?: string;
  resultCode?: number | string;
  resultMessage?: string;
  recipientSeq?: number;
}

export type AlimtalkProvider = 'nhn' | 'ncp';

export interface NhnAlimtalkConfig {
  provider: 'nhn';
  appKey: string;
  secretKey: string;
  senderKey: string;
}

export interface NcpAlimtalkConfig {
  provider: 'ncp';
  accessKey: string;
  secretKey: string;
  serviceId: string;
  plusFriendId: string;
  templateCodes: {
    reserve: string;
    checkin: string;
    checkout: string;
  };
}

export type AlimtalkConfig = NhnAlimtalkConfig | NcpAlimtalkConfig;

export type SendAlimtalkMessage = (
  config: AlimtalkConfig,
  templateCode: string,
  recipientNo: string,
  templateParameter: AlimtalkTemplateParams,
  buttons?: AlimtalkButton[]
) => Promise<AlimtalkSendResult>;
