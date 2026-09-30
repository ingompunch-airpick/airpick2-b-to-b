import { google, sheets_v4 } from 'googleapis';
import { SHEET_LAST_COLUMN } from './constants';

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

const ADMITTED = new Set(['입고', '출고요청', '출차']);
const BOOKED = new Set(['예약', '입고요청']);
const WAWA_IDS = new Set(['wawa', 'wawa_valet', '와와', '와와발렛']);

export type HqLedgerCompany = {
  id: string;
  airpick: number;
  homepage: number;
  onsite: number;
  total: number;
  revenue: number;
  settled: number;
  settledRevenue: number;
};

export type HqMonthLedger = {
  month: string;
  admittedCount: number;
  admittedRevenue: number;
  settledCount: number;
  settledRevenue: number;
  sources: {
    airpick: number;
    other: number;
  };
  customerMix: {
    newCustomers: number;
    returningCustomers: number;
    newBookings: number;
    returningBookings: number;
  };
  companies: HqLedgerCompany[];
};

type LedgerRow = {
  id: string;
  admitted: boolean;
  /** 예약·입고요청. 아직 입고 전이다. */
  booked: boolean;
  settled: boolean;
  source: 'airpick' | 'homepage' | 'onsite';
  companyId: string;
  customerKey: string;
  departureYmd: string;
  exitYmd: string;
  scheduledExitYmd: string;
  price: number;
};

function quoteTab(tabName: string): string {
  return `'${tabName.replace(/'/g, "''")}'`;
}

function ymdFromCell(value: unknown): string {
  const text = String(value ?? '').trim();
  if (!text || text === '-') return '';
  const yearFirst = text.match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/);
  if (yearFirst) {
    return `${yearFirst[1]}-${yearFirst[2].padStart(2, '0')}-${yearFirst[3].padStart(2, '0')}`;
  }
  const monthFirst = text.match(/(\d{1,2})\D+(\d{1,2})\D+(\d{4})/);
  if (monthFirst) {
    return `${monthFirst[3]}-${monthFirst[1].padStart(2, '0')}-${monthFirst[2].padStart(2, '0')}`;
  }
  return '';
}

function priceFromCell(value: unknown): number {
  const n = Number(String(value ?? '').replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

/** 엑셀이 010 앞자리를 지우면 10자리 10… 이 된다. 앱의 010… 과 같은 번호로 맞춘다. */
function phoneKey(value: unknown): string {
  let digits = String(value ?? '').replace(/\D/g, '');
  if (digits.startsWith('82')) digits = `0${digits.slice(2)}`;
  if (digits.length === 10 && digits.startsWith('10')) digits = `0${digits}`;
  return digits.length >= 10 ? digits : '';
}

function companyIdFromCell(value: unknown, tabName: string): string {
  const id = String(value ?? '').trim().toLowerCase();
  if (id && id !== '-') {
    if (WAWA_IDS.has(id)) return 'wawa';
    return id;
  }
  if (tabName === '와와') return 'wawa';
  if (tabName === '가유') return 'gayu';
  if (tabName === '시즌') return 'season';
  if (tabName === '안녕') return 'hi';
  return 'unknown';
}

function sourceFromCell(value: unknown): LedgerRow['source'] {
  const label = String(value ?? '').trim();
  if (label === '에어픽') return 'airpick';
  if (label === '홈페이지') return 'homepage';
  return 'onsite';
}

function customerKey(phone: string, name: unknown, id: string): string {
  if (phone) return `p:${phone}`;
  const trimmed = String(name ?? '').trim().toLowerCase();
  if (trimmed && trimmed !== '-') return `n:${trimmed}`;
  return `id:${id}`;
}

export function ledgerRowsFromSheetValues(values: unknown[][], tabName = ''): LedgerRow[] {
  if (!values.length) return [];
  const header = (values[0] || []).map((cell) => String(cell ?? '').trim());
  const index = (name: string) => header.indexOf(name);
  const idCol = index('예약ID');
  const statusCol = index('상태');
  if (idCol < 0 || statusCol < 0) return [];

  const col = (row: unknown[], name: string): unknown => {
    const at = index(name);
    return at < 0 ? '' : row[at];
  };

  const rows: LedgerRow[] = [];
  for (const raw of values.slice(1)) {
    if (!Array.isArray(raw)) continue;
    const id = String(col(raw, '예약ID') ?? '').trim();
    if (!id || id === '예약ID') continue;
    const status = String(col(raw, '상태') ?? '').trim();
    if (status === '취소') continue;
    const phone = phoneKey(col(raw, '연락처'));
    const exitYmd = ymdFromCell(col(raw, '출차일시')) || ymdFromCell(col(raw, '출차예정'));
    rows.push({
      id,
      admitted: ADMITTED.has(status),
      booked: BOOKED.has(status),
      settled: status === '출차',
      source: sourceFromCell(col(raw, '유입')),
      companyId: companyIdFromCell(col(raw, '업체ID'), tabName),
      customerKey: customerKey(phone, col(raw, '고객명'), id),
      departureYmd: ymdFromCell(col(raw, '입차예정')),
      exitYmd,
      scheduledExitYmd: ymdFromCell(col(raw, '출차예정')),
      price: priceFromCell(col(raw, '금액')),
    });
  }
  return rows;
}

function emptyCompany(id: string): HqLedgerCompany {
  return {
    id,
    airpick: 0,
    homepage: 0,
    onsite: 0,
    total: 0,
    revenue: 0,
    settled: 0,
    settledRevenue: 0,
  };
}

export function aggregateHqMonthLedger(rows: LedgerRow[], month: string): HqMonthLedger {
  const byId = new Map<string, LedgerRow>();
  for (const row of rows) {
    if (!byId.has(row.id)) byId.set(row.id, row);
  }
  const unique = [...byId.values()];
  const monthStart = `${month}-01`;

  const before = new Set<string>();
  for (const row of unique) {
    if (!row.admitted || !row.departureYmd || row.departureYmd >= monthStart) continue;
    before.add(row.customerKey);
  }

  const result: HqMonthLedger = {
    month,
    admittedCount: 0,
    admittedRevenue: 0,
    settledCount: 0,
    settledRevenue: 0,
    sources: { airpick: 0, other: 0 },
    customerMix: {
      newCustomers: 0,
      returningCustomers: 0,
      newBookings: 0,
      returningBookings: 0,
    },
    companies: [],
  };

  const companies = new Map<string, HqLedgerCompany>();
  const seenCustomers = new Set<string>();
  const ensure = (id: string) => {
    let row = companies.get(id);
    if (!row) {
      row = emptyCompany(id);
      companies.set(id, row);
    }
    return row;
  };

  for (const row of unique) {
    if ((row.admitted || row.booked) && row.departureYmd.startsWith(month)) {
      result.admittedCount += 1;
      result.admittedRevenue += row.price;
      if (row.source === 'airpick') result.sources.airpick += 1;
      else result.sources.other += 1;

      const company = ensure(row.companyId);
      company.total += 1;
      company.revenue += row.price;
      if (row.source === 'airpick') company.airpick += 1;
      else if (row.source === 'homepage') company.homepage += 1;
      else company.onsite += 1;

      const returning = before.has(row.customerKey);
      if (returning) result.customerMix.returningBookings += 1;
      else result.customerMix.newBookings += 1;
      if (!seenCustomers.has(row.customerKey)) {
        seenCustomers.add(row.customerKey);
        if (returning) result.customerMix.returningCustomers += 1;
        else result.customerMix.newCustomers += 1;
      }
    }

    const countsAsCheckout =
      (row.settled && row.exitYmd.startsWith(month)) ||
      (row.booked && row.scheduledExitYmd.startsWith(month));
    if (countsAsCheckout) {
      result.settledCount += 1;
      result.settledRevenue += row.price;
      ensure(row.companyId).settled += 1;
      ensure(row.companyId).settledRevenue += row.price;
    }
  }

  result.companies = [...companies.values()].sort(
    (a, b) => b.settled - a.settled || b.airpick - a.airpick || b.total - a.total || a.id.localeCompare(b.id, 'ko')
  );
  return result;
}

function sheetsClient(serviceAccountJson?: string): sheets_v4.Sheets {
  const auth = serviceAccountJson
    ? new google.auth.GoogleAuth({
        credentials: JSON.parse(serviceAccountJson) as Record<string, unknown>,
        scopes: SCOPES,
      })
    : new google.auth.GoogleAuth({ scopes: SCOPES });
  return google.sheets({ version: 'v4', auth });
}

export type LedgerVisit = { k: string; d: string; a?: boolean };

const ROW_CACHE_MS = 10 * 60 * 1000;
let rowCache: { key: string; at: number; rows: LedgerRow[] } | null = null;

async function readSpreadsheetRows(
  sheets: sheets_v4.Sheets,
  spreadsheetId: string
): Promise<LedgerRow[]> {
  const meta = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: 'sheets.properties.title',
  });
  const titles = (meta.data.sheets || [])
    .map((sheet) => sheet.properties?.title || '')
    .filter(Boolean);
  if (!titles.length) return [];

  const res = await sheets.spreadsheets.values.batchGet({
    spreadsheetId,
    ranges: titles.map((title) => `${quoteTab(title)}!A:${SHEET_LAST_COLUMN}`),
  });
  const rows: LedgerRow[] = [];
  (res.data.valueRanges || []).forEach((range, index) => {
    rows.push(...ledgerRowsFromSheetValues(range.values || [], titles[index] || ''));
  });
  return rows;
}

export function admittedVisits(rows: LedgerRow[]): LedgerVisit[] {
  const byId = new Map<string, LedgerRow>();
  for (const row of rows) {
    if (!byId.has(row.id)) byId.set(row.id, row);
  }
  const visits: LedgerVisit[] = [];
  for (const row of byId.values()) {
    if (!(row.admitted || row.booked) || !row.departureYmd) continue;
    visits.push({ k: row.customerKey, d: row.departureYmd, a: row.admitted });
  }
  return visits;
}

function monthsInRows(rows: LedgerRow[]): string[] {
  const months = new Set<string>();
  for (const row of rows) {
    if (row.departureYmd.length >= 7) months.add(row.departureYmd.slice(0, 7));
    if (row.exitYmd.length >= 7) months.add(row.exitYmd.slice(0, 7));
  }
  return [...months];
}

export type HqLedgerBundle = {
  months: Record<string, HqMonthLedger>;
  visits: LedgerVisit[];
};

export async function loadHqLedgerBundle(config: {
  spreadsheetId: string;
  wawaSpreadsheetId: string;
  serviceAccountJson?: string;
}): Promise<HqLedgerBundle> {
  const cacheKey = `${config.spreadsheetId}|${config.wawaSpreadsheetId}`;
  let rows = rowCache && rowCache.key === cacheKey && Date.now() - rowCache.at < ROW_CACHE_MS
    ? rowCache.rows
    : null;
  if (!rows) {
    const sheets = sheetsClient(config.serviceAccountJson);
    const ids = [config.spreadsheetId, config.wawaSpreadsheetId].filter(
      (id, index, all) => id && all.indexOf(id) === index
    );
    const groups = await Promise.all(ids.map((id) => readSpreadsheetRows(sheets, id)));
    rows = groups.flat();
    rowCache = { key: cacheKey, at: Date.now(), rows };
  }
  const months: Record<string, HqMonthLedger> = {};
  for (const month of monthsInRows(rows)) {
    months[month] = aggregateHqMonthLedger(rows, month);
  }
  return { months, visits: admittedVisits(rows) };
}
