/**
 * 공항 플러그인 설정.
 * 1차: ICN만 enabled. GMP는 자리만 두고 OFF.
 */

export type AirportId = 'ICN' | 'GMP';

export interface AirportTerminalDef {
  code: string;
  /** 짧은 표기 — T1, 국내선 */
  shortLabel: string;
  /** 버튼/설정용 — 제1여객터미널(T1) */
  label: string;
  /** 접수증·뱃지 — T1 / 국내선 */
  badgeLabel: string;
}

export interface AirportConfig {
  id: AirportId;
  name: string;
  shortName: string;
  regionLabel: string;
  terminals: AirportTerminalDef[];
  defaultTerminal: string;
  /** 기존 t2Surcharge 적용 대상 (비메인 터미널) */
  surchargeTerminalCodes: string[];
  coords: Record<string, { lat: number; lng: number }>;
  /** false면 HQ 선택·운영 UI에서 숨김 */
  enabled: boolean;
}

export const DEFAULT_AIRPORT_ID: AirportId = 'ICN';

export const AIRPORTS: Record<AirportId, AirportConfig> = {
  ICN: {
    id: 'ICN',
    name: '인천국제공항',
    shortName: '인천공항',
    regionLabel: '인천공항 전역',
    defaultTerminal: 'T1',
    surchargeTerminalCodes: ['T2'],
    enabled: true,
    terminals: [
      {
        code: 'T1',
        shortLabel: 'T1',
        label: '제1여객터미널 (T1)',
        badgeLabel: 'T1',
      },
      {
        code: 'T2',
        shortLabel: 'T2',
        label: '제2여객터미널 (T2)',
        badgeLabel: 'T2',
      },
    ],
    coords: {
      T1: { lat: 37.44749, lng: 126.4524 },
      T2: { lat: 37.46874, lng: 126.4334 },
    },
  },
  /** 김포 — 구조만 준비, enabled: false */
  GMP: {
    id: 'GMP',
    name: '김포국제공항',
    shortName: '김포공항',
    regionLabel: '김포공항 전역',
    defaultTerminal: 'DOM',
    surchargeTerminalCodes: ['INT'],
    enabled: false,
    terminals: [
      {
        code: 'DOM',
        shortLabel: '국내선',
        label: '국내선 청사',
        badgeLabel: '국내선',
      },
      {
        code: 'INT',
        shortLabel: '국제선',
        label: '국제선 청사',
        badgeLabel: '국제선',
      },
    ],
    coords: {
      DOM: { lat: 37.5583, lng: 126.7906 },
      INT: { lat: 37.5615, lng: 126.8014 },
    },
  },
};

export const ENABLED_AIRPORTS: AirportConfig[] = Object.values(AIRPORTS).filter(
  (a) => a.enabled
);
