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
  cancelled: boolean;
  source: 'airpick' | 'homepage' | 'onsite';
  companyId: string;
  customerKey: string;
  /** 예약일시. ISO는 한국 날짜로 자른다. */
  createdYmd: string;
  departureYmd: string;
  exitYmd: string;
  scheduledExitYmd: string;
  price: number;
};

export type CompanyMonthStat = {
  reserved: number;
  admitted: number;
  exited: number;
  cancelled: number;
  revenue: number;
  airpick: number;
  homepage: number;
  onsite: number;
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

/**
 * 예전 와와 행은 출차예정 칸에 T1·T2가 있고, 출차 시각은 여행지 칸에 있다.
 * 입차예정일보다 앞선 시각은 출고로 세지 않는다.
 */
function shiftedExitYmd(scheduledRaw: unknown, destinationRaw: unknown, departureYmd: string): string {
  const scheduled = String(scheduledRaw ?? '').trim();
  if (!/^T\d$/i.test(scheduled)) return '';
  if (ymdFromCell(scheduledRaw)) return '';
  const exit = ymdFromCell(destinationRaw);
  if (!exit) return '';
  if (departureYmd && exit < departureYmd) return '';
  return exit;
}

/**
 * 예전 와와 행은 출차예정 칸에 T1·T2가 있고, 예약 시각은 출국항공사 칸에 있다.
 */
function shiftedCreatedYmd(scheduledRaw: unknown, createdRaw: unknown): string {
  const scheduled = String(scheduledRaw ?? '').trim();
  if (!/^T\d$/i.test(scheduled) || ymdFromCell(scheduledRaw)) return '';
  return createdYmdFromCell(createdRaw);
}
function createdYmdFromCell(value: unknown): string {
  const text = String(value ?? '').trim();
  if (/^\d{4}-\d{2}-\d{2}T/.test(text)) {
    const parsed = Date.parse(text);
    if (!Number.isNaN(parsed)) {
      return new Date(parsed + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
    }
  }
  return ymdFromCell(text);
}

function priceFromCell(value: unknown): number {
  const n = Number(String(value ?? '').replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

/** 예전 행은 금액이 입국 터미널 칸에 들어가 있다. 그 숫자만 금액으로 본다. */
function priceFromLedgerCells(amount: unknown, arrivalTerminal: unknown): number {
  const direct = priceFromCell(amount);
  if (direct > 0) return direct;
  const terminal = String(arrivalTerminal ?? '').trim();
  if (!/^\d{5,6}$/.test(terminal)) return direct;
  const n = Number(terminal);
  if (n >= 10000 && n <= 500000) return n;
  return direct;
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
    const cancelled = status === '취소';
    const phone = phoneKey(col(raw, '연락처'));
    const departureYmd = ymdFromCell(col(raw, '입차예정'));
    const scheduledRaw = col(raw, '출차예정');
    const scheduledExitYmd =
      ymdFromCell(scheduledRaw) || shiftedExitYmd(scheduledRaw, col(raw, '여행지'), departureYmd);
    const exitYmd = ymdFromCell(col(raw, '출차일시')) || scheduledExitYmd;
    rows.push({
      id,
      admitted: !cancelled && ADMITTED.has(status),
      booked: !cancelled && BOOKED.has(status),
      settled: !cancelled && status === '출차',
      cancelled,
      source: sourceFromCell(col(raw, '유입')),
      companyId: companyIdFromCell(col(raw, '업체ID'), tabName),
      customerKey: customerKey(phone, col(raw, '고객명'), id),
      createdYmd:
        createdYmdFromCell(col(raw, '예약일시')) || shiftedCreatedYmd(scheduledRaw, col(raw, '출국항공사')),
      departureYmd,
      exitYmd,
      scheduledExitYmd,
      price: priceFromLedgerCells(col(raw, '금액'), col(raw, '입국T')),
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

function uniqueLedgerRows(rows: LedgerRow[]): LedgerRow[] {
  const byId = new Map<string, LedgerRow>();
  for (const row of rows) {
    const prev = byId.get(row.id);
    if (!prev || (prev.cancelled && !row.cancelled)) byId.set(row.id, row);
  }
  return [...byId.values()];
}

function emptyMonthStat(): CompanyMonthStat {
  return {
    reserved: 0,
    admitted: 0,
    exited: 0,
    cancelled: 0,
    revenue: 0,
    airpick: 0,
    homepage: 0,
    onsite: 0,
  };
}

/**
 * 업체 월 실적. 취소가 아닌 행만 예약일시·입차예정·출차예정으로 센다.
 * 취소는 입차예정이 있으면 그달, 없으면 예약일시의 달.
 */
export function companyMonthStats(rows: LedgerRow[]): Record<string, Record<string, CompanyMonthStat>> {
  const byMonth = new Map<string, Map<string, CompanyMonthStat>>();
  const bump = (month: string, companyId: string): CompanyMonthStat | null => {
    if (!/^\d{4}-\d{2}$/.test(month) || !companyId || companyId === 'unknown') return null;
    let companies = byMonth.get(month);
    if (!companies) {
      companies = new Map();
      byMonth.set(month, companies);
    }
    let stat = companies.get(companyId);
    if (!stat) {
      stat = emptyMonthStat();
      companies.set(companyId, stat);
    }
    return stat;
  };

  for (const row of uniqueLedgerRows(rows)) {
    if (row.cancelled) {
      const when = row.departureYmd || row.createdYmd;
      const stat = bump(when.slice(0, 7), row.companyId);
      if (stat) stat.cancelled += 1;
      continue;
    }
    const reserved = bump(row.createdYmd.slice(0, 7), row.companyId);
    if (reserved) reserved.reserved += 1;
    const admitted = bump(row.departureYmd.slice(0, 7), row.companyId);
    if (admitted) {
      admitted.admitted += 1;
      admitted.revenue += row.price;
      if (row.source === 'airpick') admitted.airpick += 1;
      else if (row.source === 'homepage') admitted.homepage += 1;
      else admitted.onsite += 1;
    }
    const exited =
      row.admitted || row.booked
        ? bump(row.scheduledExitYmd.slice(0, 7), row.companyId)
        : null;
    if (exited) exited.exited += 1;
  }

  const result: Record<string, Record<string, CompanyMonthStat>> = {};
  for (const [month, companies] of byMonth) {
    result[month] = Object.fromEntries(companies);
  }
  return result;
}

export function aggregateHqMonthLedger(rows: LedgerRow[], month: string): HqMonthLedger {
  const unique = uniqueLedgerRows(rows).filter((row) => !row.cancelled);
  const reservationCounts = new Map<string, number>();
  for (const row of unique) {
    reservationCounts.set(row.customerKey, (reservationCounts.get(row.customerKey) || 0) + 1);
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

      const returning = (reservationCounts.get(row.customerKey) || 0) >= 2;
      if (returning) result.customerMix.returningBookings += 1;
      else result.customerMix.newBookings += 1;
      if (!seenCustomers.has(row.customerKey)) {
        seenCustomers.add(row.customerKey);
        if (returning) result.customerMix.returningCustomers += 1;
        else result.customerMix.newCustomers += 1;
      }
    }

    const countsAsCheckout = row.settled
      ? row.exitYmd.startsWith(month)
      : (row.booked || row.admitted) && row.scheduledExitYmd.startsWith(month);
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
  const visits: LedgerVisit[] = [];
  for (const row of uniqueLedgerRows(rows)) {
    if (row.cancelled || !(row.admitted || row.booked) || !row.departureYmd) continue;
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
  companyMonths: Record<string, Record<string, CompanyMonthStat>>;
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
  return { months, visits: admittedVisits(rows), companyMonths: companyMonthStats(rows) };
}
