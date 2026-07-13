import type { Reservation } from '../types';
import { isWawaCompany } from './pricing';
import { normalizeReservationStatus } from './reservationStatus';
import { resolveFlightFields } from './flightFields';
import { RESERVATION_CREATED_BY, resolveBookingSource } from './bookingSource';

export function getSafeDateString(val: unknown): string {
  if (!val) return new Date().toISOString();
  if (typeof val === 'string') return val;
  if (val instanceof Date) return val.toISOString();
  if (typeof val === 'object' && val !== null) {
    const record = val as { toDate?: () => Date; seconds?: number };
    if (typeof record.toDate === 'function') {
      try {
        return record.toDate().toISOString();
      } catch (_) {}
    }
    if (record.seconds !== undefined) {
      try {
        return new Date(record.seconds * 1000).toISOString();
      } catch (_) {}
    }
  }
  try {
    const d = new Date(val as string | number);
    if (!isNaN(d.getTime())) return d.toISOString();
  } catch (_) {}
  return new Date().toISOString();
}

export function normalizeDateString(dStr: string | undefined | null | unknown): string {
  if (dStr == null || dStr === '') return '';
  // Timestamp/숫자 등이 들어오면 문자열로 정규화
  const asString =
    typeof dStr === 'string'
      ? dStr
      : typeof dStr === 'number'
        ? String(dStr)
        : getSafeDateString(dStr).slice(0, 10);
  let clean = asString.trim().replace(/[\.\/]/g, '-');

  if (clean.includes(' ')) {
    clean = clean.split(' ')[0];
  }
  if (clean.includes('T')) {
    clean = clean.split('T')[0];
  }

  const parts = clean.split('-');
  if (parts.length === 3) {
    const y = parts[0];
    const m = parts[1].padStart(2, '0');
    const d = parts[2].padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return clean;
}

function resolveCompanyFields(r: Record<string, unknown>): { companyId: string; companyName: string } {
  const rawCompId = String(r.companyId || r.company || '').trim();
  if (isWawaCompany(rawCompId, String(r.companyName || r.company || ''))) {
    return { companyId: 'wawa', companyName: '와와' };
  }
  return {
    companyId: rawCompId,
    companyName: String(r.companyName || r.company || ''),
  };
}
export function normalizeDocsArray(items: unknown[]): Reservation[] {
  if (!items || !Array.isArray(items)) return [];
  return items.map((raw): Reservation => {
    const r = raw as Record<string, unknown>;
    const finalName = String(r.name || r.userName || '미지정');
    const finalDate = normalizeDateString(String(r.entryDate || r.departureDate || ''));
    const arrivalDate = normalizeDateString(String(r.exitDate || r.arrivalDate || ''));
    const departureTime = String(r.entryTime || r.departureTime || '');
    const arrivalTime = String(r.exitTime || r.arrivalTime || '');
    const statusNorm = normalizeReservationStatus(r.status as string | undefined);
    const createdAtStr = getSafeDateString(r.createdAt);
    const updatedAtStr = r.updatedAt ? getSafeDateString(r.updatedAt) : undefined;
    const finalCarNumber = String(r.carNumber || r.carNo || r.vehicleNo || r.car_number || '');
    const finalPrice = typeof r.totalPrice === 'number' ? r.totalPrice : Number(r.totalPrice) || 0;
    const { companyId, companyName: resolvedCompanyName } = resolveCompanyFields(r);
    const displayCompanyName =
      String(r.companyName || r.company || '').trim() || resolvedCompanyName;
    const flightFields = resolveFlightFields(r);
    const bookingSource = resolveBookingSource(
      r.createdBy as string | undefined,
      r
    );
    const createdBy =
      bookingSource === 'homepage' && !String(r.createdBy || '').trim()
        ? RESERVATION_CREATED_BY.HOMEPAGE
        : (r.createdBy as string | undefined);

    return {
      ...(r as Reservation),
      createdBy,
      userId: String(r.userId || r.uid || 'external_system'),
      phone: String(r.phone || r.userPhone || ''),
      carNumber: finalCarNumber,
      departureTerminal: (r.departureTerminal || r.entryTerminal || 'T1') as 'T1' | 'T2',
      arrivalTerminal: (r.arrivalTerminal || r.exitTerminal || 'T1') as 'T1' | 'T2',
      totalPrice: finalPrice,
      departureDate: finalDate,
      arrivalDate,
      departureTime,
      arrivalTime,
      userName: finalName,
      status: statusNorm,
      createdAt: createdAtStr,
      updatedAt: updatedAtStr,
      companyId,
      companyName: displayCompanyName,
      ...flightFields,
    };
  });
}
