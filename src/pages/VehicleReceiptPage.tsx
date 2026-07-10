import React, { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import type { Company, Reservation } from '../types';
import { fetchCompanyById, fetchReservationByLookupCode } from '../lib/receiptFirestore';
import { resolveFlightFields } from '../utils/flightFields';
import { normalizeDateString } from '../utils/reservationNormalize';
import {
  buildReceiptUrl,
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
  if (isCompletedOut(reservation.status)) return '출차 완료 확인증';
  if (isParked(reservation.status) || isAdmitted(reservation.status)) return '차량 입고 확인증';
  return '예약 접수 확인증';
}

function statusBadgeLabel(status: Reservation['status']): string {
  if (status === 'cancelled') return '취소됨';
  if (isCompletedOut(status)) return '출차 완료';
  if (isParked(status) || isAdmitted(status)) return '입고 완료';
  return '접수 완료';
}

function formatTerminal(terminal?: string): 'T1' | 'T2' {
  const t = (terminal || '').trim().toUpperCase();
  return t === 'T2' ? 'T2' : 'T1';
}

interface FlightLegView {
  terminal: 'T1' | 'T2';
  airline: string;
  flightNo: string;
}

function buildFlightLeg(
  airline?: string,
  flightNo?: string,
  terminal?: string
): FlightLegView {
  return {
    terminal: formatTerminal(terminal),
    airline: (airline || '').trim(),
    flightNo: (flightNo || '').trim(),
  };
}

function formatShortDateTime(dateStr?: string, timeStr?: string): string {
  const normalized = normalizeDateString(dateStr || '');
  if (!normalized) return '-';
  const [y, m, d] = normalized.split('-');
  const time = (timeStr || '').trim().slice(0, 5);
  const short = `${y.slice(2)}.${m}.${d}`;
  return time ? `${short} ${time}` : short;
}

function airlineHeaderLabel(airline?: string, flightNo?: string): string {
  const code = (flightNo || '').trim().slice(0, 2).toUpperCase();
  const name = (airline || '').trim();
  if (code && name) return `${code} ${name}`;
  return name || code || '';
}

function Perforation() {
  return (
    <div className="relative flex items-center bg-[#f4efe6] print:bg-white">
      <div
        className="absolute -left-2.5 top-1/2 h-5 w-5 -translate-y-1/2 rounded-full bg-[#e8e4dc] print:bg-white print:border print:border-neutral-200"
        aria-hidden
      />
      <div
        className="absolute -right-2.5 top-1/2 h-5 w-5 -translate-y-1/2 rounded-full bg-[#e8e4dc] print:bg-white print:border print:border-neutral-200"
        aria-hidden
      />
      <div className="mx-4 flex-1 border-t border-dashed border-white/25 print:border-neutral-300" />
    </div>
  );
}

function TerminalBadge({ terminal }: { terminal: 'T1' | 'T2' }) {
  const isT1 = terminal === 'T1';
  return (
    <span
      className={`inline-flex shrink-0 rounded px-1.5 py-0.5 text-[10px] font-black leading-none ${
        isT1
          ? 'bg-blue-100 text-blue-600 print:bg-transparent print:text-blue-700'
          : 'bg-red-100 text-red-600 print:bg-transparent print:text-red-700'
      }`}
    >
      {terminal}
    </span>
  );
}

function FlightGridCell({
  label,
  leg,
}: {
  label: string;
  leg: FlightLegView;
}) {
  const detail = [leg.airline, leg.flightNo].filter(Boolean).join(' ') || '-';

  return (
    <div className="min-w-0 px-3 py-2.5">
      <p className="text-[9px] font-bold tracking-wide text-[#9a8b78] uppercase">{label}</p>
      <div className="mt-1 flex min-w-0 items-center gap-1.5">
        <TerminalBadge terminal={leg.terminal} />
        <p className="min-w-0 truncate text-[13px] font-black text-[#1a1f2e]">{detail}</p>
      </div>
    </div>
  );
}

function GridCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 px-3 py-2.5">
      <p className="text-[9px] font-bold tracking-wide text-[#9a8b78] uppercase">{label}</p>
      <p className="mt-0.5 truncate text-[13px] font-black text-[#1a1f2e] tabular-nums">{value}</p>
    </div>
  );
}

/** 접수증 URL QR — 스캔 시 동일 접수증 페이지로 이동 */
function ReceiptQrCode({ url, scanCode }: { url: string; scanCode: string }) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(url, {
      width: 112,
      margin: 1,
      errorCorrectionLevel: 'M',
      color: { dark: '#1a1f2e', light: '#f4efe6' },
    })
      .then((src) => {
        if (!cancelled) setDataUrl(src);
      })
      .catch(() => {
        if (!cancelled) setDataUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [url]);

  return (
    <div className="shrink-0">
      {dataUrl ? (
        <img
          src={dataUrl}
          alt="접수증 확인 QR 코드"
          className="h-[4.5rem] w-[4.5rem] rounded-md bg-[#f4efe6] print:bg-white"
        />
      ) : (
        <div className="flex h-[4.5rem] w-[4.5rem] items-center justify-center rounded-md bg-white/60 text-[8px] font-bold text-[#9a8b78]">
          QR
        </div>
      )}
      <p className="mt-1 font-mono text-[8px] font-bold tracking-wider text-[#9a8b78]">{scanCode}</p>
    </div>
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
    const destination = (flight.destination || '').trim() || '-';
    const departureTerminal = formatTerminal(reservation.departureTerminal);

    const departureLeg = buildFlightLeg(
      flight.departureAirline,
      flight.departureFlight,
      reservation.departureTerminal
    );
    const arrivalLeg = buildFlightLeg(
      flight.arrivalAirline,
      flight.arrivalFlight,
      reservation.arrivalTerminal
    );

    const intakeAt = reservation.actualParkingTime
      ? formatShortDateTime(
          reservation.actualParkingTime.slice(0, 10),
          reservation.actualParkingTime.includes('T')
            ? reservation.actualParkingTime.split('T')[1]
            : reservation.actualParkingTime.split(' ')[1]
        )
      : formatShortDateTime(reservation.departureDate, reservation.departureTime);

    const arrivalAt = formatShortDateTime(reservation.arrivalDate, reservation.arrivalTime);

    const companyPhone =
      company?.phone ||
      (company as Company & { customerCenter?: string })?.customerCenter ||
      '1545-5746';

    const docNo =
      reservation.receiptCode ||
      reservation.id ||
      (reservation.receiptToken ? reservation.receiptToken.slice(0, 12).toUpperCase() : '') ||
      code;

    return {
      title: receiptTitle(reservation),
      badge: statusBadgeLabel(reservation.status),
      docNo,
      carModel: reservation.carModel || '-',
      carNumber: reservation.carNumber || '-',
      userName: reservation.userName || '-',
      intakeAt,
      arrivalAt,
      destination,
      departureLeg,
      arrivalLeg,
      airlineLabel: airlineHeaderLabel(flight.departureAirline || flight.arrivalAirline, flight.departureFlight || flight.arrivalFlight),
      routeFrom: `ICN · ${departureTerminal}`,
      totalPrice: `${(reservation.totalPrice ?? 0).toLocaleString()}원`,
      customerPhone: maskPhoneForDisplay(reservation.phone),
      companyPhone: maskPhoneForDisplay(companyPhone),
      companyName: reservation.companyName || company?.name || '에어픽',
      status: reservation.status,
      shareUrl: buildReceiptUrl(reservation),
      qrUrl:
        typeof window !== 'undefined'
          ? `${window.location.origin}${window.location.pathname}`
          : buildReceiptUrl(reservation),
      scanCode: (reservation.receiptToken || reservation.id || code).slice(-8).toUpperCase(),
    };
  }, [reservation, company, code]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#e8e4dc] flex items-center justify-center p-4">
        <div className="h-7 w-7 animate-spin rounded-full border-2 border-[#d4a853] border-t-transparent" />
      </div>
    );
  }

  if (error || !reservation || !view) {
    return (
      <div className="min-h-screen bg-[#e8e4dc] flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white border border-neutral-200 rounded-xl p-6 text-center shadow-lg">
          <p className="text-sm font-bold text-neutral-900 mb-1">접수증을 표시할 수 없습니다</p>
          <p className="text-xs text-neutral-600">{error || '알 수 없는 오류'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#e8e4dc] py-4 px-3 sm:py-6 print:bg-white print:py-0">
      <div className="max-w-[22rem] mx-auto mb-3 flex justify-center print:hidden">
        <button
          type="button"
          onClick={() => window.print()}
          className="rounded-full bg-[#1c2233] px-5 py-2 text-xs font-bold text-[#d4a853] shadow-md active:scale-[0.98] transition-transform"
        >
          인쇄 / PDF 저장
        </button>
      </div>

      <article className="max-w-[22rem] mx-auto overflow-hidden rounded-[1.35rem] shadow-xl shadow-[#1c2233]/15 print:shadow-none print:rounded-none">
        {/* ── Header (boarding pass top) ── */}
        <header className="bg-[#1c2233] px-4 pb-3 pt-4 text-white print:bg-white print:text-[#1c2233] print:border-b print:border-neutral-300">
          <div className="flex items-start justify-between gap-2">
            <p className="text-[9px] font-bold tracking-[0.28em] text-[#d4a853]">AIRPICK VALET</p>
            <span className="shrink-0 rounded border border-[#d4a853]/70 px-2 py-0.5 text-[9px] font-bold text-[#d4a853] print:border-neutral-400 print:text-neutral-700">
              {view.badge}
            </span>
          </div>
          <h1 className="mt-2 text-[1.35rem] font-black leading-tight tracking-tight">{view.title}</h1>
          <p className="mt-1 text-[11px] font-medium text-white/55 print:text-neutral-500">
            {view.companyName} · No. {view.docNo}
          </p>

          <div className="mt-4 flex items-center gap-2 text-[11px] font-bold">
            <span className="shrink-0 text-white/90 print:text-neutral-800">{view.routeFrom}</span>
            <span className="min-w-0 flex-1 border-t border-dashed border-white/20 print:border-neutral-300" />
            <span className="shrink-0 text-[#d4a853] text-base leading-none" aria-hidden>
              →
            </span>
            <span className="min-w-0 flex-1 border-t border-dashed border-white/20 print:border-neutral-300" />
            <span className="shrink-0 truncate text-white/90 print:text-neutral-800">{view.destination}</span>
            {view.airlineLabel ? (
              <span className="ml-1 shrink-0 text-[10px] font-semibold text-white/40 print:text-neutral-400">
                {view.airlineLabel}
              </span>
            ) : null}
          </div>
        </header>

        <Perforation />

        {/* ── Body ── */}
        <div className="bg-[#f4efe6] px-4 pb-3 pt-4 print:bg-white">
          <p className="text-[9px] font-bold tracking-[0.15em] text-[#9a8b78]">차량 번호</p>
          <p className="mt-0.5 text-[1.75rem] font-black leading-none tracking-wide text-[#1a1f2e] tabular-nums">
            {view.carNumber}
          </p>
          <p className="mt-1.5 text-xs font-semibold text-[#6b6358]">
            {view.carModel} · {view.userName}
          </p>

          <div className="mt-4 flex items-center justify-between rounded-xl bg-[#1c2233] px-4 py-3 ring-1 ring-[#d4a853]/25 print:bg-neutral-200 print:ring-neutral-400">
            <span className="text-[11px] font-bold text-[#e8dcc8] print:text-neutral-700">총 주차 금액</span>
            <span className="text-xl font-black tabular-nums text-[#f0c14a] print:text-neutral-900">
              {view.totalPrice}
            </span>
          </div>

          <div className="mt-3 grid grid-cols-2 divide-x divide-y divide-[#e8e0d4] overflow-hidden rounded-xl border border-[#e8e0d4] bg-white/50 print:divide-neutral-200 print:border-neutral-200 print:bg-white">
            <GridCell label="접수일시" value={view.intakeAt} />
            <GridCell label="도착일시" value={view.arrivalAt} />
            <FlightGridCell label="출국편" leg={view.departureLeg} />
            <FlightGridCell label="귀국편" leg={view.arrivalLeg} />
            <GridCell label="고객 연락처" value={view.customerPhone} />
            <GridCell label="고객센터" value={view.companyPhone} />
          </div>

          <details className="mt-3 group print:open">
            <summary className="cursor-pointer list-none text-center text-[9px] font-bold text-[#9a8b78] print:hidden">
              표준약관 보기
            </summary>
            <div className="mt-2 space-y-1.5 rounded-lg border border-[#e8e0d4] bg-white/40 p-2.5 text-[8px] leading-snug text-[#6b6358] print:border-neutral-200 print:text-[7px]">
              {STANDARD_TERMS.map((term) => (
                <div key={term.title}>
                  <p className="font-bold text-[#1a1f2e]">{term.title}</p>
                  <p>{term.body}</p>
                </div>
              ))}
            </div>
          </details>

          {view.status === 'cancelled' && (
            <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-center text-xs font-bold text-red-600">
              본 예약은 취소되었습니다
            </p>
          )}
        </div>

        <Perforation />

        <footer className="flex items-end justify-between gap-3 bg-[#f4efe6] px-4 py-3 print:bg-white">
          <ReceiptQrCode url={view.qrUrl} scanCode={view.scanCode} />
          <p className="text-right text-[8px] font-bold leading-tight tracking-[0.12em] text-[#b0a89a] uppercase">
            Powered by
            <br />
            에어픽 주차대행
          </p>
        </footer>
      </article>

      <p className="max-w-[22rem] mx-auto mt-2 text-center text-[10px] text-[#9a8b78] print:hidden truncate px-2">
        {view.shareUrl}
      </p>
    </div>
  );
}
