# Plan: 구글 시트 동기화 — 예약마다 즉시 쓰기 → 10분마다 모아서 쓰기

작성 2026-11-27 · 승인·구현 2026-11-27 (켜기 전까지는 기존 즉시 방식)

## 지금 구조 (문제)
- 예약 문서가 바뀔 때마다(`onReservationSync`) 그 예약 1건을 시트에 바로 씀
  - 탭 확인(`spreadsheets.get`) → 헤더 확인(`values.get`) → 예약ID 열 전체 읽기(`values.get`) → 행 수정/추가(`values.update|append`) → 중복 행 정리
  - **예약 1건 변경 = 시트 API 4~6회 + 예약 문서에 결과 다시 쓰기 1회**
- 하루 흐름: 예약 생성 → 입고 → 입고완료 → 출고요청 → 출고완료 + 사진·메모 수정 → 예약 1건당 변경 5~10번 → 시트 API 20~60회
- 시트 API는 서비스 계정 기준 **분당 요청 수 한도**가 있음(오픈 전 GCP 콘솔 쿼터 화면에서 실제 값 확인). 업체 10곳 → 50곳, 아침·저녁 입출고가 몰리는 시간에 한도에 걸리면 **시트가 늦게·일부만 반영**되고 재시도 대기로 함수가 길어짐
- 동시 변경을 막으려고 예약 문서에 잠금·대기(`sheetsSyncInProgress`, 드레인 라운드)를 둬서 코드가 복잡하고, 예약 문서에 쓰기가 한 번 더 생김

## 바꾸는 구조
1. **예약이 바뀌면 "시트에 써야 함" 표시만** — `sheetSyncQueue/{reservationId}`에 시각만 기록(시트 API 0회)
2. **10분마다 한 번 도는 작업**(동시에 1개만 실행, 간격은 설정값)이 대기열을 모아서 처리 — 진단 보고서(11-26) 권장안
   - 시트·탭별로 묶음 → 탭마다 **예약ID 열 1번 읽기 + 수정은 한 번에(batchUpdate) + 새 행은 한 번에(append)**
   - 예약이 10건이든 100건이든 **탭당 시트 API 2~3회**
   - 같은 예약이 10분 안에 여러 번 바뀌면 **마지막 상태 1번만** 씀
3. 잠금·대기 로직과 예약 문서의 `sheetsArchive` 다시 쓰기 제거 → 예약 문서 쓰기도 줄어듦
4. 실패하면 대기열에 남겨 다음 차례에 다시(3번 실패하면 본사 오류 보고)

## 달라지는 점 (업체가 느끼는 것)
- 시트 반영이 **바로 → 최대 10분 늦게**. 업체 앱·사이트 화면·알림톡은 지금처럼 즉시(시트와 무관)
- 행 위치·열 구성·탭 이름은 그대로(업체 시트 모양 안 바뀜)

## 안전장치
- 설정 `SHEETS_SYNC_MODE` = `instant`(지금) / `batch`(새 방식). 문제 생기면 `instant`로 되돌리고 함수만 재배포
- 처음 1주는 `batch`로 돌리며 본사가 매일 시트와 예약 수를 대조
- 10분 작업: 하루 144회 실행(대부분 대기열 비어 바로 종료)

## 장기 (50곳 이후)
- 시트는 "업체가 보는 사본"으로만. 원본은 Firestore
- 업체별 시트가 필요 없는 업체는 끄고, 본사는 B2B 화면의 엑셀 다운로드로 대체 검토

## 구현 범위 (승인 후)
- `functions/src/sheets/queue.ts`(대기열 표시·꺼내기), `batchSync.ts`(탭별 묶음 쓰기), `onReservationWrite.ts` 분기, 스케줄 함수 `drainSheetsQueue`(10분)
- 2차: 파일을 업체·연도별로 나누고 공용 파일은 본사만(보고서 권장) — 업체 시트 주소가 바뀌므로 업체 공지 후
- `SHEETS_SYNC_MODE` 파라미터, 기존 즉시 방식은 그대로 남김
- 테스트: 탭별 묶음·중복 행·새 탭 생성·실패 재시도 단위 테스트

## 구현 (2026-11-27)
- `functions/src/sheets/batchPlan.ts` — 시트 파일 1개 계획·실행(Firestore 모름). 파일당 시트 API: 탭 목록 1 + (새 탭 1) + 읽기 1 + 고치기 1 + 탭별 추가 1 + (지우기 1)
- `functions/src/sheets/batchSync.ts` — 대기열 `sheetSync/{예약ID}` `{pending, queuedAt, attempts, lastTarget, syncedAt, lastError, lastErrorAt}`
  - 꺼낸 뒤 예약이 또 바뀌면(문서 시각 다름) 완료 표시를 안 함 → 다음 차례에 최신 상태로 다시
  - 3번 연속 실패 → 본사 오류 보고(`errorReports`, 「서버 작업」) 후 1시간마다 재시도
  - 예전 위치는 `lastTarget`(없으면 예약의 `sheetsArchive`)로 알고, 탭·파일이 바뀌면 예전 줄을 지움
  - 묶음 방식은 예약 문서에 `sheetsArchive`·잠금을 쓰지 않음
- `drainSheetsQueue` (asia-northeast3, 10분, 동시 1개). instant로 되돌려도 남은 대기열은 계속 비움
- 즉시 방식 수정: 시트에서 예약ID를 못 찾으면 예전에 저장한 행 번호에 덮어쓰지 않고 새 줄로 추가(다른 예약 줄 덮어쓰기 방지)
- 테스트: `cd functions && npm test` (메모리 가짜 시트, 7개)

## 켜는 법
1. 함수 배포: `npx firebase-tools deploy --only functions:onReservationSync,functions:drainSheetsQueue,functions:dispatchErrorReportsDaily`
2. `functions/.env`에 `SHEETS_SYNC_MODE=batch` 추가 → `functions:onReservationSync`만 다시 배포
3. 1주 동안 매일 시트 줄 수와 예약 수 대조. 문제 → `SHEETS_SYNC_MODE=instant`로 바꾸고 `onReservationSync` 재배포
