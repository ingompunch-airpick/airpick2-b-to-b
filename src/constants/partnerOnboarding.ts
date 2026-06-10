/** 제휴업체 온보딩 체크 항목 (B2B UI · docs 공통) */

export type PartnerChannel = 'b2c-only' | 'homepage+b2c';

export interface PartnerOnboardingStep {
  id: string;
  label: string;
  /** 자체 홈 유형일 때만 표시 */
  homepageOnly?: boolean;
}

export const PARTNER_ONBOARDING_STEPS: PartnerOnboardingStep[] = [
  {
    id: 'firestore',
    label: 'Firebase Console → companies/{id} 문서 저장 확인',
  },
  {
    id: 'login',
    label: 'B2B Gate 로그인 테스트 (업체 ID / 비밀번호)',
  },
  {
    id: 'test_booking',
    label: '테스트 예약 1건 → 해당 업체 입고예정 타임라인 확인',
  },
  {
    id: 'b2c',
    label: 'B2C(airpick-b2c) 업체 비교 목록 노출 확인',
  },
  {
    id: 'channel',
    label: '유입·수수료 구분 기록 (createdBy: homepage vs airpick-b2c)',
  },
  {
    id: 'homepage',
    label: '자체 홈 Firebase = airpick-reservation, companyId 일치, createdBy: homepage',
    homepageOnly: true,
  },
  {
    id: 'staff',
    label: '기사·부관리자 계정 등록 (필요 시)',
  },
  {
    id: 'rates',
    label: '요금·예약 마감(isOpen / blockedDates) 설정 확인',
  },
];

export function onboardingStorageKey(companyId: string): string {
  return `partner_onboarding_${companyId.trim().toLowerCase()}`;
}
