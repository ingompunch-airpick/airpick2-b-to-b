# AI 스튜디오(B2C 고객용 홈페이지) 전달 사항

B2B 레포에서 Firestore Rules·Functions를 바꿀 때, B2C 프론트엔드에서 같이 고쳐야 하는 내용을 여기에 모읍니다.
Rules와 Functions 배포는 항상 B2B 레포에서만 합니다 (`docs/FIREBASE_DEPLOY_OWNERSHIP.md`).

---

## 2026-08 · 예약 목록 직접 조회 중단 + 예약 비밀번호 분리

### 배경

`reservations` 문서에는 손님 이름·연락처·차량번호와 4자리 예약 비밀번호가 들어 있습니다.
지금까지는 익명 로그인만 하면 이 컬렉션을 통째로 읽을 수 있었고, 시간당 입고 마감을 확인하려고
B2C가 실제로 예약 목록을 그대로 내려받고 있었습니다. 두 가지를 정리했습니다.

### 1. 시간당 마감 확인 — `capacity` 집계 문서로 교체

새 컬렉션 `capacity/{companyId}__{YYYY-MM-DD}` 를 B2B Functions(`onReservationSync`)가 갱신합니다.
읽기는 공개, 쓰기는 서버만 가능합니다. 담긴 값은 대수뿐이라 개인정보가 없습니다.

```json
{
  "companyId": "wawa",
  "date": "2026-08-05",
  "hours": { "7": 3, "8": 1, "14": 2 },
  "total": 6,
  "updatedAt": "2026-08-03T14:00:00.000Z"
}
```

`hours` 의 키는 입고 시각의 **시(0–23)** 를 문자열로 쓴 것입니다(`"07"` 아님, `"7"`).
와와처럼 별칭 ID(`wawa`, `wawa_valet`, `와와`, `와와발렛`)를 쓰는 업체는 ID별로 문서가 따로 생기므로
클라이언트에서 별칭 문서들을 읽어 시간대별로 더해야 합니다.

**해야 할 일**: `reservations` 를 `where(companyId)` + `where(departureDate)` 로 조회하던 마감 확인 코드를
`capacity` 문서 읽기로 바꿉니다. 로컬 레포 기준 수정본은 `src/lib/hourlyCapacityFirestore.ts` 에 반영돼 있습니다.

집계 문서가 아직 없으면 0대로 읽힙니다. 이때도 서버가 한도 초과 예약을 자동취소하는 백스톱이 있고,
매일 04:00 KST 에 앞으로 날짜 집계를 다시 채웁니다.

### 2. 예약 비밀번호 — 본문에서 `secrets` 하위 문서로 이동

예약 생성 직후 서버가 `reservationPassword` 를 `reservations/{id}/secrets/lookup` 으로 옮기고
본문 필드는 삭제합니다. 하위 문서는 Rules 로 클라이언트 읽기·쓰기를 전면 차단했습니다.

**B2C 코드 변경은 필요 없습니다.** 예약 생성 시 지금처럼 `reservationPassword` 를 담아 보내면 되고,
조회·취소·후기는 이미 서버 API(`/api/reservation-lookup`, `/api/reservation-cancel`, `/api/reservation-review`)로
비밀번호를 넘겨 검증하므로 그대로 동작합니다.

다만 **예약 문서에서 `reservationPassword` 를 읽어 화면에 보여주거나 검증에 쓰는 코드가 있다면 제거**해야 합니다.
그 필드는 이제 문서에 남아 있지 않습니다.

### 4. 입고/출고 담당자 (B2B → 손님 「내 예약」)

B2B가 상태 변경 시 예약 문서에 저장합니다. 조회 API·직접 구독 모두 그대로 내려옵니다.

| 필드 | 시점 | 예시 |
|------|------|------|
| `checkedInBy` / `checkedInAt` | `status → completed_in` | `"김기사"`, ISO 시각 |
| `checkedOutBy` / `checkedOutAt` | `status → completed_out` | `"이기사"` 또는 `"업체 담당"` |

- 직원 계정: 직원 이름 그대로
- 업체/본사 마스터: `"업체 담당"` (내부 `updatedBy`와 다름)
- 되돌리면 해당 필드 삭제됨
- 연락처·사번 없음. 문의는 업체 대표번호

**B2C:** 입고 완료 / 출고 완료 구간에만 한 줄 표시 권장.  
예: `입고 완료 · 담당 김기사` / `출고 완료 · 담당 업체 담당`

### 5. Firestore — 예약 **목록(list)** 조임 (2026-08)

- `list`: 본사 이메일 계정, 또는 커스텀 토큰의 `partnerCompanyId` 와 일치하는 업체만
- `get`: 로그인한 손님(익명 포함) 단건 조회는 유지 (MY 구독·접수 직후)
- 시간당 마감은 반드시 `capacity` 문서로 (위 §1). `reservations` where 조회하면 permission-denied

### 6. 업체 홈페이지 → `/h/{companyId}` 권장 + 입국편 시각 자동

업체 자체 홈(AI 스튜디오)에 입국편 API를 각각 넣기보다, B2B 호스팅의  
`https://airpick-reservation.web.app/h/{companyId}` 로 예약 폼을 돌리는 것을 권장합니다.

`/h/` 는 입국 편명 입력 시 공항 예정 도착 시각·터미널을 자동 채웁니다(오늘~+6일).  
출국편 시각은 자동으로 안 바꿉니다(손님이 여유 있게 오는 시간이라서).

직접 유지할 홈은 `integrations/wawavalet-firebase.example.js` 를 참고해  
시간당 마감을 `capacity` 로 읽고, 예약 list 는 쓰지 마세요.
