/** Firestore reservations — Functions가 읽는 공통 필드 */
export interface ReservationRecord {
  companyId?: string;
  companyName?: string;
  userName?: string;
  phone?: string;
  carNumber?: string;
  carModel?: string;
  departureDate?: string;
  departureTime?: string;
  arrivalDate?: string;
  arrivalTime?: string;
  departureTerminal?: string;
  arrivalTerminal?: string;
  destination?: string;
  departureAirline?: string;
  departureFlight?: string;
  arrivalAirline?: string;
  arrivalFlight?: string;
  isIndoor?: boolean;
  totalPrice?: number;
  status?: string;
  createdBy?: string;
  receiptToken?: string;
}

export function parseReservationRecord(
  data: FirebaseFirestore.DocumentData | undefined
): ReservationRecord {
  if (!data) return {};
  return data as ReservationRecord;
}
