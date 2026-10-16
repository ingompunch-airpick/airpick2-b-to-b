import { useEffect, useState } from 'react';
import type { Reservation } from '../types';
import {
  displayedVisitCount,
  fetchCustomerVisitCount,
} from '../lib/customerVisit';

export default function CustomerVisitBadge({
  reservation,
  pool,
  className = 'inline-flex shrink-0 rounded-md border border-emerald-500/20 bg-emerald-500/10 px-1.5 py-0.5 align-middle text-[10px] font-black text-emerald-400',
}: {
  reservation: Reservation;
  pool: Reservation[];
  className?: string;
}) {
  const [storedCount, setStoredCount] = useState<number | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    setStoredCount(undefined);
    void fetchCustomerVisitCount(reservation.phone)
      .then((count) => {
        if (!cancelled) setStoredCount(count);
      })
      .catch(() => {
        if (!cancelled) setStoredCount(null);
      });
    return () => {
      cancelled = true;
    };
  }, [reservation.phone]);

  if (storedCount === undefined) return null;

  const visitCount = displayedVisitCount(reservation, pool, storedCount);
  if (visitCount == null || visitCount < 1) return null;

  return <span className={className}>방문 {visitCount}회</span>;
}
