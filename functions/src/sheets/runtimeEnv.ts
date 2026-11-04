import {
  sheetsArchiveEnabled,
  sheetsServiceAccountJson,
  sheetsSpreadsheetId,
  sheetsWawaSpreadsheetId,
} from './params';

/** 시트 동기화가 읽는 환경값. 예약 트리거와 업체 탭 생성 트리거가 같이 쓴다. */
export function applySheetsRuntimeEnv(): void {
  process.env.SHEETS_ARCHIVE_ENABLED = sheetsArchiveEnabled.value();
  process.env.GOOGLE_SHEETS_SPREADSHEET_ID = sheetsSpreadsheetId.value();
  process.env.GOOGLE_SHEETS_SPREADSHEET_ID_WAWA = sheetsWawaSpreadsheetId.value();
  try {
    process.env.GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON = sheetsServiceAccountJson.value();
  } catch {
    process.env.GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON = '';
  }
}
