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

// #root 가 없더라도(문서 변조·확장 프로그램 등) 빈 화면으로 끝나지 않게 직접 만든다.
function resolveRootElement(): HTMLElement {
  const existing = document.getElementById('root');
  if (existing) return existing;
  const created = document.createElement('div');
  created.id = 'root';
  document.body.appendChild(created);
  return created;
}

try {
  createRoot(resolveRootElement()).render(
    <StrictMode>
      <Root />
    </StrictMode>,
  );
} catch (err) {
  console.error('[boot] render failed', err);
}

// 렌더가 실패해도 네이티브 스플래시(아이콘 화면)에 고착되지 않게 항상 해제한다.
void dismissNativeSplash();
window.setTimeout(() => {
  void dismissNativeSplash();
}, 2500);
