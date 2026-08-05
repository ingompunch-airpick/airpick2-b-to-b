import type { Company } from '../types';
import { isAirpickHeadquarters } from '../constants/platform';
import { readPartnerProfileFromCompany } from './companyProfile';
import { getAirport, normalizeAirportId } from './airport';

export type HqPartnerBoardFilter =
  | 'all'
  | 'open'
  | 'closed'
  | 'suspended'
  | 'incomplete';

export type HqAccountStatus = 'active' | 'suspended';

export interface HqPartnerProfileFlags {
  insurance: boolean;
  address: boolean;
  photos: boolean;
}

export interface HqPartnerBoardRow {
  id: string;
  name: string;
  airportLabel: string;
  accountStatus: HqAccountStatus;
  isOpen: boolean;
  hourlyCapLabel: string;
  parkingCapLabel: string;
  blockedCount: number;
  profile: HqPartnerProfileFlags;
  incomplete: boolean;
  rating: number;
  reviewsCount: number;
  parentCompanyId?: string;
  isOperatorPrimary?: boolean;
}

function hasParkingAddress(company: Company): boolean {
  const lots = Array.isArray(company.parkingLots) ? company.parkingLots : [];
  if (lots.some((lot) => String(lot.parkingAddress || '').trim())) return true;
  if (String(company.indoorParkingAddress || '').trim()) return true;
  if (String(company.outdoorParkingAddress || '').trim()) return true;
  return false;
}

function hasParkingPhotos(company: Company): boolean {
  if (String(company.image_url || '').trim()) return true;
  if (Array.isArray(company.image_urls) && company.image_urls.some((u) => String(u || '').trim())) {
    return true;
  }
  const lots = Array.isArray(company.parkingLots) ? company.parkingLots : [];
  return lots.some((lot) => {
    const photos = (lot as { photos?: unknown }).photos;
    return Array.isArray(photos) && photos.some((u) => String(u || '').trim());
  });
}

export function resolveCompanyAccountStatus(company: Company): HqAccountStatus {
  return company.status === 'suspended' ? 'suspended' : 'active';
}

export function buildPartnerProfileFlags(company: Company): HqPartnerProfileFlags {
  const profile = readPartnerProfileFromCompany(company);
  return {
    insurance: profile.insuranceEnrolled,
    address: hasParkingAddress(company),
    photos: hasParkingPhotos(company),
  };
}

export function isPartnerProfileIncomplete(flags: HqPartnerProfileFlags): boolean {
  return !flags.insurance || !flags.address || !flags.photos;
}

function formatCapLabel(enabled: boolean | undefined, value: number | undefined, unit: string): string {
  if (enabled !== true) return 'OFF';
  const n = typeof value === 'number' && Number.isFinite(value) ? Math.trunc(value) : 0;
  if (n <= 0) return 'ON·미설정';
  return `${n}${unit}`;
}

export function buildHqPartnerBoardRows(companies: Company[]): HqPartnerBoardRow[] {
  return companies
    .filter((c) => c.id && !isAirpickHeadquarters(c.id))
    .map((company) => {
      const profile = buildPartnerProfileFlags(company);
      const incomplete = isPartnerProfileIncomplete(profile);
      const airport = normalizeAirportId(company.airport);
      return {
        id: company.id,
        name: String(company.name || company.id).trim() || company.id,
        airportLabel: getAirport(airport).shortName,
        accountStatus: resolveCompanyAccountStatus(company),
        isOpen: company.isOpen !== false,
        hourlyCapLabel: formatCapLabel(
          company.hourlyCapEnabled,
          company.maxCarsPerHour,
          '대/시'
        ),
        parkingCapLabel: formatCapLabel(
          company.parkingCapEnabled,
          company.maxParkedCars,
          '대'
        ),
        blockedCount: Array.isArray(company.blockedDates) ? company.blockedDates.length : 0,
        profile,
        incomplete,
        rating: typeof company.rating === 'number' ? company.rating : 0,
        reviewsCount: typeof company.reviews_count === 'number' ? company.reviews_count : 0,
        parentCompanyId: company.parentCompanyId,
        isOperatorPrimary: company.isOperatorPrimary,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'ko'));
}

export function filterHqPartnerBoardRows(
  rows: HqPartnerBoardRow[],
  filter: HqPartnerBoardFilter,
  query: string
): HqPartnerBoardRow[] {
  const q = query.trim().toLowerCase();
  return rows.filter((row) => {
    if (filter === 'open' && !(row.accountStatus === 'active' && row.isOpen)) return false;
    if (filter === 'closed' && !(row.accountStatus === 'active' && !row.isOpen)) return false;
    if (filter === 'suspended' && row.accountStatus !== 'suspended') return false;
    if (filter === 'incomplete' && !row.incomplete) return false;
    if (!q) return true;
    return (
      row.name.toLowerCase().includes(q) ||
      row.id.toLowerCase().includes(q) ||
      row.airportLabel.toLowerCase().includes(q)
    );
  });
}

export function summarizeHqPartnerBoard(rows: HqPartnerBoardRow[]) {
  return {
    open: rows.filter((r) => r.accountStatus === 'active' && r.isOpen).length,
    closed: rows.filter((r) => r.accountStatus === 'active' && !r.isOpen).length,
    suspended: rows.filter((r) => r.accountStatus === 'suspended').length,
    incomplete: rows.filter((r) => r.incomplete).length,
    total: rows.length,
  };
}
