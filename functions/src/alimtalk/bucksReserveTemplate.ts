/**
 * 주차벅스(주차나라 채널) 홈페이지·현장 예약완료 알림톡.
 * NCP 콘솔(@주차나라-주차대행-인천공항로 / bucksreserve) 본문과 글자 하나까지 같아야 한다.
 */
export const BUCKS_RESERVE_TEMPLATE_CODE = 'bucksreserve';
export const BUCKS_RESERVE_BUTTON_NAME = '접수증 보기';
export const BUCKS_CHANNEL_PLUS_FRIEND_ID = '@주차나라-주차대행-인천공항로';

export const BUCKS_RESERVE_TEMPLATE_TITLE = '[주차벅스] 예약완료';

export const BUCKS_RESERVE_TEMPLATE_BODY = `안녕하세요. 벅스입니다.

■ 실내/실외: #{주차유형}
■ 예약자: #{고객명}
■ 차량모델: #{차종}
■ 차량번호: #{차량번호}
■ 출국터미널: #{출발터미널}
■ 입국터미널: #{도착터미널}
■ 차량접수일: #{인도일시}
■ 금액: #{금액}

아래 계좌로 입금해 주시고 연락 주시면 감사하겠습니다.

■ 은행: 카카오뱅크
■ 계좌: 3333-0126-78329
■ 예금주: 유병훈

※ 도착 30분 전에 미리 연락 주세요.
※ 접수증은 아래 버튼에서 확인하세요.

고객센터
010-4956-8567
010-7202-7758`;
