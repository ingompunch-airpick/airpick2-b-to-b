# Security Specification

> **현재 배포 규칙:** `firestore.rules`, `storage.rules` — 상세는 [docs/FIRESTORE_RULES.md](./docs/FIRESTORE_RULES.md)

## 1. Data Invariants (운영 규칙 기준)

### Parking Companies (`/companies/{companyId}`)

- **read:** 공개 (B2C·홈페이지 요금·마감 조회)
- **create / delete:** 플랫폼 관리자만 (`drive5746@gmail.com`, `ingompunch@gmail.com`)
- **update:** Firebase Authentication 로그인 사용자 (현재 Anonymous 포함 — 2단계에서 custom claims로 업체 범위 제한 예정)
- `companyId` 형식: `^[a-z0-9_]{1,64}$`

### Reservations (`/reservations/{reservationId}`)

- **read / create / update:** 로그인(Anonymous 포함) + `status`, `createdAt`, `companyId`, `totalPrice` 검증
- **delete:** 플랫폼 관리자만
- 홈페이지·B2C·B2B가 동일 컬렉션 사용 — `createdBy` 로 유입 구분

### System settings (`/system_settings/{settingId}`)

- **read:** 로그인
- **write:** 플랫폼 관리자만

### Storage (`/reservations/{companyId}/{reservationId}/…`)

- **read / write:** 로그인, 업로드 15MB 이하

---

## 2. 앱 로그인 vs Firebase Auth

| 계층 | 역할 |
|------|------|
| **Gate / localStorage** | B2B 화면 접근 (업체·역할·모드) |
| **Firebase Anonymous** | 예약·업체 운영 필드 update·차량 사진 Storage |
| **Firebase 이메일 (플랫폼 관리자)** | Gate에서 직접 로그인 → Callable / 주차장 사진 |

본사 비밀번호는 `.env`에 두지 않습니다. Firebase Console Authentication 계정으로 Gate 로그인합니다.

---

## 3. 향후 강화 (2단계)

- Firebase Custom Claims `companyId` — 업체 update를 해당 업체로 제한
- Gate 비밀번호 Firestore 평문 저장 제거
- `firestore.rules.test.ts` (@firebase/rules-unit-testing) 추가

---

## 4. Legacy — Dirty Dozen (목표 테스트 시나리오)

아래 공격은 **운영 규칙에서 거부**되어야 함:

1. 비로그인 예약 생성
2. 비로그인 companies write
3. Anonymous 사용자의 companies **create**
4. Anonymous 사용자의 reservation **delete**
5. 음수 `totalPrice` 예약
6. `status` / `createdAt` 누락 예약
7. 비관리자 system_settings write
8. 128자 초과 document ID

테스트 러너: 추후 `firestore.rules.test.ts` 추가 예정.
