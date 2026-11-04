import * as admin from 'firebase-admin';
import { DEFAULT_SPREADSHEET_ID, WAWA_SPREADSHEET_ID } from './constants';
import { resolveSheetTabName } from './tabName';

const SHARED_LEDGER_SKIP = new Set(['demo', 'airpick']);

const LEDGER_DOC = 'ledger';

function cleanId(value: unknown): string {
  return String(value ?? '').trim().toLowerCase();
}

async function spreadsheetIdForOwner(ownerId: string): Promise<string> {
  if (!ownerId || SHARED_LEDGER_SKIP.has(ownerId)) return '';
  let spreadsheetId = await readCompanyLedgerSpreadsheetId(ownerId);
  if (!spreadsheetId && (ownerId === 'wawa' || ownerId === 'wawa_valet')) {
    spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID_WAWA?.trim() || WAWA_SPREADSHEET_ID;
  }
  if (!spreadsheetId) {
    spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID?.trim() || DEFAULT_SPREADSHEET_ID;
  }
  return spreadsheetId;
}

function ownerIdFromCompany(companyId: string, company: Record<string, unknown>): string {
  const parentId = company.isOperatorPrimary === false ? cleanId(company.parentCompanyId) : '';
  return parentId || companyId;
}

/** 업체 장부 위치. 전용 파일이 없으면 에어픽 예약장부의 업체 탭을 쓴다. */
export async function ledgerTargetForCompany(
  companyId: string,
  company: Record<string, unknown>
): Promise<{ spreadsheetId: string; tab: string } | null> {
  const id = cleanId(companyId);
  if (!id || SHARED_LEDGER_SKIP.has(id)) return null;
  const spreadsheetId = await spreadsheetIdForOwner(ownerIdFromCompany(id, company));
  if (!spreadsheetId) return null;
  return {
    spreadsheetId,
    tab: resolveSheetTabName({
      companyId: id,
      companyName: String(company.name || ''),
    }),
  };
}

/** 대표 업체의 예약 장부 파일. 하위 업체는 대표 업체 파일을 쓴다. */
export async function ledgerTargetForReservation(
  data: Record<string, unknown>
): Promise<{ spreadsheetId: string; tab: string } | null> {
  const companyId = cleanId(data.companyId);
  if (!companyId) return null;

  const companySnap = await admin.firestore().collection('companies').doc(companyId).get();
  const company = companySnap.data() || {};
  const spreadsheetId = await spreadsheetIdForOwner(ownerIdFromCompany(companyId, company));
  if (!spreadsheetId) return null;

  const companyName =
    typeof data.companyName === 'string' && data.companyName.trim()
      ? data.companyName
      : String(company.name || '');
  return {
    spreadsheetId,
    tab: resolveSheetTabName({ companyId, companyName }),
  };
}

export async function readCompanyLedgerSpreadsheetId(companyId: string): Promise<string> {
  const id = cleanId(companyId);
  if (!id) return '';
  const snap = await admin
    .firestore()
    .collection('companies')
    .doc(id)
    .collection('secrets')
    .doc(LEDGER_DOC)
    .get();
  return String(snap.data()?.spreadsheetId || '').trim();
}

export async function saveCompanyLedgerSpreadsheetId(
  companyId: string,
  spreadsheetId: string
): Promise<void> {
  const id = cleanId(companyId);
  const fileId = spreadsheetId.trim();
  if (!id || !fileId) return;
  await admin.firestore().collection('companies').doc(id).collection('secrets').doc(LEDGER_DOC).set(
    { spreadsheetId: fileId, updatedAt: new Date().toISOString() },
    { merge: true }
  );
}

/** 본사 합계가 업체 파일을 빠뜨리지 않도록, 대표 업체 장부 파일 목록. */
export async function listCompanyLedgerSpreadsheetIds(): Promise<string[]> {
  const companies = await admin.firestore().collection('companies').get();
  const ids: string[] = [];
  for (const doc of companies.docs) {
    if (doc.data().isOperatorPrimary === false) continue;
    const id = await readCompanyLedgerSpreadsheetId(doc.id);
    if (id) ids.push(id);
  }
  return ids;
}
