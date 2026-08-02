/** @sync src/constants/reservationSource.ts */
export const RESERVATION_CREATED_BY = {
  AIRPICK_B2C: 'airpick-b2c',
  HOMEPAGE: 'homepage',
  B2B: 'b2b',
} as const;

export type ReservationCreatedBy =
  (typeof RESERVATION_CREATED_BY)[keyof typeof RESERVATION_CREATED_BY];
