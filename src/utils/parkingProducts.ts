import type { Company, HandoffType, ParkingProduct, ParkingProductType } from '../types';
import { inferFacilityType } from './companyProfile';

export const PARKING_PRODUCT_LIMIT = 12;

export const HANDOFF_TYPE_LABELS: Record<HandoffType, string> = {
  curb: '커브사이드',
  meet_greet: '밋앤그릿',
  drop: '드랍오프',
};

export const PARKING_PRODUCT_TYPES: { id: ParkingProductType; label: string }[] = [
  { id: 'valet', label: '주차대행' },
  { id: 'walk', label: '직접 주차' },
  { id: 'shuttle', label: '셔틀' },
  { id: 'official', label: '공식 주차장' },
];

const TYPES = new Set<ParkingProductType>(['valet', 'walk', 'shuttle', 'official']);
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

function parseHours(
  raw: unknown
): ParkingProduct['hours'] | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const hours = raw as Record<string, unknown>;
  if (hours.allDay === true) return { allDay: true };
  if (HHMM.test(String(hours.open)) && HHMM.test(String(hours.close))) {
    return { open: String(hours.open), close: String(hours.close) };
  }
  return undefined;
}

export function newParkingProductId(): string {
  return `pp_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

function productOffers(p: ParkingProduct, handoff: HandoffType): boolean {
  if (handoff === 'curb') return p.curb;
  if (handoff === 'meet_greet') return p.meetGreet;
  return p.drop;
}

/** Firestore 값 → 상품. 레거시 meet 은 curb 로 읽는다. */
export function sanitizeParkingProduct(raw: unknown): ParkingProduct | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const id = String(r.id || '').trim();
  const type = String(r.type || '') as ParkingProductType;
  const lot = r.lot === 'indoor' || r.lot === 'outdoor' ? r.lot : null;
  const terminal = r.terminal === 'T1' || r.terminal === 'T2' || r.terminal === 'both' ? r.terminal : null;
  if (!id || !TYPES.has(type) || !lot || !terminal) return null;

  // curb 필드가 있으면 그걸 쓰고, 없으면 레거시 meet
  const curbResolved =
    typeof r.curb === 'boolean' ? r.curb === true : r.meet === true;

  const product: ParkingProduct = {
    id,
    type,
    lot,
    terminal,
    curb: curbResolved,
    meetGreet: r.meetGreet === true,
    drop: r.drop === true,
  };
  if (r.hidden === true) product.hidden = true;
  const note = typeof r.transferNote === 'string' ? r.transferNote.trim() : '';
  if (note) product.transferNote = note.slice(0, 120);
  const minutes = Number(r.transferMinutes);
  if (Number.isInteger(minutes) && minutes > 0 && minutes <= 180) product.transferMinutes = minutes;
  if (r.keyHandover === 'leave' || r.keyHandover === 'keep') product.keyHandover = r.keyHandover;
  if (r.evCharging === 'yes' || r.evCharging === 'no') product.evCharging = r.evCharging;
  const hours = parseHours(r.hours);
  if (hours) product.hours = hours;
  if (product.curb) {
    const curbHours = parseHours(r.curbHours) || parseHours(r.meetHours);
    if (curbHours) product.curbHours = curbHours;
  }
  if (typeof r.updatedAt === 'string') product.updatedAt = r.updatedAt;
  return product;
}

/**
 * 상품 필드가 없는 예전 업체 → valet 상품.
 * 커브 요금이 있으면 커브만, 없으면 드랍만.
 */
export function legacyParkingProducts(company: Partial<Company>): ParkingProduct[] {
  const facility = inferFacilityType(company);
  const lots: ParkingProduct['lot'][] =
    facility === 'mixed' ? ['indoor', 'outdoor'] : facility === 'outdoor' ? ['outdoor'] : ['indoor'];
  const terminals = Array.isArray(company.terminals) ? company.terminals : [];
  const terminal: ParkingProduct['terminal'] =
    terminals.length === 1 && (terminals[0] === 'T1' || terminals[0] === 'T2') ? terminals[0] : 'both';
  const curb = typeof company.valetFeeT1 === 'number' || typeof company.valetFeeT2 === 'number';
  return lots.map((lot) => ({
    id: `pp_valet_${lot}`,
    type: 'valet',
    lot,
    terminal,
    curb,
    meetGreet: false,
    drop: !curb,
  }));
}

export function readParkingProducts(company?: Partial<Company> | null): ParkingProduct[] {
  if (!company) return [];
  if (!Array.isArray(company.parkingProducts)) return legacyParkingProducts(company);
  return company.parkingProducts
    .map(sanitizeParkingProduct)
    .filter((p): p is ParkingProduct => p !== null)
    .slice(0, PARKING_PRODUCT_LIMIT);
}

function coversTerminal(product: ParkingProduct, terminal: 'T1' | 'T2'): boolean {
  return product.terminal === 'both' || product.terminal === terminal;
}

/** 이 터미널에 해당 입고 방식을 받는 노출 상품이 있는지 — 추가요금 칸을 열지 정한다 */
export function productsOfferHandoff(
  products: ParkingProduct[],
  handoff: HandoffType,
  terminal: 'T1' | 'T2'
): boolean {
  return products.some((p) => !p.hidden && productOffers(p, handoff) && coversTerminal(p, terminal));
}

/** 저장 직전 정리 — B2C 구버전용 meet/meetHours 별칭 포함 */
export function parkingProductsForFirestore(
  products: ParkingProduct[],
  now: string
): Array<ParkingProduct & { meet: boolean; meetHours?: ParkingProduct['curbHours'] }> {
  return products
    .map((p) => sanitizeParkingProduct({ ...p, updatedAt: now }))
    .filter((p): p is ParkingProduct => p !== null)
    .slice(0, PARKING_PRODUCT_LIMIT)
    .map((p) => ({
      ...p,
      meet: p.curb,
      ...(p.curb && p.curbHours ? { meetHours: p.curbHours } : {}),
    }));
}

export function parkingProductValidationError(products: ParkingProduct[]): string | null {
  for (const [index, p] of products.entries()) {
    const label = `상품 ${index + 1}`;
    if (!p.curb && !p.meetGreet && !p.drop) {
      return `${label}: 커브사이드·밋앤그릿·드랍오프 중 하나 이상 체크해 주세요.`;
    }
    if (p.hours && !('allDay' in p.hours)) {
      if (!HHMM.test(p.hours.open) || !HHMM.test(p.hours.close)) {
        return `${label}: 영업 시작·종료 시각을 HH:MM으로 입력해 주세요.`;
      }
    }
    if (p.curb && p.curbHours && !('allDay' in p.curbHours)) {
      if (!HHMM.test(p.curbHours.open) || !HHMM.test(p.curbHours.close)) {
        return `${label}: 커브사이드 시작·종료 시각을 HH:MM으로 입력해 주세요.`;
      }
    }
    if (p.transferMinutes != null && (!Number.isInteger(p.transferMinutes) || p.transferMinutes <= 0)) {
      return `${label}: 이동 시간(분)은 1 이상 정수로 입력해 주세요.`;
    }
  }
  return null;
}
