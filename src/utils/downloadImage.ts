export function photoDownloadFilename(carNumber: string, index: number, total: number): string {
  const base = (carNumber || 'vehicle').replace(/\s+/g, '').replace(/[^\w가-힣-]/g, '_') || 'vehicle';
  return `${base}_${String(index + 1).padStart(2, '0')}_of_${String(total).padStart(2, '0')}.jpg`;
}

/** Firebase Storage URL → 기기에 JPEG 파일로 저장 */
export async function downloadImageFromUrl(url: string, filename: string): Promise<void> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`다운로드 실패 (${response.status})`);
  }
  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = filename;
    anchor.rel = 'noopener';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export async function downloadAllImages(
  urls: string[],
  carNumber: string,
  onProgress?: (current: number, total: number) => void
): Promise<void> {
  for (let i = 0; i < urls.length; i++) {
    onProgress?.(i + 1, urls.length);
    await downloadImageFromUrl(urls[i], photoDownloadFilename(carNumber, i, urls.length));
    if (i < urls.length - 1) {
      await new Promise((r) => setTimeout(r, 400));
    }
  }
}
