import * as admin from 'firebase-admin';

type PolicyCompany = {
  isOpen?: boolean;
  blockedDates?: unknown;
  sameDayBookingBlocked?: boolean;
};

function statusIsCancelled(status: unknown): boolean {
  const s = String(status || '')
    .trim()
    .toLowerCase();
  return s === 'cancelled' || s === '취소';
}

function normalizeYmd(value: unknown): string {
  const s = String(value || '').trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return '';
}

/** Asia/Seoul YYYY-MM-DD */
function kstTodayYmd(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

function resolveDepartureDate(data: FirebaseFirestore.DocumentData): string {
  return normalizeYmd(data.departureDate) || normalizeYmd(data.entryDate) || '';
}

async function cancelReservation(
  reservationId: string,
  reason: string,
  note: string
): Promise<void> {
  const now = new Date().toISOString();
  await admin.firestore().collection('reservations').doc(reservationId).update({
    status: 'cancelled',
    cancelledAt: now,
    cancelReason: reason,
    cancelNote: note,
    updatedAt: now,
  });
}

/**
 * 신규 예약이 업체 마감·입고일 blockedDates·당일차단에 걸리면 즉시 취소.
 * 홈페이지/B2C 클라이언트가 검사를 빼먹어도 서버 백스톱.
 * blockedDates는 입고일(departureDate)만 검사 — 출고일은 허용.
 * @returns true면 거절(취소)됨 → 푸시·알림톡 등 스킵
 */
export async function enforceBookingPolicyOnCreate(
  reservationId: string,
  data: FirebaseFirestore.DocumentData
): Promise<boolean> {
  if (statusIsCancelled(data.status)) return false;

  const companyId = String(data.companyId || '').trim();
  if (!companyId) return false;

  const departureDate = resolveDepartureDate(data);
  if (!departureDate) return false;

  const companySnap = await admin.firestore().collection('companies').doc(companyId).get();
  if (!companySnap.exists) return false;
  const company = (companySnap.data() || {}) as PolicyCompany;

  if (company.isOpen === false) {
    await cancelReservation(
      reservationId,
      'company_closed',
      '전체 예약 마감(자동취소)'
    );
    console.warn(`[bookingPolicy] closed ${reservationId} company=${companyId}`);
    return true;
  }

  if (company.sameDayBookingBlocked === true && departureDate === kstTodayYmd()) {
    await cancelReservation(
      reservationId,
      'same_day_blocked',
      '당일 입고 예약 차단(자동취소)'
    );
    console.warn(
      `[bookingPolicy] same-day ${reservationId} company=${companyId} dep=${departureDate}`
    );
    return true;
  }

  const blockedSet = new Set(
    (Array.isArray(company.blockedDates) ? company.blockedDates : [])
      .map((d) => normalizeYmd(d))
      .filter(Boolean)
  );
  if (blockedSet.size === 0) return false;

  if (!blockedSet.has(departureDate)) return false;

  await cancelReservation(
    reservationId,
    'blocked_dates',
    `입고일 마감(자동취소): ${departureDate}`
  );
  console.warn(
    `[bookingPolicy] blocked ${reservationId} company=${companyId} dep=${departureDate}`
  );
  return true;
}
