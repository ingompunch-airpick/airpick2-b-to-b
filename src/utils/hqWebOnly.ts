import { Capacitor } from '@capacitor/core';
import type { AppView } from '../types';

/** 본사(HQ) 콘솔 — Hosting 웹. 네이티브 파트너 앱에서는 열지 않는다. */
export const HQ_WEB_ORIGIN = 'https://airpick-reservation.web.app';

export const HQ_WEB_ONLY_MESSAGE =
  `본사 화면은 웹에서만 이용할 수 있습니다.\n브라우저에서 열어 주세요.\n${HQ_WEB_ORIGIN}`;

/**
 * Capacitor 파트너 앱(Android/iOS).
 * 회원 탭 등 HQ 전용 UI도 `isNativePartnerApp()` 으로 동일하게 가드한다.
 */
export function isNativePartnerApp(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

/** 네이티브에서 본사 세션·본사 전용 화면을 쓰면 안 되는지 */
export function shouldBlockHqOnThisPlatform(): boolean {
  return isNativePartnerApp();
}

export function alertHqWebOnly(): void {
  if (typeof window !== 'undefined') {
    window.alert(HQ_WEB_ONLY_MESSAGE);
  }
}

/**
 * 본사 전용 AppView (파트너 statistics/master_settings 와 겹치지 않는 것만).
 * HQ 홈의 statistics·master_settings 는 isSuperAdmin+HQ 컨텍스트로 따로 막는다.
 * 회원 탭 추가 시 이 목록에 view 를 넣으면 됨.
 */
export const HQ_EXCLUSIVE_VIEWS: readonly AppView[] = [
  'hq_reviews',
  'hq_customers',
  'acquisition_funnel',
  'affiliate_admin',
  'hq_partner_applications',
  'hq_partner_board',
] as const;

export function isHqExclusiveView(view: AppView | string): boolean {
  return (HQ_EXCLUSIVE_VIEWS as readonly string[]).includes(view);
}
