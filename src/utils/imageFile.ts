/** Android WebView·갤러리: type 이 비어 있거나 octet-stream 인 경우가 많음 */
export function isImageLikeFile(file: File): boolean {
  const type = (file.type || '').toLowerCase();
  if (type.startsWith('image/')) return true;

  const name = file.name || '';
  if (/\.(jpe?g|png|webp|heic|heif|gif|bmp)$/i.test(name)) return true;

  // 갤러리에서 이름·MIME 없이 넘어오는 경우 (image/* 피커 결과)
  if ((type === '' || type === 'application/octet-stream') && file.size > 0) {
    return file.size <= 30 * 1024 * 1024;
  }

  return false;
}

export async function readImageFileAsDataUrl(file: File): Promise<string> {
  const fromReader = await new Promise<string | null>((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      resolve(typeof reader.result === 'string' ? reader.result : null);
    };
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });

  if (fromReader?.startsWith('data:image/')) {
    return fromReader;
  }

  return decodeViaObjectUrl(file);
}

function decodeViaObjectUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const mime = file.type?.startsWith('image/') ? file.type : 'image/jpeg';
    const blob = file.slice(0, file.size, mime);
    const objectUrl = URL.createObjectURL(blob);
    const img = new Image();

    img.onload = () => {
      try {
        const maxDim = 2560;
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          const scale = maxDim / Math.max(width, height);
          width = Math.round(width * scale);
          height = Math.round(height * scale);
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('이미지 처리 실패'));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
        if (!dataUrl.startsWith('data:image/')) {
          reject(new Error('이미지 변환 실패'));
          return;
        }
        resolve(dataUrl);
      } finally {
        URL.revokeObjectURL(objectUrl);
      }
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      const ext = (file.name || '').toLowerCase();
      if (ext.endsWith('.heic') || ext.endsWith('.heif') || file.type.includes('heic')) {
        reject(new Error('HEIC 사진은 이 기기에서 열 수 없습니다. 카메라로 JPG 촬영하거나 갤러리에서 JPG를 선택해 주세요.'));
      } else {
        reject(new Error('이미지를 열 수 없습니다. JPG·PNG 파일을 선택해 주세요.'));
      }
    };

    img.src = objectUrl;
  });
}

export async function readImageFilesAsDataUrls(files: FileList | File[]): Promise<string[]> {
  const list = Array.from(files).filter(isImageLikeFile);
  if (!list.length) {
    throw new Error('이미지 파일(JPG·PNG 등)만 선택할 수 있습니다.');
  }

  const results: string[] = [];
  const errors: string[] = [];

  for (const file of list) {
    try {
      results.push(await readImageFileAsDataUrl(file));
    } catch (err) {
      const msg = err instanceof Error ? err.message : '읽기 실패';
      errors.push(file.name ? `${file.name}: ${msg}` : msg);
    }
  }

  if (!results.length) {
    throw new Error(errors[0] || '선택한 사진을 읽지 못했습니다.');
  }

  if (errors.length) {
    console.warn('Some gallery images skipped:', errors);
  }

  return results;
}

export function safePersistPhotoDraft(key: string, photos: string[]): void {
  try {
    if (photos.length > 0) {
      localStorage.setItem(key, JSON.stringify(photos));
    } else {
      localStorage.removeItem(key);
    }
  } catch {
    // Android WebView localStorage 용량 초과 — 화면 상태는 유지, 업로드는 가능
    console.warn('Photo draft not saved to localStorage (quota)');
    // 예전에 저장된 1장짜리 초안이 남아 촬영 중 덮어쓰기에 쓰이지 않게 제거
    try {
      localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  }
}
