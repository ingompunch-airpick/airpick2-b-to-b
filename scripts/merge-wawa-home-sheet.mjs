/**
 * One-off: merge Google Sheet tab 「와와홈」 → 「와와」, then delete 「와와홈」.
 *
 * Usage (from repo root):
 *   export GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON="$(npx -y firebase-tools functions:secrets:access GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON)"
 *   node scripts/merge-wawa-home-sheet.mjs
 *
 * Options:
 *   --keep-source   do not delete 「와와홈」 after merge
 *   --dry-run       report only, no writes
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
const SOURCE_TAB = '와와홈';
const TARGET_TAB = '와와';
const dryRun = process.argv.includes('--dry-run');
const keepSource = process.argv.includes('--keep-source');

function quoteTab(tabName) {
  return `'${String(tabName).replace(/'/g, "''")}'`;
}

function padRow(row, width) {
  return Array.from({ length: width }, (_, i) => (row[i] == null ? '' : String(row[i])));
}

async function main() {
  const saJson = process.env.GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON?.trim();
  if (!saJson) {
    throw new Error('Set GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON');
  }

  const auth = new google.auth.GoogleAuth({
    credentials: JSON.parse(saJson),
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  const sheets = google.sheets({ version: 'v4', auth });

  const meta = await sheets.spreadsheets.get({
    spreadsheetId: SPREADSHEET_ID,
    fields: 'sheets.properties(sheetId,title)',
  });
  const tabs = new Map();
  for (const sheet of meta.data.sheets || []) {
    const title = sheet.properties?.title;
    const sheetId = sheet.properties?.sheetId;
    if (title != null && sheetId != null) tabs.set(title, sheetId);
  }

  if (!tabs.has(SOURCE_TAB)) {
    console.log(`Source tab 「${SOURCE_TAB}」 not found — nothing to merge.`);
    console.log('Existing tabs:', [...tabs.keys()].join(', '));
    return;
  }
  if (!tabs.has(TARGET_TAB)) {
    throw new Error(`Target tab 「${TARGET_TAB}」 not found`);
  }

  const [sourceRes, targetRes] = await Promise.all([
    sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${quoteTab(SOURCE_TAB)}!A:AZ`,
    }),
    sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${quoteTab(TARGET_TAB)}!A:AZ`,
    }),
  ]);

  const sourceValues = sourceRes.data.values || [];
  const targetValues = targetRes.data.values || [];
  const targetHeader = targetValues[0] || sourceValues[0] || [];
  const colWidth = Math.max(targetHeader.length, 1);

  const existingIds = new Set();
  for (let i = 1; i < targetValues.length; i++) {
    const id = String(targetValues[i]?.[0] || '').trim();
    if (id) existingIds.add(id);
  }

  const toAppend = [];
  let skippedDup = 0;
  let skippedEmpty = 0;
  for (let i = 1; i < sourceValues.length; i++) {
    const row = sourceValues[i] || [];
    const id = String(row[0] || '').trim();
    if (!id && row.every((c) => String(c || '').trim() === '')) {
      skippedEmpty += 1;
      continue;
    }
    if (id && existingIds.has(id)) {
      skippedDup += 1;
      continue;
    }
    if (id) existingIds.add(id);
    toAppend.push(padRow(row, colWidth));
  }

  console.log({
    spreadsheetId: SPREADSHEET_ID,
    sourceRows: Math.max(0, sourceValues.length - 1),
    targetRowsBefore: Math.max(0, targetValues.length - 1),
    append: toAppend.length,
    skippedDup,
    skippedEmpty,
    dryRun,
    keepSource,
  });

  if (dryRun) {
    console.log('Dry run — no changes written.');
    return;
  }

  if (toAppend.length > 0) {
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: `${quoteTab(TARGET_TAB)}!A:AZ`,
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: toAppend },
    });
    console.log(`Appended ${toAppend.length} rows to 「${TARGET_TAB}」`);
  } else {
    console.log('Nothing new to append.');
  }

  if (!keepSource) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: {
        requests: [
          {
            deleteSheet: {
              sheetId: tabs.get(SOURCE_TAB),
            },
          },
        ],
      },
    });
    console.log(`Deleted tab 「${SOURCE_TAB}」`);
  } else {
    console.log(`Kept source tab 「${SOURCE_TAB}」 (--keep-source)`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
