/**
 * Normalize 「와와」 tab 업체명/매장 aliases → 「와와」.
 *
 *   export GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON="$(npx -y firebase-tools functions:secrets:access GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON)"
 *   node scripts/normalize-wawa-sheet-names.mjs
 */
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';

const require = createRequire(
  path.join(path.dirname(fileURLToPath(import.meta.url)), '../functions/package.json')
);
const { google } = require('googleapis');

const SPREADSHEET_ID =
  process.env.GOOGLE_SHEETS_SPREADSHEET_ID?.trim() ||
  '1zxxMHH7cJDz_nyCQbPOt2GCHdBtAVY9mzBDnUVV6lTs';
const TAB = '와와';
const CANONICAL = '와와';
const dryRun = process.argv.includes('--dry-run');

// SHEET_HEADERS: 업체명=E(5), 매장=F(6) — 0-based 4,5
const COL_COMPANY_NAME = 4;
const COL_STORE = 5;

function quoteTab(tabName) {
  return `'${String(tabName).replace(/'/g, "''")}'`;
}

function shouldNormalize(value) {
  const s = String(value || '').trim();
  if (!s) return false;
  if (s === CANONICAL) return false;
  return s.includes('와와');
}

async function main() {
  const saJson = process.env.GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON?.trim();
  if (!saJson) throw new Error('Set GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON');

  const auth = new google.auth.GoogleAuth({
    credentials: JSON.parse(saJson),
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  const sheets = google.sheets({ version: 'v4', auth });

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${quoteTab(TAB)}!A:AZ`,
  });
  const values = res.data.values || [];
  if (values.length < 2) {
    console.log('No data rows.');
    return;
  }

  const dataUpdates = [];
  let changed = 0;
  for (let i = 1; i < values.length; i++) {
    const row = values[i] || [];
    const rowNum = i + 1;
    let rowChanged = false;
    const next = [...row];
    while (next.length <= COL_STORE) next.push('');

    if (shouldNormalize(next[COL_COMPANY_NAME])) {
      next[COL_COMPANY_NAME] = CANONICAL;
      rowChanged = true;
    }
    if (shouldNormalize(next[COL_STORE])) {
      next[COL_STORE] = CANONICAL;
      rowChanged = true;
    }
    // Also fill empty 매장 when 업체명/ID looks like wawa
    const id = String(next[3] || '').trim().toLowerCase();
    const name = String(next[COL_COMPANY_NAME] || '').trim();
    if (!String(next[COL_STORE] || '').trim() && (id === 'wawa' || id === 'wawa_valet' || name.includes('와와'))) {
      next[COL_STORE] = CANONICAL;
      rowChanged = true;
    }
    if (name === '' && (id === 'wawa' || id === 'wawa_valet')) {
      next[COL_COMPANY_NAME] = CANONICAL;
      rowChanged = true;
    }

    if (rowChanged) {
      changed += 1;
      dataUpdates.push({
        range: `${quoteTab(TAB)}!A${rowNum}:AZ${rowNum}`,
        values: [next],
      });
    }
  }

  console.log({ tab: TAB, rows: values.length - 1, willUpdate: changed, dryRun });
  if (dryRun || dataUpdates.length === 0) return;

  // batchUpdate in chunks of 100
  for (let i = 0; i < dataUpdates.length; i += 100) {
    const chunk = dataUpdates.slice(i, i + 100);
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: {
        valueInputOption: 'USER_ENTERED',
        data: chunk,
      },
    });
  }
  console.log(`Updated ${changed} rows.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
