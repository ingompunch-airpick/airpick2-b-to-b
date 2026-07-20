import type { AlimtalkTemplateParams } from './types';

export interface AlimtalkButton {
  ordering?: number;
  type: 'WL' | 'AC' | 'AL' | 'DS' | 'BK' | 'MD' | 'BC' | 'BT';
  name: string;
  linkMo?: string;
  linkPc?: string;
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
