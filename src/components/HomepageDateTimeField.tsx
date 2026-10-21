import { useEffect, useRef, useState } from 'react';

type Part = 'year' | 'month' | 'day' | 'hour' | 'minute';

type Parts = { y: number; m: number; d: number; h: number; min: number };

const PARTS: Part[] = ['year', 'month', 'day', 'hour', 'minute'];

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function parseLocal(value: string): Parts | null {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!match) return null;
  return {
    y: Number(match[1]),
    m: Number(match[2]),
    d: Number(match[3]),
    h: Number(match[4]),
    min: Number(match[5]),
  };
}

function toLocal(parts: Parts): string {
  return `${parts.y}-${pad(parts.m)}-${pad(parts.d)}T${pad(parts.h)}:${pad(parts.min)}`;
}

function hourText(hour: number): string {
  const half = hour < 12 ? '오전' : '오후';
  const h12 = hour % 12 || 12;
  return `${half} ${h12}`;
}

function clampParts(parts: Parts, minValue?: string): Parts {
  const dayMax = daysInMonth(parts.y, parts.m);
  const next = { ...parts, d: Math.min(parts.d, dayMax) };
  const min = minValue ? parseLocal(minValue) : null;
  if (!min) return next;
  if (toLocal(next) < toLocal(min)) return min;
  return next;
}

function optionsFor(part: Part, current: Parts, minValue?: string): { value: number; label: string }[] {
  const min = minValue ? parseLocal(minValue) : null;
  const years = [current.y];
  if (min && !years.includes(min.y)) years.push(min.y);
  years.push(current.y + 1);
  const uniqueYears = [...new Set(years)].sort((a, b) => a - b);

  if (part === 'year') return uniqueYears.map((value) => ({ value, label: String(value) }));
  if (part === 'month') {
    return Array.from({ length: 12 }, (_, i) => ({ value: i + 1, label: String(i + 1) }));
  }
  if (part === 'day') {
    return Array.from({ length: daysInMonth(current.y, current.m) }, (_, i) => ({
      value: i + 1,
      label: String(i + 1),
    }));
  }
  if (part === 'hour') {
    return Array.from({ length: 24 }, (_, value) => ({ value, label: hourText(value) }));
  }
  return Array.from({ length: 12 }, (_, i) => {
    const value = i * 5;
    return { value, label: pad(value) };
  });
}

function nearestMinute(minute: number): number {
  const rounded = Math.round(minute / 5) * 5;
  return rounded >= 60 ? 0 : rounded;
}

export default function HomepageDateTimeField({
  value,
  min,
  onChange,
}: {
  value: string;
  min?: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState<Part | null>(null);
  const [openUp, setOpenUp] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const parsed = parseLocal(value);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(null);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  useEffect(() => {
    if (!open || !rootRef.current) return;
    const rect = rootRef.current.getBoundingClientRect();
    const menuHeight = open === 'hour' ? 250 : open === 'minute' ? 150 : 220;
    setOpenUp(window.innerHeight - rect.bottom < menuHeight + 24);
  }, [open]);

  useEffect(() => {
    const list = listRef.current;
    const selected = list?.querySelector('[data-selected="true"]') as HTMLElement | null;
    if (!list || !selected || open === 'hour' || open === 'minute') return;
    list.scrollTop = selected.offsetTop - list.clientHeight / 2 + selected.clientHeight / 2;
  }, [open]);

  if (!parsed) return null;

  const choose = (part: Part, nextValue: number) => {
    const next = clampParts({ ...parsed, [part === 'year' ? 'y' : part === 'month' ? 'm' : part === 'day' ? 'd' : part === 'hour' ? 'h' : 'min']: nextValue }, min);
    onChange(toLocal(next));
    setOpen(null);
  };

  const currentNumber = (part: Part) => {
    if (part === 'year') return parsed.y;
    if (part === 'month') return parsed.m;
    if (part === 'day') return parsed.d;
    if (part === 'hour') return parsed.h;
    return nearestMinute(parsed.min);
  };

  const buttonLabel = (part: Part) => {
    if (part === 'year') return String(parsed.y);
    if (part === 'month') return String(parsed.m);
    if (part === 'day') return String(parsed.d);
    if (part === 'hour') return hourText(parsed.h);
    return pad(parsed.min);
  };

  return (
    <div ref={rootRef} className="relative">
      <div className="flex min-h-12 w-full items-center gap-0.5 rounded-lg border border-stone-200 bg-white px-2.5 py-2 text-base text-stone-900">
        {PARTS.map((part, index) => (
          <span key={part} className="flex items-center">
            <button
              type="button"
              onClick={() => setOpen((current) => (current === part ? null : part))}
              className={`rounded-md px-1 py-1 font-semibold tabular-nums hover:bg-stone-100 ${
                open === part ? 'bg-stone-900 text-white hover:bg-stone-900' : ''
              }`}
            >
              {buttonLabel(part)}
            </button>
            {index < 2 ? <span className="text-stone-400">.</span> : null}
            {index === 2 ? <span className="px-0.5 text-stone-300"> </span> : null}
            {index === 3 ? <span className="px-0.5 text-stone-400">:</span> : null}
          </span>
        ))}
      </div>
      {open ? (
        <div
          ref={listRef}
          className={`absolute z-50 rounded-xl border border-stone-200 bg-white shadow-lg ${
            openUp ? 'bottom-full mb-1' : 'top-full mt-1'
          } ${
            open === 'hour' || open === 'minute'
              ? 'left-0 right-0 grid grid-cols-4 gap-1 p-1.5'
              : 'left-0 max-h-52 w-28 overflow-y-auto py-1'
          }`}
        >
          {optionsFor(open, parsed, min).map((option) => {
            const selected = option.value === currentNumber(open);
            const timePart = open === 'hour' || open === 'minute';
            return (
              <button
                key={option.value}
                type="button"
                data-selected={selected ? 'true' : 'false'}
                onClick={() => choose(open, option.value)}
                className={`font-semibold tabular-nums ${
                  timePart
                    ? 'rounded-lg px-1 py-2 text-center text-[13px]'
                    : 'block w-full px-3 py-1.5 text-left text-sm'
                } ${selected ? 'bg-stone-900 text-white' : 'text-stone-800 hover:bg-stone-100'}`}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
