/**
 * 업체 홈 예약(/h/{slug}) 광고 전환 — 업체별 GTM + reservation_complete.
 * gtmId 없는 업체는 no-op.
 */

declare global {
  interface Window {
    dataLayer?: Record<string, unknown>[];
    gtag?: (...args: unknown[]) => void;
  }
}

const GTM_ID_RE = /^GTM-[A-Z0-9]+$/i;
const firedTxn = new Set<string>();

export function normalizeGtmId(raw?: string | null): string | null {
  const id = String(raw || '')
    .trim()
    .toUpperCase();
  if (!id || !GTM_ID_RE.test(id)) return null;
  return id;
}

/** head에 해당 업체 GTM 컨테이너 1회 로드 */
export function loadCompanyGtm(gtmId?: string | null): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  const id = normalizeGtmId(gtmId);
  if (!id) return;
  if (document.getElementById(`gtm-script-${id}`)) return;

  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({ 'gtm.start': new Date().getTime(), event: 'gtm.js' });

  const script = document.createElement('script');
  script.id = `gtm-script-${id}`;
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtm.js?id=${encodeURIComponent(id)}`;
  document.head.appendChild(script);
}

/**
 * 예약 성공·완료 화면 표시 시 1회만.
 * 실패·검증오류·새로고침 후 재방문·같은 예약 재표시에서는 다시 안 쏨.
 */
export function pushHomepageReservationComplete(opts: {
  vendor: string;
  value: number;
  transactionId: string;
}): boolean {
  if (typeof window === 'undefined') return false;
  const vendor = String(opts.vendor || '')
    .trim()
    .toLowerCase();
  const transactionId = String(opts.transactionId || '').trim();
  const value = Number(opts.value);
  if (!vendor || !transactionId || !Number.isFinite(value) || value < 0) return false;

  const storageKey = `hp.gtm.reservation_complete.${transactionId}`;
  if (firedTxn.has(transactionId)) return false;
  try {
    if (sessionStorage.getItem(storageKey)) {
      firedTxn.add(transactionId);
      return false;
    }
    sessionStorage.setItem(storageKey, '1');
  } catch {
    /* private mode — 메모리 Set 만으로 중복 방지 */
  }
  firedTxn.add(transactionId);

  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({
    event: 'reservation_complete',
    vendor,
    value,
    currency: 'KRW',
    transaction_id: transactionId,
  });

  // 주차벅스 — 완료 화면에서도 Ads 전환(페이지 로드 방식). 제출 시점과 중복될 수 있어 txn 단위로만 1회.
  if (vendor === 'bucks' && typeof window.gtag === 'function') {
    window.gtag('event', 'conversion', {
      send_to: 'AW-18564457511/iYQuCIb-6LQdEKfInJRF',
      value: value > 0 ? value : 1.0,
      currency: 'KRW',
      transaction_id: transactionId,
    });
  }

  return true;
}
