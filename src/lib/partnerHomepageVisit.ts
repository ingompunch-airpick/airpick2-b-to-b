/**
 * /h/{업체} 방문 — partnerHomepageStats 일별 카운트.
 * 업체 전용 홈(airpick-partner-homepage)과 같은 컬렉션.
 */
import { doc, increment, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import {
  shouldSkipHomepageVisitCount,
  sourceFromHomepageLocation,
} from '../utils/homepageFirstTouch';

function kstTodayKey(): string {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function sessionKey(companyId: string, day: string): string {
  return `ph.visit.${companyId}.${day}`;
}

/**
 * 같은 업체·같은 날·같은 탭은 1회.
 * via=ph(업체 홈에서 이미 집계)면 생략.
 * src 있으면 sources.{src} 도 +1.
 */
export async function recordHomepageBookingPageView(
  companyId: string,
  pathname = typeof window !== 'undefined' ? window.location.pathname : '/',
  search = typeof window !== 'undefined' ? window.location.search : ''
): Promise<void> {
  const id = companyId.trim().toLowerCase();
  if (!/^[a-z0-9_]{1,64}$/.test(id)) return;
  if (shouldSkipHomepageVisitCount(search)) return;

  const day = kstTodayKey();
  const sk = sessionKey(id, day);
  try {
    if (sessionStorage.getItem(sk)) return;
    sessionStorage.setItem(sk, '1');
  } catch {
    /* private mode — 카운트는 시도 */
  }

  const source = sourceFromHomepageLocation(pathname, search);
  const ref = doc(db, 'partnerHomepageStats', id, 'days', day);
  const updatedAt = new Date().toISOString();
  try {
    await setDoc(ref, { pageViews: increment(1), updatedAt }, { merge: true });
    if (source) {
      await updateDoc(ref, { [`sources.${source}`]: increment(1) });
    }
  } catch {
    /* rules 미배포 등 */
  }
}
