import * as admin from 'firebase-admin';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import { randomUUID } from 'node:crypto';
import { assertPlatformAdmin } from '../admin/assertPlatformAdmin';
import { kstToday } from '../ops/insuranceExpiry';
import { checkPaths, INBOX_ID, PUBLIC_STEM, readDocument, responseFields } from './analyzeDocuments';
import { normalizeDate, reviewDocuments, type DocType } from './classify';
import { matchCompanies, type CompanyForMatch } from './match';

/**
 * 본사 「서류함」 — 업체 상관없이 서류를 넣으면
 *  analyzeDocumentInbox: 읽고(주민번호 가림·분류·값 읽기) 어느 업체 것인지 후보를 고른다. 저장하지 않음.
 *  applyInboxDocuments: 본사가 고른 업체마다 가린 사본을 공개 자리로 복사하고 업체 정보에 넣는다.
 * 원본·가린 사본은 companyDocuments/_inbox/… (본사만, storage.rules)
 */

const INBOX_PREFIX = `companyDocuments/${INBOX_ID}/`;
const MASKED_PREFIX = `${INBOX_PREFIX}masked/`;

function companyForMatch(doc: admin.firestore.QueryDocumentSnapshot): CompanyForMatch | null {
  const d = doc.data();
  if (doc.id === 'demo' || doc.id === 'airpick' || d.status === 'suspended') return null;
  const ins = (d.insurance || {}) as Record<string, unknown>;
  const reg = (d.businessRegistration || {}) as Record<string, unknown>;
  return {
    id: doc.id,
    name: String(d.name || doc.id),
    representative: d.representative ? String(d.representative) : undefined,
    parentCompanyId: d.parentCompanyId ? String(d.parentCompanyId) : undefined,
    businessNumber: reg.number ? String(reg.number) : undefined,
    businessName: reg.name ? String(reg.name) : undefined,
    insuredName: ins.insuredName ? String(ins.insuredName) : undefined,
    policyNumber: ins.policyNumber ? String(ins.policyNumber) : undefined,
    insuranceProvider: ins.provider ? String(ins.provider) : undefined,
  };
}

export const analyzeDocumentInbox = onCall(
  { region: 'asia-northeast3', memory: '1GiB', timeoutSeconds: 300, maxInstances: 2 },
  async (request) => {
    assertPlatformAdmin(request);
    const data = (request.data || {}) as { paths?: unknown };
    const paths = checkPaths(data.paths, `${INBOX_PREFIX}incoming/`);

    const [files, companiesSnap] = await Promise.all([
      Promise.all(paths.map((p) => readDocument(p))),
      admin.firestore().collection('companies').get(),
    ]);
    const companies = companiesSnap.docs
      .map(companyForMatch)
      .filter((c): c is CompanyForMatch => !!c);
    const today = kstToday();
    const bucket = admin.storage().bucket();

    const results = [];
    for (const [i, f] of files.entries()) {
      if (!f.ok || !f.extracted) {
        results.push({ ...responseFields(f), candidates: [], publishable: false });
        continue;
      }
      const candidates = matchCompanies(f.extracted, companies);
      const first = candidates.find((c) => c.selected);
      const [review] = reviewDocuments(
        [{ extracted: f.extracted, rrnMasked: f.rrnMasked, isPdf: f.isPdf }],
        today,
        first?.name
      );
      if (!first && f.extracted.docType !== 'other') {
        review.warnings.unshift('어느 업체 서류인지 찾지 못했어요. 아래에서 골라 주세요.');
      }
      let maskedPath: string | undefined;
      if (f.body && f.bodyType) {
        const ext = f.bodyType === 'application/pdf' ? 'pdf' : 'jpg';
        maskedPath = `${MASKED_PREFIX}${Date.now()}_${i}.${ext}`;
        await bucket.file(maskedPath).save(f.body, {
          resumable: false,
          metadata: { contentType: f.bodyType },
        });
      }
      results.push({
        ...responseFields(f, review),
        maskedPath,
        publishable: review.publishable && !!maskedPath,
        candidates,
      });
    }
    return { results };
  }
);

// ── 적용 ────────────────────────────────────────────────────────────────

interface ApplyItem {
  maskedPath?: unknown;
  docType?: unknown;
  companyIds?: unknown;
  business?: { name?: unknown; registrationNumber?: unknown; representative?: unknown };
  insurance?: {
    provider?: unknown;
    productName?: unknown;
    coverageLimitText?: unknown;
    periodStart?: unknown;
    periodEnd?: unknown;
    insuredName?: unknown;
    policyNumber?: unknown;
  };
}

function text(v: unknown, max = 120): string | undefined {
  const s = String(v ?? '').replace(/\s+/g, ' ').trim();
  return s ? s.slice(0, max) : undefined;
}

async function publishCopy(maskedPath: string, companyId: string, docType: DocType, index: number) {
  const bucket = admin.storage().bucket();
  const ext = maskedPath.endsWith('.pdf') ? 'pdf' : 'jpg';
  const dest = `companies/${companyId}/${PUBLIC_STEM[docType]}_${Date.now()}_${index}.${ext}`;
  const token = randomUUID();
  await bucket.file(maskedPath).copy(bucket.file(dest));
  await bucket.file(dest).setMetadata({
    cacheControl: 'public, max-age=31536000',
    metadata: { firebaseStorageDownloadTokens: token },
  });
  return `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(dest)}?alt=media&token=${token}`;
}

export const applyInboxDocuments = onCall(
  { region: 'asia-northeast3', memory: '512MiB', timeoutSeconds: 120, maxInstances: 2 },
  async (request) => {
    assertPlatformAdmin(request);
    const items = (Array.isArray((request.data || {}).items) ? request.data.items : []) as ApplyItem[];
    if (!items.length || items.length > 16) {
      throw new HttpsError('invalid-argument', '적용할 서류가 없어요.');
    }
    const db = admin.firestore();
    const now = new Date().toISOString();
    const done: Array<{ companyId: string; docType: string; ok: boolean; error?: string }> = [];

    for (const [index, item] of items.entries()) {
      const maskedPath = String(item.maskedPath || '');
      const docType = String(item.docType || '') as DocType;
      const companyIds = (Array.isArray(item.companyIds) ? item.companyIds : [])
        .map((c) => String(c || '').trim())
        .filter((c) => /^[a-z0-9_]{1,64}$/.test(c) && c !== INBOX_ID)
        .slice(0, 8);
      if (!maskedPath.startsWith(MASKED_PREFIX) || maskedPath.includes('..')) {
        throw new HttpsError('invalid-argument', '서류 경로가 올바르지 않아요.');
      }
      if (docType !== 'business_registration' && docType !== 'insurance_certificate') {
        throw new HttpsError('invalid-argument', '사업자등록증·보험증권만 넣을 수 있어요.');
      }

      for (const companyId of companyIds) {
        try {
          const ref = db.doc(`companies/${companyId}`);
          if (!(await ref.get()).exists) throw new Error('업체가 없어요.');
          const url = await publishCopy(maskedPath, companyId, docType, index);

          if (docType === 'business_registration') {
            const b = item.business || {};
            const number = String(b.registrationNumber ?? '').replace(/\D/g, '');
            await ref.update({
              'verificationDocuments.businessRegistrationUrl': url,
              businessRegistration: {
                ...(text(b.name, 80) ? { name: text(b.name, 80) } : {}),
                ...(number.length === 10
                  ? { number: `${number.slice(0, 3)}-${number.slice(3, 5)}-${number.slice(5)}` }
                  : {}),
                ...(text(b.representative, 40) ? { representative: text(b.representative, 40) } : {}),
                updatedAt: now,
              },
              updatedAt: now,
            });
          } else {
            const ins = item.insurance || {};
            const provider = text(ins.provider, 60);
            const limit = text(ins.coverageLimitText, 120);
            const patch: Record<string, unknown> = {
              'insurance.enrolled': true,
              'insurance.certificateUrl': url,
              'insurance.updatedAt': now,
              hasInsurance: true,
              sharesInsurance: true,
              updatedAt: now,
            };
            if (provider) {
              patch['insurance.provider'] = provider;
              patch.insuranceProvider = provider;
            }
            const product = text(ins.productName, 80);
            if (product) patch['insurance.productName'] = product;
            if (limit) {
              patch['insurance.coverageLimitText'] = limit;
              patch['insurance.coverageLimitWon'] = null;
              patch.insuranceLimit = null;
            }
            const start = normalizeDate(ins.periodStart);
            const end = normalizeDate(ins.periodEnd);
            if (start) patch['insurance.periodStart'] = start;
            if (end) patch['insurance.periodEnd'] = end;
            const insured = text(ins.insuredName, 80);
            if (insured) patch['insurance.insuredName'] = insured;
            const policy = text(ins.policyNumber, 60);
            if (policy) patch['insurance.policyNumber'] = policy;
            await ref.update(patch);
          }
          done.push({ companyId, docType, ok: true });
        } catch (err) {
          logger.warn('[applyInboxDocuments] failed', { companyId, docType, err: String(err) });
          done.push({ companyId, docType, ok: false, error: String((err as Error)?.message || err) });
        }
      }
    }
    return { results: done };
  }
);
