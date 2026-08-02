import type { ReservationRecord } from './types';

export interface ReceiptPublicDto {
  id: string;
  companyName: string;
  userName: string;
  carModel: string;
  carNumber: string;
  phone: string;
  departureDate: string;
  departureTime: string;
  arrivalDate: string;
  arrivalTime: string;
  departureTerminal: string;
  arrivalTerminal?: string;
  destination?: string;
  departureAirline?: string;
  departureFlight?: string;
  arrivalAirline?: string;
  arrivalFlight?: string;
  totalPrice: number;
  isIndoor: boolean;
  createdAt: string;
  status: string;
}

function str(data: Record<string, unknown>, key: string, fallback = ''): string {
  const v = data[key];
  return v != null && String(v).trim() ? String(v).trim() : fallback;
}

export function toReceiptPublic(
  id: string,
  raw: Record<string, unknown>
): ReceiptPublicDto {
  const record = raw as ReservationRecord;
  const arrivalTerminal = record.arrivalTerminal?.trim() || record.departureTerminal?.trim();

  return {
    id,
    companyName: str(raw, 'companyName', '주차대행'),
    userName: str(raw, 'userName', '고객'),
    carModel: str(raw, 'carModel', '-'),
    carNumber: str(raw, 'carNumber', '-'),
    phone: str(raw, 'phone'),
    departureDate: str(raw, 'departureDate'),
    departureTime: str(raw, 'departureTime'),
    arrivalDate: str(raw, 'arrivalDate'),
    arrivalTime: str(raw, 'arrivalTime'),
    departureTerminal: str(raw, 'departureTerminal', 'T1'),
    arrivalTerminal: arrivalTerminal || undefined,
    destination: record.destination?.trim() || undefined,
    departureAirline: record.departureAirline?.trim() || undefined,
    departureFlight: record.departureFlight?.trim() || undefined,
    arrivalAirline: record.arrivalAirline?.trim() || undefined,
    arrivalFlight: record.arrivalFlight?.trim() || undefined,
    totalPrice: Number(record.totalPrice) || 0,
    isIndoor: record.isIndoor !== false,
    createdAt: str(raw, 'createdAt'),
    status: str(raw, 'status', 'pending'),
  };
}
