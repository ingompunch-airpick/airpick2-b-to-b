# Plan: 업체 앱 예약 불러오기 가볍게 (2년치 실시간 → 필요한 만큼만)

> 2026-11-14 · 계기: 전체 점검 — 앱을 열 때마다 과거 400일 + 미래 400일 예약을 전부 실시간 구독  
> **이 파일이 승인되기 전에는 코드를 쓰지 않는다.**

## 지금 구조 (조사 결과)

- `src/utils/reservationQuery.ts` — `RESERVATION_SYNC_LOOKBACK_DAYS = 400`, `FUTURE_DAYS = 400`  
  본사는 이 기간 **전 업체** 예약, 업체는 자기 업체(10개씩 `in` 묶음) 예약을 `onSnapshot` 실시간 구독.
- `src/hooks/useReservations.ts` — 위 결과를 **배열 하나(`reservations`)**로 만들어 `App.tsx`가 모든 화면에 내려줌.
- 예약 문서는 지우지 않음(`functions/src/retention.ts` `PURGE_RESERVATION_DOCUMENTS = false`) → 매달 쌓임.
- 결과: 앱 시작할 때마다 수천 건 다운로드(Firestore 읽기 비용 = 건수), 폰 메모리·배터리 부담, 첫 화면이 점점 느려짐.
  예약 1건이 바뀔 때마다 배열 전체를 다시 계산하는 화면도 많음.

### 화면별로 실제 필요한 범위

| 화면 | 컴포넌트 | 필요한 예약 |
|------|----------|-------------|
| 배차 보드·타임라인·출차·입고 | `DispatchBoardView`, `TimelineView`, `ParkingDepartureView`, `AdminMode` | **오늘 앞뒤 며칠 + 지금 주차 중인 차** (실시간 필요). 2주보다 먼 날짜를 달력에서 넘기면 그 기간만 추가 조회 |
| 사진·스크래치 | `VehiclePhotosView`, `ScratchUploadView`, `PhotoSearchView` | 최근 + 주차 중 (사진은 출차 14일 뒤 삭제됨) |
| 접수·검색 | `SearchReceptionView` | 최근은 바로, 오래된 건 **검색할 때만** |
| 취소 목록·결제 변경 | `CancelledListView`, `PaymentChangeView` | 최근 몇 달 |
| 통계·장부·이용 이력 | `StatisticsView`, `ReservationLedgerView`, `ServiceHistoryView` | **고른 기간만** (지난 달은 `hqMonthSnapshots` 요약 사용) |
| 본사 유입·제휴 | `HqAcquisitionView`, `AffiliateAdminView` | 고른 기간만 |

## 목표

앱 첫 로딩에 받는 예약 수를 **기간과 무관하게 거의 일정**하게 만든다 (지금의 약 1/30 수준 예상).
현장 화면(배차·입출고)은 지금과 똑같이 실시간으로 동작한다.

## 하지 않음

- 예약 문서 삭제·보관 정책 변경 (별도 결정)
- 화면 디자인 변경
- Functions·알림톡·시트 연동 변경

## 바꾸는 방법

### 1단계 — 실시간 구독을 「현장용」으로 줄이기

1. `reservationQuery.ts` 실시간 기간을 **지난 3일 ~ 앞으로 14일**로 (상수 2개만 변경). 2026-11-14 대표 결정.
2. **「지금 주차 중」 쿼리 추가** — 날짜와 관계없이 `status in ['completed_in', 'request_out']`
   (+ 업체 범위 `companyId in [...]`). 오래 맡긴 차가 기간 밖으로 빠지는 일 방지.
3. 두 결과를 id 기준으로 합쳐 지금처럼 `reservations` 배열 하나로 내려줌 → **현장 화면 코드 수정 없음**.
4. 색인: `firestore.indexes.json`에 `companyId + status` 복합 색인 추가 (본사용 `status` 단일은 자동).

### 2단계 — 오래된 데이터는 「필요할 때 한 번」

5. `src/lib/reservationHistory.ts` 신설: `fetchReservationsByRange(scope, from, to)` — `getDocs` 1회, 화면이 열려 있는 동안만 메모리에 보관.
6. 통계·장부·이용 이력: 화면 상단 기간 선택(이번 달 기본) → 1단계 범위 밖이면 5번으로 추가 조회.
   지난 달 합계는 이미 있는 `hqMonthSnapshots`(월 마감 요약) 사용.
7. 접수·검색(`SearchReceptionView`): 1단계 결과에서 먼저 찾고, 없으면 「이전 예약에서 찾기」 버튼 → 이름·차량번호·전화 끝자리로 서버 조회.
8. 취소 목록·결제 변경: 기본 최근 90일 + 「더 보기」로 이전 달 불러오기.

### 3단계 — 확인·마무리

9. 개발 모드에서 「불러온 예약 수」를 콘솔에 표시해 전·후 비교.
10. `docs/STATUS.md`에 바뀐 범위 기록.

## 위험과 대비

| 위험 | 대비 |
|------|------|
| 기간 밖인데 아직 안 끝난 예약이 안 보임 | 2번 「주차 중」 쿼리 + 출고요청 상태 포함. 배포 전 실데이터로 `완료 아닌 + 기간 밖` 건수 0인지 확인 |
| 통계 숫자가 지금과 달라짐 | 같은 달을 전·후로 비교해서 같을 때만 배포 |
| 새 색인이 만들어지는 동안 쿼리 실패 | 색인 먼저 배포 → 생성 완료 확인 후 앱 배포 |
| 업체가 「예전 예약이 안 보여요」 | 검색·더 보기 버튼 문구를 분명하게, 공지 한 줄 |

## 검증

- [ ] `npx tsc --noEmit` · `npm run build:pages`
- [ ] 본사·업체·직원 계정으로 배차 보드, 입출고, 사진, 통계, 검색 각각 확인 (demo 데이터)
- [ ] 첫 로딩 예약 수 전·후 비교 (콘솔)
- [ ] 통계 한 달치 숫자 전·후 동일

## 순서·배포

1. 색인 배포 (`firebase deploy --only firestore:indexes`) → 생성 완료 대기
2. 1단계 배포 (현장 화면 영향 확인 1~2일)
3. 2단계 배포

## 메모 (사람이 적음)

- 2026-11-14 대표: 실시간 범위 **지난 3일 ~ 앞으로 14일**로 확정. 2주 넘는 미래 예약은 달력에서 넘길 때 불러오기(5번 함수 재사용).
