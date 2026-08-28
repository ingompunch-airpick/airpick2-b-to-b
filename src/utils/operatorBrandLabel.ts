import type { Company, Reservation } from '../types';
import { resolveOperatorCompanyIds } from './operatorHierarchy';
import { shortPartnerName } from './partnerWordmark';

export function isMultiOperatorScope(
  primaryCompanyId: string,
  companies: Company[] | undefined
): boolean {
  if (!primaryCompanyId?.trim()) return false;
  return resolveOperatorCompanyIds(primaryCompanyId, companies || []).length > 1;
}

/** 통합 관리일 때 예약 카드·상세에 표시할 짧은 브랜드명 (가유 / 안녕 / 시즌) */
export function resolveOperatorBrandLabel(
  reservation: Pick<Reservation, 'companyId' | 'companyName'>,
  companies: Company[] | undefined,
  multiOperator: boolean
): string | null {
  if (!multiOperator) return null;

  const cid = (reservation.companyId || '').trim().toLowerCase();
  if (!cid) return null;

  const company = companies?.find((c) => (c.id || '').trim().toLowerCase() === cid);
  const rawName = (reservation.companyName || company?.name || cid).trim();
  return shortPartnerName(rawName) || cid;
}
