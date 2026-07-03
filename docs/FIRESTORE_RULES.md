# Firestore · Storage 보안 규칙

프로젝트 `airpick-reservation` — **홈페이지 · B2C · B2B** 가 같은 DB를 공유합니다.

## 규칙 요약

| 컬렉션 | read | create | update | delete |
|--------|------|--------|--------|--------|
| `reservations` | 로그인(Anonymous 포함) | 로그인 + 필드 검증 | 로그인 + 필드 검증 | 로그인 |
| `companies` | **공개** (요금·마감 조회) | **플랫폼 관리자** | 로그인 | **플랫폼 관리자** |
| `system_settings` | 로그인 | **플랫폼 관리자** | **플랫폼 관리자** | **플랫폼 관리자** |
| Storage `reservations/…` | 로그인 | 로그인 (15MB 이하) | — | — |

### 플랫폼 관리자 (Firestore `isPlatformAdmin`)

- `drive5746@gmail.com`
- `ingompunch@gmail.com`

Firebase Authentication에 **이메일/비밀번호**로 등록된 계정이어야 합니다.  
B2B 앱은 `.env`의 `VITE_FIREBASE_ADMIN_EMAIL` / `VITE_FIREBASE_ADMIN_PASSWORD`로 로그인합니다.

### blockedDates (예약 마감)

- **단일 소스:** `companies/{companyId}.blockedDates` (+ `isOpen`)
- 홈페이지·B2C·B2B 모두 동일 경로 읽기
- 레거시 `system_settings/config` → `companies/airpick` 자동 1회 이전 (B2B)

### Anonymous Auth (예약·업체 수정)

- 홈페이지·B2C·B2B **예약 생성/수정**
- 제휴업체 **요금·마감(companies update)**

Firebase Console → Authentication → Sign-in method → **Anonymous 사용 설정** 필수.

## 배포

```powershell
cd airpick2-b-to-b

# .env 파일에 관리자 계정 설정 (git에 커밋하지 말 것)
# VITE_FIREBASE_ADMIN_EMAIL=...
# VITE_FIREBASE_ADMIN_PASSWORD=...

npm.cmd run deploy:rules
```

Firestore + Storage 규칙이 함께 배포됩니다 (`firebase.json`).

## B2B 앱 동작

| 작업 | Firebase Auth |
|------|----------------|
| 예약 조회·상태 변경 | `ensureFirestoreAuth()` → Anonymous |
| 현장 접수·사진 업로드 | 동일 |
| 제휴업체 요금/마감 수정 | Anonymous |
| **신규 제휴업체 등록** | `ensurePlatformAdminAuth()` |
| **업체 삭제** | `ensurePlatformAdminAuth()` |
| 본사 system_settings 마감 | `ensurePlatformAdminAuth()` |

구현: `src/lib/firebaseAuth.ts`

## 아직 열려 있는 부분 (2단계)

- Anonymous로 로그인한 **누구나** `companies/{id}` **update** 가능 (업체별 custom claims 미적용)
- 앱 Gate 로그인(`airpick/9980` 등)은 **Firestore와 별개** — localStorage 기반

향후: Firebase Custom Claims `companyId` 로 업체 update 범위 제한.

## 검증 체크리스트

- [ ] Anonymous Auth 활성화
- [ ] 관리자 이메일 Firebase Auth 등록
- [ ] `.env` 설정 후 B2B dev 서버 재시작
- [ ] `npm run deploy:rules` 성공
- [ ] 홈페이지 예약 → Console `reservations` 생성
- [ ] B2B AdminDashboard 신규 업체 등록 성공
- [ ] 제휴업체 로그인 → 예약 마감 저장 성공
