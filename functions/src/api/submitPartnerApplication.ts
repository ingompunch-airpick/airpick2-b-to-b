import * as admin from 'firebase-admin';
import { onRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import nodemailer from 'nodemailer';

/**
 * 에어픽.kr /partner 「입점 상담 신청」 → partnerApplications 저장 + 본사 메일.
 * B2C firebase.json `/api/partner-application` 이 이 함수로 연결된다.
 * (2026-11-14 B2C 저장소에서 옮김 — 그동안 배포가 빠져 404였음)
 */
const MEMO_MAX = 1000;
/** 오류 보고 메일과 같은 설정(gmailUser·appPassword·to) 사용 */
const MAIL_DOC = 'opsSecrets/errorMail';

function digitsPhone(phone: string): string {
  return phone.replace(/\D/g, '');
}

function formatPhone(d: string): string {
  if (d.length === 11) return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  return d;
}

async function notifyHq(app: {
  id: string;
  companyName: string;
  contactName: string;
  phone: string;
  memo: string;
}): Promise<void> {
  const config = (await admin.firestore().doc(MAIL_DOC).get()).data() || {};
  const gmailUser = String(config.gmailUser || '').trim();
  const appPassword = String(config.appPassword || '').replace(/\s+/g, '');
  const to = String(config.to || gmailUser).trim();
  if (!gmailUser || !appPassword || !to) {
    logger.warn('[partnerApplication] mail not configured', { id: app.id });
    return;
  }
  const transport = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: gmailUser, pass: appPassword },
  });
  await transport.sendMail({
    from: `에어픽 입점 신청 <${gmailUser}>`,
    to,
    subject: `[에어픽] 입점 상담 신청 — ${app.companyName}`,
    text: [
      '에어픽.kr 파트너 페이지에서 입점 상담 신청이 들어왔습니다.',
      '',
      `업체명: ${app.companyName}`,
      `담당자: ${app.contactName}`,
      `연락처: ${formatPhone(app.phone)}`,
      `메모: ${app.memo || '(없음)'}`,
      '',
      `신청 번호: ${app.id} (Firestore partnerApplications)`,
    ].join('\n'),
  });
}

export const submitPartnerApplication = onRequest(
  { region: 'asia-northeast3', cors: true },
  async (req, res) => {
    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'method_not_allowed' });
      return;
    }

    const body = (req.body ?? {}) as Record<string, unknown>;
    const companyName = String(body.companyName ?? '').trim().slice(0, 120);
    const contactName = String(body.contactName ?? '').trim().slice(0, 80);
    const phone = digitsPhone(String(body.phone ?? '')).slice(0, 15);
    const memo = String(body.memo ?? '').trim().slice(0, MEMO_MAX);

    if (!companyName || !contactName || !phone) {
      res.status(400).json({ error: 'missing_fields' });
      return;
    }
    if (phone.length < 9 || phone.length > 11) {
      res.status(400).json({ error: 'invalid_phone' });
      return;
    }

    try {
      const ref = await admin.firestore().collection('partnerApplications').add({
        companyName,
        contactName,
        phone,
        memo: memo || null,
        status: 'new',
        source: 'www.partner',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      logger.info('partner_application_created', { id: ref.id });
      try {
        await notifyHq({ id: ref.id, companyName, contactName, phone, memo });
      } catch (err) {
        // 메일 실패해도 신청은 저장됨 — 오류 보고로 남김
        logger.error('[partnerApplication] mail failed', {
          id: ref.id,
          err: err instanceof Error ? err.message : String(err),
        });
      }
      res.status(200).json({ ok: true, id: ref.id });
    } catch (err) {
      logger.error('partner_application_failed', err);
      res.status(500).json({ error: 'server_error' });
    }
  }
);
