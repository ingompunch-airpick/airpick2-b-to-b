import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '../firebase';
import { ensureFirestoreAuth } from './reservationFirestore';
import { isRemoteImageUrl } from './reservationPhotos';

const UPLOAD_TIMEOUT_MS = 90_000;
const MAX_CERTIFICATES = 6;

function withTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`${label} 시간 초과 (${UPLOAD_TIMEOUT_MS / 1000}초)`)),
      UPLOAD_TIMEOUT_MS
    );
    promise
      .then((v) => {
        clearTimeout(timer);
        resolve(v);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

function dataUrlToCompressedBlob(dataUrl: string, maxWidth = 1600): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = img.width > maxWidth ? maxWidth / img.width : 1;
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('이미지 처리 실패'));
        return;
      }
      ctx.drawImage(img, 0, 0, w, h);
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('이미지 압축 실패'))),
        'image/jpeg',
        0.82
      );
    };
    img.onerror = () => reject(new Error('이미지를 읽을 수 없습니다.'));
    img.src = dataUrl;
  });
}

async function fileToJpegBlob(file: File): Promise<Blob> {
  if (!file.type.startsWith('image/')) {
    throw new Error('이미지 파일(JPG, PNG 등)만 업로드할 수 있습니다.');
  }
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('파일을 읽을 수 없습니다.'));
    reader.readAsDataURL(file);
  });
  return dataUrlToCompressedBlob(dataUrl);
}

function storagePathForCertificate(companyId: string): string {
  const safeCompany = (companyId || 'unknown').replace(/[^\w-]/g, '_');
  return `companies/${safeCompany}/insurance/${Date.now()}.jpg`;
}

export function getMaxInsuranceCertificates(): number {
  return MAX_CERTIFICATES;
}

export async function uploadInsuranceCertificate(companyId: string, file: File): Promise<string> {
  if (!companyId?.trim()) {
    throw new Error('업체 ID가 없어 증명서를 업로드할 수 없습니다. 업체를 먼저 선택해 주세요.');
  }

  await ensureFirestoreAuth();
  const blob = await fileToJpegBlob(file);
  const path = storagePathForCertificate(companyId);
  const storageRef = ref(storage, path);

  await withTimeout(uploadBytes(storageRef, blob, { contentType: 'image/jpeg' }), '보험 증명서 업로드');
  return withTimeout(getDownloadURL(storageRef), '보험 증명서 URL');
}

export function normalizeCertificateUrls(urls?: string[]): string[] {
  if (!urls?.length) return [];
  const seen = new Set<string>();
  return urls
    .map((p) => p?.trim())
    .filter((url): url is string => {
      if (!url || !isRemoteImageUrl(url) || seen.has(url)) return false;
      seen.add(url);
      return true;
    });
}
