# Firestore 규칙 정본 (초안)

**프로젝트:** `airpick-reservation` (B2B · B2C · 홈페이지 예약 공유)  
**목적:** B2B/B2C 저장소에 각각 다른 `firestore.rules`가 있어, 나중에 배포한 쪽이 다른 쪽 보호를 지우는 문제를 막기 위함입니다.

**적용 상태:** B2B `firestore.rules` · B2C `firestore.rules`에 동일 내용 반영됨 (로컬).  
프로덕션 반영: B2B에서 `firebase deploy --only firestore:rules --project airpick-reservation`

## 배포 원칙 (중요)

1. **정본은 이 문서의 규칙 블록 하나**입니다.
2. 반영 시 **B2B `firestore.rules`와 B2C `firestore.rules`를 동일 내용으로 맞춘 뒤**, 한곳에서만 배포하세요.
   - 예: B2B에서만 `firebase deploy --only firestore:rules`
   - B2C에서는 rules 배포 스크립트를 끄거나, 같은 파일을 복사해 두고 “B2B가 정본”이라고 README에 적기
3. Functions도 같은 이유로 **한쪽 전체 배포가 다른 쪽 함수를 지울 수 있습니다.**  
   → 규칙과 별도로 Functions 배포 체크리스트를 따르세요. (`docs/LAUNCH_CHECKLIST.md`)

## 이 초안이 합친 것

| 출처 | 내용 |
|------|------|
| B2C | 예약 보안 필드 잠금 (`reservationPassword`, `receiptToken`, `createdBy` 등), 삭제는 본사만, `reviews` 컬렉션 |
| B2B | 보험·주소·핀·T1/T2·사진·시설유형은 **최고관리자만** companies 수정 |
| 공통 | companies 공개 읽기, 요금/직원 등은 가맹점 수정 가능, `storage_retention` 클라이언트 차단 |

## 아직 안 넣은 것 (다음 단계)

- companies의 `password` / `employees[].password` 공개 읽기 제한 → Auth 재설계와 함께
- Storage `companies/{id}/parking` 쓰기를 본사만으로 제한 → `storage.rules` 별도

---

## 정본 규칙 (복사해 `firestore.rules`에 사용)

```
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {

    // ── Helpers ─────────────────────────────────────────────────────────────

    function isSignedIn() {
      return request.auth != null;
    }

    /** B2B 본사 Firebase Auth 계정 (Anonymous 아님) */
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

    function isSubOperatorCompanyData(data, companyId) {
      return data.keys().hasAll(['parentCompanyId', 'isOperatorPrimary'])
        && data.isOperatorPrimary == false
        && data.parentCompanyId is string
        && isValidCompanyId(data.parentCompanyId)
        && data.parentCompanyId != companyId;
    }

    function subOperatorParentExists(data) {
      return exists(/databases/$(database)/documents/companies/$(data.parentCompanyId));
    }

    function isSubOperatorCreate(companyId) {
      return isSignedIn()
        && isValidCompanyId(companyId)
        && isSubOperatorCompanyData(request.resource.data, companyId)
        && subOperatorParentExists(request.resource.data);
    }

    function isSubOperatorDelete() {
      return isSignedIn()
        && resource.data.keys().hasAll(['parentCompanyId'])
        && resource.data.parentCompanyId is string
        && resource.data.parentCompanyId.size() > 0
        && isValidCompanyId(resource.data.parentCompanyId);
    }

    /** 가맹점이 덮어쓰면 안 되는 B2C MY 보험·위치·사진 필드 (최고관리자만) */
    function touchesHqOnlyParkingFields() {
      return request.resource.data.diff(resource.data).affectedKeys().hasAny([
        'facilityType',
        'is_indoor',
        'supports_indoor',
        'supports_outdoor',
        'features',
        'indoorParkingAddress',
        'outdoorParkingAddress',
        'indoorParkingLat',
        'indoorParkingLng',
        'outdoorParkingLat',
        'outdoorParkingLng',
        'parkingLots',
        'parkingDistances',
        'parkingDistancesIndoor',
        'parkingDistancesOutdoor',
        'image_url',
        'image_urls',
        'sharesParkingLocation',
        'sharesPhotos',
        'insurance',
        'hasInsurance',
        'insuranceProvider',
        'insuranceLimit',
        'sharesInsurance'
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

    // ── companies ──────────────────────────────────────────────────────────

    match /companies/{companyId} {
      allow read: if true;

      allow create: if isPlatformAdmin() && isValidCompanyId(companyId)
        || isSubOperatorCreate(companyId);

      // 가맹점: 요금·대면·직원·마감 등만
      // 보험·주소·핀·거리·사진·시설유형: 최고관리자만
      allow update: if isSignedIn() && isValidCompanyId(companyId)
        && (
          isPlatformAdmin()
          || !touchesHqOnlyParkingFields()
        );

      allow delete: if isPlatformAdmin() && isValidCompanyId(companyId)
        || isSubOperatorDelete();
    }

    // ── system_settings / parking_lots ─────────────────────────────────────

    match /system_settings/{settingId} {
      allow read: if isSignedIn();
      allow write: if isPlatformAdmin();
    }

    match /parking_lots/{lotId} {
      allow read: if true;
      allow write: if isPlatformAdmin();
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
- [ ] 가맹점이 브라우저에서 companies의 `indoorParkingAddress`를 직접 바꾸려 하면 → 실패
- [ ] 본사(플랫폼 Auth) 가맹점 수정에서 주소·사진·보험 저장 → 성공
- [ ] B2C에서 예약 생성 → 성공
- [ ] B2C/B2B가 `reservationPassword` / `createdBy`를 클라이언트로 바꾸려 하면 → 실패
- [ ] MY에서 published 후기 목록 조회 → 성공
- [ ] 예약 문서 클라이언트 삭제 시도(비본사) → 실패
