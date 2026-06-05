import type { Reservation } from '../types';
import { getScratchPhotoUrls } from '../lib/scratchPhotos';

/** 예약에 연결된 모든 차량 사진 URL (images + scratchPhotos) */
export function getReservationPhotoUrls(res: Reservation): string[] {
  const urls: string[] = [];
  const add = (u?: string) => {
    const t = u?.trim();
    if (t && !urls.includes(t)) urls.push(t);
  };
  (res.images || []).forEach(add);
  getScratchPhotoUrls(res.scratchPhotos).forEach(add);
  return urls;
}

export function reservationHasPhotos(res: Reservation): boolean {
  return getReservationPhotoUrls(res).length > 0;
}
