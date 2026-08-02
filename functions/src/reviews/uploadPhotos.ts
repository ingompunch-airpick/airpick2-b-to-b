import { randomUUID } from 'crypto';
import * as admin from 'firebase-admin';

const MAX_PHOTOS = 3;
const MAX_BYTES = 1.5 * 1024 * 1024;

function parseDataUrl(dataUrl: string): { buffer: Buffer; contentType: string } | null {
  const m = /^data:(image\/(?:jpeg|jpg|png|webp));base64,([A-Za-z0-9+/=]+)$/i.exec(dataUrl.trim());
  if (!m) return null;
  const contentType = m[1]!.toLowerCase() === 'image/jpg' ? 'image/jpeg' : m[1]!.toLowerCase();
  try {
    const buffer = Buffer.from(m[2]!, 'base64');
    if (!buffer.length || buffer.length > MAX_BYTES) return null;
    return { buffer, contentType };
  } catch {
    return null;
  }
}

/**
 * 후기 사진 data URL → Storage `reviews/{reservationId}/…`
 * 실패 시 해당 장은 건너뛰고 성공한 URL만 반환.
 */
export async function uploadReviewPhotosFromDataUrls(
  reservationId: string,
  dataUrls: unknown
): Promise<string[]> {
  if (!Array.isArray(dataUrls) || dataUrls.length === 0) return [];

  const bucket = admin.storage().bucket();
  const urls: string[] = [];
  const slice = dataUrls.slice(0, MAX_PHOTOS);

  for (let i = 0; i < slice.length; i++) {
    const raw = String(slice[i] ?? '');
    const parsed = parseDataUrl(raw);
    if (!parsed) continue;

    const token = randomUUID();
    const ext = parsed.contentType === 'image/png' ? 'png' : parsed.contentType === 'image/webp' ? 'webp' : 'jpg';
    const path = `reviews/${reservationId}/${Date.now()}_${i}.${ext}`;
    const file = bucket.file(path);

    await file.save(parsed.buffer, {
      resumable: false,
      metadata: {
        contentType: parsed.contentType,
        cacheControl: 'public, max-age=31536000',
        metadata: {
          firebaseStorageDownloadTokens: token,
        },
      },
    });

    const encoded = encodeURIComponent(path);
    urls.push(
      `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encoded}?alt=media&token=${token}`
    );
  }

  return urls;
}

export const REVIEW_PHOTO_LIMITS = { maxPhotos: MAX_PHOTOS, maxBytes: MAX_BYTES } as const;
