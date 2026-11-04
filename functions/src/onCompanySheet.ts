import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { sheetsServiceAccountJson } from './sheets/params';
import { applySheetsRuntimeEnv } from './sheets/runtimeEnv';
import { ledgerTargetForCompany } from './sheets/companyLedger';
import { ensureLedgerTab } from './sheets/syncReservation';

/**
 * 새 업체는 전용 파일을 받지 않는다.
 * 서버는 구글 파일을 만들 수 없고, 이미 있는 에어픽 예약장부에 탭만 추가한다.
 * 와와·가유·아시아처럼 파일이 따로 있으면 그 파일에 탭을 만든다.
 */
export const onCompanySheet = onDocumentCreated(
  {
    document: 'companies/{companyId}',
    region: 'asia-northeast3',
    memory: '256MiB',
    timeoutSeconds: 60,
    secrets: [sheetsServiceAccountJson],
  },
  async (event) => {
    const companyId = String(event.params.companyId || '').trim().toLowerCase();
    const data = event.data?.data();
    if (!companyId || !data) return;

    applySheetsRuntimeEnv();
    if (process.env.SHEETS_ARCHIVE_ENABLED !== 'true') return;

    const target = await ledgerTargetForCompany(companyId, data);
    if (!target) return;

    await ensureLedgerTab(
      target.spreadsheetId,
      target.tab,
      process.env.GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON
    );
    console.log('[sheets] company tab ready', { companyId, tab: target.tab });
  }
);
