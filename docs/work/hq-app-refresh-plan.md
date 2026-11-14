# Plan: 업체 앱(본사) 화면 정리 + 입점 신청함 + 수수료 자동 기준

> 2026-11-14 · 대표 승인(시안 5장 → 「응」). ④ 금액 확인 화면은 만들지 않고 수수료 자동 계산으로 대체.

## 바꾼 것
1. **주차 업체 · 상태** (`HqPartnerBoardView`)
   - 영업·손님앱 노출 → 스위치. 누르면 확인 창 먼저 (숨기기·휴업은 빨간 버튼).
   - PC(md+) 표 한 장, 폰은 업체 카드. 필터: 전체·영업중·휴업·프로필 미완.
   - 데모(`demo`)는 맨 아래·흐리게·「심사용」. `parentCompanyId` → 「○○이 운영」.
   - 본사 주차 업체·입점 신청 화면은 PC에서 `max-w-6xl`.
2. **입점 신청함** (`HqPartnerApplicationsView`, view `hq_partner_applications`)
   - `partnerApplications` 실시간(최근 200). 상태: 새 신청 → 연락함 → 입점 완료 / 보류. 전화 버튼.
   - rules: 본사만 읽기, 상태·메모(`status`,`hqNote`,`updatedAt`,`updatedBy`)만 수정. 생성·삭제는 서버만.
3. **수수료 자동 기준** (`utils/b2cCommission.ts`, `functions/.../priceCheck.ts`)
   - 서버 검사에서 문제(`priceCheck.ok === false`)면 정가 = max(받은 정가, 서버 기본 요금).
   - 가입 쿠폰은 규칙 안 금액만 차감(최대 5,000원 · 카카오 첫 예약). 서버가 `couponAllowedWon` 기록.
   - 본사 오류 보고(errorReports) 기록은 중단 — 직접 확인하지 않음. 정산표에 「기본 요금 기준」 꼬리표만.
   - 예약 카드 빨간 「금액 확인 필요」 → 회색 「정산 기준 N원」.
4. **사이드 메뉴** (`Sidebar`): 번호 없이 묶음(운영·고객 / 관리 / 업무) + 한 줄 목록, 입점 신청 새 건수 배지.
   단말기 ID는 작은 한 줄. 본사·관리자는 「메인화면 이동」 제거(대시보드와 중복), 기사는 「타임라인으로」.
5. 안내문 속 ①·⑤ 번호 → 메뉴 이름(주차 업체 안내문은 누르면 이동).

## 배포 순서 (대표가 Cursor로)
1. `firebase deploy --only firestore:rules` — 입점 신청함 읽기 권한
2. `firebase deploy --only functions:onReservationSync,functions:submitPartnerApplication` — 쿠폰 인정액 기록·오류 보고 중단
3. 앱: main 푸시 → GitHub Actions 자동 배포

## 검증
- [x] `npx tsc --noEmit` (앱·functions)
- [x] 실제 컴포넌트를 가짜 데이터로 렌더해 PC·폰·사이드 메뉴 스크린샷 확인
- [ ] 배포 후 본사 계정으로 입점 신청함 열기 (권한 오류 없는지)
