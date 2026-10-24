import { Capacitor } from '@capacitor/core';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase';

type ReportKind = 'crash' | 'error' | 'report';

const context = { companyId: '', screen: '' };
const sentThisSession = new Set<string>();
const SESSION_LIMIT = 20;

/** 브라우저 확장, 화면 크기 경고처럼 우리 코드와 무관한 오류 */
const IGNORED = [
  /ResizeObserver loop/i,
  /chrome-extension:\/\//i,
  /safari-extension:\/\//i,
  /^Script error\.?$/i,
];

export function setErrorReportContext(next: { companyId?: string; screen?: string }): void {
  if (next.companyId !== undefined) context.companyId = next.companyId;
  if (next.screen !== undefined) context.screen = next.screen;
}

function appBuild(): string {
  return String(import.meta.env.VITE_APP_BUILD || '');
}

function platform(): string {
  try {
    return Capacitor.getPlatform();
  } catch {
    return 'web';
  }
}

function send(kind: ReportKind, payload: { message: string; stack?: string; note?: string }): Promise<void> {
  const call = httpsCallable(functions, 'reportClientError');
  return call({
    app: 'b2b',
    kind,
    ...payload,
    screen: context.screen,
    companyId: context.companyId,
    appBuild: appBuild(),
    platform: platform(),
  }).then(() => undefined);
}

/** 오류를 서버에 남긴다. 실패해도 화면 동작에는 영향을 주지 않는다. */
export function reportError(kind: 'crash' | 'error', error: unknown, where = ''): void {
  const err = error instanceof Error ? error : new Error(String(error ?? 'unknown'));
  const message = [where, err.message].filter(Boolean).join(': ').slice(0, 300);
  const stack = String(err.stack || '');
  if (!message || IGNORED.some((re) => re.test(message) || re.test(stack))) return;
  if (import.meta.env.DEV) return;

  const key = `${kind}|${message}|${context.screen}`;
  if (sentThisSession.has(key) || sentThisSession.size >= SESSION_LIMIT) return;
  sentThisSession.add(key);
  void send(kind, { message, stack }).catch(() => undefined);
}

/** 직원이 직접 적어 보내는 "문제 보내기" */
export function sendProblemReport(note: string): Promise<void> {
  const text = note.trim();
  return send('report', { message: text.slice(0, 300), note: text });
}

let installed = false;

export function installGlobalErrorReporting(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  window.addEventListener('error', (event) => {
    reportError('error', event.error ?? event.message, 'window');
  });
  window.addEventListener('unhandledrejection', (event) => {
    reportError('error', event.reason, 'promise');
  });
}
