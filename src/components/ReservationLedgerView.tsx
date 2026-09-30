import React, { useMemo, useState } from 'react';
import type { Company, Reservation, ReservationStatus } from '../types';
import { getKSTDateOnlyString } from '../utils/kstDate';
import { normalizeDateString } from '../utils/reservationNormalize';
import { normalizeReservationStatus } from '../utils/reservationStatus';
import {
  normalizeAirportId,
  normalizeTerminalCode,
  terminalShortLabel,
} from '../utils/airport';

type DateBasis = 'intake' | 'exit';
type StatusFilter = 'all' | ReservationStatus;

const STATUS_FILTERS: { id: StatusFilter; label: string }[] = [
  { id: 'all', label: '전체' },
  { id: 'pending', label: '예약완료' },
  { id: 'pending_in', label: '입고' },
  { id: 'request_out', label: '출고' },
  { id: 'completed_in', label: '출고예정' },
  { id: 'completed_out', label: '반납완료' },
  { id: 'cancelled', label: '취소' },
];

const STATUS_LABEL: Record<ReservationStatus, string> = {
  pending: '예약완료',
  pending_in: '입고',
  request_out: '출고',
  completed_in: '출고예정',
  completed_out: '반납완료',
  cancelled: '취소',
};

function monthBounds(today: string): { from: string; to: string } {
  const prefix = today.slice(0, 7);
  const [y, m] = prefix.split('-').map(Number);
  const last = new Date(y, m, 0).getDate();
  return {
    from: `${prefix}-01`,
    to: `${prefix}-${String(last).padStart(2, '0')}`,
  };
}

function shortWhen(date: string, time: string): string {
  const ymd = normalizeDateString(date);
  if (!ymd) return '—';
  const md = `${ymd.slice(5, 7)}-${ymd.slice(8, 10)}`;
  const hm = String(time || '').trim().slice(0, 5);
  return hm ? `${md} ${hm}` : md;
}

interface ReservationLedgerViewProps {
  reservations: Reservation[];
  companies?: Company[];
  currentCompanyId?: string;
  onEditReservation?: (res: Reservation) => void;
}

export default function ReservationLedgerView({
  reservations,
  companies = [],
  currentCompanyId = '',
  onEditReservation,
}: ReservationLedgerViewProps) {
  const today = getKSTDateOnlyString();
  const initial = monthBounds(today);
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [basis, setBasis] = useState<DateBasis>('intake');
  const [terminal, setTerminal] = useState('all');
  const [place, setPlace] = useState<'all' | 'indoor' | 'outdoor'>('all');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [query, setQuery] = useState('');

  const company = companies.find((c) => c.id === currentCompanyId);
  const airport = normalizeAirportId(company?.airport);
  const terminals =
    airport === 'GMP'
      ? [
          { code: 'DOM', label: '국내선' },
          { code: 'INT', label: '국제선' },
        ]
      : [
          { code: 'T1', label: 'T1' },
          { code: 'T2', label: 'T2' },
        ];

  const rows = useMemo(() => {
    const start = from <= to ? from : to;
    const end = from <= to ? to : from;
    const q = query.trim().toLowerCase().replace(/\s+/g, '');
    return reservations
      .filter((res) => {
        const ymd = normalizeDateString(basis === 'intake' ? res.departureDate : res.arrivalDate);
        if (!ymd || ymd < start || ymd > end) return false;
        const code = normalizeReservationStatus(res.status);
        if (status !== 'all' && code !== status) return false;
        if (place === 'indoor' && res.isIndoor !== true) return false;
        if (place === 'outdoor' && res.isIndoor === true) return false;
        if (terminal !== 'all') {
          const leg = basis === 'intake' ? res.departureTerminal : res.arrivalTerminal;
          if (normalizeTerminalCode(airport, leg) !== terminal) return false;
        }
        if (!q) return true;
        const hay = `${res.carNumber || ''} ${res.userName || ''} ${res.phone || ''}`
          .toLowerCase()
          .replace(/\s+/g, '');
        return hay.includes(q);
      })
      .sort((a, b) => {
        const ad = `${basis === 'intake' ? a.departureDate : a.arrivalDate} ${
          basis === 'intake' ? a.departureTime : a.arrivalTime
        }`;
        const bd = `${basis === 'intake' ? b.departureDate : b.arrivalDate} ${
          basis === 'intake' ? b.departureTime : b.arrivalTime
        }`;
        return ad.localeCompare(bd);
      });
  }, [reservations, from, to, basis, terminal, place, status, query, airport]);

  const chip = (on: boolean) =>
    `px-2.5 py-1 rounded-lg text-[11px] font-black border ${
      on ? 'bg-amber-500 text-neutral-950 border-amber-500' : 'bg-[#1C1C1E] text-zinc-400 border-neutral-800'
    }`;
  const field =
    'bg-[#1C1C1E] border border-neutral-800 rounded-xl px-2.5 py-1.5 text-[12px] font-bold text-white [color-scheme:dark]';

  return (
    <div className="space-y-3 pb-8">
      <div className="px-1">
        <h2 className="text-sm font-black text-white">예약 목록</h2>
        <p className="text-[11px] text-zinc-500 font-semibold mt-0.5">
          터미널, 실내·야외, 기간, 상태, 차량번호로 거릅니다. 기사 카드는 그대로입니다.
        </p>
      </div>

      <div className="bg-[#1C1C1E] border border-neutral-800/60 rounded-2xl p-3 space-y-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={field} aria-label="시작일" />
          <span className="text-zinc-500 text-xs">–</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={field} aria-label="종료일" />
          <button type="button" className={chip(basis === 'intake')} onClick={() => setBasis('intake')}>
            입고일
          </button>
          <button type="button" className={chip(basis === 'exit')} onClick={() => setBasis('exit')}>
            출고일
          </button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button type="button" className={chip(terminal === 'all')} onClick={() => setTerminal('all')}>
            터미널 전체
          </button>
          {terminals.map((item) => (
            <button
              key={item.code}
              type="button"
              className={chip(terminal === item.code)}
              onClick={() => setTerminal(item.code)}
            >
              {item.label}
            </button>
          ))}
          <button type="button" className={chip(place === 'all')} onClick={() => setPlace('all')}>
            실내·야외
          </button>
          <button type="button" className={chip(place === 'indoor')} onClick={() => setPlace('indoor')}>
            실내
          </button>
          <button type="button" className={chip(place === 'outdoor')} onClick={() => setPlace('outdoor')}>
            야외
          </button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {STATUS_FILTERS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={chip(status === item.id)}
              onClick={() => setStatus(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="차량번호, 고객명, 전화번호"
          className={`${field} w-full`}
        />
      </div>

      <p className="px-1 text-[11px] text-zinc-500 font-bold">{rows.length}건</p>

      <div className="space-y-2">
        {rows.length === 0 ? (
          <p className="px-3 py-8 text-center text-[12px] text-zinc-500 font-semibold">
            이 조건의 예약이 없습니다.
          </p>
        ) : (
          rows.map((res) => {
            const code = normalizeReservationStatus(res.status);
            return (
              <button
                key={res.id || `${res.carNumber}-${res.departureDate}-${res.createdAt}`}
                type="button"
                onClick={() => onEditReservation?.(res)}
                className="w-full text-left bg-[#1C1C1E] border border-neutral-800/50 rounded-2xl px-3 py-2.5 hover:border-neutral-700"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[14px] font-black text-white">{res.carNumber || '차량번호 없음'}</span>
                  <span className="text-[11px] font-black text-amber-400">{STATUS_LABEL[code]}</span>
                </div>
                <p className="text-[12px] text-zinc-300 mt-0.5">{res.userName || '이름 없음'}</p>
                <p className="text-[11px] text-zinc-500 font-semibold mt-1 tabular-nums">
                  입고 {shortWhen(res.departureDate, res.departureTime)}{' '}
                  {terminalShortLabel(airport, res.departureTerminal)}
                  {' · '}
                  출고 {shortWhen(res.arrivalDate, res.arrivalTime)}{' '}
                  {terminalShortLabel(airport, res.arrivalTerminal)}
                  {' · '}
                  {res.isIndoor ? '실내' : '야외'}
                </p>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
