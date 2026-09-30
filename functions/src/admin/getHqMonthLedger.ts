import { onCall } from 'firebase-functions/v2/https';
import { assertPlatformAdmin } from './assertPlatformAdmin';
import { loadHqLedgerBundle } from '../sheets/hqMonthLedger';
import {
  sheetsServiceAccountJson,
  sheetsSpreadsheetId,
  sheetsWawaSpreadsheetId,
} from '../sheets/params';

/** 본사 월간 — 구글 시트 장부. 출차 후 앱에서 지운 예약도 포함한다. */
export const getHqMonthLedger = onCall(
  {
    region: 'us-central1',
    memory: '512MiB',
    timeoutSeconds: 120,
    secrets: [sheetsServiceAccountJson],
  },
  async (request) => {
    assertPlatformAdmin(request);

    let serviceAccountJson = '';
    try {
      serviceAccountJson = sheetsServiceAccountJson.value();
    } catch {
      serviceAccountJson = '';
    }

    return loadHqLedgerBundle({
      spreadsheetId: sheetsSpreadsheetId.value(),
      wawaSpreadsheetId: sheetsWawaSpreadsheetId.value(),
      ...(serviceAccountJson ? { serviceAccountJson } : {}),
    });
  }
);
