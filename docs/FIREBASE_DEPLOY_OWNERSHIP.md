# Firebase 배포 소유권 (B2B 단일)

**프로젝트:** `airpick-reservation`  
**정본 저장소:** 이 repo (`airpick2-b-to-b`)

B2C(`airpick-b2c`) · 업체 홈페이지는 **클라이언트만** 배포한다.  
아래를 그쪽에서 돌리면 B2B/손님 함수·rules가 덮이거나 지워질 수 있다.

| 대상 | 배포 위치 | 비고 |
|------|-----------|------|
| Cloud Functions | **B2B만** | 손님 API 코드는 이 repo `functions/src/api` 에 통합됨. **첫 통합 배포 전**에 아래 “통합 배포” 절차를 따를 것 |
| Firestore rules | **B2B만** | `firebase deploy --only firestore:rules` |
| Storage rules | **B2B만** | `firebase deploy --only storage` |
| Hosting (B2B 앱·`/h`·`/r`) | B2B | `firebase deploy --only hosting` |
| B2C 웹·앱 | B2C | Hosting / 스토어만 |
| 업체 홈페이지 | 해당 사이트 | 화면·정적 배포만 |

## B2C / 업체 홈에 적을 문구 (복사용)

> Firebase 백엔드(Functions / Firestore·Storage rules)는 `airpick2-b-to-b`(에어픽 B2B)에서만 배포·관리한다.  
> 여기서 `firebase deploy --only functions` 또는 `firestore:rules` / `storage` 를 하지 말 것.

## 현재 라이브 함수 스냅샷

확인일: 2026-08-02 · `firebase functions:list --project airpick-reservation`

**손님·B2C 계열** (`asia-northeast3`, HTTPS)

- `cancelReservation`, `getReceipt`, `lookupReservation`, `submitReview`
- `listAdminReviews`, `moderateReview`
- `getDriveEta`, `getIcnAirportLive`, `getIcnFlight`, `getIcnFlightSearch`, `getIcnShuttle`

**B2B 계열**

- Firestore: `onReservationSync` (`asia-northeast3`)
- Callable (`us-central1`): `adminUpsertCompany`, `adminSetCompanyStatus`, `adminDeleteCompany`, `verifyPartnerLogin`, `upsertCompanyEmployees`
- Scheduled (`us-central1`): `purgeExpiredReservationData`, `checkIncheonFlightDelays`

> 전체가 살아 있는 상태. 한쪽 repo에서 Functions **전체** 배포하면 다른 쪽 목록이 사라질 수 있음.

## 코드 통합 상태 (이 repo)

- [x] B2C `api/*` · `reservations/*` · `reviews/*` · `utils/*` 를 `functions/src/` 로 복사
- [x] `functions/src/index.ts` 에서 손님 API export
- [x] 리전 고정: 손님·`onReservationSync` → `asia-northeast3` / 관리자·스케줄 → `us-central1`
- [x] `functions` 패키지 `tsc` 빌드 통과
- [x] **B2B에서 Functions 통합 배포** (2026-08-02) — 손님·B2B 함수 모두 유지
- [x] B2C repo Functions 배포 끄기 + 문구 고정 (`firebase.json` functions 제거 · npm scripts 차단)
- [x] 업체 홈(AI Studio) 문구 전달 (Functions/rules → `airpick2-b-to-b`만)
- [x] `blockedDates` 정본 = **입고일만** (B2C `bookingPolicy` 맞춤 · 서버·홈·현장 동일)
- [x] B2C `firestore.rules` ↔ B2B 동기화 커밋 (배포는 B2B만)
- [x] 출차확인증 완납/미납 + 금액 표시 (Hosting 배포)

### 통합 배포 시 주의

- `DATA_GO_KR_SERVICE_KEY` 는 **Secret Manager만** 사용. `functions/.env`에 평문으로 넣지 말 것 (Secret과 겹치면 ICN 함수 배포 실패).
- `NAVER_NCP_API_KEY_ID` / `NAVER_NCP_API_KEY` 는 `functions/.env`에 필요 (`getDriveEta`).

```bash
cd functions && npm run build
firebase deploy --only functions --project airpick-reservation
firebase functions:list --project airpick-reservation
```

관련: `docs/LAUNCH_CHECKLIST.md` · `docs/FIRESTORE_RULES_CANONICAL.md`
