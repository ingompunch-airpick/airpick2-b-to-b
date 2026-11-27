import * as admin from 'firebase-admin';
import { HttpsError, onCall, type CallableRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import { GoogleAuth } from 'google-auth-library';
import sharp from 'sharp';
import { randomUUID } from 'node:crypto';
import { PLATFORM_ADMIN_EMAILS } from '../admin/constants';
import { kstToday } from '../ops/insuranceExpiry';
import { findRrns, maskRects, maskSvg, symbolsFromVisionPage } from './rrn';
import {
  DOC_TYPE_LABEL,
  parseExtraction,
  reviewDocuments,
  type DocReview,
  type DocType,
  type ExtractedDoc,
} from './classify';

/**
 * 업체 서류 한 번에 올리기 — 사진·PDF 여러 장을 받아
 *  1) 글자 읽기(Cloud Vision) → 주민등록번호 뒤 7자리만 검게 가린 사본을 만든다(손님 공개용)
 *  2) Gemini가 서류 종류를 고르고 상호·보험기간·한도 등을 읽는다
 *  3) 만기 지남·증권 아님·상호 다름 같은 경고를 붙여 돌려준다
 * 업체 정보는 바꾸지 않는다. 화면에서 본사·업체가 확인하고 「적용」해야 입력칸에 들어간다.
 *
 * 원본은 companyDocuments/{companyId}/… (본사·해당 업체만 읽기, storage.rules)
 * 필요: Vertex AI API · Cloud Vision API 사용 설정
 */

/** Gemini 3.5 Flash — 서울 리전에는 없어서 가장 가까운 도쿄에서 처리 (2026-11 기준) */
const GEMINI_MODEL = 'gemini-3.5-flash';
const GEMINI_LOCATION = 'asia-northeast1';
const MAX_FILES = 8;
const MAX_BYTES = 15 * 1024 * 1024;
const MAX_EDGE = 2400;
/** 서류함 — 업체를 아직 모르는 서류를 두는 곳 (companyDocuments/_inbox/…) */
export const INBOX_ID = '_inbox';

const auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] });

function projectId(): string {
  return (
    process.env.GCLOUD_PROJECT ||
    process.env.GOOGLE_CLOUD_PROJECT ||
    admin.app().options.projectId ||
    'airpick-reservation'
  );
}

async function googlePost<T>(url: string, data: unknown): Promise<T> {
  const client = await auth.getClient();
  const res = await client.request<T>({ url, method: 'POST', data, timeout: 90_000 });
  return res.data;
}

// ── 권한 ────────────────────────────────────────────────────────────────

async function assertCompanyAccess(request: CallableRequest, companyId: string): Promise<void> {
  const token = request.auth?.token;
  if (!request.auth || !token) throw new HttpsError('unauthenticated', '로그인이 필요합니다.');
  const email = typeof token.email === 'string' ? token.email.trim().toLowerCase() : '';
  if (email && (PLATFORM_ADMIN_EMAILS as readonly string[]).includes(email)) return;
  const partner = typeof token.partnerCompanyId === 'string' ? token.partnerCompanyId : '';
  if (!partner) throw new HttpsError('permission-denied', '업체 계정으로 로그인해 주세요.');
  if (partner === companyId) return;
  const wawa = ['wawa', 'wawa_valet'];
  if (wawa.includes(partner) && wawa.includes(companyId)) return;
  const snap = await admin.firestore().doc(`companies/${companyId}`).get();
  if (snap.exists && snap.get('parentCompanyId') === partner) return;
  throw new HttpsError('permission-denied', '이 업체 서류를 올릴 권한이 없어요.');
}

// ── 글자 읽기 (Cloud Vision) ─────────────────────────────────────────────

interface VisionAnnotation {
  text?: string;
  pages?: Array<Parameters<typeof symbolsFromVisionPage>[0]>;
}

async function ocrImage(jpeg: Buffer): Promise<VisionAnnotation> {
  const res = await googlePost<{
    responses?: Array<{ fullTextAnnotation?: VisionAnnotation; error?: { message?: string } }>;
  }>('https://vision.googleapis.com/v1/images:annotate', {
    requests: [
      {
        image: { content: jpeg.toString('base64') },
        features: [{ type: 'DOCUMENT_TEXT_DETECTION' }],
        imageContext: { languageHints: ['ko', 'en'] },
      },
    ],
  });
  const first = res.responses?.[0];
  if (first?.error?.message) throw new Error(`글자 읽기 실패: ${first.error.message}`);
  return first?.fullTextAnnotation || {};
}

async function ocrPdf(pdf: Buffer): Promise<VisionAnnotation[]> {
  const res = await googlePost<{
    responses?: Array<{ responses?: Array<{ fullTextAnnotation?: VisionAnnotation }> }>;
  }>('https://vision.googleapis.com/v1/files:annotate', {
    requests: [
      {
        inputConfig: { content: pdf.toString('base64'), mimeType: 'application/pdf' },
        features: [{ type: 'DOCUMENT_TEXT_DETECTION' }],
        imageContext: { languageHints: ['ko', 'en'] },
        pages: [1, 2, 3, 4, 5],
      },
    ],
  });
  return (res.responses?.[0]?.responses || []).map((r) => r.fullTextAnnotation || {});
}

// ── 서류 읽기 (Gemini) ───────────────────────────────────────────────────

const PROMPT = `이 파일은 인천공항 주차대행 업체가 플랫폼 입점을 위해 낸 서류 1건이다.
보이는 내용만 그대로 읽어라. 추측하지 말고, 안 보이면 빈 문자열로 둔다.

- docType: business_registration(사업자등록증) / insurance_certificate(보험증권·보험가입증명서·가입사실증명서) /
  insurance_other(청약서·계약변경신청서·영수증 등 증권이 아닌 보험 서류) / other(그 밖의 서류)
- docTitle: 서류 맨 위 제목 그대로
- business: name(상호), registrationNumber(등록번호), representative(대표자), address(사업장 소재지)
- insurance: insurer(보험회사), productName(보험종목·상품명), insuredName(피보험자),
  insuredBusinessNumber(피보험자 사업자번호), policyNumber(증권번호·계약번호), periodStart·periodEnd(보험기간 시작·끝, YYYY-MM-DD),
  coverageEnd(담보별 유효기간 중 가장 이른 끝 날짜. 보험기간 끝과 같으면 빈 문자열),
  limitSummary(보상한도 요약을 「대인 무한 · 대물 2억 · 자차 1천만」처럼 짧게. 1인당/1사고당이 나뉘면 1사고당)
- unmaskedRrnCount: 뒷자리가 가려지지 않은 주민등록번호·외국인등록번호 개수 (예: 900101-1234567).
  뒷자리가 *로 가려진 번호(900101-*******)는 세지 않는다.
- relatedNames: 서류에 나온 상호와 사람 이름을 모두(계약자·피보험자·운전자·대표자). 주민번호·전화번호는 넣지 않는다.`;

const SCHEMA = {
  type: 'OBJECT',
  properties: {
    docType: {
      type: 'STRING',
      enum: ['business_registration', 'insurance_certificate', 'insurance_other', 'other'],
    },
    docTitle: { type: 'STRING' },
    business: {
      type: 'OBJECT',
      properties: {
        name: { type: 'STRING' },
        registrationNumber: { type: 'STRING' },
        representative: { type: 'STRING' },
        address: { type: 'STRING' },
      },
    },
    insurance: {
      type: 'OBJECT',
      properties: {
        insurer: { type: 'STRING' },
        productName: { type: 'STRING' },
        insuredName: { type: 'STRING' },
        insuredBusinessNumber: { type: 'STRING' },
        policyNumber: { type: 'STRING' },
        periodStart: { type: 'STRING' },
        periodEnd: { type: 'STRING' },
        coverageEnd: { type: 'STRING' },
        limitSummary: { type: 'STRING' },
      },
    },
    unmaskedRrnCount: { type: 'INTEGER' },
    relatedNames: { type: 'ARRAY', items: { type: 'STRING' } },
  },
  required: ['docType', 'docTitle', 'unmaskedRrnCount'],
};

async function extractWithGemini(file: Buffer, mimeType: string, ocrText: string): Promise<ExtractedDoc> {
  const url =
    `https://${GEMINI_LOCATION}-aiplatform.googleapis.com/v1/projects/${projectId()}` +
    `/locations/${GEMINI_LOCATION}/publishers/google/models/${GEMINI_MODEL}:generateContent`;
  const res = await googlePost<{
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  }>(url, {
    contents: [
      {
        role: 'user',
        parts: [
          { inlineData: { mimeType, data: file.toString('base64') } },
          { text: `${PROMPT}\n\n참고 — 글자 인식 결과(틀릴 수 있음):\n${ocrText.slice(0, 12000)}` },
        ],
      },
    ],
    generationConfig: { responseMimeType: 'application/json', responseSchema: SCHEMA },
  });
  const text = (res.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('');
  return parseExtraction(text);
}

// ── 저장 ────────────────────────────────────────────────────────────────

export const PUBLIC_STEM: Record<DocType, string> = {
  business_registration: 'documents/business_registration',
  insurance_certificate: 'insurance/certificate',
  insurance_other: 'insurance/other',
  other: 'documents/other',
};

export async function savePublicCopy(
  companyId: string,
  docType: DocType,
  body: Buffer,
  contentType: string,
  index: number
): Promise<string> {
  const bucket = admin.storage().bucket();
  const ext = contentType === 'application/pdf' ? 'pdf' : 'jpg';
  const path = `companies/${companyId}/${PUBLIC_STEM[docType]}_${Date.now()}_${index}.${ext}`;
  const token = randomUUID();
  await bucket.file(path).save(body, {
    resumable: false,
    metadata: {
      contentType,
      cacheControl: 'public, max-age=31536000',
      metadata: { firebaseStorageDownloadTokens: token },
    },
  });
  return `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(path)}?alt=media&token=${token}`;
}

// ── 한 장 처리 ───────────────────────────────────────────────────────────

interface ReadResult {
  path: string;
  ok: boolean;
  error?: string;
  extracted?: ExtractedDoc;
  rrnMasked: number;
  isPdf: boolean;
  /** 손님에게 보여도 되는 몸통 — 사진은 주민번호를 가린 JPEG, PDF는 번호가 없을 때만 원본 */
  body?: Buffer;
  bodyType?: string;
}

/** 파일 하나 읽기 — 글자 위치로 주민번호를 가리고, AI로 종류·값을 읽는다. 저장은 하지 않는다. */
export async function readDocument(path: string): Promise<ReadResult> {
  const base: ReadResult = { path, ok: false, rrnMasked: 0, isPdf: false };
  try {
    const file = admin.storage().bucket().file(path);
    const [meta] = await file.getMetadata();
    const size = Number(meta.size || 0);
    if (size > MAX_BYTES) return { ...base, error: '15MB 이하 파일만 올릴 수 있어요.' };
    const contentType = String(meta.contentType || '');
    const [raw] = await file.download();

    if (contentType === 'application/pdf') {
      const pages = await ocrPdf(raw);
      const ocrText = pages.map((p) => p.text || '').join('\n');
      const rrnFound = pages.reduce(
        (n, p) => n + (p.pages || []).reduce((m, pg) => m + findRrns(symbolsFromVisionPage(pg)).length, 0),
        0
      );
      const extracted = await extractWithGemini(raw, 'application/pdf', ocrText);
      extracted.unmaskedRrnCount = Math.max(extracted.unmaskedRrnCount, rrnFound);
      const shareable = extracted.unmaskedRrnCount === 0 && extracted.docType !== 'other';
      return {
        ...base,
        ok: true,
        isPdf: true,
        extracted,
        ...(shareable ? { body: raw, bodyType: 'application/pdf' } : {}),
      };
    }

    if (!contentType.startsWith('image/')) {
      return { ...base, error: '사진(JPG·PNG) 또는 PDF만 읽을 수 있어요.' };
    }

    // 사진 방향을 바로 세우고 크기를 맞춘 뒤, 그 이미지 기준으로 글자 위치를 읽고 가린다
    const jpeg = await sharp(raw)
      .rotate()
      .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 90 })
      .toBuffer();
    const { width = 0, height = 0 } = await sharp(jpeg).metadata();
    const ocr = await ocrImage(jpeg);
    const hits = (ocr.pages || []).flatMap((pg) => findRrns(symbolsFromVisionPage(pg)));
    const rects = maskRects(hits, width, height);
    const masked = rects.length
      ? await sharp(jpeg)
          .composite([{ input: Buffer.from(maskSvg(rects, width, height)), top: 0, left: 0 }])
          .jpeg({ quality: 90 })
          .toBuffer()
      : jpeg;

    const extracted = await extractWithGemini(jpeg, 'image/jpeg', ocr.text || '');
    return {
      ...base,
      ok: true,
      extracted,
      rrnMasked: hits.length,
      ...(extracted.docType !== 'other' ? { body: masked, bodyType: 'image/jpeg' } : {}),
    };
  } catch (err) {
    logger.warn('[documents] read failed', { path, err: String(err) });
    const msg = String((err as { message?: string })?.message || err);
    const hint = /SERVICE_DISABLED|has not been used|is disabled/i.test(msg)
      ? 'Vision·Vertex AI API가 꺼져 있어요. 구글 클라우드에서 사용 설정해 주세요.'
      : '이 파일을 읽지 못했어요. 더 밝고 반듯하게 찍어서 다시 올려 주세요.';
    return { ...base, error: hint };
  }
}

export function responseFields(r: ReadResult, review?: DocReview) {
  const docType = r.extracted?.docType;
  return {
    path: r.path,
    ok: r.ok,
    error: r.error,
    docType,
    docTypeLabel: docType ? DOC_TYPE_LABEL[docType] : undefined,
    docTitle: r.extracted?.docTitle,
    business: r.extracted?.business,
    insurance: r.extracted?.insurance,
    rrnMasked: r.rrnMasked,
    warnings: review?.warnings || [],
    notes: review?.notes || [],
    suggestion: review?.suggestion || {},
  };
}

export function checkPaths(raw: unknown, prefix: string): string[] {
  const paths = (Array.isArray(raw) ? raw : [])
    .map((p) => String(p || ''))
    .filter((p) => p.startsWith(prefix) && !p.includes('..'));
  if (!paths.length) throw new HttpsError('invalid-argument', '올린 파일이 없어요.');
  if (paths.length > MAX_FILES) {
    throw new HttpsError('invalid-argument', `한 번에 ${MAX_FILES}장까지 올릴 수 있어요.`);
  }
  return paths;
}

// ── 호출 ────────────────────────────────────────────────────────────────

export const analyzeCompanyDocuments = onCall(
  { region: 'asia-northeast3', memory: '1GiB', timeoutSeconds: 300, maxInstances: 3 },
  async (request) => {
    const data = (request.data || {}) as { companyId?: unknown; paths?: unknown };
    const companyId = String(data.companyId || '').trim();
    if (!/^[a-z0-9_]{1,64}$/.test(companyId) || companyId === INBOX_ID) {
      throw new HttpsError('invalid-argument', '업체 아이디가 올바르지 않아요.');
    }
    await assertCompanyAccess(request, companyId);
    const paths = checkPaths(data.paths, `companyDocuments/${companyId}/`);

    const companySnap = await admin.firestore().doc(`companies/${companyId}`).get();
    const companyName = String(companySnap.get('name') || '').trim() || undefined;

    const files = await Promise.all(paths.map((p) => readDocument(p)));
    const okFiles = files.filter((f) => f.ok && f.extracted);
    const reviews = reviewDocuments(
      okFiles.map((f) => ({ extracted: f.extracted!, rrnMasked: f.rrnMasked, isPdf: f.isPdf })),
      kstToday(),
      companyName
    );
    const reviewByPath = new Map<string, DocReview>(okFiles.map((f, i) => [f.path, reviews[i]]));

    const results = [];
    for (const [i, f] of files.entries()) {
      const review = reviewByPath.get(f.path);
      const publicUrl =
        f.body && f.bodyType && f.extracted
          ? await savePublicCopy(companyId, f.extracted.docType, f.body, f.bodyType, i)
          : undefined;
      results.push({
        ...responseFields(f, review),
        publicUrl,
        publishable: review ? review.publishable && !!publicUrl : false,
      });
    }
    return { results };
  }
);
