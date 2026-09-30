import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase';
import { ensurePlatformAdminAuth } from './firebaseAuth';
import type { Company, Reservation } from '../types';
import { formatPartnerDisplayName } from '../utils/companyDisplay';
import { normalizeDateString } from '../utils/reservationNormalize';
import { isAdmitted } from '../utils/reservationStatus';

export type HqLedgerCompany = {
  id: string;
  name: string;
  airpick: number;
  homepage: number;
  onsite: number;
  total: number;
  revenue: number;
  settled: number;
  settledRevenue: number;
  settledRevenueLabel?: string;
  airpickRevenue: number;
  homepageRevenue: number;
};

export type HqMonthLedger = {
  month: string;
  admittedCount: number;
  admittedRevenue: number;
  settledCount: number;
  settledRevenue: number;
  sources: { airpick: number; other: number };
  customerMix: {
    newCustomers: number;
    returningCustomers: number;
    newBookings: number;
    returningBookings: number;
  };
  companies: HqLedgerCompany[];
};

type RawLedger = Omit<HqMonthLedger, 'companies'> & {
  companies: Omit<HqLedgerCompany, 'name' | 'airpickRevenue' | 'homepageRevenue'>[];
};

export type LedgerVisit = { k: string; d: string; a?: boolean };

export type HqLedgerBundle = {
  months: Record<string, RawLedger>;
  visits: LedgerVisit[];
};

const NAME_FALLBACK: Record<string, string> = {
  gayu: '가유',
  hi: '안녕',
  season: '시즌',
  wawa: '와와발렛',
};

function companyName(companyId: string, companies: Company[]): string {
  const found = companies.find((company) => (company.id || '').toLowerCase() === companyId);
  const named = formatPartnerDisplayName(found?.name, companyId);
  if (named && named !== companyId) return named;
  return NAME_FALLBACK[companyId] || named || companyId;
}

function namedCompanies(data: RawLedger | undefined, companies: Company[]): HqLedgerCompany[] {
  const byId = new Map((data?.companies || []).map((row) => [row.id, row]));
  const seen = new Set<string>();
  const rows: HqLedgerCompany[] = [];

  for (const company of companies) {
    const id = (company.id || '').trim().toLowerCase();
    if (!id || id === 'airpick') continue;
    const hit = byId.get(id);
    seen.add(id);
    rows.push({
      id,
      name: companyName(id, companies),
      airpick: hit?.airpick || 0,
      homepage: hit?.homepage || 0,
      onsite: hit?.onsite || 0,
      total: hit?.total || 0,
      revenue: hit?.revenue || 0,
      airpickRevenue: 0,
      homepageRevenue: 0,
      settled: hit?.settled || 0,
      settledRevenue: hit?.settledRevenue || 0,
    });
  }

  for (const hit of data?.companies || []) {
    if (seen.has(hit.id)) continue;
    rows.push({
      ...hit,
      name: companyName(hit.id, companies),
      airpickRevenue: 0,
      homepageRevenue: 0,
    });
  }

  rows.sort(
    (a, b) =>
      b.settled - a.settled ||
      b.airpick - a.airpick ||
      b.total - a.total ||
      a.name.localeCompare(b.name, 'ko')
  );
  return rows;
}

export function presentHqMonth(
  month: string,
  bundle: HqLedgerBundle | null,
  companies: Company[]
): HqMonthLedger | null {
  if (!bundle) return null;
  const data = bundle.months[month];
  return {
    month,
    admittedCount: data?.admittedCount || 0,
    admittedRevenue: data?.admittedRevenue || 0,
    settledCount: data?.settledCount || 0,
    settledRevenue: data?.settledRevenue || 0,
    sources: data?.sources || { airpick: 0, other: 0 },
    customerMix: data?.customerMix || {
      newCustomers: 0,
      returningCustomers: 0,
      newBookings: 0,
      returningBookings: 0,
    },
    companies: namedCompanies(data, companies),
  };
}

function ledgerPhoneKey(phone: string): string {
  let digits = phone.replace(/\D/g, '');
  if (digits.startsWith('82')) digits = `0${digits.slice(2)}`;
  if (digits.length === 10 && digits.startsWith('10')) digits = `0${digits}`;
  return digits.length >= 10 ? `p:${digits}` : '';
}

function reservationCustomerKey(reservation: Reservation): string {
  const phone = ledgerPhoneKey(reservation.phone || '');
  if (phone) return phone;
  const name = (reservation.userName || '').trim().toLowerCase();
  return name ? `n:${name}` : `id:${reservation.id}`;
}

/** 장부의 이전 입고 + 앱에 아직 있는 입고. 장부가 짧으면 앱 이력이 재방문을 채운다. */
export function mergeCustomerMix(
  visits: LedgerVisit[],
  reservations: Reservation[],
  month: string
): HqMonthLedger['customerMix'] {
  const monthStart = `${month}-01`;
  const prior = new Set<string>();
  for (const visit of visits) {
    if (visit.d && visit.d < monthStart && visit.a !== false) prior.add(visit.k);
  }
  for (const reservation of reservations) {
    if (reservation.status === 'cancelled' || !isAdmitted(reservation.status)) continue;
    const departure = normalizeDateString(reservation.departureDate);
    if (departure && departure < monthStart) prior.add(reservationCustomerKey(reservation));
  }

  const seen = new Set<string>();
  const mix = {
    newCustomers: 0,
    returningCustomers: 0,
    newBookings: 0,
    returningBookings: 0,
  };
  for (const visit of visits) {
    if (!visit.d.startsWith(month)) continue;
    const returning = prior.has(visit.k);
    if (returning) mix.returningBookings += 1;
    else mix.newBookings += 1;
    if (seen.has(visit.k)) continue;
    seen.add(visit.k);
    if (returning) mix.returningCustomers += 1;
    else mix.newCustomers += 1;
  }
  return mix;
}

export async function fetchHqLedgerBundle(): Promise<HqLedgerBundle> {
  await ensurePlatformAdminAuth();
  const call = httpsCallable<Record<string, never>, HqLedgerBundle>(functions, 'getHqMonthLedger');
  const result = await call({});
  return {
    months: result.data.months || {},
    visits: result.data.visits || [],
  };
}
