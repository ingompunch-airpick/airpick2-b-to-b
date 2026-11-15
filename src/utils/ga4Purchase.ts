/**
 * 에어픽 공통 GA4 (G-258VBKY6C2) — /h/ 예약 purchase.
 * 업체별 GTM·reservation_complete 와 별개. 태그는 1회만 로드.
 */

import firebaseConfig from '../../firebase-applet-config.json' with { type: 'json' };

const GA4_MEASUREMENT_ID = String(
  (firebaseConfig as { measurementId?: string }).measurementId || 'G-258VBKY6C2'
).trim();

const purchaseFired = new Set<string>();

type GtagFn = (...args: unknown[]) => void;

declare global {
  interface Window {
    gtag?: GtagFn;
    __airpickGa4Configured?: boolean;
  }
}

/** G-258 로드. 이미 있으면 중복 삽입하지 않음. 업체 GTM은 그대로 둔다. */
export function ensureAirpickGa4(measurementId: string = GA4_MEASUREMENT_ID): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  const id = measurementId.trim();
  if (!id) return;

  window.dataLayer = window.dataLayer || [];
  if (typeof window.gtag !== 'function') {
    window.gtag = function gtag(...args: unknown[]) {
      window.dataLayer!.push(args as unknown as Record<string, unknown>);
    };
  }

  if (window.__airpickGa4Configured) return;
  if (
    document.querySelector(`script[src*="googletagmanager.com/gtag/js?id=${id}"]`) ||
    document.querySelector(`script[data-airpick-ga4="${id}"]`)
  ) {
    window.__airpickGa4Configured = true;
    return;
  }

  const script = document.createElement('script');
  script.async = true;
  script.dataset.airpickGa4 = id;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`;
  document.head.appendChild(script);
  window.gtag('js', new Date());
  window.gtag('config', id);
  window.__airpickGa4Configured = true;
}

export type PurchaseBookingPath = 'vendor_page' | 'airpick_main';
export type PurchaseBookingMethod = 'kakao' | 'guest' | 'vendor_form';

/** 예약 저장 성공 직후 1회. */
export function trackPurchaseOnce(opts: {
  transactionId: string;
  value: number;
  vendor: string;
  vendorName: string;
  bookingPath: PurchaseBookingPath;
  bookingMethod: PurchaseBookingMethod;
}): boolean {
  if (typeof window === 'undefined') return false;
  const transactionId = String(opts.transactionId || '').trim();
  const vendor = String(opts.vendor || '')
    .trim()
    .toLowerCase();
  const vendorName = String(opts.vendorName || '').trim() || vendor;
  const value = Number(opts.value);
  if (!transactionId || !vendor || !Number.isFinite(value) || value < 0) return false;

  const storageKey = `ga4.purchase.${transactionId}`;
  if (purchaseFired.has(transactionId)) return false;
  try {
    if (sessionStorage.getItem(storageKey)) {
      purchaseFired.add(transactionId);
      return false;
    }
    sessionStorage.setItem(storageKey, '1');
  } catch {
    /* private mode */
  }
  purchaseFired.add(transactionId);

  ensureAirpickGa4();

  try {
    if (typeof window.gtag !== 'function') return false;
    window.gtag('event', 'purchase', {
      transaction_id: transactionId,
      value,
      currency: 'KRW',
      vendor,
      booking_path: opts.bookingPath,
      booking_method: opts.bookingMethod,
      items: [
        {
          item_id: vendor,
          item_name: vendorName.slice(0, 100),
          price: value,
          quantity: 1,
        },
      ],
    });
    return true;
  } catch {
    return false;
  }
}
