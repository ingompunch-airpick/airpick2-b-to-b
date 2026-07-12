# 에어픽 출시 전 체크리스트

프로젝트: `airpick-reservation`  
대상: B2B 운영앱 + B2C(에어픽.kr) + 홈페이지 예약(`/h/{업체ID}`)

사용법: 항목을 확인하면 `[ ]` → `[x]` 로 바꿔 주세요.

---

## A. 배포·소유권 (가장 중요)

- [ ] **Firestore 규칙 정본**을 하나로 정했다 (`docs/FIRESTORE_RULES_CANONICAL.md`)
- [ ] B2B · B2C `firestore.rules` 내용이 **동일**하다
- [ ] rules는 **한곳(권장: B2B)에서만** 배포한다  
  - 명령 예: `firebase deploy --only firestore:rules --project airpick-reservation`
- [ ] B2C에서 rules를 따로 배포하지 않기로 팀(본인)이 기억한다
- [ ] Cloud Functions 배포 전, **지금 프로젝트에 어떤 함수가 있는지** 목록을 확인했다  
  - 예: `firebase functions:list --project airpick-reservation`
- [ ] Functions 배포 시 **한쪽 저장소가 다른 쪽 함수를 지우지 않는** 방법을 정했다  
  - (임시) 배포 후 `functions:list`로 B2B+B2C 함수가 모두 남아 있는지 확인  
  - (권장 다음 단계) B2B/B2C functions codebase 분리 또는 단일 패키지로 통합
- [ ] Storage rules도 누가 배포하는지 정했다 (`firebase deploy --only storage`)

### Functions가 둘 다 살아 있어야 하는 목록

**B2B 쪽 (예약 동기화)**
- [ ] `onReservationSync` (또는 동일 역할 트리거) 존재
- [ ] 보관기간 정리 함수 존재 (`purgeExpiredReservationData` 등)

**B2C 쪽 (손님 MY)**
- [ ] `getReceipt` (접수증)
- [ ] `lookupReservation` / 예약 조회
- [ ] `cancelReservation` (취소)
- [ ] `submitReview` (후기)
- [ ] (있으면) 관리자 후기 목록/숨김 API

---

## B. 알림톡 · 시트 스위치

- [ ] Firebase Functions 파라미터에 `ALIMTALK_ENABLED=true` (또는 동일 설정)
- [ ] NHN 알림톡 `APP_KEY` / `SECRET_KEY` / `SENDER_KEY` 설정됨
- [ ] NHN 콘솔 템플릿이 코드와 맞다  
  - 예약 `airpick_reserve`  
  - 입차 `airpick_checkin`  
  - 출고 `airpick_checkout` → 버튼명 **후기 남기기**, 링크 `/my?review={예약ID}`
- [ ] 시트 연동이 필요하면 `SHEETS_ARCHIVE_ENABLED=true` + 스프레드시트/서비스계정 확인
- [ ] **홈페이지·현장 예약은 알림톡이 안 가는 것이 정상**임을 이해했다 (에어픽 B2C만 발송)

---

## C. 본사(최고관리자) · 가맹점 권한

### 본사에서만 설정
- [ ] 제휴 가맹점 수정에서 **보험 가입 여부** 저장됨
- [ ] **주차장 주소** 저장됨
- [ ] **지도 핀**(위도/경도) 저장됨
- [ ] **T1 / T2 거리** 저장됨
- [ ] **주차장 사진** 업로드·저장됨
- [ ] 저장 후 Firestore `companies/{업체ID}`에 값이 보임

### 가맹점(업체 마스터)에서
- [ ] 위 항목이 **확인 전용**으로만 보인다 (입력칸/수정 없음)
- [ ] 요금·대면 입고·직원은 저장 가능
- [ ] 저장해도 주소·핀·거리·사진·보험이 **바뀌지 않는다**

---

## D. 손님 동선 (에어픽.kr B2C)

### 예약 → MY
- [ ] 에어픽에서 예약 1건 생성 (`createdBy` = `airpick-b2c`)
- [ ] 예약 알림톡(또는 로그) 확인
- [ ] MY에서 차량번호+비밀번호로 조회됨
- [ ] MY에 **주차 위치·거리·사진**(본사가 넣은 값)이 보인다

### 입고 / 출고
- [ ] B2B에서 입고 완료 → 입차 알림톡(보관증) 확인
- [ ] B2B에서 출고 완료 → 출고 알림톡 확인
- [ ] 출고 알림톡 버튼/링크가  
  `https://www.에어픽.kr/my?review={예약ID}` 형태다
- [ ] 링크를 열면 MY로 이동하고 **후기 작성 모달**이 열린다
- [ ] 후기 등록 후 업체 상세/평점에 반영(또는 관리자 후기 목록에 보임)

### 접수증
- [ ] 예약/입차 링크의 접수증·보관증 페이지가 열린다 (`/r/...`)

---

## E. 홈페이지 예약 (`/h/{업체ID}`)

- [ ] 링크가 **실제 업체 ID**다 (빈 값 → wawa 기본값 없음)
- [ ] 예: `https://airpick-reservation.web.app/h/와와업체id`
- [ ] 예약이 Firestore에 생기고 `createdBy` = `homepage`
- [ ] **알림톡은 안 가고**, 시트에는 (켜져 있다면) 기록된다
- [ ] B2B 타임라인/통계에 해당 예약이 보인다
- [ ] 영수증/브랜딩에 에어픽 수수료·뱃지가 **과하게 붙지 않는다**(홈페이지 정책대로)

---

## F. B2B 운영 (현장)

- [ ] 당일 접수 CRM에서 상세 → **예약 수정 · 취소** 가능
- [ ] 기사/관리자 모드 전환 후 입고·출고 상태가 바뀐다
- [ ] 차량 사진 업로드가 된다
- [ ] 출고 완료 후 상태가 `completed_out`(또는 앱 표기 출고완료)

---

## G. 보안·정리 (출시 직전 최소)

- [ ] `android/*.jks*` 키스토어·백업이 git에 **안** 올라갔다
- [ ] `.env` / 서비스계정 JSON이 git에 **안** 올라갔다
- [ ] 가맹점 초기 비밀번호를 약한 기본값(`master1234` 등)으로 두지 않았다 (또는 반드시 변경 안내)
- [ ] (알고 있음) companies 공개 읽기 + 비밀번호 필드는 **아직 구조적 리스크** — 출시 후 우선 개선 후보

---

## H. 한 번에 통과하는 “골든 패스” (추천)

아래를 **순서대로 한 번에** 해 보면 출시 준비가 거의 끝입니다.

1. [ ] 본사가 테스트 업체에 주소·핀·T1/T2·사진·보험 등록  
2. [ ] 에어픽.kr에서 그 업체로 예약  
3. [ ] 예약 알림톡 수신  
4. [ ] B2B 입고 → 입차 알림톡  
5. [ ] B2B 출고 → 후기 알림톡 → 링크 클릭 → 후기 작성  
6. [ ] 같은 업체로 `/h/{id}` 홈페이지 예약 1건 → 알림톡 없음·B2B에 보임  
7. [ ] 가맹점 계정으로 로그인 → 위치/보험 **수정 불가**, 요금만 저장  

전부 `[x]`면 큰 그림 동선은 통과입니다.

---

## 문제 생겼을 때 빠른 감별

| 증상 | 의심 |
|------|------|
| 알림톡이 전혀 안 옴 | `ALIMTALK_ENABLED` / NHN 키 / 에어픽 예약인지(`airpick-b2c`) |
| 출고 알림톡은 오는데 링크가 이상함 | NHN 템플릿 버튼 URL vs Functions `buildReviewUrl` |
| MY에서 위치가 안 보임 | 본사가 companies에 저장했는지, B2C가 그 업체 문서를 읽는지 |
| 가맹점이 위치를 고칠 수 있음 | 구버전 앱이거나, B2C rules가 HQ 잠금을 덮어씀 |
| 접수증/후기 API 404 | Functions 배포가 B2C 함수를 지움 |
| 본사만 저장되던 사진이 갑자기 풀림 | Storage/Firestore rules 재배포로 정본이 아닌 파일 적용 |

---

관련 문서: `docs/FIRESTORE_RULES_CANONICAL.md`
