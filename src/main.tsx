import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import ErrorBoundary from './components/ErrorBoundary.tsx';
import VehicleReceiptPage from './pages/VehicleReceiptPage.tsx';
import { parseReceiptCodeFromPath } from './utils/receipt.ts';
import './index.css';

function Root() {
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

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
