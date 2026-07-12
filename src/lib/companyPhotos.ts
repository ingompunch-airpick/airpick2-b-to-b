import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '../firebase';
import { ensureFirestoreAuth } from './firebaseAuth';

const UPLOAD_TIMEOUT_MS = 90_000;
const MAX_PARKING_PHOTOS = 5;

export function isRemoteImageUrl(value: string): boolean {
  const v = value.trim();
  return (v.startsWith('http://') || v.startsWith('https://')) && !v.startsWith('data:');
}

function withTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () =>
        reject(
          new Error(
            `${label} 시간 초과 (${UPLOAD_TIMEOUT_MS / 1000}초). Storage 규칙·네트워크를 확인하세요.`
          )
        ),
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
      try {
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
      } catch (e) {
        reject(e instanceof Error ? e : new Error('이미지 처리 실패'));
      }
    };
    img.onerror = () =>
      reject(new Error('이미지를 읽을 수 없습니다. JPG/PNG 파일을 다시 선택해 주세요.'));
    img.src = dataUrl;
  });
}

function formatUploadError(err: unknown): string {
  const code = (err as { code?: string })?.code || '';
  const message = err instanceof Error ? err.message : String(err);
  if (code === 'storage/unauthorized' || message.includes('permission')) {
    return 'Storage 권한 거부: Firebase Console → Storage → Rules 게시, 또는 `firebase deploy --only storage` 실행이 필요합니다.';
  }
  if (code === 'storage/unknown' || message.includes('404') || message.includes('bucket')) {
    return 'Storage 버킷 오류: Console에서 Storage를 먼저 활성화하세요.';
  }
  if (code?.startsWith('auth/')) {
    return `로그인 오류(${code}): Authentication → Anonymous 사용을 확인하세요.`;
  }
  return message || '알 수 없는 업로드 오류';
}

export function normalizeCompanyParkingPhotos(urls: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of urls) {
    const url = String(raw || '').trim();
    if (!url || seen.has(url)) continue;
    seen.add(url);
    out.push(url);
    if (out.length >= MAX_PARKING_PHOTOS) break;
  }
  return out;
}

/** 가맹점 주차장 사진 → companies/{companyId}/parking/… */
export async function uploadCompanyParkingImages(
  companyId: string,
  sources: string[]
): Promise<string[]> {
  if (!companyId || sources.length === 0) return [];

  await ensureFirestoreAuth();
  const safeCompany = companyId.replace(/[^\w-]/g, '_').toLowerCase();
  const urls: string[] = [];

  for (let i = 0; i < sources.length; i++) {
    const src = sources[i]?.trim();
    if (!src) continue;

    if (isRemoteImageUrl(src)) {
      urls.push(src);
      continue;
    }

    if (!src.startsWith('data:')) {
      console.warn('Skipped non-image entry at index', i);
      continue;
    }

    try {
      const blob = await dataUrlToCompressedBlob(src);
      const path = `companies/${safeCompany}/parking/${Date.now()}_${i}.jpg`;
      const storageRef = ref(storage, path);
      await withTimeout(
        uploadBytes(storageRef, blob, { contentType: 'image/jpeg' }),
        `주차장 사진 ${i + 1} 업로드`
      );
      const downloadUrl = await withTimeout(getDownloadURL(storageRef), `주차장 사진 ${i + 1} URL`);
      urls.push(downloadUrl);
    } catch (err) {
      throw new Error(formatUploadError(err));
    }
  }

  if (sources.some((s) => s?.trim().startsWith('data:')) && urls.length === 0) {
    throw new Error('주차장 사진을 Storage에 올리지 못했습니다. JPG/PNG를 다시 선택해 주세요.');
  }

  return normalizeCompanyParkingPhotos(urls);
}

export { MAX_PARKING_PHOTOS };
