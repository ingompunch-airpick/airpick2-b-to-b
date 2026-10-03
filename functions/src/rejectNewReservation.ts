import * as admin from 'firebase-admin';
import { deleteReservationSecrets } from './reservations/reservationSecrets';

/**
 * 신규 예약이 마감·한도에 걸리면 취소 상태로 남기지 않고 문서를 지운다.
 * 손님 화면에는 마감 안내만 보여주고, 시트에 취소 행이 쌓이지 않게 한다.
 */
export async function rejectNewReservation(
  reservationId: string,
  logTag: string,
  detail: string
): Promise<void> {
  await deleteReservationSecrets(reservationId);
  await admin.firestore().collection('reservations').doc(reservationId).delete();
  console.warn(`[${logTag}] rejected ${reservationId} ${detail}`);
}
