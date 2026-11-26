import { useEffect, useState } from 'react';
import type { Reservation } from '../types';
import {
  displayedVisitCount,
  fetchCustomerVisitCount,
} from '../lib/customerVisit';

export default function CustomerVisitBadge({
  reservation,
  pool,
  className = 'inline-flex shrink-0 rounded-md border border-emerald-500/20 bg-emerald-500/10 px-1.5 py-0.5 align-middle text-[12px] font-black text-emerald-400',
  minCount = 1,
}: {
  reservation: Reservation;
  pool: Reservation[];
  className?: string;
  /** 이 횟수부터 표시 (예약 카드는 2 — 재방문만) */
  minCount?: number;
}) {
  const [storedCount, setStoredCount] = useState<number | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    setStoredCount(undefined);
    void fetchCustomerVisitCount(reservation.phone, reservation.companyId)
      .then((count) => {
        if (!cancelled) setStoredCount(count);
      })
      .catch(() => {
        if (!cancelled) setStoredCount(null);
      });
    return () => {
      cancelled = true;
    };
  }, [reservation.phone, reservation.companyId]);

  if (storedCount === undefined) return null;

  const visitCount = displayedVisitCount(reservation, pool, storedCount);
  if (visitCount == null || visitCount < Math.max(1, minCount)) return null;

  return <span className={className}>방문 {visitCount}회</span>;
}
