import { defineSecret, defineString } from 'firebase-functions/params';

export const sheetsArchiveEnabled = defineString('SHEETS_ARCHIVE_ENABLED', { default: 'false' });
export const sheetsSpreadsheetId = defineString('GOOGLE_SHEETS_SPREADSHEET_ID', {
  default: '1zxxMHH7cJDz_nyCQbPOt2GCHdBtAVY9mzBDnUVV6lTs',
});
export const sheetsWawaSpreadsheetId = defineString('GOOGLE_SHEETS_SPREADSHEET_ID_WAWA', {
  default: '1QHg5Ta1XmAVdRHYeCCArhTVhK7ukn3nvxL2JyW4vC30',
});
export const sheetsServiceAccountJson = defineSecret('GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON');
/** instant = 예약 바뀔 때마다 바로 씀(기존) · batch = 10분마다 모아서 씀(drainSheetsQueue) */
export const sheetsSyncMode = defineString('SHEETS_SYNC_MODE', { default: 'instant' });
