/**
 * wawavalet.com 홈페이지용 Firebase 연동 예제 (airpick-reservation)
 * npm: firebase ^11 — 프로젝트 설정은 ../firebase-config.homepage.json 과 동일하게 맞출 것
 */
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously } from 'firebase/auth';
import { getFirestore, doc, getDoc, setDoc } from 'firebase/firestore';
import homepageConfig from '../firebase-config.homepage.json' assert { type: 'json' };

const app = initializeApp(homepageConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const COMPANY_ID = 'wawa';

function datesInRange(startYmd, endYmd) {
  const dates = [];
  const start = new Date(startYmd);
  const end = new Date(endYmd);
  start.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);
  const cur = new Date(start);
  while (cur <= end) {
    const y = cur.getFullYear();
    const m = String(cur.getMonth() + 1).padStart(2, '0');
    const d = String(cur.getDate()).padStart(2, '0');
    dates.push(`${y}-${m}-${d}`);
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
}

export async function loadWawaBookingPolicy() {
  await signInAnonymously(auth);
  const snap = await getDoc(doc(db, 'companies', COMPANY_ID));
  const data = snap.data() || {};
  return {
    isOpen: data.isOpen !== false,
    blockedDates: Array.isArray(data.blockedDates) ? data.blockedDates : [],
  };
}

export async function createHomepageReservation(form) {
  const { isOpen, blockedDates } = await loadWawaBookingPolicy();
  if (!isOpen) {
    throw new Error('전체 예약이 마감된 상태입니다.');
  }
  const span = datesInRange(form.departureDate, form.arrivalDate);
  const blocked = span.filter((d) => blockedDates.includes(d));
  if (blocked.length > 0) {
    throw new Error(`마감된 날짜가 포함되어 있습니다: ${blocked.join(', ')}`);
  }

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
