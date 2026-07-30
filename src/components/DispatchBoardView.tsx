import React, { useMemo, useState } from 'react';
import { Download, Printer } from 'lucide-react';
import type { Company, Reservation } from '../types';
import DateNavBar from './DateNavBar';
import { getKSTDateOnlyString } from '../utils/kstDate';
import { normalizeDateString } from '../utils/reservationNormalize';
import {
  formatParkingLotLabel,
  resolveCompanyLotsForReservation,
} from '../utils/parkingLot';
import {
  normalizeAirportId,
  normalizeTerminalCode,
  terminalShortLabel,
} from '../utils/airport';
import { isCancelled } from '../utils/reservationStatus';

type FocusMode = 'all' | 'intake' | 'exit';

interface DispatchBoardViewProps {
  reservations: Reservation[];
  companyName?: string;
  companies?: Company[];
}

function cn(...classes: (string | boolean | undefined | null)[]) {
  return classes.filter(Boolean).join(' ');
}

function flightOut(res: Reservation): string {
  return String(res.departureFlight || res.entryFlight || '').trim().toUpperCase();
}

function flightIn(res: Reservation): string {
  return String(res.arrivalFlight || res.exitFlight || '').trim().toUpperCase();
}

function maskPhone(phone: string): string {
  const d = phone.replace(/\D/g, '');
  if (d.length < 4) return phone || '-';
  return `***-****-${d.slice(-4)}`;
}

function terminalForMoment(
  res: Reservation,
  kind: 'intake' | 'exit'
): string {
  const airportId = normalizeAirportId(res.airport);
  const code =
    kind === 'intake'
      ? res.departureTerminal
      : res.arrivalTerminal || res.departureTerminal;
  return terminalShortLabel(airportId, normalizeTerminalCode(airportId, code));
}

type BoardRow = {
  res: Reservation;
  onSelectedDate: { intake: boolean; exit: boolean };
};

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

/**
 * 관리자 입출차 배차표.
 * - 상태·결제·삭제·이미지 없음 (기사/기존 화면이 담당)
 * - 실내/외 분리 컬럼 없음 → 주차장(실내1·실외2…) 한 칸
 * - A4 인쇄 + CSV
 */
export default function DispatchBoardView({
  reservations,
  companyName = '',
  companies = [],
}: DispatchBoardViewProps) {
  const [selectedDate, setSelectedDate] = useState(() => getKSTDateOnlyString());
  const [focus, setFocus] = useState<FocusMode>('all');
  const [maskPhoneOnPrint, setMaskPhoneOnPrint] = useState(true);

  const lotLabel = (res: Reservation) =>
    formatParkingLotLabel(
      res,
      resolveCompanyLotsForReservation(companies, res.companyId)
    );

  const rows = useMemo(() => {
    const day = normalizeDateString(selectedDate) || getKSTDateOnlyString();
    const list: BoardRow[] = [];

    for (const res of reservations) {
      if (isCancelled(res.status)) continue;

      const dep = normalizeDateString(res.departureDate);
      const arr = normalizeDateString(res.arrivalDate);
      const intake = dep === day;
      const exit = arr === day;
      if (!intake && !exit) continue;

      if (focus === 'intake' && !intake) continue;
      if (focus === 'exit' && !exit) continue;

      list.push({ res, onSelectedDate: { intake, exit } });
    }

    list.sort((a, b) => {
      const timeA = a.onSelectedDate.exit
        ? `${a.res.arrivalTime || ''} ${a.res.departureTime || ''}`
        : `${a.res.departureTime || ''} ${a.res.arrivalTime || ''}`;
      const timeB = b.onSelectedDate.exit
        ? `${b.res.arrivalTime || ''} ${b.res.departureTime || ''}`
        : `${b.res.departureTime || ''} ${b.res.arrivalTime || ''}`;
      return timeA.localeCompare(timeB);
    });

    return list;
  }, [reservations, selectedDate, focus]);

  const shuttleHints = useMemo(() => {
    const day = normalizeDateString(selectedDate) || getKSTDateOnlyString();
    const exits = reservations.filter(
      (r) =>
        !isCancelled(r.status) &&
        normalizeDateString(r.arrivalDate) === day &&
        Boolean(r.arrivalTime)
    );
    const intakes = reservations.filter(
      (r) =>
        !isCancelled(r.status) &&
        normalizeDateString(r.departureDate) === day &&
        Boolean(r.departureTime)
    );

    const hints: { exit: Reservation; intake: Reservation; gapMin: number }[] = [];
    for (const ex of exits) {
      const exTerm = terminalForMoment(ex, 'exit');
      const exMin = toMinutes(ex.arrivalTime);
      if (exMin == null) continue;
      let best: { intake: Reservation; gapMin: number } | null = null;
      for (const inn of intakes) {
        if (inn.id === ex.id) continue;
        if (terminalForMoment(inn, 'intake') !== exTerm) continue;
        const inMin = toMinutes(inn.departureTime);
        if (inMin == null) continue;
        const gap = inMin - exMin;
        if (gap < 0 || gap > 90) continue;
        if (!best || gap < best.gapMin) best = { intake: inn, gapMin: gap };
      }
      if (best) hints.push({ exit: ex, intake: best.intake, gapMin: best.gapMin });
    }
    return hints.slice(0, 12);
  }, [reservations, selectedDate]);

  const handlePrint = () => {
    window.print();
  };

  const handleCsv = () => {
    const day = normalizeDateString(selectedDate) || getKSTDateOnlyString();
    const header = [
      '순번',
      '청사(입고)',
      '청사(출고)',
      '주차장',
      '차종',
      '차번',
      '입고일시',
      '출국편명',
      '출고일시',
      '도착편명',
      '예약자',
      '연락처',
    ];
    const lines = [header.join(',')];
    rows.forEach((row, idx) => {
      const r = row.res;
      lines.push(
        [
          String(idx + 1),
          terminalForMoment(r, 'intake'),
          terminalForMoment(r, 'exit'),
          lotLabel(r),
          r.carModel || '',
          r.carNumber || '',
          `${r.departureDate || ''} ${r.departureTime || ''}`.trim(),
          flightOut(r),
          `${r.arrivalDate || ''} ${r.arrivalTime || ''}`.trim(),
          flightIn(r),
          r.userName || '',
          r.phone || '',
        ]
          .map((c) => csvEscape(String(c)))
          .join(',')
      );
    });
    const blob = new Blob(['\uFEFF' + lines.join('\n')], {
      type: 'text/csv;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `입출차배차표_${day}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4 font-sans">
      <style>{`
        @media print {
          @page { size: A4 landscape; margin: 10mm; }
          body * { visibility: hidden !important; }
          .dispatch-print-root, .dispatch-print-root * { visibility: visible !important; }
          .dispatch-print-root {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            background: white !important;
            color: black !important;
            padding: 0 !important;
          }
          .dispatch-no-print { display: none !important; }
          .dispatch-print-table th, .dispatch-print-table td {
            border: 1px solid #333 !important;
            color: #111 !important;
            background: white !important;
            font-size: 9px !important;
            padding: 3px 4px !important;
          }
          .dispatch-print-table th { background: #f0f0f0 !important; }
        }
      `}</style>

      <div className="dispatch-no-print space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-black text-white tracking-tight">입출차 배차표</h2>
            <p className="text-[11px] text-zinc-500 font-semibold mt-0.5">
              셔틀 동선용 · 상태/결제/삭제는 다루지 않습니다 · 주차장만 표시(실내1·실외2…)
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleCsv}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#2C2C2E] text-zinc-200 text-xs font-bold border border-neutral-700 hover:bg-neutral-700"
            >
              <Download size={14} />
              CSV
            </button>
            <button
              type="button"
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-sky-600 text-white text-xs font-black hover:bg-sky-500"
            >
              <Printer size={14} />
              A4 출력
            </button>
          </div>
        </div>

        <DateNavBar
          selectedDate={selectedDate}
          onChangeDate={setSelectedDate}
          onOpenCalendar={() => {
            const next = window.prompt('조회일 (YYYY-MM-DD)', selectedDate);
            if (next && /^\d{4}-\d{2}-\d{2}$/.test(next.trim())) {
              setSelectedDate(next.trim());
            }
          }}
          compact
        />

        <div className="flex flex-wrap items-center gap-2">
          {(
            [
              { id: 'all' as const, label: '전체' },
              { id: 'intake' as const, label: '오늘 입차' },
              { id: 'exit' as const, label: '오늘 출차' },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setFocus(t.id)}
              className={cn(
                'px-3 py-1.5 rounded-full text-[11px] font-black border transition-colors',
                focus === t.id
                  ? 'bg-amber-500 text-neutral-950 border-amber-500'
                  : 'bg-transparent text-zinc-400 border-neutral-700 hover:text-zinc-200'
              )}
            >
              {t.label}
            </button>
          ))}
          <label className="ml-auto flex items-center gap-1.5 text-[11px] text-zinc-400 font-semibold cursor-pointer select-none">
            <input
              type="checkbox"
              checked={maskPhoneOnPrint}
              onChange={(e) => setMaskPhoneOnPrint(e.target.checked)}
              className="accent-amber-500"
            />
            인쇄 시 연락처 마스킹
          </label>
        </div>

        {shuttleHints.length > 0 && (
          <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-3 space-y-1.5">
            <p className="text-[11px] font-black text-emerald-400">셔틀 힌트 (출차 후 90분 안 · 같은 청사 입차)</p>
            {shuttleHints.map((h) => (
              <p key={`${h.exit.id}-${h.intake.id}`} className="text-[11px] text-zinc-300 font-semibold">
                출 {h.exit.carNumber || '-'} {h.exit.arrivalTime} ({terminalForMoment(h.exit, 'exit')})
                {' → '}
                입 {h.intake.carNumber || '-'} {h.intake.departureTime} · +{h.gapMin}분
              </p>
            ))}
          </div>
        )}
      </div>

      <div className="dispatch-print-root">
        <div className="hidden print:block mb-2">
          <p className="text-sm font-black">
            {companyName || '에어픽 파트너'} · 입출차 배차표 · {selectedDate}
          </p>
        </div>

        <div className="overflow-x-auto rounded-2xl border border-neutral-800 print:border-neutral-400 print:rounded-none">
          <table className="dispatch-print-table w-full min-w-[900px] text-left border-collapse">
            <thead>
              <tr className="bg-[#1C1C1E] text-[10px] text-zinc-400 font-black uppercase tracking-wide print:bg-neutral-100">
                <th className="px-2 py-2.5 whitespace-nowrap">#</th>
                <th className="px-2 py-2.5 whitespace-nowrap">청사</th>
                <th className="px-2 py-2.5 whitespace-nowrap">주차장</th>
                <th className="px-2 py-2.5 whitespace-nowrap">차종</th>
                <th className="px-2 py-2.5 whitespace-nowrap">차번</th>
                <th className="px-2 py-2.5 whitespace-nowrap">입고</th>
                <th className="px-2 py-2.5 whitespace-nowrap">출국편</th>
                <th className="px-2 py-2.5 whitespace-nowrap">출고</th>
                <th className="px-2 py-2.5 whitespace-nowrap">도착편</th>
                <th className="px-2 py-2.5 whitespace-nowrap">예약자</th>
                <th className="px-2 py-2.5 whitespace-nowrap">연락처</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={11} className="px-4 py-10 text-center text-sm text-zinc-500 font-semibold">
                    해당 날짜의 입·출차 예약이 없습니다.
                  </td>
                </tr>
              ) : (
                rows.map((row, idx) => {
                  const r = row.res;
                  const printPhone = maskPhoneOnPrint
                    ? maskPhone(r.phone || '')
                    : r.phone || '-';
                  const termLabel = row.onSelectedDate.exit && !row.onSelectedDate.intake
                    ? terminalForMoment(r, 'exit')
                    : row.onSelectedDate.intake && !row.onSelectedDate.exit
                      ? terminalForMoment(r, 'intake')
                      : `${terminalForMoment(r, 'intake')}/${terminalForMoment(r, 'exit')}`;

                  return (
                    <tr
                      key={r.id || idx}
                      className={cn(
                        'border-t border-neutral-800/80 text-[12px] text-zinc-200 print:border-neutral-300 print:text-neutral-900',
                        row.onSelectedDate.exit && row.onSelectedDate.intake
                          ? 'bg-amber-500/5'
                          : 'bg-transparent'
                      )}
                    >
                      <td className="px-2 py-2 tabular-nums text-zinc-500">{idx + 1}</td>
                      <td className="px-2 py-2 font-bold">{termLabel}</td>
                      <td className="px-2 py-2 font-semibold">{lotLabel(r)}</td>
                      <td className="px-2 py-2">{r.carModel || '-'}</td>
                      <td className="px-2 py-2 font-black tabular-nums">{r.carNumber || '-'}</td>
                      <td
                        className={cn(
                          'px-2 py-2 tabular-nums whitespace-nowrap',
                          row.onSelectedDate.intake && 'text-sky-400 print:text-sky-800 font-bold'
                        )}
                      >
                        {r.departureDate} {r.departureTime}
                      </td>
                      <td className="px-2 py-2 font-mono text-[11px]">{flightOut(r) || '-'}</td>
                      <td
                        className={cn(
                          'px-2 py-2 tabular-nums whitespace-nowrap',
                          row.onSelectedDate.exit && 'text-rose-400 print:text-rose-800 font-bold'
                        )}
                      >
                        {r.arrivalDate} {r.arrivalTime}
                      </td>
                      <td className="px-2 py-2 font-mono text-[11px]">{flightIn(r) || '-'}</td>
                      <td className="px-2 py-2">{r.userName || '-'}</td>
                      <td className="px-2 py-2 tabular-nums text-[11px]">
                        <span className="print:hidden">{r.phone || '-'}</span>
                        <span className="hidden print:inline">{printPhone}</span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <p className="dispatch-no-print mt-2 text-[10px] text-zinc-500 font-semibold">
          {rows.length}건 · 하늘색=당일 입고 · 분홍=당일 출고 · 노란 행=당일 입·출 모두
        </p>
      </div>
    </div>
  );
}

function toMinutes(time?: string): number | null {
  const m = String(time || '')
    .trim()
    .match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(min)) return null;
  return h * 60 + min;
}
