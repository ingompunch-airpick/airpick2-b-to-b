import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { isWawaCompany } from '../utils/pricing';

export type CompanyMonthSnapshot = {
  revenue: number;
  /** 그달 접수(예약일시) */
  reserved: number;
  /** 그달 입차예정 */
  admitted: number;
  /** 그달 출차예정 */
  settled: number;
  /** 그달 취소. 입차예정이 있으면 그달, 없으면 예약일시 */
  cancelled: number;
  airpick: number;
  homepage: number;
  onsite: number;
};

export function companyMonthSnapshotId(companyId: string): string {
  const id = companyId.trim().toLowerCase();
  if (isWawaCompany(id)) return 'wawa';
  return id;
}

/** 지난달 업체 매출. 문서가 없으면 null. */
export async function fetchCompanyMonthSnapshot(
  companyId: string,
  month: string
): Promise<CompanyMonthSnapshot | null> {
  const id = companyMonthSnapshotId(companyId);
  if (!id || !/^\d{4}-\d{2}$/.test(month)) return null;
  const snap = await getDoc(doc(db, 'companyMonthSnapshots', id, 'months', month));
  if (!snap.exists()) return null;
  const data = snap.data();
  return {
    revenue: Number(data.revenue) || 0,
    reserved: Number(data.reserved) || 0,
    admitted: Number(data.admitted) || 0,
    settled: Number(data.settled) || 0,
    cancelled: Number(data.cancelled) || 0,
    airpick: Number(data.airpick) || 0,
    homepage: Number(data.homepage) || 0,
    onsite: Number(data.onsite) || 0,
  };
}
