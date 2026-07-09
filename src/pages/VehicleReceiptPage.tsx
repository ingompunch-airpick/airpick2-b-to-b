import React, { useEffect, useMemo, useState } from 'react';
import type { Company, Reservation } from '../types';
import { fetchCompanyById, fetchReservationByLookupCode } from '../lib/receiptFirestore';
import { resolveFlightFields } from '../utils/flightFields';
import {
  buildReceiptUrl,
  formatKoreanDateTime,
  formatKoreanFromIso,
  maskPhoneForDisplay,
} from '../utils/receipt';
import { isAdmitted, isCompletedOut, isParked } from '../utils/reservationStatus';

const STANDARD_TERMS = [
  {
    title: '제1조 (서비스의 개시와 종료)',
    body:
      '본 서비스는 고객이 부스에서 접수증을 발급받은 시점에 개시되며, 차량을 고객에게 인도한 시점에 종료됩니다. 서비스는 연중무휴 24시간 운영합니다.',
  },
  {
    title: '제2조 (차량 손해 및 보상)',
    body:
      '회사는 차량 인수부터 인도까지 발생한 손해에 대해 책임을 집니다. 고객은 차량 인도 시 외관을 확인해야 합니다. 단, 인도 후 현장을 이탈한 뒤 제기하는 손해, 천재지변, 기존 손상, 미세 스크래치, 마모에 따른 고장 등은 보상 대상에서 제외될 수 있습니다.',
  },
  {
    title: '제3조 (귀중품 보관)',
    body:
      '현금 및 귀중품은 고객이 직접 휴대하시기 바랍니다. 보관이 필요한 물품은 접수 시 목록을 작성·서명해야 하며, 그렇지 않은 경우 분실·손상에 대해 회사가 책임지지 않습니다.',
  },
] as const;

interface VehicleReceiptPageProps {
  code: string;
}

function receiptTitle(reservation: Reservation): string {
  if (isCompletedOut(reservation.status)) return '출차 완료증';
  if (isParked(reservation.status) || isAdmitted(reservation.status)) return '차량보관증';
  return '예약 접수증';
}

function ReceiptTableRow({ label, value }: { label: string; value: string }) {
  return (
    <tr className="border-b border-neutral-300 last:border-b-0">
      <th className="w-[32%] bg-neutral-100 border-r border-neutral-300 px-3 py-2.5 text-left text-sm font-bold text-neutral-800 whitespace-nowrap">
        {label}
      </th>
      <td className="px-3 py-2.5 text-sm text-neutral-900 font-medium break-words">{value}</td>
    </tr>
  );
}

export default function VehicleReceiptPage({ code }: VehicleReceiptPageProps) {
  const [reservation, setReservation] = useState<Reservation | null>(null);
  const [company, setCompany] = useState<Company | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetchReservationByLookupCode(code);
        if (cancelled) return;
        if (!res) {
          setError('접수증을 찾을 수 없습니다. 링크를 다시 확인해 주세요.');
          setReservation(null);
          return;
        }
        setReservation(res);
        const comp = res.companyId ? await fetchCompanyById(res.companyId) : null;
        if (!cancelled) setCompany(comp);
      } catch (e: unknown) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : '접수증을 불러오지 못했습니다.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [code]);

  const view = useMemo(() => {
    if (!reservation) return null;

    const flight = resolveFlightFields(reservation as unknown as Record<string, unknown>);
    const destination = flight.destination || '-';
    const airline = flight.departureAirline || flight.arrivalAirline || '-';
    const travelFlight =
      destination !== '-' || airline !== '-'
        ? `${destination} : ${airline}`.replace(/^-\s*:\s*|-\s*:\s*-$/g, '').trim() || '-'
        : '-';

    const intakeAt = reservation.actualParkingTime
      ? formatKoreanFromIso(reservation.actualParkingTime)
      : formatKoreanDateTime(reservation.departureDate, reservation.departureTime);

    const arrivalAt = formatKoreanDateTime(reservation.arrivalDate, reservation.arrivalTime);

    const companyPhone =
      company?.phone ||
      (company as Company & { customerCenter?: string })?.customerCenter ||
      '1545-5746';

    const docNo = reservation.receiptCode || reservation.id || code;

    return {
      title: receiptTitle(reservation),
      docNo,
      carModel: reservation.carModel || '-',
      carNumber: reservation.carNumber || '-',
      intakeAt,
      arrivalAt,
      travelFlight,
      totalPrice: `${(reservation.totalPrice ?? 0).toLocaleString()}원`,
      customerPhone: maskPhoneForDisplay(reservation.phone),
      companyPhone: maskPhoneForDisplay(companyPhone),
      companyName: reservation.companyName || company?.name || '에어픽',
      status: reservation.status,
      shareUrl: buildReceiptUrl(reservation),
    };
  }, [reservation, company, code]);

  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-100 flex items-center justify-center p-6">
        <p className="text-sm text-neutral-600 font-medium">접수증을 불러오는 중…</p>
      </div>
    );
  }

  if (error || !reservation || !view) {
    return (
      <div className="min-h-screen bg-neutral-100 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white border border-neutral-200 rounded-xl p-6 text-center shadow-sm">
          <p className="text-base font-bold text-neutral-900 mb-2">접수증을 표시할 수 없습니다</p>
          <p className="text-sm text-neutral-600">{error || '알 수 없는 오류'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-200 py-6 px-4 print:bg-white print:py-0">
      <div className="max-w-2xl mx-auto bg-white border border-neutral-300 shadow-md print:shadow-none print:border-0">
        <div className="px-4 py-5 sm:px-8 sm:py-8">
          <div className="text-center mb-6">
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-neutral-900 border-b-2 border-neutral-900 inline-block pb-1">
              {view.title}
            </h1>
            <p className="mt-3 text-sm font-mono text-neutral-700">NO : {view.docNo}</p>
            <p className="mt-1 text-xs text-neutral-500">{view.companyName}</p>
          </div>

          <table className="w-full border-collapse border border-neutral-300 mb-8">
            <tbody>
              <ReceiptTableRow label="차종" value={view.carModel} />
              <ReceiptTableRow label="차량번호" value={view.carNumber} />
              <ReceiptTableRow label="접수일시" value={view.intakeAt} />
              <ReceiptTableRow label="도착일시" value={view.arrivalAt} />
              <ReceiptTableRow label="여행 : 항공" value={view.travelFlight} />
              <ReceiptTableRow label="총주차금액" value={view.totalPrice} />
              <ReceiptTableRow label="고객연락처" value={view.customerPhone} />
              <ReceiptTableRow label="고객센터" value={view.companyPhone} />
            </tbody>
          </table>

          <div className="space-y-4 text-[13px] leading-relaxed text-neutral-800">
            <h2 className="text-center font-black text-neutral-900 text-sm">
              [주차대행서비스 표준약관]
            </h2>
            {STANDARD_TERMS.map((term) => (
              <div key={term.title}>
                <p className="font-bold mb-1">{term.title}</p>
                <p className="text-neutral-700 whitespace-pre-wrap">{term.body}</p>
              </div>
            ))}
          </div>

          {view.status === 'cancelled' && (
            <p className="mt-6 text-center text-sm font-bold text-red-600">※ 본 예약은 취소되었습니다.</p>
          )}
        </div>
      </div>

      <p className="max-w-2xl mx-auto mt-4 text-center text-[11px] text-neutral-500 print:hidden">
        에어픽 주차대행 · {view.shareUrl}
      </p>
    </div>
  );
}
