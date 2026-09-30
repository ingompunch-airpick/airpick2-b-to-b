import { doc, getDoc, type Firestore } from 'firebase/firestore';
import { db } from '../firebase';
import {
  evaluateDailyIntake,
  isDailyIntakeCapActive,
  type DailyIntakeCompany,
  type DailyIntakeResult,
} from '../utils/dailyIntakeCapacity';
import { expandCompanyIdsForFirestoreQuery } from '../utils/reservationQuery';
import { normalizeDateString } from '../utils/reservationNormalize';

async function fetchCapacityTotal(
  firestore: Firestore,
  companyId: string,
  date: string
): Promise<number> {
  const ids = expandCompanyIdsForFirestoreQuery([companyId]);
  if (!ids.length) return 0;
  const snaps = await Promise.all(
    ids.map((id) => getDoc(doc(firestore, 'capacity', `${id}__${date}`)))
  );
  let total = 0;
  for (const snap of snaps) {
    if (!snap.exists()) continue;
    const n = Number((snap.data() as { total?: unknown }).total ?? 0);
    if (Number.isFinite(n)) total += n;
  }
  return total;
}

export async function checkDailyIntakeForBooking(
  company: DailyIntakeCompany & { id?: string },
  companyId: string,
  departureDate: string,
  firestore: Firestore = db
): Promise<DailyIntakeResult> {
  if (!isDailyIntakeCapActive(company)) {
    return evaluateDailyIntake({ company, existingCount: 0 });
  }
  const date = normalizeDateString(departureDate);
  const existingCount = date ? await fetchCapacityTotal(firestore, companyId, date) : 0;
  return evaluateDailyIntake({ company, existingCount });
}

export async function assertDailyIntakeAvailable(
  company: DailyIntakeCompany & { id?: string },
  companyId: string,
  departureDate: string,
  firestore: Firestore = db
): Promise<DailyIntakeResult> {
  const result = await checkDailyIntakeForBooking(
    company,
    companyId,
    departureDate,
    firestore
  );
  if (result.ok === false) throw new Error(result.message);
  return result;
}
