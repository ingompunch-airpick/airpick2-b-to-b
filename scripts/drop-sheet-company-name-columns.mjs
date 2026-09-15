/**
 * Remove redundant columns 업체명(E) · 매장(F) after header schema change.
 *
 *   export GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON="$(npx -y firebase-tools functions:secrets:access GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON)"
 *   node scripts/drop-sheet-company-name-columns.mjs
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
const dryRun = process.argv.includes('--dry-run');

async function main() {
  const saJson = process.env.GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON?.trim();
  if (!saJson) throw new Error('Set GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON');

  const auth = new google.auth.GoogleAuth({
    credentials: JSON.parse(saJson),
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  const sheets = google.sheets({ version: 'v4', auth });

  const meta = await sheets.spreadsheets.get({
    spreadsheetId: SPREADSHEET_ID,
    fields: 'sheets.properties(sheetId,title)',
  });

  const requests = [];
  for (const sheet of meta.data.sheets || []) {
    const title = sheet.properties?.title;
    const sheetId = sheet.properties?.sheetId;
    if (!title || sheetId == null) continue;

    const headerRes = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `'${title.replace(/'/g, "''")}'!1:1`,
    });
    const h = headerRes.data.values?.[0] || [];
    const e = String(h[4] || '').trim();
    const f = String(h[5] || '').trim();
    if (e !== '업체명' || f !== '매장') {
      console.log(`skip 「${title}」 — headers E/F = ${e} / ${f}`);
      continue;
    }
    console.log(`drop E+F on 「${title}」`);
    // F then E (0-based column index)
    for (const colIndex of [5, 4]) {
      requests.push({
        deleteDimension: {
          range: {
            sheetId,
            dimension: 'COLUMNS',
            startIndex: colIndex,
            endIndex: colIndex + 1,
          },
        },
      });
    }
  }

  console.log({ dryRun, requestCount: requests.length });
  if (dryRun || requests.length === 0) return;

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SPREADSHEET_ID,
    requestBody: { requests },
  });
  console.log('Done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
