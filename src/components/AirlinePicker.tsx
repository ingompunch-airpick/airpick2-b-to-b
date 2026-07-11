import React, { useEffect, useState } from 'react';
import {
  DEFAULT_AIRLINES,
  OTHER_AIRLINE_VALUE,
  isListedAirline,
} from '../utils/flightFields';

interface AirlinePickerProps {
  value: string;
  onChange: (airlineName: string) => void;
  /** dark = B2B 앱, light = 홈 예약 */
  tone?: 'dark' | 'light';
  required?: boolean;
  id?: string;
  allowEmpty?: boolean;
  emptyLabel?: string;
}

export default function AirlinePicker({
  value,
  onChange,
  tone = 'dark',
  required = false,
  id,
  allowEmpty = true,
  emptyLabel = '선택 안 함',
}: AirlinePickerProps) {
  const listed = isListedAirline(value);
  const [mode, setMode] = useState<'listed' | 'other'>(() =>
    value && !listed ? 'other' : 'listed'
  );
  const [custom, setCustom] = useState(() => (value && !listed ? value : ''));

  useEffect(() => {
    if (!value) {
      setMode('listed');
      setCustom('');
      return;
    }
    if (isListedAirline(value)) {
      setMode('listed');
      return;
    }
    setMode('other');
    setCustom(value);
  }, [value]);

  const selectClass =
    tone === 'light'
      ? 'w-full min-h-12 rounded-lg border border-stone-200 bg-white px-3.5 py-3 text-base text-stone-900 outline-none focus:border-stone-400'
      : 'w-full px-3 py-2 bg-neutral-950 border border-neutral-850 rounded-xl text-zinc-100 text-xs font-bold outline-none focus:border-amber-500';

  const inputClass =
    tone === 'light'
      ? 'mt-2 w-full min-h-12 rounded-lg border border-stone-200 bg-white px-3.5 py-3 text-base text-stone-900 outline-none focus:border-stone-400'
      : 'mt-2 w-full px-3 py-2 bg-neutral-950 border border-neutral-850 rounded-xl text-zinc-100 text-xs font-bold outline-none focus:border-amber-500';

  const selectValue = mode === 'other' ? OTHER_AIRLINE_VALUE : value;

  return (
    <div>
      <select
        id={id}
        value={selectValue}
        required={required && mode !== 'other'}
        onChange={(e) => {
          const next = e.target.value;
          if (next === OTHER_AIRLINE_VALUE) {
            setMode('other');
            onChange(custom.trim());
            return;
          }
          setMode('listed');
          setCustom('');
          onChange(next);
        }}
        className={selectClass}
      >
        {allowEmpty ? <option value="">{emptyLabel}</option> : null}
        {DEFAULT_AIRLINES.map((name) => (
          <option key={name} value={name}>
            {name}
          </option>
        ))}
        <option value={OTHER_AIRLINE_VALUE}>기타 (직접 입력)</option>
      </select>
      {mode === 'other' ? (
        <input
          value={custom}
          required={required}
          onChange={(e) => {
            const next = e.target.value;
            setCustom(next);
            onChange(next.trim());
          }}
          placeholder="항공사 이름을 입력하세요."
          className={inputClass}
        />
      ) : null}
    </div>
  );
}
