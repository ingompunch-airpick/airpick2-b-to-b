# Firestore 규칙 정본

**프로젝트:** `airpick-reservation` (B2B · B2C · 홈페이지 예약 공유)  
**목적:** B2B/B2C 저장소에 각각 다른 `firestore.rules`가 있어, 나중에 배포한 쪽이 다른 쪽 보호를 지우는 문제를 막기 위함입니다.

**적용 상태:** B2B `firestore.rules` · B2C `Documents/GitHub/airpick-b2c/firestore.rules` 동기화됨.  
프로덕션 반영: B2B에서 `firebase deploy --only firestore:rules --project airpick-reservation`  
**(B2C에서는 rules 배포하지 말 것)**

## 배포 원칙 (중요)

1. **정본은 이 문서의 규칙 블록 하나**입니다.
2. 반영 시 **B2B `firestore.rules`와 B2C `firestore.rules`를 동일 내용으로 맞춘 뒤**, 한곳에서만 배포하세요.
   - 예: B2B에서만 `firebase deploy --only firestore:rules`
   - B2C에서는 rules 배포 스크립트를 끄거나, 같은 파일을 복사해 두고 “B2B가 정본”이라고 README에 적기
3. Functions도 같은 이유로 **한쪽 전체 배포가 다른 쪽 함수를 지울 수 있습니다.**  
   → 규칙과 별도로 Functions 배포 체크리스트를 따르세요. (`docs/LAUNCH_CHECKLIST.md`)

## 권한 모델 (요약)

| 컬렉션 | 클라이언트 | Cloud Functions (Admin SDK) |
|--------|------------|------------------------------|
| `companies` create/delete | **불가** | `adminUpsertCompany` / `adminDeleteCompany` |
| `companies` HQ 프로필 (핀·보험·사진·password·status 등) | **불가** | `adminUpsertCompany` / `adminSetCompanyStatus` |
| `companies/.../secrets` (로그인 비번) | **불가** | Admin SDK만 (`verifyPartnerLogin` 검증) |
| `companies` 운영 필드 (요금·직원·마감·isOpen 등) | 로그인 후 update 허용 | — |
| `system_settings` / `parking_lots` write | **불가** | 필요 시 Functions |
| `reviews` write | **불가** | Functions만 |
| `reservations` | 로그인 + 필드 검증 | 보안 필드·삭제는 본사/Functions |

## 아직 안 넣은 것 (다음 단계)

- `.env` 본사 비밀번호 로그인 제거 → **완료** (Gate Firebase 이메일 로그인)
- Firebase Custom Claims `companyId` 로 가맹점 update 범위 제한

---

## 정본 규칙 (복사해 `firestore.rules`에 사용)

```
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {

    // ── Helpers ─────────────────────────────────────────────────────────────
    // 정본: docs/FIRESTORE_RULES_CANONICAL.md — B2B·B2C 동일 유지, rules 배포는 한곳에서만

    function isSignedIn() {
      return request.auth != null;
    }

    /** B2B 본사 Firebase Auth 계정 (Anonymous 아님). 예약 삭제 등 Rules 경로용 */
    function isPlatformAdmin() {
      return isSignedIn()
        && request.auth.token.email != null
        && request.auth.token.email in [
          'drive5746@gmail.com',
          'ingompunch@gmail.com'
        ];
    }

    function isValidCompanyId(companyId) {
      return companyId.matches('^[a-z0-9_]{1,64}$');
    }

    /**
     * 가맹점(클라이언트)이 바꿀 수 있는 운영 필드만.
     * 생성·삭제·프로필(핀·보험·비밀번호·status 등)은 Cloud Functions Admin SDK만.
     */
    function onlyPartnerOperationalFieldsChanged() {
      return request.resource.data.diff(resource.data).affectedKeys().hasOnly([
        'id',
        'base_price',
        'extra_day_price',
        'base_days',
        'outdoorBasePrice',
        'outdoorBaseDays',
        'outdoorExtraPrice',
        'indoorBasePrice',
        'indoorBaseDays',
        'indoorExtraPrice',
        'surchargeStartTime',
        'surchargeEndTime',
        'surchargePrice',
        't2Surcharge',
        'peakStartTime',
        'peakEndTime',
        'peakSurcharge',
        'valetFeeT1',
        'valetFeeT2',
        'employees',
        'isOpen',
        'blockedDates',
        'cancelCutoffHours',
        'sameDayBookingBlocked',
        'hourlyCapEnabled',
        'maxCarsPerHour',
        'phone',
        'updatedAt'
      ]);
    }

    function isValidReservationId(reservationId) {
      return reservationId.matches('^[a-zA-Z0-9_-]{1,128}$');
    }

    function reservationCoreFieldsValid(data) {
      return data.keys().hasAll(['status', 'createdAt'])
        && data.status is string
        && data.status.size() > 0
        && data.status.size() <= 64
        && data.createdAt is string
        && data.createdAt.size() > 0
        && data.createdAt.size() <= 40;
    }

    function reservationCompanyIdValid(data) {
      return !('companyId' in data)
        || (data.companyId is string
            && data.companyId.size() > 0
            && data.companyId.size() <= 64);
    }

    function reservationTotalPriceValid(data) {
      return !('totalPrice' in data)
        || (data.totalPrice is number && data.totalPrice >= 0);
    }

    function validReservationWrite() {
      return reservationCoreFieldsValid(request.resource.data)
        && reservationCompanyIdValid(request.resource.data)
        && reservationTotalPriceValid(request.resource.data);
    }

    /**
     * 보안·생성 필드는 최초 생성 후 클라이언트가 변경할 수 없다.
     * 취소·비번 검증 등 정당한 변경은 Cloud Functions(admin)가 규칙을 우회해 처리.
     */
    function reservationProtectedFieldsUnchanged() {
      return !request.resource.data.diff(resource.data).affectedKeys()
        .hasAny(['reservationPassword', 'receiptToken', 'createdBy', 'createdAt', 'userId']);
    }

    // ── reservations ───────────────────────────────────────────────────────

    match /reservations/{reservationId} {
      allow read: if isSignedIn();

      allow create: if isSignedIn()
        && isValidReservationId(reservationId)
        && validReservationWrite();

      allow update: if isSignedIn()
        && isValidReservationId(reservationId)
        && validReservationWrite()
        && reservationProtectedFieldsUnchanged();

      // 고객·파트너는 상태 변경으로 취소. 문서 삭제는 본사만.
      allow delete: if isPlatformAdmin() && isValidReservationId(reservationId);
    }

    match /storage_retention/{reservationId} {
      allow read, write: if false;
    }

    // customers/{phoneKey} — visitCount (Functions만 쓰기)
    match /customers/{phoneKey} {
      allow read: if isSignedIn();
      allow create, update, delete: if false;
    }

    // ── companies ──────────────────────────────────────────────────────────

    match /companies/{companyId} {
      allow read: if true;

      // 생성·삭제는 Cloud Functions(adminUpsertCompany / adminDeleteCompany)만
      allow create, delete: if false;

      // 가맹점: 요금·발레·직원·마감·영업여부 등 운영 필드만
      // 핀·보험·사진·password·status·정산메모 등 → Functions만
      allow update: if isSignedIn()
        && isValidCompanyId(companyId)
        && onlyPartnerOperationalFieldsChanged();
    }

    // ── system_settings / parking_lots ─────────────────────────────────────

    match /system_settings/{settingId} {
      allow read: if isSignedIn();
      allow write: if false;
    }

    match /parking_lots/{lotId} {
      allow read: if true;
      allow write: if false;
    }

    // ── reviews (후기 — 쓰기는 Cloud Functions만) ─────────────────────────

    match /reviews/{reviewId} {
      allow read: if isSignedIn() && resource.data.status == 'published';
      allow create, update, delete: if false;
    }
  }
}
```

## 반영 후 스모크 테스트

- [ ] 가맹점 마스터에서 요금 저장 → 성공
- [ ] 가맹점이 브라우저에서 companies의 `indoorParkingAddress` / `password` / `status`를 직접 바꾸려 하면 → 실패
- [ ] 본사 AdminDashboard에서 주소·사진·보험 저장 (Callable) → 성공
- [ ] 본사에서 업체 생성·삭제·상태 토글 (Callable) → 성공
- [ ] B2C에서 예약 생성 → 성공
- [ ] B2C/B2B가 `reservationPassword` / `createdBy`를 클라이언트로 바꾸려 하면 → 실패
- [ ] MY에서 published 후기 목록 조회 → 성공
- [ ] 예약 문서 클라이언트 삭제 시도(비본사) → 실패
