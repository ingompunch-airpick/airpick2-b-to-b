import type { AlimtalkEventType } from './constants';
import type { AlimtalkTemplateParams } from './types';

/**
 * NCP 콘솔에 등록·검수된 템플릿 본문과 동일해야 함.
 * 변수는 #{이름} 형식 — 발송 전 치환.
 *
 * reserve = 에어픽_예약완료_강조2 (코드: reservation3)
 * remind  = 에어픽_리마인드 (코드: remind)
 * checkout = 에어픽_출고완료 (코드: checkout1)
 */
const NCP_TEMPLATE_BODIES: Record<
  AlimtalkEventType,
  { title?: string; body: string }
> = {
  reserve: {
    title: '[에어픽] 예약 완료',
    body: `#{고객명}님, #{차량번호} 예약이 접수되었습니다.

■ 업체: #{업체명}
■ 입고: #{인도일시}
■ 터미널: #{출발터미널}
■ 입고 방식: #{입고방식}
■ 만남 장소: #{픽업안내}
■ 연락처: #{업체연락처}

※ 공항 도착 30분 전 업체로 꼭 전화 주세요.
※ 결제·취소는 접수증, 지도 길찾기는 「가는 길 보기」에서 확인하세요.`,
  },
  remind: {
    title: '[에어픽] 내일 입고 안내',
    body: `#{고객명}님, #{차량번호} 예약을 확인해 주세요.

■ 업체: #{업체명}
■ 입고: #{인도일시}
■ 터미널: #{출발터미널}
■ 이용 방법: #{입고방식}
■ 만남 장소: #{픽업안내}
■ 연락처: #{업체연락처}

※ 탑승 터미널을 한 번 더 확인해 주세요.
※ 공항 도착 30분 전 업체로 꼭 전화 주세요.
※ 귀중품은 미리 챙겨 주세요.
※ 길은 「가는 길 보기」에서 지도로 확인하세요.`,
  },
  checkin: {
    title: '[에어픽] 입차 완료',
    body: `[에어픽] #{고객명}님 #{차량번호} 차량이 입차되었습니다.

아래 링크를 클릭하시면 차량보관증을 확인하실 수 있습니다.
#{접수증링크}`,
  },
  checkout: {
    title: '[에어픽] 출고 완료',
    body: `[에어픽] #{고객명}님 #{차량번호} 출고가 완료되었습니다.

서비스는 어떠셨나요?
아래 버튼에서 후기를 남겨 주세요.`,
  },
};

/** `#{변수}` 치환 — 값이 없는 변수는 그대로 남겨 발송 시 불일치로 드러나게 둔다 */
export function renderTemplateBody(
  body: string,
  params: AlimtalkTemplateParams
): string {
  let content = body;
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;
    content = content.split(`#{${key}}`).join(String(value));
  }
  return content;
}

export function renderNcpTemplateContent(
  eventType: AlimtalkEventType,
  params: AlimtalkTemplateParams
): { title?: string; content: string } {
  const template = NCP_TEMPLATE_BODIES[eventType];
  return {
    ...(template.title ? { title: template.title } : {}),
    content: renderTemplateBody(template.body, params),
  };
}
