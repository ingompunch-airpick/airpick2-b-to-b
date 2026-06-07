import { useEffect, useState } from 'react';
import { AIRLINE_OPTIONS, CUSTOM_AIRLINE_VALUE, isListedAirline } from '../constants/airlines';

interface AirlineFieldProps {
  value: string;
  onChange: (value: string) => void;
  selectClassName: string;
  inputClassName?: string;
}

export default function AirlineField({
  value,
  onChange,
  selectClassName,
  inputClassName,
}: AirlineFieldProps) {
  const [customMode, setCustomMode] = useState(() => Boolean(value) && !isListedAirline(value));

  useEffect(() => {
    if (value && !isListedAirline(value)) {
      setCustomMode(true);
      return;
    }
    if (value && isListedAirline(value)) {
      setCustomMode(false);
    }
  }, [value]);

  const selectValue = customMode
    ? CUSTOM_AIRLINE_VALUE
    : value && isListedAirline(value)
      ? value
      : '';

  return (
    <div className="space-y-1">
      <select
        value={selectValue}
        onChange={(e) => {
          const next = e.target.value;
          if (next === '') {
            setCustomMode(false);
            onChange('');
            return;
          }
          if (next === CUSTOM_AIRLINE_VALUE) {
            setCustomMode(true);
            if (isListedAirline(value)) onChange('');
            return;
          }
          setCustomMode(false);
          onChange(next);
        }}
        className={selectClassName}
      >
        <option value="">선택 안 함</option>
        {AIRLINE_OPTIONS.map((airline) => (
          <option key={airline} value={airline}>
            {airline}
          </option>
        ))}
        <option value={CUSTOM_AIRLINE_VALUE}>기타 (직접 입력)</option>
      </select>
      {customMode && (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="항공사명 입력"
          className={inputClassName || selectClassName}
        />
      )}
    </div>
  );
}
