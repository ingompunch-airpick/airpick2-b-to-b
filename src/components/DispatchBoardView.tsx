import React, { useCallback, useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, Download, Printer, Settings2 } from 'lucide-react';
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
import { isCancelled, statusToLabel } from '../utils/reservationStatus';
import { isReservationUnpaid } from '../utils/paymentStatus';
import {
  bookingSourceLabel,
  resolveBookingSourceFromReservation,
} from '../utils/bookingSource';
import {
  DISPATCH_COLUMN_META,
  DISPATCH_FEATURE_META,
  defaultDispatchBoardPrefs,
  loadDispatchBoardPrefs,
  moveColumnInOrder,
  orderedDispatchColumns,
  saveDispatchBoardPrefs,
  visibleDispatchColumns,
  type DispatchBoardPrefs,
  type DispatchColumnId,
  type DispatchLayoutMode,
} from '../utils/dispatchBoardPrefs';

type FocusMode = 'all' | 'intake' | 'exit';

type SlotKind = 'intake' | 'exit';

type BoardRow = {
  res: Reservation;
  onSelectedDate: { intake: boolean; exit: boolean };
};

type TimetableEvent = BoardRow & {
  kind: SlotKind;
  slotTime: string;
};

type TimetableSlot = {
  time: string;
  sortKey: number;
  events: TimetableEvent[];
};

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

function airlineOut(res: Reservation): string {
  return String(res.departureAirline || res.entryAirline || '').trim();
}

function airlineIn(res: Reservation): string {
  return String(res.arrivalAirline || res.exitAirline || '').trim();
}

function maskPhone(phone: string): string {
  const d = phone.replace(/\D/g, '');
  if (d.length < 4) return phone || '-';
  return `***-****-${d.slice(-4)}`;
}

function phoneTelHref(phone: string): string | null {
  const d = phone.replace(/\D/g, '');
  if (d.length < 8) return null;
  return `tel:${d}`;
}

function terminalForMoment(res: Reservation, kind: 'intake' | 'exit'): string {
  const airportId = normalizeAirportId(res.airport);
  const code =
    kind === 'intake'
      ? res.departureTerminal
      : res.arrivalTerminal || res.departureTerminal;
  return terminalShortLabel(airportId, normalizeTerminalCode(airportId, code));
}

function customerRequest(res: Reservation): string {
  return String(
    res.userRequest ||
      (res as { customerNotes?: string }).customerNotes ||
      res.paymentNotes ||
      ''
  ).trim();
}

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function columnHeader(id: DispatchColumnId): string {
  return DISPATCH_COLUMN_META.find((c) => c.id === id)?.label || id;
}

/** HH:mm 정규화. 없으면 빈 문자열 */
function normalizeClock(time?: string): string {
  const m = String(time || '')
    .trim()
    .match(/^(\d{1,2}):(\d{2})/);
  if (!m) return '';
  return `${String(Number(m[1])).padStart(2, '0')}:${m[2]}`;
}

function toMinutes(time?: string): number | null {
  const clock = normalizeClock(time);
  if (!clock) return null;
  const [h, min] = clock.split(':').map(Number);
  return h * 60 + min;
}

function hourSlotLabel(hour: number): string {
  const start = `${String(hour).padStart(2, '0')}:00`;
  const endHour = hour + 1;
  const end = endHour === 24 ? '24:00' : `${String(endHour).padStart(2, '0')}:00`;
  return `${start}~${end}`;
}

/** 시각 → 0~23 시간대. 파싱 실패 시 null */
function hourBucket(time?: string): number | null {
  const min = toMinutes(time);
  if (min == null) return null;
  return Math.min(23, Math.floor(min / 60));
}

/**
 * 00:00~01:00 … 23:00~24:00 고정 시간표.
 * 해당 시간대에 입·출 예정인 차량만 칸에 넣고, 없으면 빈칸.
 */
function buildTimetableSlots(rows: BoardRow[]): TimetableSlot[] {
  const buckets: TimetableEvent[][] = Array.from({ length: 24 }, () => []);
  const unknown: TimetableEvent[] = [];

  const push = (timeRaw: string | undefined, kind: SlotKind, row: BoardRow) => {
    const hour = hourBucket(timeRaw);
    const clock = normalizeClock(timeRaw) || '시간 미정';
    const event: TimetableEvent = { ...row, kind, slotTime: clock };
    if (hour == null) unknown.push(event);
    else buckets[hour].push(event);
  };

  for (const row of rows) {
    if (row.onSelectedDate.intake) push(row.res.departureTime, 'intake', row);
    if (row.onSelectedDate.exit) push(row.res.arrivalTime, 'exit', row);
  }

  const sortEvents = (events: TimetableEvent[]) => {
    events.sort((a, b) => {
      const ta = toMinutes(a.slotTime) ?? 99_999;
      const tb = toMinutes(b.slotTime) ?? 99_999;
      if (ta !== tb) return ta - tb;
      if (a.kind !== b.kind) return a.kind === 'intake' ? -1 : 1;
      return (a.res.carNumber || '').localeCompare(b.res.carNumber || '', 'ko');
    });
  };

  const slots: TimetableSlot[] = buckets.map((events, hour) => {
    sortEvents(events);
    return {
      time: hourSlotLabel(hour),
      sortKey: hour,
      events,
    };
  });

  if (unknown.length > 0) {
    sortEvents(unknown);
    slots.push({ time: '시간 미정', sortKey: 99, events: unknown });
  }

  return slots;
}

/**
 * 관리자 입출차 배차표.
 * - 읽기 전용 (상태·결제 수정/삭제는 다른 화면)
 * - 컬럼 ON/OFF·순서·보조기능은 표시 설정(localStorage)
 */
export default function DispatchBoardView({
  reservations,
  companyName = '',
  companies = [],
}: DispatchBoardViewProps) {
  const [selectedDate, setSelectedDate] = useState(() => getKSTDateOnlyString());
  const [focus, setFocus] = useState<FocusMode>('all');
  const [prefs, setPrefs] = useState<DispatchBoardPrefs>(() => loadDispatchBoardPrefs());
  const [settingsOpen, setSettingsOpen] = useState(false);

  const updatePrefs = useCallback((next: DispatchBoardPrefs) => {
    setPrefs(next);
    saveDispatchBoardPrefs(next);
  }, []);

  const visibleCols = useMemo(() => visibleDispatchColumns(prefs), [prefs]);

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

  const timetableSlots = useMemo(() => buildTimetableSlots(rows), [rows]);
  const isTimetable = prefs.layout === 'timetable';

  const setLayout = (layout: DispatchLayoutMode) => {
    updatePrefs({ ...prefs, layout });
  };

  const cellText = useCallback(
    (
      id: DispatchColumnId,
      row: BoardRow,
      idx: number,
      opts?: { forPrint?: boolean }
    ): string => {
      const r = row.res;
      switch (id) {
        case 'index':
          return String(idx + 1);
        case 'terminal': {
          if (row.onSelectedDate.exit && !row.onSelectedDate.intake) {
            return terminalForMoment(r, 'exit');
          }
          if (row.onSelectedDate.intake && !row.onSelectedDate.exit) {
            return terminalForMoment(r, 'intake');
          }
          return `${terminalForMoment(r, 'intake')}/${terminalForMoment(r, 'exit')}`;
        }
        case 'terminalIn':
          return terminalForMoment(r, 'intake');
        case 'terminalOut':
          return terminalForMoment(r, 'exit');
        case 'airport':
          return normalizeAirportId(r.airport);
        case 'lot':
          return lotLabel(r);
        case 'carModel':
          return r.carModel || '-';
        case 'carNumber':
          return r.carNumber || '-';
        case 'intake':
          return `${r.departureDate || ''} ${r.departureTime || ''}`.trim() || '-';
        case 'flightOut':
          return flightOut(r) || '-';
        case 'airlineOut':
          return airlineOut(r) || '-';
        case 'exit':
          return `${r.arrivalDate || ''} ${r.arrivalTime || ''}`.trim() || '-';
        case 'flightIn':
          return flightIn(r) || '-';
        case 'airlineIn':
          return airlineIn(r) || '-';
        case 'status':
          return statusToLabel(r.status, 'driver');
        case 'unpaid':
          return isReservationUnpaid(r) ? '미납' : '완납';
        case 'destination':
          return r.destination || '-';
        case 'userRequest':
          return customerRequest(r) || '-';
        case 'adminMemo':
          return r.adminMemo || '-';
        case 'companyName':
          return r.companyName || r.companyId || '-';
        case 'bookingSource':
          return bookingSourceLabel(resolveBookingSourceFromReservation(r));
        case 'guestName':
          return r.userName || '-';
        case 'phone': {
          if (opts?.forPrint && prefs.features.maskPhoneOnPrint) {
            return maskPhone(r.phone || '');
          }
          return r.phone || '-';
        }
        default:
          return '-';
      }
    },
    [companies, prefs.features.maskPhoneOnPrint]
  );

  const handlePrint = () => {
    window.print();
  };

  const handleCsv = () => {
    const day = normalizeDateString(selectedDate) || getKSTDateOnlyString();
    const cols = prefs.features.csvVisibleOnly
      ? visibleCols
      : orderedDispatchColumns(prefs);
    const header = cols.map(columnHeader);
    const lines = [header.join(',')];
    rows.forEach((row, idx) => {
      lines.push(
        cols
          .map((id) => csvEscape(cellText(id, row, idx, { forPrint: false })))
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

  const renderCell = (
    id: DispatchColumnId,
    row: BoardRow,
    idx: number,
    opts?: { compact?: boolean }
  ) => {
    const r = row.res;
    const text = cellText(id, row, idx);
    const pad = opts?.compact ? 'px-2 py-1' : 'px-2 py-2';

    if (id === 'intake') {
      return (
        <td
          key={id}
          className={cn(
            pad,
            'tabular-nums whitespace-nowrap',
            row.onSelectedDate.intake && 'text-sky-400 print:text-sky-800 font-bold'
          )}
        >
          {text}
        </td>
      );
    }
    if (id === 'exit') {
      return (
        <td
          key={id}
          className={cn(
            pad,
            'tabular-nums whitespace-nowrap',
            row.onSelectedDate.exit && 'text-rose-400 print:text-rose-800 font-bold'
          )}
        >
          {text}
        </td>
      );
    }
    if (id === 'carNumber' || id === 'index') {
      return (
        <td
          key={id}
          className={cn(
            pad,
            'tabular-nums',
            id === 'carNumber' ? 'font-black' : 'text-zinc-500'
          )}
        >
          {text}
        </td>
      );
    }
    if (id === 'flightOut' || id === 'flightIn') {
      return (
        <td key={id} className={cn(pad, 'font-mono text-[11px]')}>
          {text}
        </td>
      );
    }
    if (id === 'unpaid') {
      return (
        <td
          key={id}
          className={cn(
            pad,
            'font-bold whitespace-nowrap',
            isReservationUnpaid(r) ? 'text-rose-400' : 'text-emerald-400'
          )}
        >
          {text}
        </td>
      );
    }
    if (id === 'phone') {
      const printPhone = cellText(id, row, idx, { forPrint: true });
      const tel = phoneTelHref(r.phone || '');
      return (
        <td key={id} className={cn(pad, 'tabular-nums text-[11px]')}>
          <span className="print:hidden">
            {prefs.features.telLink && tel ? (
              <a
                href={tel}
                className="text-sky-400 hover:underline font-semibold"
                onClick={(e) => e.stopPropagation()}
              >
                {r.phone || '-'}
              </a>
            ) : (
              r.phone || '-'
            )}
          </span>
          <span className="hidden print:inline">{printPhone}</span>
        </td>
      );
    }
    if (id === 'userRequest' || id === 'adminMemo' || id === 'destination') {
      return (
        <td key={id} className={cn(pad, 'max-w-[140px] truncate text-[11px]')} title={text}>
          {text}
        </td>
      );
    }
    return (
      <td key={id} className={pad}>
        {text}
      </td>
    );
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
              목록·시간표 전환 · 표시 항목은 「표시 설정」에서 선택
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setSettingsOpen((v) => !v)}
              className={cn(
                'inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border',
                settingsOpen
                  ? 'bg-amber-500 text-neutral-950 border-amber-500'
                  : 'bg-[#2C2C2E] text-zinc-200 border-neutral-700 hover:bg-neutral-700'
              )}
            >
              <Settings2 size={14} />
              표시 설정
            </button>
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

        {settingsOpen && (
          <div className="rounded-2xl border border-neutral-700 bg-[#1C1C1E] p-4 space-y-4">
            <div className="space-y-2">
              <p className="text-xs font-black text-zinc-200">보기 방식</p>
              <div className="flex flex-wrap gap-2">
                {(
                  [
                    { id: 'list' as const, label: '목록' },
                    { id: 'timetable' as const, label: '시간표' },
                  ] as const
                ).map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setLayout(t.id)}
                    className={cn(
                      'px-3 py-1.5 rounded-full text-[11px] font-black border transition-colors',
                      prefs.layout === t.id
                        ? 'bg-amber-500 text-neutral-950 border-amber-500'
                        : 'bg-transparent text-zinc-400 border-neutral-700 hover:text-zinc-200'
                    )}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-zinc-500 font-semibold">
                시간표는 화면용입니다. 인쇄·CSV는 항상 목록 형식으로 나갑니다.
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-neutral-800 pt-3">
              <div>
                <p className="text-xs font-black text-zinc-200">표시할 컬럼 · 순서</p>
                <p className="text-[10px] text-zinc-500 font-semibold mt-0.5">
                  위↓아래 버튼으로 좌→우 순서를 바꿉니다. 이 기기 브라우저에 저장됩니다.
                </p>
              </div>
              <button
                type="button"
                onClick={() => updatePrefs(defaultDispatchBoardPrefs())}
                className="text-[11px] font-bold text-amber-500 hover:text-amber-400"
              >
                기본값으로
              </button>
            </div>
            <div className="space-y-1 max-h-64 overflow-y-auto pr-1">
              {orderedDispatchColumns(prefs).map((id, orderIdx, order) => {
                const meta = DISPATCH_COLUMN_META.find((c) => c.id === id);
                if (!meta) return null;
                return (
                  <div
                    key={id}
                    className="flex items-center gap-2 rounded-lg border border-neutral-800 bg-neutral-950/40 px-2 py-1.5"
                  >
                    <label className="flex min-w-0 flex-1 items-center gap-2 text-[11px] text-zinc-300 font-semibold cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={prefs.columns[id]}
                        onChange={(e) =>
                          updatePrefs({
                            ...prefs,
                            columns: { ...prefs.columns, [id]: e.target.checked },
                          })
                        }
                        className="accent-amber-500 shrink-0"
                      />
                      <span className="truncate">{meta.label}</span>
                    </label>
                    <div className="flex shrink-0 items-center gap-0.5">
                      <button
                        type="button"
                        aria-label={`${meta.label} 왼쪽으로`}
                        disabled={orderIdx === 0}
                        onClick={() =>
                          updatePrefs({
                            ...prefs,
                            columnOrder: moveColumnInOrder(prefs.columnOrder, id, 'up'),
                          })
                        }
                        className="p-1 rounded text-zinc-400 hover:text-zinc-100 hover:bg-neutral-800 disabled:opacity-30 disabled:hover:bg-transparent"
                      >
                        <ChevronUp size={14} />
                      </button>
                      <button
                        type="button"
                        aria-label={`${meta.label} 오른쪽으로`}
                        disabled={orderIdx === order.length - 1}
                        onClick={() =>
                          updatePrefs({
                            ...prefs,
                            columnOrder: moveColumnInOrder(prefs.columnOrder, id, 'down'),
                          })
                        }
                        className="p-1 rounded text-zinc-400 hover:text-zinc-100 hover:bg-neutral-800 disabled:opacity-30 disabled:hover:bg-transparent"
                      >
                        <ChevronDown size={14} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="border-t border-neutral-800 pt-3 space-y-2">
              <p className="text-xs font-black text-zinc-200">보조 기능</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {DISPATCH_FEATURE_META.map((f) => (
                  <label
                    key={f.id}
                    className="flex items-center gap-2 text-[11px] text-zinc-300 font-semibold cursor-pointer select-none"
                  >
                    <input
                      type="checkbox"
                      checked={prefs.features[f.id]}
                      onChange={(e) =>
                        updatePrefs({
                          ...prefs,
                          features: { ...prefs.features, [f.id]: e.target.checked },
                        })
                      }
                      className="accent-amber-500"
                    />
                    {f.label}
                  </label>
                ))}
              </div>
            </div>
          </div>
        )}

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
              { id: 'list' as const, label: '목록' },
              { id: 'timetable' as const, label: '시간표' },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setLayout(t.id)}
              className={cn(
                'px-3 py-1.5 rounded-full text-[11px] font-black border transition-colors',
                prefs.layout === t.id
                  ? 'bg-sky-500 text-neutral-950 border-sky-500'
                  : 'bg-transparent text-zinc-400 border-neutral-700 hover:text-zinc-200'
              )}
            >
              {t.label}
            </button>
          ))}
          <span className="w-px h-4 bg-neutral-700 mx-0.5" aria-hidden />
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
        </div>
      </div>

      <div className="dispatch-print-root">
        <div className="hidden print:block mb-2">
          <p className="text-sm font-black">
            {companyName || '에어픽 파트너'} · 입출차 배차표 · {selectedDate}
          </p>
        </div>

        {/* 화면용 시간표 — 인쇄/엑셀은 목록이 더 읽기 쉬움 */}
        {isTimetable ? (
          <div className="overflow-x-auto rounded-2xl border border-neutral-800 print:hidden">
            <table className="w-full min-w-[960px] text-left border-collapse">
              <thead>
                <tr className="bg-[#1C1C1E] text-[10px] text-zinc-400 font-black uppercase tracking-wide">
                  <th className="px-2 py-2 whitespace-nowrap sticky left-0 z-[1] bg-[#1C1C1E]">
                    시간대
                  </th>
                  <th className="px-2 py-2 whitespace-nowrap">입/출</th>
                  <th className="px-2 py-2 whitespace-nowrap">시각</th>
                  {visibleCols.map((id) => (
                    <th key={id} className="px-2 py-2 whitespace-nowrap">
                      {columnHeader(id)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(() => {
                  let eventIdx = 0;
                  return timetableSlots.map((slot) => {
                    const empty = slot.events.length === 0;
                    if (empty) {
                      return (
                        <tr
                          key={slot.time}
                          className="border-t border-neutral-800/60"
                        >
                          <td
                            className={cn(
                              'px-2 py-0.5 text-[11px] font-mono tabular-nums font-bold whitespace-nowrap sticky left-0 z-[1]',
                              'text-zinc-600 bg-neutral-950/90'
                            )}
                          >
                            {slot.time}
                          </td>
                          <td
                            colSpan={visibleCols.length + 2}
                            className="px-2 py-0.5 h-7"
                          />
                        </tr>
                      );
                    }

                    return slot.events.map((ev, evIdx) => {
                      const idx = eventIdx++;
                      const exact = normalizeClock(
                        ev.kind === 'intake' ? ev.res.departureTime : ev.res.arrivalTime
                      );
                      const rowForCells: BoardRow = {
                        res: ev.res,
                        onSelectedDate: {
                          intake: ev.kind === 'intake',
                          exit: ev.kind === 'exit',
                        },
                      };
                      return (
                        <tr
                          key={`${ev.res.id}-${ev.kind}-${slot.time}`}
                          className={cn(
                            'border-t border-neutral-800/80 text-[12px] text-zinc-200',
                            ev.kind === 'intake' ? 'bg-sky-500/[0.04]' : 'bg-rose-500/[0.04]'
                          )}
                        >
                          {evIdx === 0 ? (
                            <td
                              rowSpan={slot.events.length}
                              className={cn(
                                'px-2 py-1 text-[12px] font-black font-mono tabular-nums whitespace-nowrap align-top sticky left-0 z-[1]',
                                'text-amber-400 bg-[#121214]'
                              )}
                            >
                              {slot.time}
                            </td>
                          ) : null}
                          <td className="px-2 py-1 whitespace-nowrap">
                            <span
                              className={cn(
                                'inline-block px-1.5 py-0.5 rounded text-[10px] font-black',
                                ev.kind === 'intake'
                                  ? 'bg-sky-500/15 text-sky-400'
                                  : 'bg-rose-500/15 text-rose-400'
                              )}
                            >
                              {ev.kind === 'intake' ? '입차' : '출차'}
                            </span>
                          </td>
                          <td className="px-2 py-1 font-mono text-[11px] tabular-nums text-zinc-400 whitespace-nowrap">
                            {exact || '—'}
                          </td>
                          {visibleCols.map((id) =>
                            renderCell(id, rowForCells, idx, { compact: true })
                          )}
                        </tr>
                      );
                    });
                  });
                })()}
              </tbody>
            </table>
          </div>
        ) : null}

        {/* 목록: 화면(목록 탭) + 인쇄/CSV용 (시간표 탭에서도 인쇄 시 이 표) */}
        <div
          className={cn(
            'overflow-x-auto rounded-2xl border border-neutral-800 print:border-neutral-400 print:rounded-none',
            isTimetable && 'hidden print:block'
          )}
        >
          <table className="dispatch-print-table w-full min-w-[900px] text-left border-collapse">
            <thead>
              <tr className="bg-[#1C1C1E] text-[10px] text-zinc-400 font-black uppercase tracking-wide print:bg-neutral-100">
                {visibleCols.map((id) => (
                  <th key={id} className="px-2 py-2.5 whitespace-nowrap">
                    {columnHeader(id)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={Math.max(visibleCols.length, 1)}
                    className="px-4 py-10 text-center text-sm text-zinc-500 font-semibold"
                  >
                    해당 날짜의 입·출차 예약이 없습니다.
                  </td>
                </tr>
              ) : (
                rows.map((row, idx) => {
                  const both =
                    prefs.features.rowHighlight &&
                    row.onSelectedDate.exit &&
                    row.onSelectedDate.intake;
                  return (
                    <tr
                      key={row.res.id || idx}
                      className={cn(
                        'border-t border-neutral-800/80 text-[12px] text-zinc-200 print:border-neutral-300 print:text-neutral-900',
                        both ? 'bg-amber-500/5' : 'bg-transparent'
                      )}
                    >
                      {visibleCols.map((id) => renderCell(id, row, idx))}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <p className="dispatch-no-print mt-2 text-[10px] text-zinc-500 font-semibold">
          {isTimetable
            ? `시간표(화면) · 인쇄·CSV는 목록 · ${rows.length}대`
            : `${rows.length}건`}
          {' · '}하늘색=입차 · 분홍=출차
          {!isTimetable && prefs.features.rowHighlight ? ' · 노란 행=당일 입·출 모두' : ''}
        </p>
      </div>
    </div>
  );
}

