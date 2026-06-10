# 제휴업체 온보딩 체크리스트

에어픽 본사가 **신규 제휴업체**를 추가할 때마다 같은 순서로 확인합니다.  
DB는 **Firebase `airpick-reservation` 하나**, 업체는 **`companies/{업체id}`** 로만 늘립니다.

관련: [HOMEPAGE_FIREBASE_SYNC.md](./HOMEPAGE_FIREBASE_SYNC.md)

---

## 1. 본사 — 등록 직후

| # | 확인 | 설명 |
|---|------|------|
| 1 | Firestore `companies/{id}` | B2B 제휴 등록 후 Console에서 문서 존재 |
| 2 | B2B 로그인 | Gate에서 `{id}` / 비밀번호 |
| 3 | 테스트 예약 | 현장 접수 또는 B2C → **입고예정** 타임라인 |
| 4 | B2C 노출 | `airpick-b2c` 업체 비교 목록 |
| 5 | 유입·수수료 | `createdBy` 구분 (아래 표) |
| 6 | (자체 홈) | `airpick-reservation` + `companyId` + `createdBy: homepage` |
| 7 | 직원 | 기사·부관리자 (필요 시) |
| 8 | 요금·마감 | `isOpen`, `blockedDates`, 요금 필드 |

### 유입 경로 · createdBy

| 유입 | createdBy | 수수료 (예) |
|------|-----------|-------------|
| 업체 자체 홈 | `homepage` | 낮음 |
| B2B 현장 접수 | 직원명 / 업체 마스터 | 낮음 |
| 에어픽 B2C | `airpick-b2c` | 높음 (플랫폼 마케팅) |

---

## 2. 업체 id 규칙

| 업체명 예 | companyId |
|-----------|-----------|
| 와와 | `wawa` |
| 가유 | `gayu` |
| 신규 | 영문 소문자·숫자·`_` (등록 화면에서 확정) |

**id 변경 금지** — 예약·로그인·Storage 경로가 모두 `{id}`에 묶입니다.

---

## 3. Firestore · Storage 경로

```
companies/wawa          companies/gayu          …
reservations/{id}       ← companyId 필드로 구분
Storage/reservations/{companyId}/{예약id}/images/…
```

---

## 4. 제휴업체(사장) — 첫날 안내

1. B2B 로그인 (`https://airpick-reservation.web.app` 또는 localhost:3000)
2. 요금·예약 마감 확인
3. 기사 계정 등록
4. 테스트 예약 1건 처리 연습

---

## 5. 자체 홈이 있는 업체 (와와 등)

- repo·배포 계정은 별도여도 **Firebase projectId는 `airpick-reservation`**
- 예약: `companyId: 'wawa'` (해당 업체 id), `createdBy: 'homepage'`
- 마감: 예약 전 `companies/wawa` 의 `isOpen` / `blockedDates` 확인

---

## 6. B2C만 쓰는 업체

- 자체 홈 불필요
- B2B 등록 → B2C 목록 자동 후보 (`companies` 읽기)
- 고객 예약 `createdBy: 'airpick-b2c'`

---

## 7. 검증 (5분)

1. Console → `reservations` 테스트 문서 → `companyId` 확인  
2. B2B 해당 업체 로그인 → 입고예정  
3. (B2C) localhost:5173 → 업체 카드 노출  

---

B2B 앱 **제휴업체 관리** 화면에 동일 체크리스트 UI가 있습니다.  
체크 상태는 브라우저 `localStorage` (`partner_onboarding_{id}`)에 저장됩니다.
