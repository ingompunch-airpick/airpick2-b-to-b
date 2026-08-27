import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import { Capacitor } from '@capacitor/core';
import { SplashScreen } from '@capacitor/splash-screen';
import App from './App.tsx';
import ErrorBoundary from './components/ErrorBoundary.tsx';
import HomepageBookingPage from './pages/HomepageBookingPage.tsx';
import VehicleReceiptPage from './pages/VehicleReceiptPage.tsx';
import { parseHomepageCompanyIdFromPath } from './utils/homepageBookingPath.ts';
import { parseReceiptCodeFromPath } from './utils/receipt.ts';
import './index.css';

async function dismissNativeSplash(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await SplashScreen.hide({ fadeOutDuration: 200 });
  } catch (err) {
    console.warn('[splash] hide failed', err);
  }
}

function Root() {
  const homepageCompanyId = parseHomepageCompanyIdFromPath(window.location.pathname);
  if (homepageCompanyId) {
    return (
      <ErrorBoundary>
        <HomepageBookingPage companyId={homepageCompanyId} />
      </ErrorBoundary>
    );
  }

  const receiptCode = parseReceiptCodeFromPath(window.location.pathname);
  if (receiptCode) {
    return (
      <ErrorBoundary>
        <VehicleReceiptPage code={receiptCode} />
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  );
}

const rootEl = document.getElementById('root');
if (rootEl) {
  createRoot(rootEl).render(
    <StrictMode>
      <Root />
    </StrictMode>,
  );
  void dismissNativeSplash();
  window.setTimeout(() => {
    void dismissNativeSplash();
  }, 2500);
}
