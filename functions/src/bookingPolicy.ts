import * as admin from 'firebase-admin';
import { rejectNewReservation } from './rejectNewReservation';
import { matchScheduleBlock, scheduleBlockOverrideHonored } from './scheduleBlock';

type PolicyCompany = {
  isOpen?: boolean;
  blockedDates?: unknown;
  sameDayBookingBlocked?: boolean;
  bookingLeadHours?: number;
  scheduleBlocks?: unknown;
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

function normalizeLeadHours(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(24, Math.floor(n)));
}

function intakeLeadClosed(departureDate: string, departureTime: string, leadHours: number): boolean {
  const dateM = departureDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const timeM = departureTime.match(/^(\d{2}):(\d{2})$/);
  if (!dateM || !timeM || leadHours <= 0) return false;
  const intakeMs = Date.UTC(
    Number(dateM[1]),
    Number(dateM[2]) - 1,
    Number(dateM[3]),
    Number(timeM[1]) - 9,
    Number(timeM[2]),
    0,
    0
  );
  return Date.now() >= intakeMs - leadHours * 60 * 60 * 1000;
}

function resolveDepartureDate(data: FirebaseFirestore.DocumentData): string {
  return normalizeYmd(data.departureDate) || normalizeYmd(data.entryDate) || '';
}

/**
 * 신규 예약이 업체 마감·입고일 blockedDates·당일차단에 걸리면 문서를 지운다.
 * 홈페이지/B2C 클라이언트가 검사를 빼먹어도 서버 백스톱.
 * blockedDates는 입고일 하루 전체. scheduleBlocks는 입고·출고, 터미널, 시간 구간.
 * @returns true면 거절됨 → 푸시·알림톡·시트 스킵
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
    await rejectNewReservation(reservationId, 'bookingPolicy', `closed company=${companyId}`);
    return true;
  }

  if (company.sameDayBookingBlocked === true && departureDate === kstTodayYmd()) {
    await rejectNewReservation(
      reservationId,
      'bookingPolicy',
      `same-day company=${companyId} dep=${departureDate}`
    );
    return true;
  }

  const lead = normalizeLeadHours(company.bookingLeadHours);
  if (lead > 0) {
    const departureTime = String(data.departureTime || '').trim().slice(0, 5);
    if (intakeLeadClosed(departureDate, departureTime, lead)) {
      await rejectNewReservation(
        reservationId,
        'bookingPolicy',
        `lead company=${companyId} dep=${departureDate} ${departureTime} lead=${lead}`
      );
      return true;
    }
  }

  const blockedSet = new Set(
    (Array.isArray(company.blockedDates) ? company.blockedDates : [])
      .map((d) => normalizeYmd(d))
      .filter(Boolean)
  );

  if (blockedSet.has(departureDate)) {
    await rejectNewReservation(
      reservationId,
      'bookingPolicy',
      `blocked company=${companyId} dep=${departureDate}`
    );
    return true;
  }

  if (scheduleBlockOverrideHonored(data)) return false;

  const hit = matchScheduleBlock(company.scheduleBlocks, data);
  if (!hit) return false;

  await rejectNewReservation(
    reservationId,
    'bookingPolicy',
    `schedule company=${companyId} ${hit.leg} ${hit.date} ${hit.terminal}`
  );
  return true;
}
