import React from 'react';
import { getAirportTerminals, type AirportId } from '../utils/airport';

function cn(...classes: (string | boolean | undefined | null)[]) {
  return classes.filter(Boolean).join(' ');
}

type Props = {
  airportId?: AirportId | string | null;
  value: string;
  onChange: (code: string) => void;
  variant?: 'amber' | 'zinc' | 'homepage';
  className?: string;
  /** 버튼 클래스 오버라이드용 size */
  size?: 'sm' | 'md';
};

/**
 * 공항 설정표 기준 터미널 선택.
 * ICN → T1/T2, GMP → 국내선/국제선 (airportId로 터미널 목록 결정).
 */
export default function TerminalPicker({
  airportId,
  value,
  onChange,
  variant = 'amber',
  className,
  size = 'md',
}: Props) {
  const terminals = getAirportTerminals(airportId);
  const active = String(value || '').trim();

  return (
    <div
      className={cn('grid gap-1.5', className)}
      style={{ gridTemplateColumns: `repeat(${terminals.length}, minmax(0, 1fr))` }}
    >
      {terminals.map((t) => {
        const selected = active === t.code;
        if (variant === 'homepage') {
          return (
            <button
              key={t.code}
              type="button"
              onClick={() => onChange(t.code)}
              className={cn(
                'rounded-xl border px-3 py-2.5 text-left transition-all',
                size === 'sm' ? 'text-xs' : 'text-sm',
                selected
                  ? 'border-neutral-900 bg-neutral-900 text-white'
                  : 'border-neutral-200 bg-white text-neutral-700 hover:border-neutral-400'
              )}
            >
              <span className="font-bold block">{t.shortLabel}</span>
              <span className={cn('text-[11px]', selected ? 'text-white/70' : 'text-neutral-400')}>
                {t.label.replace(` (${t.code})`, '')}
              </span>
            </button>
          );
        }

        const activeCls =
          variant === 'amber'
            ? 'bg-amber-500/95 text-neutral-950'
            : 'bg-[#FFB800] text-neutral-950';
        const idleCls = 'bg-[#2C2C2E] text-zinc-400';

        return (
          <button
            key={t.code}
            type="button"
            onClick={() => onChange(t.code)}
            className={cn(
              'py-1.5 px-2.5 rounded-lg font-bold transition-all cursor-pointer',
              size === 'sm' ? 'text-[12px]' : 'text-[12.5px]',
              selected ? activeCls : idleCls
            )}
          >
            {t.shortLabel === t.code ? t.label : t.label}
          </button>
        );
      })}
    </div>
  );
}
