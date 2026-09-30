import type { DocumentData } from 'firebase-admin/firestore';

type ScheduleLeg = 'intake' | 'exit';

type ScheduleRule = {
  leg: ScheduleLeg;
  terminal: string;
  date: string;
  startTime?: string;
  endTime?: string;
};

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

function normalizeYmd(value: unknown): string {
  const s = String(value || '').trim();
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : '';
}

export function readScheduleBlocks(value: unknown): ScheduleRule[] {
  if (!Array.isArray(value)) return [];
  const out: ScheduleRule[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== 'object') continue;
    const row = raw as Record<string, unknown>;
    const date = normalizeYmd(row.date);
    if (!date) continue;
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
    out.push({
      leg,
      terminal,
      date,
      ...(startTime ? { startTime } : {}),
      ...(endTime ? { endTime } : {}),
    });
    if (out.length >= 200) break;
  }
  return out;
}

function canonicalTerminal(raw: unknown): string {
  const s = String(raw || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '');
  if (!s) return '';
  if (s === 'T1' || s === '1' || s.includes('제1') || s.includes('1터미널')) return 'T1';
  if (s === 'T2' || s === '2' || s.includes('제2') || s.includes('2터미널')) return 'T2';
  if (s === 'DOM' || s.includes('국내')) return 'DOM';
  if (s === 'INT' || s.includes('국제')) return 'INT';
  return s;
}

function timeHits(reservationTime: unknown, start?: string, end?: string): boolean {
  const startM = start ? hmToMinutes(start) : null;
  const endM = end ? hmToMinutes(end) : null;
  if (startM === null && endM === null) return true;
  const current = hmToMinutes(String(reservationTime || ''));
  if (current === null) return false;
  if (startM !== null && current < startM) return false;
  if (endM !== null && current > endM) return false;
  return true;
}

function terminalHits(ruleTerminal: string, reservationTerminal: unknown): boolean {
  if (ruleTerminal === 'all') return true;
  const code = canonicalTerminal(reservationTerminal);
  if (!code) return false;
  return code === ruleTerminal;
}

function terminalPhrase(code: string): string {
  if (code === 'all') return '';
  if (code === 'T1') return '제1터미널';
  if (code === 'T2') return '제2터미널';
  if (code === 'DOM') return '국내선';
  if (code === 'INT') return '국제선';
  return code;
}

export function scheduleBlockNote(rule: ScheduleRule): string {
  const month = Number(rule.date.slice(5, 7));
  const day = Number(rule.date.slice(8, 10));
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
  const head = [`${month}월 ${day}일`, where, span].filter(Boolean).join(' ');
  return `${head} ${what}는 받지 않습니다.`;
}

export function matchScheduleBlock(
  rules: unknown,
  data: DocumentData
): ScheduleRule | null {
  const list = readScheduleBlocks(rules);
  const legs: { leg: ScheduleLeg; date: string; time: unknown; terminal: unknown }[] = [
    {
      leg: 'intake',
      date: normalizeYmd(data.departureDate),
      time: data.departureTime,
      terminal: data.departureTerminal,
    },
    {
      leg: 'exit',
      date: normalizeYmd(data.arrivalDate),
      time: data.arrivalTime,
      terminal: data.arrivalTerminal,
    },
  ];
  for (const leg of legs) {
    if (!leg.date) continue;
    for (const rule of list) {
      if (rule.leg !== leg.leg || rule.date !== leg.date) continue;
      if (!timeHits(leg.time, rule.startTime, rule.endTime)) continue;
      if (!terminalHits(rule.terminal, leg.terminal)) continue;
      return rule;
    }
  }
  return null;
}

/** 홈페이지·에어픽 예약은 확인 플래그를 무시한다. 현장 관리자 확인만 통과. */
export function scheduleBlockOverrideHonored(data: DocumentData): boolean {
  if (data.scheduleBlockOverride !== true) return false;
  const created = String(data.createdBy || '')
    .trim()
    .toLowerCase();
  if (!created) return false;
  if (created === 'homepage' || created === 'airpick-b2c' || created === 'airpick_b2c') {
    return false;
  }
  return true;
}
