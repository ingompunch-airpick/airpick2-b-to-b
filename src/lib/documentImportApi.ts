import { httpsCallable } from 'firebase/functions';
import { ref, uploadBytes } from 'firebase/storage';
import { functionsSeoul, storage } from '../firebase';
import { ensureFirestoreAuth } from './firebaseAuth';

/** 서버 functions/src/documents/analyzeDocuments.ts 와 같은 모양 */
export type ImportedDocType =
  | 'business_registration'
  | 'insurance_certificate'
  | 'insurance_other'
  | 'other';

export interface ImportedDocResult {
  path: string;
  ok: boolean;
  error?: string;
  docType?: ImportedDocType;
  docTypeLabel?: string;
  docTitle?: string;
  business?: { name?: string; registrationNumber?: string; representative?: string; address?: string };
  insurance?: {
    insurer?: string;
    productName?: string;
    insuredName?: string;
    insuredBusinessNumber?: string;
    periodStart?: string;
    periodEnd?: string;
    coverageEnd?: string;
    limitSummary?: string;
  };
  rrnMasked: number;
  /** 주민등록번호를 가린 사본 — 손님 「원본 보기」에 쓰는 주소 */
  publicUrl?: string;
  /** 가리지 못한 번호가 남았을 수 있으면 false */
  publishable: boolean;
  warnings: string[];
  notes: string[];
  suggestion: {
    businessRegistration?: { name?: string; registrationNumber?: string; representative?: string };
    insurance?: {
      provider?: string;
      productName?: string;
      coverageLimitText?: string;
      periodStart?: string;
      periodEnd?: string;
    };
  };
}

export const MAX_IMPORT_FILES = 8;
const MAX_BYTES = 15 * 1024 * 1024;

/** 서류 원본을 본사·업체만 보는 곳에 올린다 */
async function uploadOriginal(companyId: string, file: File, index: number): Promise<string> {
  const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
  const contentType = isPdf ? 'application/pdf' : file.type || 'image/jpeg';
  if (!isPdf && !contentType.startsWith('image/')) {
    throw new Error(`${file.name}: 사진(JPG·PNG) 또는 PDF만 올릴 수 있어요.`);
  }
  if (file.size > MAX_BYTES) throw new Error(`${file.name}: 15MB 이하로 올려 주세요.`);
  const ext = isPdf ? 'pdf' : contentType === 'image/png' ? 'png' : 'jpg';
  const path = `companyDocuments/${companyId}/incoming/${Date.now()}_${index}.${ext}`;
  await uploadBytes(ref(storage, path), file, { contentType });
  return path;
}

/** 올리고 → 서버가 분류·읽기·주민번호 가림 → 결과 */
export async function importCompanyDocuments(
  companyId: string,
  files: File[]
): Promise<ImportedDocResult[]> {
  const id = companyId.trim().toLowerCase();
  if (!/^[a-z0-9_]{1,64}$/.test(id)) throw new Error('업체 아이디를 먼저 정해 주세요.');
  const list = files.slice(0, MAX_IMPORT_FILES);
  await ensureFirestoreAuth();
  const paths = await Promise.all(list.map((f, i) => uploadOriginal(id, f, i)));
  const call = httpsCallable<{ companyId: string; paths: string[] }, { results: ImportedDocResult[] }>(
    functionsSeoul,
    'analyzeCompanyDocuments',
    { timeout: 300_000 }
  );
  try {
    const res = await call({ companyId: id, paths });
    return res.data.results;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(msg || '서류를 읽지 못했어요.');
  }
}
