import type { AlimtalkEventType } from './constants';
import type { AlimtalkTemplateParams } from './types';

/**
 * NCP 콘솔에 등록·검수된 템플릿 본문과 동일해야 함.
 * 변수는 #{이름} 형식 — 발송 전 치환.
 *
 * reserve = 에어픽_예약완료 (코드: reservation, 기본형)
 * 본문·버튼명·버튼 URL은 콘솔 등록값과 일치시킬 것.
 */
const NCP_TEMPLATE_BODIES: Record<
  AlimtalkEventType,
  { title?: string; body: string }
> = {
  reserve: {
    // 기본형 — title 없음
    body: `[에어픽] #{고객명}님 #{차량번호} 예약 접수가 완료되었습니다. 아래 버튼에서 접수증을 확인하세요.`,
  },
  checkin: {
    title: '[에어픽] 입차 완료',
    body: `[에어픽] #{고객명}님 #{차량번호} 차량이 입차되었습니다.

아래 링크를 클릭하시면 차량보관증을 확인하실 수 있습니다.
#{접수증링크}`,
  },
  checkout: {
    title: '[에어픽] 출차 완료',
    body: `[에어픽] #{고객명}님 #{차량번호} 출고가 완료되었습니다.

결제금액: #{결제금액}원
후기 남기기 → #{접수증링크}

문의: #{업체연락처}`,
  },
};

export function renderNcpTemplateContent(
  eventType: AlimtalkEventType,
  params: AlimtalkTemplateParams
): { title?: string; content: string } {
  const template = NCP_TEMPLATE_BODIES[eventType];
  let content = template.body;
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;
    content = content.split(`#{${key}}`).join(String(value));
  }
  return {
    ...(template.title ? { title: template.title } : {}),
    content,
  };
}
