export const BOOKING_SOURCE_HOMEPAGE = 'homepage';
export const BOOKING_SOURCE_B2C = 'airpick-b2c';

export function isHomepageBooking(createdBy?: string): boolean {
  return createdBy === BOOKING_SOURCE_HOMEPAGE;
}

export function isB2cBooking(createdBy?: string): boolean {
  return createdBy === BOOKING_SOURCE_B2C;
}

export function isExternalBooking(createdBy?: string): boolean {
  return isHomepageBooking(createdBy) || isB2cBooking(createdBy);
}

export function getBookingSourceLabel(createdBy?: string): string | null {
  if (isHomepageBooking(createdBy)) return '홈페이지';
  if (isB2cBooking(createdBy)) return 'B2C앱';
  return null;
}
