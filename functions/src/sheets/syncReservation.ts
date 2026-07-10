import { google, sheets_v4 } from 'googleapis';
import { DEFAULT_SPREADSHEET_ID, SHEET_HEADERS } from './constants';
import { buildReservationSheetRow } from './reservationRow';
import { resolveSheetTabName } from './tabName';

export interface SheetsArchiveConfig {
  spreadsheetId: string;
  /** 없으면 Cloud Functions 기본 서비스 계정(ADC) 사용 */
  serviceAccountJson?: string;
}

export interface SheetsArchiveMeta {
  spreadsheetId: string;
  tab: string;
  row: number;
  syncedAt: string;
}

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

function parseServiceAccount(json: string): Record<string, unknown> {
  const trimmed = json.trim();
  if (!trimmed) throw new Error('empty service account json');
  return JSON.parse(trimmed) as Record<string, unknown>;
}

function createSheetsClient(serviceAccountJson?: string): sheets_v4.Sheets {
  const auth = serviceAccountJson
    ? new google.auth.GoogleAuth({
        credentials: parseServiceAccount(serviceAccountJson),
        scopes: SCOPES,
      })
    : new google.auth.GoogleAuth({ scopes: SCOPES });
  return google.sheets({ version: 'v4', auth });
}

function parseRowFromUpdatedRange(updatedRange?: string | null): number | null {
  if (!updatedRange) return null;
  const match = updatedRange.match(/![A-Z]+(\d+)(?::|$)/i);
  if (!match?.[1]) return null;
  const row = Number(match[1]);
  return Number.isFinite(row) && row > 0 ? row : null;
}

async function listTabTitles(
  sheets: sheets_v4.Sheets,
  spreadsheetId: string
): Promise<Set<string>> {
  const res = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: 'sheets.properties.title',
  });
  const titles = res.data.sheets?.map((s) => s.properties?.title).filter(Boolean) as string[];
  return new Set(titles || []);
}

async function ensureTabWithHeaders(
  sheets: sheets_v4.Sheets,
  spreadsheetId: string,
  tabName: string
): Promise<void> {
  const tabs = await listTabTitles(sheets, spreadsheetId);
  if (!tabs.has(tabName)) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [
          {
            addSheet: {
              properties: { title: tabName },
            },
          },
        ],
      },
    });
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `'${tabName.replace(/'/g, "''")}'!A1`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [Array.from(SHEET_HEADERS)],
      },
    });
    return;
  }

  const headerRes = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `'${tabName.replace(/'/g, "''")}'!A1:A1`,
  });
  const firstCell = headerRes.data.values?.[0]?.[0];
  if (!firstCell) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `'${tabName.replace(/'/g, "''")}'!A1`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [Array.from(SHEET_HEADERS)],
      },
    });
  }
}

function quoteTab(tabName: string): string {
  return `'${tabName.replace(/'/g, "''")}'`;
}

async function appendReservationRow(
  sheets: sheets_v4.Sheets,
  spreadsheetId: string,
  tabName: string,
  rowValues: string[]
): Promise<number> {
  await ensureTabWithHeaders(sheets, spreadsheetId, tabName);

  const res = await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${quoteTab(tabName)}!A:U`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: {
      values: [rowValues],
    },
  });

  const row = parseRowFromUpdatedRange(res.data.updates?.updatedRange);
  if (!row) {
    throw new Error(`could not parse appended row from ${res.data.updates?.updatedRange}`);
  }
  return row;
}

async function updateReservationRow(
  sheets: sheets_v4.Sheets,
  spreadsheetId: string,
  tabName: string,
  rowNumber: number,
  rowValues: string[]
): Promise<void> {
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${quoteTab(tabName)}!A${rowNumber}:U${rowNumber}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [rowValues],
    },
  });
}

const SYNC_SKIP_FIELDS = new Set(['sheetsArchive', 'alimtalkSent', 'updatedAt', 'updatedBy']);

export function shouldSyncReservationToSheets(
  before: Record<string, unknown> | undefined,
  after: Record<string, unknown> | undefined
): boolean {
  if (!after) return false;
  if (!before) return true;

  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const key of keys) {
    if (SYNC_SKIP_FIELDS.has(key)) continue;
    if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) return true;
  }
  return false;
}

export function buildSheetsConfigFromEnv(): SheetsArchiveConfig | null {
  if (process.env.SHEETS_ARCHIVE_ENABLED !== 'true') return null;

  const serviceAccountJson = process.env.GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON?.trim();

  return {
    spreadsheetId: process.env.GOOGLE_SHEETS_SPREADSHEET_ID?.trim() || DEFAULT_SPREADSHEET_ID,
    ...(serviceAccountJson ? { serviceAccountJson } : {}),
  };
}

export async function syncReservationToSheets(
  reservationId: string,
  data: Record<string, unknown>,
  config: SheetsArchiveConfig
): Promise<SheetsArchiveMeta | null> {
  const sheets = createSheetsClient(config.serviceAccountJson || undefined);
  const tabName = resolveSheetTabName(data);
  const rowValues = buildReservationSheetRow(reservationId, data);

  const existing = data.sheetsArchive as SheetsArchiveMeta | undefined;
  const sameSpreadsheet =
    existing?.spreadsheetId === config.spreadsheetId && existing?.tab === tabName;

  let rowNumber = sameSpreadsheet ? existing?.row : undefined;

  if (rowNumber && rowNumber > 0) {
    await updateReservationRow(sheets, config.spreadsheetId, tabName, rowNumber, rowValues);
  } else {
    rowNumber = await appendReservationRow(sheets, config.spreadsheetId, tabName, rowValues);
  }

  return {
    spreadsheetId: config.spreadsheetId,
    tab: tabName,
    row: rowNumber,
    syncedAt: new Date().toISOString(),
  };
}
