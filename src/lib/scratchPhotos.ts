import type { ScratchPhotoSet } from '../types';

function isDemoScratchUrl(url: string): boolean {
  return url.includes('unsplash.com') || url.includes('images.unsplash');
}

/** Firestore scratchPhotos → 표시용 URL 배열 (구 4면 형식 포함) */
export function getScratchPhotoUrls(set?: ScratchPhotoSet): string[] {
  if (!set) return [];

  if (set.urls?.length) {
    return set.urls.filter((u) => u?.trim() && !isDemoScratchUrl(u));
  }

  return [set.front, set.rear, set.left, set.right].filter(
    (u): u is string => !!u?.trim() && !isDemoScratchUrl(u)
  );
}

export function buildScratchPhotoSet(urls: string[], synced: boolean): ScratchPhotoSet {
  return {
    urls,
    synced,
    updatedAt: new Date().toISOString(),
  };
}

export function isScratchSynced(set?: ScratchPhotoSet): boolean {
  return !!(set?.synced && getScratchPhotoUrls(set).length > 0);
}
