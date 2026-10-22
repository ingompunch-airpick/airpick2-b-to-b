import * as admin from 'firebase-admin';
import {
  loadHqLedgerBundle,
  type CompanyMonthStat,
  type HqMonthLedger,
} from './sheets/hqMonthLedger';
import {
  sheetsServiceAccountJson,
  sheetsSpreadsheetId,
  sheetsWawaSpreadsheetId,
} from './sheets/params';
import { normalizePhoneDigits } from './customerVisit';

/** 스냅샷 전에는 지우지 않으므로, 예전 90일 안이면 그달 예약이 아직 온전하다. */
const DATA_STILL_COMPLETE_DAYS = 90;

type ResDoc = {
  id: string;
  status: string;
  createdYmd: string;
  cancelledYmd: string;
  departureYmd: string;
  arrivalYmd: string;
  exitYmd: string;
  companyId: string;
  customerKey: string;
  source: 'airpick' | 'homepage' | 'onsite';
  price: number;
};

function ymd(value: unknown): string {
  const text = String(value ?? '').trim();
  const match = text.match(/(\d{4})\D*(\d{2})\D*(\d{2})/);
  if (!match) return '';
  return `${match[1]}-${match[2]}-${match[3]}`;
}

function kstYmd(value: unknown): string {
  const text = String(value ?? '').trim();
  if (!text) return '';
  if (/^\d{4}-\d{2}-\d{2}T/.test(text)) {
    const parsed = Date.parse(text);
    if (!Number.isNaN(parsed)) {
      return new Date(parsed + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
    }
  }
  return ymd(text);
}

function addDays(ymdText: string, days: number): string {
  const [y, m, d] = ymdText.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return date.toISOString().slice(0, 10);
}

function kstToday(): string {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1 + delta, 1));
  return date.toISOString().slice(0, 7);
}

function monthEnd(month: string): string {
  return addDays(shiftMonth(month, 1) + '-01', -1);
}

/** 그달 1일 출차분이 아직 앱에 있으면 파이어베이스로 합계를 만든다. */
function monthStillInFirestore(month: string, today: string): boolean {
  return addDays(`${month}-01`, DATA_STILL_COMPLETE_DAYS) > today;
}

function statusOf(value: unknown): string {
  const raw = String(value ?? '').trim();
  const aliases: Record<string, string> = {
    pending: 'pending',
    입고예정: 'pending',
    예약완료: 'pending',
    접수: 'pending',
    입고대기: 'pending',
    pending_in: 'pending_in',
    입고요청: 'pending_in',
    request_out: 'request_out',
    출고요청: 'request_out',
    completed_in: 'completed_in',
    주차완료: 'completed_in',
    출고예정: 'completed_in',
    completed_out: 'completed_out',
    인도완료: 'completed_out',
    출차완료: 'completed_out',
    cancelled: 'cancelled',
    취소: 'cancelled',
  };
  return aliases[raw] || aliases[raw.toLowerCase()] || 'pending';
}

function phoneKey(value: unknown): string {
  const digits = normalizePhoneDigits(value);
  return digits.length >= 10 && digits.startsWith('01') ? `p:${digits}` : '';
}

function companyIdOf(data: Record<string, unknown>): string {
  const id = String(data.companyId ?? '').trim().toLowerCase();
  const name = String(data.companyName ?? '');
  if (
    id === 'wawa' ||
    id === 'wawa_valet' ||
    name.toLowerCase().includes('wawa') ||
    name.includes('와와')
  ) {
    return 'wawa';
  }
  return id || 'unknown';
}

function sourceOf(data: Record<string, unknown>): ResDoc['source'] {
  const created = String(data.createdBy ?? '').trim().toLowerCase();
  if (created === 'homepage') return 'homepage';
  if (created === 'airpick-b2c' || created === 'airpick_b2c') return 'airpick';
  return 'onsite';
}

function toRes(id: string, data: Record<string, unknown>): ResDoc {
  const exit = ymd(data.actualExitTime) || ymd(data.arrivalDate);
  const phone = phoneKey(data.phone);
  const name = String(data.userName ?? '').trim().toLowerCase();
  const status = statusOf(data.status);
  return {
    id,
    status,
    createdYmd: kstYmd(data.createdAt),
    cancelledYmd: status === 'cancelled' ? kstYmd(data.cancelledAt) || kstYmd(data.updatedAt) : '',
    departureYmd: ymd(data.departureDate),
    arrivalYmd: ymd(data.arrivalDate),
    exitYmd: exit,
    companyId: companyIdOf(data),
    customerKey: phone || (name ? `n:${name}` : `id:${id}`),
    source: sourceOf(data),
    price: Number(data.totalPrice) || 0,
  };
}

function countsAsIntake(row: ResDoc, month: string): boolean {
  return row.status !== 'cancelled' && row.departureYmd.startsWith(month);
}

function countsAsCheckout(row: ResDoc, month: string): boolean {
  if (row.status === 'cancelled') return false;
  if (row.status === 'completed_out') return row.exitYmd.startsWith(month);
  if (row.status === 'pending' || row.status === 'pending_in' || row.status === 'completed_in' || row.status === 'request_out') {
    return row.arrivalYmd.startsWith(month);
  }
  return false;
}

export function aggregateReservationMonth(rows: ResDoc[], month: string): HqMonthLedger {
  const reservationCounts = new Map<string, number>();
  for (const row of rows) {
    if (row.status === 'cancelled' || !row.customerKey) continue;
    reservationCounts.set(row.customerKey, (reservationCounts.get(row.customerKey) || 0) + 1);
  }

  const companies = new Map<string, HqMonthLedger['companies'][number]>();
  const ensure = (id: string) => {
    let row = companies.get(id);
    if (!row) {
      row = { id, airpick: 0, homepage: 0, onsite: 0, total: 0, revenue: 0, settled: 0, settledRevenue: 0 };
      companies.set(id, row);
    }
    return row;
  };

  const result: HqMonthLedger = {
    month,
    admittedCount: 0,
    admittedRevenue: 0,
    settledCount: 0,
    settledRevenue: 0,
    sources: { airpick: 0, other: 0 },
    customerMix: { newCustomers: 0, returningCustomers: 0, newBookings: 0, returningBookings: 0 },
    companies: [],
  };
  const seen = new Set<string>();

  for (const row of rows) {
    if (countsAsIntake(row, month)) {
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
      if (!seen.has(row.customerKey)) {
        seen.add(row.customerKey);
        if (returning) result.customerMix.returningCustomers += 1;
        else result.customerMix.newCustomers += 1;
      }
    }
    if (countsAsCheckout(row, month)) {
      result.settledCount += 1;
      result.settledRevenue += row.price;
      const company = ensure(row.companyId);
      company.settled += 1;
      company.settledRevenue += row.price;
    }
  }

  result.companies = [...companies.values()].sort(
    (a, b) => b.settled - a.settled || b.airpick - a.airpick || b.total - a.total
  );
  return result;
}

async function queryRange(
  field: string,
  start: string,
  end: string
): Promise<Map<string, ResDoc>> {
  const snap = await admin.firestore().collection('reservations').where(field, '>=', start).where(field, '<=', end).get();
  const rows = new Map<string, ResDoc>();
  for (const doc of snap.docs) {
    rows.set(doc.id, toRes(doc.id, doc.data() as Record<string, unknown>));
  }
  return rows;
}

async function reservationsForMonth(month: string): Promise<ResDoc[]> {
  const start = `${month}-01`;
  const end = monthEnd(month);
  const priorStart = addDays(start, -240);
  const groups = await Promise.all([
    queryRange('departureDate', priorStart, end),
    queryRange('arrivalDate', start, end),
    queryRange('createdAt', `${addDays(start, -1)}T00:00:00.000Z`, `${addDays(end, 2)}T00:00:00.000Z`),
    queryRange('cancelledAt', start, `${end}T99`),
  ]);
  const byId = new Map<string, ResDoc>();
  for (const group of groups) {
    for (const [id, row] of group) byId.set(id, row);
  }
  return [...byId.values()];
}

function companyStatsFromReservations(rows: ResDoc[], month: string): Record<string, CompanyMonthStat> {
  const companies = new Map<string, CompanyMonthStat>();
  const ensure = (id: string) => {
    let stat = companies.get(id);
    if (!stat) {
      stat = { reserved: 0, admitted: 0, exited: 0, cancelled: 0, revenue: 0, airpick: 0, homepage: 0, onsite: 0 };
      companies.set(id, stat);
    }
    return stat;
  };
  for (const row of rows) {
    if (!row.companyId || row.companyId === 'unknown') continue;
    if (row.status === 'cancelled') {
      if (row.cancelledYmd.startsWith(month)) ensure(row.companyId).cancelled += 1;
      continue;
    }
    if (row.createdYmd.startsWith(month)) ensure(row.companyId).reserved += 1;
    if (row.departureYmd.startsWith(month)) {
      const stat = ensure(row.companyId);
      stat.admitted += 1;
      stat.revenue += row.price;
      if (row.source === 'airpick') stat.airpick += 1;
      else if (row.source === 'homepage') stat.homepage += 1;
      else stat.onsite += 1;
    }
    if (row.arrivalYmd.startsWith(month)) ensure(row.companyId).exited += 1;
  }
  return Object.fromEntries(companies);
}

async function writeCompanyMonthDocs(
  month: string,
  companies: Record<string, CompanyMonthStat>,
  source: 'firestore' | 'sheet'
): Promise<void> {
  const frozenAt = new Date().toISOString();
  const batch = admin.firestore().batch();
  let count = 0;
  for (const [id, stat] of Object.entries(companies)) {
    if (!id || id === 'unknown') continue;
    if (!stat.reserved && !stat.admitted && !stat.exited && !stat.cancelled && !stat.revenue) continue;
    const ref = admin.firestore().collection('companyMonthSnapshots').doc(id).collection('months').doc(month);
    batch.set(
      ref,
      {
        month,
        reserved: stat.reserved,
        admitted: stat.admitted,
        settled: stat.exited,
        cancelled: stat.cancelled,
        revenue: stat.revenue,
        airpick: stat.airpick,
        homepage: stat.homepage,
        onsite: stat.onsite,
        source,
        frozenAt,
      },
      { merge: true }
    );
    count += 1;
  }
  if (count) await batch.commit();
}

async function writeSnapshot(month: string, ledger: HqMonthLedger, source: 'firestore' | 'sheet'): Promise<void> {
  await admin.firestore().collection('hqMonthSnapshots').doc(month).set({
    ...ledger,
    source,
    frozenAt: new Date().toISOString(),
  });
}

/** 이번달을 빼고, 없는 지난달만 남긴다. 아직 앱에 있는 달은 앱에서, 지워진 달은 시트에서 한 번. */
export async function freezePastHqMonths(): Promise<{ wrote: string[] }> {
  const today = kstToday();
  const current = today.slice(0, 7);
  const existing = await admin.firestore().collection('hqMonthSnapshots').get();
  const have = new Set(existing.docs.map((doc) => doc.id));

  const wrote: string[] = [];
  let sheetMonths: Record<string, HqMonthLedger> | null = null;
  let sheetCompanyMonths: Record<string, Record<string, CompanyMonthStat>> | null = null;
  const metaRef = admin.firestore().collection('hqMonthSnapshots').doc('_meta');
  const meta = await metaRef.get();
  const sheetAlreadyCopied = meta.data()?.sheetBackfill === true;

  const ensureSheet = async () => {
    if (sheetMonths) return sheetMonths;
    let serviceAccountJson = '';
    try {
      serviceAccountJson = sheetsServiceAccountJson.value();
    } catch {
      serviceAccountJson = '';
    }
    const bundle = await loadHqLedgerBundle({
      spreadsheetId: sheetsSpreadsheetId.value(),
      wawaSpreadsheetId: sheetsWawaSpreadsheetId.value(),
      ...(serviceAccountJson ? { serviceAccountJson } : {}),
    });
    sheetMonths = bundle.months;
    sheetCompanyMonths = bundle.companyMonths;
    return sheetMonths;
  };

  const candidates = new Set<string>();
  candidates.add(shiftMonth(current, -1));
  for (let i = 1; i <= 4; i += 1) {
    const month = shiftMonth(current, -i);
    if (monthStillInFirestore(month, today)) candidates.add(month);
  }
  if (!sheetAlreadyCopied) {
    try {
      for (const month of Object.keys(await ensureSheet())) candidates.add(month);
    } catch (error) {
      console.error('[freezePastHqMonths] sheet list failed', error);
    }
  }

  for (const month of [...candidates].sort()) {
    if (!/^\d{4}-\d{2}$/.test(month) || month >= current || have.has(month)) continue;
    if (monthStillInFirestore(month, today)) {
      const rows = await reservationsForMonth(month);
      await writeSnapshot(month, aggregateReservationMonth(rows, month), 'firestore');
      await writeCompanyMonthDocs(month, companyStatsFromReservations(rows, month), 'firestore');
    } else {
      const months = await ensureSheet();
      const ledger = months[month];
      if (!ledger) continue;
      await writeSnapshot(month, ledger, 'sheet');
      const companies = sheetCompanyMonths?.[month];
      if (companies) await writeCompanyMonthDocs(month, companies, 'sheet');
    }
    wrote.push(month);
  }
  if (sheetMonths) {
    await metaRef.set({ sheetBackfill: true, at: new Date().toISOString() }, { merge: true });
  }
  return { wrote };
}
