import {
  doc,
  getDoc,
  updateDoc,
  collection,
  query,
  where,
  getDocs,
  orderBy,
  limit,
  setDoc,
} from 'firebase/firestore';
import { db } from '../firebase';
import { ensureFirestoreAuth } from './firebaseAuth';
import {
  ACQUISITION_COLLECTION,
  createAcquisitionClickId,
  isValidAcquisitionClickId,
  normalizeAcquisitionCampaign,
  normalizeAcquisitionCompanyId,
  normalizeAcquisitionMedium,
  normalizeAcquisitionSource,
  type AcquisitionAttribution,
  type AcquisitionClickDoc,
} from '../utils/acquisition';

export type ValidatedAcquisition = AcquisitionAttribution & {
  click: AcquisitionClickDoc;
};

function visitorKeyFromStorage(): string {
  try {
    const key = 'ap_acq_vid';
    const existing = localStorage.getItem(key);
    if (existing && /^[a-z0-9_-]{8,64}$/i.test(existing)) return existing;
    const next =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID().replace(/-/g, '').slice(0, 20)
        : `v${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem(key, next);
    return next;
  } catch {
    return `v${Date.now().toString(36)}`;
  }
}

/** SPA/로컬용 — Functions /go 가 없을 때 클릭 생성 */
export async function createAcquisitionClickClient(params: {
  companyId: string;
  source?: string;
  medium?: string;
  campaign?: string;
}): Promise<{ clickId: string; companyId: string } | null> {
  const companyId = normalizeAcquisitionCompanyId(params.companyId);
  if (!companyId) return null;
  await ensureFirestoreAuth();
  const source = normalizeAcquisitionSource(params.source);
  const medium = normalizeAcquisitionMedium(params.medium);
  const campaign = normalizeAcquisitionCampaign(params.campaign, companyId, source);
  const clickId = createAcquisitionClickId();
  const payload: AcquisitionClickDoc = {
    companyId,
    source,
    medium,
    campaign,
    clickedAt: new Date().toISOString(),
    visitorKey: visitorKeyFromStorage(),
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 180) : undefined,
  };
  await setDoc(doc(db, ACQUISITION_COLLECTION, clickId), payload);
  return { clickId, companyId };
}

export async function fetchAcquisitionClick(
  clickId: string
): Promise<(AcquisitionClickDoc & { id: string }) | null> {
  if (!isValidAcquisitionClickId(clickId)) return null;
  await ensureFirestoreAuth();
  const snap = await getDoc(doc(db, ACQUISITION_COLLECTION, clickId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...(snap.data() as AcquisitionClickDoc) };
}

/**
 * aid 검증 — 예약 companyId 와 클릭 문서 companyId 가 일치해야 함.
 * 이미 다른 예약에 연결된 click 은 재사용하지 않음.
 */
export async function validateAcquisitionForBooking(
  clickId: string,
  bookingCompanyId: string
): Promise<ValidatedAcquisition | null> {
  const companyId = normalizeAcquisitionCompanyId(bookingCompanyId);
  if (!companyId || !isValidAcquisitionClickId(clickId)) return null;
  const click = await fetchAcquisitionClick(clickId);
  if (!click) return null;
  if (normalizeAcquisitionCompanyId(click.companyId) !== companyId) return null;
  if (click.convertedReservationId) return null;
  return {
    acquisitionClickId: click.id,
    acquisitionSource: normalizeAcquisitionSource(click.source),
    acquisitionMedium: normalizeAcquisitionMedium(click.medium),
    acquisitionCampaign: normalizeAcquisitionCampaign(
      click.campaign,
      companyId,
      click.source
    ),
    click,
  };
}

export async function markAcquisitionLanded(clickId: string): Promise<void> {
  if (!isValidAcquisitionClickId(clickId)) return;
  await ensureFirestoreAuth();
  const ref = doc(db, ACQUISITION_COLLECTION, clickId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const data = snap.data() as AcquisitionClickDoc;
  if (data.landedAt) return;
  await updateDoc(ref, { landedAt: new Date().toISOString() });
}

export async function markAcquisitionConverted(
  clickId: string,
  reservationId: string
): Promise<void> {
  if (!isValidAcquisitionClickId(clickId) || !reservationId.trim()) return;
  await ensureFirestoreAuth();
  const ref = doc(db, ACQUISITION_COLLECTION, clickId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const data = snap.data() as AcquisitionClickDoc;
  if (data.convertedReservationId) return;
  await updateDoc(ref, {
    convertedReservationId: reservationId.trim(),
    convertedAt: new Date().toISOString(),
  });
}

export type AcquisitionFunnelStats = {
  companyId: string;
  scans: number;
  uniqueVisitors: number;
  pageArrivals: number;
  bookings: number;
  conversionRate: number;
  bySource: Record<
    string,
    { scans: number; arrivals: number; bookings: number; conversionRate: number }
  >;
};

export async function loadAcquisitionFunnelForCompany(
  companyId: string,
  opts?: { sinceIso?: string; maxClicks?: number }
): Promise<AcquisitionFunnelStats> {
  const id = normalizeAcquisitionCompanyId(companyId) || companyId;
  await ensureFirestoreAuth();
  const max = opts?.maxClicks ?? 2000;
  const q = query(
    collection(db, ACQUISITION_COLLECTION),
    where('companyId', '==', id),
    orderBy('clickedAt', 'desc'),
    limit(max)
  );
  const snap = await getDocs(q);
  const since = opts?.sinceIso ? Date.parse(opts.sinceIso) : 0;
  const visitors = new Set<string>();
  let scans = 0;
  let pageArrivals = 0;
  let bookings = 0;
  const bySource: AcquisitionFunnelStats['bySource'] = {};

  for (const d of snap.docs) {
    const row = d.data() as AcquisitionClickDoc;
    const t = Date.parse(row.clickedAt || '');
    if (since && (!Number.isFinite(t) || t < since)) continue;
    scans += 1;
    const src = normalizeAcquisitionSource(row.source);
    if (!bySource[src]) {
      bySource[src] = { scans: 0, arrivals: 0, bookings: 0, conversionRate: 0 };
    }
    bySource[src].scans += 1;
    if (row.visitorKey) visitors.add(row.visitorKey);
    if (row.landedAt) {
      pageArrivals += 1;
      bySource[src].arrivals += 1;
    }
    if (row.convertedReservationId) {
      bookings += 1;
      bySource[src].bookings += 1;
    }
  }

  for (const src of Object.keys(bySource)) {
    const b = bySource[src]!;
    b.conversionRate = b.scans > 0 ? Math.round((b.bookings / b.scans) * 1000) / 10 : 0;
  }

  return {
    companyId: id,
    scans,
    uniqueVisitors: visitors.size,
    pageArrivals,
    bookings,
    conversionRate: scans > 0 ? Math.round((bookings / scans) * 1000) / 10 : 0,
    bySource,
  };
}
