import * as admin from 'firebase-admin';
import { createHash } from 'node:crypto';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import nodemailer from 'nodemailer';

/**
 * errorReports/{id} — 직원 앱 오류와 "문제 보내기".
 * 같은 오류는 한 문서로 묶고 횟수만 올린다. 전화번호·이메일처럼 보이는 값은 지운다.
 * 클라이언트는 읽거나 쓰지 못한다(규칙 없음 = 거부). 이 함수와 발송 함수만 쓴다.
 */
const COLLECTION = 'errorReports';
/** { gmailUser, appPassword, to } — 오류 메일 발송용 Gmail 앱 비밀번호. 클라이언트 접근 불가. */
const MAIL_DOC = 'opsSecrets/errorMail';

const KINDS = new Set(['crash', 'error', 'report']);
const APPS = new Set(['b2b', 'b2c', 'home']);
const MESSAGE_MAX = 300;
const STACK_MAX = 1500;
const NOTE_MAX = 500;
/** 단순 오류는 이만큼 쌓여야 보낸다. 화면 사망·직원 제보는 한 건이어도 보낸다. */
const ERROR_SEND_THRESHOLD = 3;
const SEND_LIMIT = 40;

function scrub(text: string): string {
  return text
    .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, '[email]')
    .replace(/\d[\d\s-]{6,}\d/g, '[number]')
    .replace(/([?&][\w-]+=)[^&\s#]*/g, '$1…');
}

function clip(value: unknown, max: number): string {
  return scrub(String(value ?? '').replace(/\s+/g, ' ').trim()).slice(0, max);
}

function clipStack(value: unknown): string {
  const lines = scrub(String(value ?? ''))
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 12);
  return lines.join('\n').slice(0, STACK_MAX);
}

function firstFrame(stack: string): string {
  const line = stack.split('\n').find((l) => /\.(js|ts|tsx)/.test(l)) || '';
  return line.replace(/:\d+:\d+\)?$/, '');
}

function fingerprint(app: string, kind: string, message: string, stack: string, screen: string): string {
  const base = [app, kind, message.replace(/\d+/g, '#'), firstFrame(stack), screen].join('|');
  return createHash('sha1').update(base).digest('hex').slice(0, 24);
}

function cleanApp(value: unknown): string {
  const app = String(value ?? '').trim();
  return APPS.has(app) ? app : 'b2b';
}

function cleanCompanyId(value: unknown): string {
  const id = String(value ?? '').trim();
  return /^[a-zA-Z0-9_-]{1,64}$/.test(id) ? id : '';
}

export const reportClientError = onCall(
  { region: 'us-central1', memory: '256MiB', timeoutSeconds: 15 },
  async (request) => {
    const data = (request.data ?? {}) as Record<string, unknown>;
    const kind = String(data.kind ?? '');
    if (!KINDS.has(kind)) throw new HttpsError('invalid-argument', 'kind');
    if (kind === 'report' && !request.auth) {
      throw new HttpsError('unauthenticated', '로그인 후 보내 주세요.');
    }

    const message = clip(data.message, MESSAGE_MAX);
    const note = clip(data.note, NOTE_MAX);
    if (!message && !note) throw new HttpsError('invalid-argument', 'empty');

    const stack = clipStack(data.stack);
    const screen = clip(data.screen, 60);
    const appBuild = clip(data.appBuild, 40);
    const platform = clip(data.platform, 20);
    const companyId = cleanCompanyId(data.companyId);
    const app = cleanApp(data.app);
    const now = new Date().toISOString();
    const db = admin.firestore();

    if (kind === 'report') {
      await db.collection(COLLECTION).add({
        app,
        kind,
        message: message || note.slice(0, MESSAGE_MAX),
        note,
        screen,
        appBuild,
        platform,
        companyIds: companyId ? [companyId] : [],
        count: 1,
        pendingCount: 1,
        firstAt: now,
        lastAt: now,
        status: 'open',
      });
      return { ok: true };
    }

    const ref = db.collection(COLLECTION).doc(fingerprint(app, kind, message, stack, screen));
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const prev = snap.data() || {};
      const companyIds = Array.isArray(prev.companyIds) ? prev.companyIds.map(String) : [];
      if (companyId && !companyIds.includes(companyId) && companyIds.length < 20) companyIds.push(companyId);
      tx.set(ref, {
        app,
        kind,
        message,
        stack,
        screen,
        appBuild,
        platform,
        companyIds,
        count: Number(prev.count || 0) + 1,
        pendingCount: Number(prev.pendingCount || 0) + 1,
        firstAt: prev.firstAt || now,
        lastAt: now,
        status: 'open',
        ...(prev.sentAt ? { sentAt: prev.sentAt } : {}),
      });
    });
    return { ok: true };
  }
);

type OpenReport = {
  id: string;
  app: string;
  kind: string;
  message: string;
  note?: string;
  stack?: string;
  screen?: string;
  appBuild?: string;
  platform?: string;
  companyIds?: string[];
  count: number;
  pendingCount: number;
  firstAt?: string;
  lastAt?: string;
};

function shouldSend(report: OpenReport): boolean {
  if (report.kind === 'crash' || report.kind === 'report') return true;
  return report.pendingCount >= ERROR_SEND_THRESHOLD;
}

const KIND_LABEL: Record<string, string> = {
  crash: '화면 멈춤',
  error: '오류',
  report: '직원 제보',
};

const APP_LABEL: Record<string, string> = {
  b2b: '직원 앱',
  b2c: '손님 앱',
  home: '업체 홈',
};

function appLabel(app?: string): string {
  return APP_LABEL[app || ''] || '직원 앱';
}

function kstTime(iso?: string): string {
  if (!iso) return '-';
  const d = new Date(new Date(iso).getTime() + 9 * 3600 * 1000);
  return d.toISOString().slice(5, 16).replace('T', ' ');
}

function mailSubject(due: OpenReport[]): string {
  const reports = due.filter((r) => r.kind === 'report').length;
  const crashes = due.filter((r) => r.kind === 'crash').length;
  const apps = [...new Set(due.map((r) => appLabel(r.app)))];
  const parts = [`${due.length}건`, apps.join(', ')];
  if (crashes) parts.push(`화면 멈춤 ${crashes}`);
  if (reports) parts.push(`직원 제보 ${reports}`);
  return `[에어픽] 오류 보고 ${parts.join(' · ')}`;
}

function mailBody(due: OpenReport[]): string {
  const blocks = due.map((r, i) => {
    const lines = [
      `${i + 1}. [${appLabel(r.app)} · ${KIND_LABEL[r.kind] || r.kind}] ${r.message}`,
      `   지난 보고 이후 ${r.pendingCount}회 (누적 ${r.count}회) · 처음 ${kstTime(r.firstAt)} · 마지막 ${kstTime(r.lastAt)}`,
      `   화면 ${r.screen || '-'} · 업체 ${(r.companyIds || []).join(', ') || '-'} · ${r.platform || '-'} · 빌드 ${r.appBuild || '-'}`,
    ];
    if (r.note && r.note !== r.message) lines.push(`   내용: ${r.note}`);
    if (r.stack) lines.push(`   위치:\n${r.stack.split('\n').slice(0, 6).map((l) => `     ${l}`).join('\n')}`);
    return lines.join('\n');
  });
  return [
    '직원 앱, 손님 앱, 업체 홈에서 아래 오류가 모였습니다.',
    '고칠 것이 있으면 이 메일 내용을 Cursor 채팅에 붙여 넣고 고쳐 달라고 하시면 됩니다.',
    '',
    ...blocks,
    '',
    `보고 번호: ${due.map((r) => r.id).join(', ')}`,
  ].join('\n');
}

/**
 * 열린 보고 중 보낼 만한 것이 있으면 메일을 한 통 보낸다.
 * 없으면 아무것도 보내지 않는다.
 */
export async function dispatchErrorReports(): Promise<{ open: number; sent: number; reason?: string }> {
  const db = admin.firestore();
  const snap = await db.collection(COLLECTION).where('status', '==', 'open').get();
  const open: OpenReport[] = snap.docs.map((doc) => {
    const d = doc.data();
    return {
      id: doc.id,
      app: cleanApp(d.app),
      kind: String(d.kind || ''),
      message: String(d.message || ''),
      note: d.note ? String(d.note) : undefined,
      stack: d.stack ? String(d.stack) : undefined,
      screen: d.screen ? String(d.screen) : undefined,
      appBuild: d.appBuild ? String(d.appBuild) : undefined,
      platform: d.platform ? String(d.platform) : undefined,
      companyIds: Array.isArray(d.companyIds) ? d.companyIds.map(String) : [],
      count: Number(d.count || 0),
      pendingCount: Number(d.pendingCount || 0),
      firstAt: d.firstAt ? String(d.firstAt) : undefined,
      lastAt: d.lastAt ? String(d.lastAt) : undefined,
    };
  });

  const due = open
    .filter(shouldSend)
    .sort((a, b) => b.pendingCount - a.pendingCount)
    .slice(0, SEND_LIMIT);
  if (!due.length) return { open: open.length, sent: 0, reason: 'nothing_due' };

  const config = (await db.doc(MAIL_DOC).get()).data() || {};
  const gmailUser = String(config.gmailUser || '').trim();
  const appPassword = String(config.appPassword || '').replace(/\s+/g, '');
  const to = String(config.to || gmailUser).trim();
  if (!gmailUser || !appPassword || !to) {
    logger.warn('[errorReports] mail not configured', { due: due.length });
    return { open: open.length, sent: 0, reason: 'not_configured' };
  }

  const transport = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: gmailUser, pass: appPassword },
  });
  try {
    await transport.sendMail({
      from: `에어픽 오류 알림 <${gmailUser}>`,
      to,
      subject: mailSubject(due),
      text: mailBody(due),
    });
  } catch (err) {
    logger.error('[errorReports] mail failed', { err: err instanceof Error ? err.message : String(err) });
    return { open: open.length, sent: 0, reason: 'mail_failed' };
  }

  const sentAt = new Date().toISOString();
  const batch = db.batch();
  for (const report of due) {
    batch.update(db.collection(COLLECTION).doc(report.id), { status: 'sent', pendingCount: 0, sentAt });
  }
  await batch.commit();
  return { open: open.length, sent: due.length };
}
