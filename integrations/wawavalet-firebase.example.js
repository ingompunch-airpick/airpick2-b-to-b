/**
 * wawavalet.com 홈페이지용 Firebase 연동 예제 (airpick-reservation)
 * npm: firebase ^11 — 프로젝트 설정은 ../firebase-config.homepage.json 과 동일하게 맞출 것
 *
 * 배포: Functions / Firestore·Storage rules 는 airpick2-b-to-b(B2B)만.
 * blockedDates: 입고일(departureDate)만 검사 (출고·중간일 미적용).
 */
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously } from 'firebase/auth';
import { getFirestore, doc, getDoc, setDoc, getDocs, collection, query, where } from 'firebase/firestore';
import homepageConfig from '../firebase-config.homepage.json' assert { type: 'json' };

const app = initializeApp(homepageConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const COMPANY_ID = 'wawa';

export async function loadWawaBookingPolicy() {
  await signInAnonymously(auth);
  const snap = await getDoc(doc(db, 'companies', COMPANY_ID));
  const data = snap.data() || {};
  return {
    isOpen: data.isOpen !== false,
    blockedDates: Array.isArray(data.blockedDates) ? data.blockedDates : [],
    hourlyCapEnabled: data.hourlyCapEnabled === true,
    maxCarsPerHour:
      typeof data.maxCarsPerHour === 'number' ? data.maxCarsPerHour : 0,
    parkingCapEnabled: data.parkingCapEnabled === true,
    maxParkedCars:
      typeof data.maxParkedCars === 'number' ? data.maxParkedCars : 0,
  };
}

function normalizeYmd(value) {
  const s = String(value || '').trim();
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : '';
}

function occupiesParkingDay(row, day) {
  const status = String(row.status || '').trim().toLowerCase();
  if (status === 'cancelled' || status === '취소') return false;
  if (
    status === 'completed_out' ||
    status === '출차완료' ||
    status === '인도완료' ||
    status === '출고완료'
  ) {
    return false;
  }
  const dep = normalizeYmd(row.departureDate);
  if (!dep) return false;
  const arr = normalizeYmd(row.arrivalDate) || dep;
  const end = arr >= dep ? arr : dep;
  return dep <= day && day <= end;
}

function eachYmdInclusive(start, end) {
  if (!start) return [];
  const last = end && end >= start ? end : start;
  const out = [];
  let cur = new Date(`${start}T00:00:00Z`);
  const lastDate = new Date(`${last}T00:00:00Z`);
  for (let i = 0; i < 400 && cur <= lastDate; i++) {
    out.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}

async function assertParkingCapacity(departureDate, arrivalDate, policy) {
  if (!policy.parkingCapEnabled || !(policy.maxParkedCars > 0)) return;
  const start = normalizeYmd(departureDate);
  const end = normalizeYmd(arrivalDate) || start;
  if (!start) throw new Error('입고·출고 날짜를 확인해 주세요.');

  const rangeEnd = end >= start ? end : start;
  const snap = await getDocs(
    query(
      collection(db, 'reservations'),
      where('companyId', '==', COMPANY_ID),
      where('departureDate', '<=', rangeEnd)
    )
  );
  const rows = [];
  snap.forEach((d) => {
    const row = d.data();
    const arr = normalizeYmd(row.arrivalDate) || normalizeYmd(row.departureDate);
    if (!arr || arr < start) return;
    rows.push(row);
  });

  for (const day of eachYmdInclusive(start, rangeEnd)) {
    let used = 0;
    for (const row of rows) {
      if (occupiesParkingDay(row, day)) used += 1;
    }
    if (used >= policy.maxParkedCars) {
      throw new Error(
        `${day} 기준 주차 가능 대수가 가득 찼습니다. (최대 ${policy.maxParkedCars}대 · 만차)`
      );
    }
  }
}

function parseHour(time) {
  const m = String(time || '').trim().match(/^(\d{1,2})/);
  if (!m) return null;
  const h = Number(m[1]);
  return Number.isFinite(h) && h >= 0 && h <= 23 ? h : null;
}

async function assertHourlyCapacity(departureDate, departureTime, policy) {
  if (!policy.hourlyCapEnabled || !(policy.maxCarsPerHour > 0)) return;
  const hour = parseHour(departureTime);
  if (hour === null) throw new Error('입고 시각을 확인해 주세요.');

  const snap = await getDocs(
    query(
      collection(db, 'reservations'),
      where('companyId', '==', COMPANY_ID),
      where('departureDate', '==', departureDate)
    )
  );
  let used = 0;
  snap.forEach((d) => {
    const row = d.data();
    if (String(row.status || '') === 'cancelled' || row.status === '취소') return;
    if (parseHour(row.departureTime) === hour) used += 1;
  });
  if (used >= policy.maxCarsPerHour) {
    const hh = String(hour).padStart(2, '0');
    throw new Error(
      `${hh}:00–${hh}:59 시간대 예약이 마감되었습니다. (시간당 ${policy.maxCarsPerHour}대)`
    );
  }
}

export async function createHomepageReservation(form) {
  const policy = await loadWawaBookingPolicy();
  if (!policy.isOpen) {
    throw new Error('전체 예약이 마감된 상태입니다.');
  }
  if (policy.blockedDates.includes(form.departureDate)) {
    throw new Error(`입고일(${form.departureDate})은 예약이 마감되었습니다.`);
  }
  await assertParkingCapacity(form.departureDate, form.arrivalDate, policy);
  await assertHourlyCapacity(form.departureDate, form.departureTime, policy);

  const id = `res_${Date.now()}`;
  const payload = {
    userId: auth.currentUser.uid,
    companyId: COMPANY_ID,
    companyName: '와와',
    userName: form.userName,
    carModel: form.carModel,
    carNumber: form.carNumber,
    phone: form.phone,
    departureDate: form.departureDate,
    departureTime: form.departureTime,
    departureTerminal: form.departureTerminal,
    arrivalDate: form.arrivalDate,
    arrivalTime: form.arrivalTime,
    arrivalTerminal: form.arrivalTerminal,
    totalPrice: Number(form.totalPrice) || 0,
    status: 'pending',
    createdAt: new Date().toISOString(),
    createdBy: 'homepage',
    paymentMethod: 'unpaid',
    isIndoor: form.isIndoor !== false,
    scratchPhotos: { synced: false },
    // 표준 필드명 권장 (와와 홈 레거시는 entryAirline/exitFlight 도 앱에서 자동 매핑)
    departureAirline: form.departureAirline || undefined,
    departureFlight: form.departureFlight || undefined,
    arrivalAirline: form.arrivalAirline || undefined,
    arrivalFlight: form.arrivalFlight || undefined,
    destination: form.destination || undefined,
  };

  await setDoc(doc(db, 'reservations', id), payload);
  return { id, ...payload };
}

