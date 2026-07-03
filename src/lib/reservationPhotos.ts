import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '../firebase';
import { ensureFirestoreAuth } from './reservationFirestore';

const UPLOAD_TIMEOUT_MS = 90_000;

export function isRemoteImageUrl(value: string): boolean {
  const v = value.trim();
  return (v.startsWith('http://') || v.startsWith('https://')) && !v.startsWith('data:');
}

function withTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`${label} 시간 초과 (${UPLOAD_TIMEOUT_MS / 1000}초). Storage 규칙·네트워크를 확인하세요.`)),
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

/** 큰 base64 사진을 JPEG로 줄여 Storage 업로드 실패·지연을 줄임 */
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
      reject(new Error('이미지를 읽을 수 없습니다. JPG/PNG 파일을 다시 선택하거나 카메라로 촬영해 주세요.'));
    img.src = dataUrl;
  });
}

function storagePathForImage(
  companyId: string,
  reservationId: string,
  index: number
): string {
  return `reservations/${companyId}/${reservationId}/images/${Date.now()}_${index}.jpg`;
}

function formatUploadError(err: unknown): string {
  const code = (err as { code?: string })?.code || '';
  const message = err instanceof Error ? err.message : String(err);
  if (code === 'storage/unauthorized' || message.includes('permission')) {
    return 'Storage 권한 거부: Firebase Console → Storage → Rules 게시, 또는 `firebase deploy --only storage` 실행이 필요합니다.';
  }
  if (code === 'storage/unknown' || message.includes('404') || message.includes('bucket')) {
    return 'Storage 버킷 오류: Console → airpick-reservation → Storage → 「시작하기」로 Storage를 먼저 활성화하세요.';
  }
  if (code?.startsWith('auth/')) {
    return `로그인 오류(${code}): Authentication → Anonymous 사용을 켜고 localhost를 Authorized domains에 추가하세요.`;
  }
  return message || '알 수 없는 업로드 오류';
}

export async function uploadReservationImages(
  reservationId: string,
  companyId: string,
  sources: string[]
): Promise<string[]> {
  if (!reservationId || sources.length === 0) return [];

  await ensureFirestoreAuth();
  const safeCompany = (companyId || 'unknown').replace(/[^\w-]/g, '_');

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
      const path = storagePathForImage(safeCompany, reservationId, i);
      const storageRef = ref(storage, path);

      await withTimeout(
        uploadBytes(storageRef, blob, { contentType: 'image/jpeg' }),
        `사진 ${i + 1} 업로드`
      );
      const downloadUrl = await withTimeout(getDownloadURL(storageRef), `사진 ${i + 1} URL`);
      urls.push(downloadUrl);
    } catch (err) {
      throw new Error(formatUploadError(err));
    }
  }

  if (sources.some((s) => s?.trim().startsWith('data:')) && urls.length === 0) {
    throw new Error('사진 파일을 Storage에 올리지 못했습니다. JPG/PNG 이미지를 다시 선택해 주세요.');
  }

  return urls;
}

function storagePathForScratch(
  companyId: string,
  reservationId: string,
  index: number
): string {
  return `reservations/${companyId}/${reservationId}/scratch/${Date.now()}_${index}.jpg`;
}

/** 스크래치 사진 여러 장 업로드 (장수 제한 없음) */
export async function uploadScratchPhotos(
  reservationId: string,
  companyId: string,
  sources: string[]
): Promise<string[]> {
  if (!reservationId || sources.length === 0) return [];

  await ensureFirestoreAuth();
  const safeCompany = (companyId || 'unknown').replace(/[^\w-]/g, '_');
  const urls: string[] = [];

  for (let i = 0; i < sources.length; i++) {
    const src = sources[i]?.trim();
    if (!src) continue;

    if (isRemoteImageUrl(src)) {
      urls.push(src);
      continue;
    }

    if (!src.startsWith('data:')) continue;

    try {
      const blob = await dataUrlToCompressedBlob(src);
      const path = storagePathForScratch(safeCompany, reservationId, i);
      const storageRef = ref(storage, path);

      await withTimeout(
        uploadBytes(storageRef, blob, { contentType: 'image/jpeg' }),
        `스크래치 사진 ${i + 1} 업로드`
      );
      const downloadUrl = await withTimeout(
        getDownloadURL(storageRef),
        `스크래치 사진 ${i + 1} URL`
      );
      urls.push(downloadUrl);
    } catch (err) {
      throw new Error(formatUploadError(err));
    }
  }

  if (sources.some((s) => s?.trim().startsWith('data:')) && urls.length === 0) {
    throw new Error('사진을 Storage에 올리지 못했습니다. 다시 촬영해 주세요.');
  }

  return urls;
}
