import { normalizeTerminalCode } from './airport';
import type { ScheduleBlockRule } from '../types';

export type { ScheduleBlockRule };
export type ScheduleBlockLeg = ScheduleBlockRule['leg'];

function normalizeHm(value: unknown): string {
  const m = String(value || '')
    .trim()
    .match(/^(\d{1,2}):(\d{2})/);
  if (!m) return '';
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(min) || h > 23 || min > 59) return '';
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

function hmToMinutes(value: string): number | null {
  const hm = normalizeHm(value);
  if (!hm) return null;
  const [h, m] = hm.split(':').map(Number);
  return h * 60 + m;
}

export function normalizeScheduleBlocks(value: unknown): ScheduleBlockRule[] {
  if (!Array.isArray(value)) return [];
  const out: ScheduleBlockRule[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== 'object') continue;
    const row = raw as Record<string, unknown>;
    const date = String(row.date || '').trim().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    const leg = row.leg === 'exit' ? 'exit' : row.leg === 'intake' ? 'intake' : null;
    if (!leg) continue;
    const terminalRaw = String(row.terminal || 'all').trim();
    const terminal = terminalRaw.toLowerCase() === 'all' ? 'all' : terminalRaw.toUpperCase();
    let startTime = normalizeHm(row.startTime);
    let endTime = normalizeHm(row.endTime);
    if (startTime && endTime && startTime > endTime) {
      const swap = startTime;
      startTime = endTime;
      endTime = swap;
    }
    const memo = String(row.memo || '').trim().slice(0, 80);
    const id = String(row.id || '').trim().slice(0, 40) || `blk-${out.length + 1}`;
    out.push({
      id,
      leg,
      terminal,
      date,
      ...(startTime ? { startTime } : {}),
      ...(endTime ? { endTime } : {}),
      ...(memo ? { memo } : {}),
    });
    if (out.length >= 200) break;
  }
  return out;
}

function timeHitsWindow(reservationTime: string, start?: string, end?: string): boolean {
  const startM = start ? hmToMinutes(start) : null;
  const endM = end ? hmToMinutes(end) : null;
  if (startM === null && endM === null) return true;
  const current = hmToMinutes(reservationTime);
  if (current === null) return false;
  if (startM !== null && current < startM) return false;
  if (endM !== null && current > endM) return false;
  return true;
}

function terminalHits(
  ruleTerminal: string,
  reservationTerminal: string | undefined,
  airport?: string | null
): boolean {
  if (ruleTerminal === 'all') return true;
  const raw = String(reservationTerminal || '').trim();
  if (!raw) return false;
  return normalizeTerminalCode(airport, raw) === ruleTerminal;
}

export function findScheduleBlock(args: {
  rules: unknown;
  airport?: string | null;
  departureDate: string;
  departureTime: string;
  departureTerminal?: string;
  arrivalDate: string;
  arrivalTime: string;
  arrivalTerminal?: string;
}): ScheduleBlockRule | null {
  const rules = normalizeScheduleBlocks(args.rules);
  const legs: {
    leg: ScheduleBlockLeg;
    date: string;
    time: string;
    terminal?: string;
  }[] = [
    {
      leg: 'intake',
      date: String(args.departureDate || '').slice(0, 10),
      time: args.departureTime,
      terminal: args.departureTerminal,
    },
    {
      leg: 'exit',
      date: String(args.arrivalDate || '').slice(0, 10),
      time: args.arrivalTime,
      terminal: args.arrivalTerminal,
    },
  ];

  for (const leg of legs) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(leg.date)) continue;
    for (const rule of rules) {
      if (rule.leg !== leg.leg || rule.date !== leg.date) continue;
      if (!timeHitsWindow(leg.time, rule.startTime, rule.endTime)) continue;
      if (!terminalHits(rule.terminal, leg.terminal, args.airport)) continue;
      return rule;
    }
  }
  return null;
}

function terminalPhrase(code: string): string {
  if (code === 'all') return '';
  if (code === 'T1') return '제1터미널';
  if (code === 'T2') return '제2터미널';
  if (code === 'DOM') return '국내선';
  if (code === 'INT') return '국제선';
  return code;
}

/** 00:00–00:50, 01:00–01:50 … 한 칸. 구간이 비어 있으면 하루 24칸 */
export function hoursCoveredByRule(rule: Pick<ScheduleBlockRule, 'startTime' | 'endTime'>): number[] {
  if (!rule.startTime && !rule.endTime) {
    return Array.from({ length: 24 }, (_, hour) => hour);
  }
  const startM = rule.startTime ? hmToMinutes(rule.startTime) : 0;
  const endM = rule.endTime ? hmToMinutes(rule.endTime) : 23 * 60 + 50;
  if (startM === null || endM === null) return [];
  const hours: number[] = [];
  for (let hour = 0; hour < 24; hour += 1) {
    const slotStart = hour * 60;
    const slotEnd = hour * 60 + 50;
    if (slotEnd < startM || slotStart > endM) continue;
    hours.push(hour);
  }
  return hours;
}

export function scheduleBlocksFromHours(args: {
  date: string;
  leg: ScheduleBlockLeg;
  terminal: string;
  hours: number[];
}): ScheduleBlockRule[] {
  const sorted = [...new Set(args.hours.filter((hour) => hour >= 0 && hour <= 23))].sort((a, b) => a - b);
  const rules: ScheduleBlockRule[] = [];
  let index = 0;
  while (index < sorted.length) {
    let end = index;
    while (end + 1 < sorted.length && sorted[end + 1] === sorted[end] + 1) end += 1;
    const from = sorted[index];
    const last = sorted[end];
    const startTime = `${String(from).padStart(2, '0')}:00`;
    const endTime = `${String(last).padStart(2, '0')}:50`;
    rules.push({
      id: `h-${args.date}-${args.leg}-${args.terminal}-${startTime}`,
      leg: args.leg,
      terminal: args.terminal,
      date: args.date,
      startTime,
      endTime,
    });
    index = end + 1;
  }
  return rules;
}

export function scheduleBlockMessage(rule: ScheduleBlockRule): string {
  const month = Number(rule.date.slice(5, 7));
  const day = Number(rule.date.slice(8, 10));
  const when = `${month}월 ${day}일`;
  const where = terminalPhrase(rule.terminal);
  const span =
    rule.startTime && rule.endTime
      ? `${rule.startTime}–${rule.endTime}`
      : rule.startTime
        ? `${rule.startTime} 이후`
        : rule.endTime
          ? `${rule.endTime} 이전`
          : '';
  const what = rule.leg === 'exit' ? '출고' : '입고';
  const head = [when, where, span].filter(Boolean).join(' ');
  return `${head} ${what}는 받지 않습니다.`;
}

export function canStaffOverrideScheduleBlock(actor: {
  isSuperAdmin?: boolean;
  isEmployee?: boolean;
  employeeRole?: 'admin' | 'driver';
}): boolean {
  if (actor.isSuperAdmin) return true;
  if (!actor.isEmployee) return true;
  return actor.employeeRole === 'admin';
}
