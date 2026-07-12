# Firestore · Storage 보안 규칙

프로젝트 `airpick-reservation` — **홈페이지 · B2C · B2B** 가 같은 DB를 공유합니다.

> **정본:** [`FIRESTORE_RULES_CANONICAL.md`](./FIRESTORE_RULES_CANONICAL.md)  
> B2B `firestore.rules`와 B2C `firestore.rules`는 **동일**해야 합니다.  
> **rules 배포는 B2B에서만** 하세요. B2C에서 rules를 따로 올리면 잠금이 풀리거나 어긋날 수 있습니다.

## 규칙 요약

| 컬렉션 | read | create | update | delete |
|--------|------|--------|--------|--------|
| `reservations` | 로그인(Anonymous 포함) | 로그인 + 필드 검증 | 로그인 + 필드 검증 + **보안필드 잠금** | **플랫폼 관리자만** |
| `companies` | **공개** | **Functions만** | 로그인 + **운영 필드 allowlist만** (요금·직원·마감 등). 핀·보험·password·status는 Functions | **Functions만** |
| `reviews` | 로그인 + `published` | Functions만 | Functions만 | Functions만 |
| `system_settings` | 로그인 | **불가** (Functions만) | **불가** | **불가** |
| Storage `reservations/…` | 로그인 | 로그인 (15MB 이하) | — | — |
| Storage `companies/…/parking` | **공개** | **본사만** (이미지, 15MB 이하) | — | — |

### 예약 보안 필드 (클라이언트 변경 불가)

`reservationPassword`, `receiptToken`, `createdBy`, `createdAt`, `userId`  
→ 취소·비번 검증은 Cloud Functions(admin)가 처리합니다.

### 플랫폼 관리자 (Firestore `isPlatformAdmin`)

- `drive5746@gmail.com`
- `ingompunch@gmail.com`

Firebase Authentication에 **이메일/비밀번호**로 등록된 계정이어야 합니다.  
B2B Gate에서 위 이메일 + Auth 비밀번호로 로그인합니다. (`.env` 관리자 비번 방식 제거됨)

### blockedDates (예약 마감)

- **단일 소스:** `companies/{companyId}.blockedDates` (+ `isOpen`)
- 홈페이지·B2C·B2B 모두 동일 경로 읽기
- 레거시 `system_settings/config` → `companies/airpick` 자동 1회 이전 (B2B)

### Anonymous Auth (예약·업체 수정)

- 홈페이지·B2C·B2B **예약 생성/수정**
- 제휴업체 **요금·마감(companies update)** — 위치·보험 제외

Firebase Console → Authentication → Sign-in method → **Anonymous 사용 설정** 필수.

## 배포

```powershell
cd airpick2-b-to-b

# 본사는 Gate에서 Firebase 관리자 이메일로 로그인 (Authentication에 계정 등록 필요)
# VITE_NAVER_MAP_CLIENT_ID 등 클라이언트 전용 env만 .env에 둠

npm.cmd run deploy:rules
```

Firestore + Storage 규칙이 함께 배포됩니다 (`firebase.json`).

## B2B 앱 동작

| 작업 | Firebase Auth |
|------|----------------|
| 예약 조회·상태 변경 | `ensureFirestoreAuth()` → Anonymous |
| 현장 접수·사진 업로드 | 동일 |
| 제휴업체 요금/마감 수정 | Anonymous + 운영 필드 allowlist |
| **본사 업체 생성·수정·삭제·상태** | Gate Firebase 본사 로그인 → Callable |
| **본사 주차장 사진 업로드** | 동일 본사 세션 → Storage |

구현: `src/lib/firebaseAuth.ts`, `src/lib/adminCompanyApi.ts`

## 아직 열려 있는 부분 (2단계)

- Anonymous로 로그인한 사용자도 `companies` **운영 필드** update 가능 (업체별 custom claims 미적용)
- 가맹점 Gate 로그인(업체 ID/비번)은 **Firestore와 별개** — localStorage 기반 (본사만 Firebase Auth)

향후: Firebase Custom Claims `companyId` 로 업체 update 범위 제한.

## 검증 체크리스트

- [ ] Anonymous Auth 활성화
- [ ] 관리자 이메일 Firebase Auth 등록
- [ ] `.env` 설정 후 B2B dev 서버 재시작
- [ ] `npm run deploy:rules` 성공
- [ ] 홈페이지 예약 → Console `reservations` 생성
- [ ] B2B AdminDashboard 신규 업체 등록 성공
- [ ] 제휴업체 로그인 → 예약 마감 저장 성공
