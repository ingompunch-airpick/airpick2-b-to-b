import React from 'react';
import type { AirportTerminal } from '../utils/parkingDistances';
import type {
  ParkingDistancesFormInput,
  TerminalParkingDistanceForm,
} from '../utils/parkingDistances';
import { getAirportTerminals, type AirportId } from '../utils/airport';

type Props = {
  airportId?: AirportId | string | null;
  distances: ParkingDistancesFormInput;
  onChange: (terminalCode: string, next: TerminalParkingDistanceForm) => void;
  variant?: 'light' | 'dark';
  title?: string;
  hint?: string;
  /** 핀 섹션 안에 넣을 때 바깥 테두리 제거 */
  nested?: boolean;
};

function TerminalSection({
  terminal,
  label,
  form,
  onChange,
  variant,
}: {
  terminal: AirportTerminal;
  label: string;
  form: TerminalParkingDistanceForm;
  onChange: (next: TerminalParkingDistanceForm) => void;
  variant: 'light' | 'dark';
}) {
  const set = <K extends keyof TerminalParkingDistanceForm>(
    key: K,
    value: TerminalParkingDistanceForm[K]
  ) => {
    onChange({ ...form, [key]: value });
  };

  const labelCls =
    variant === 'dark'
      ? 'text-[12px] text-zinc-300 block mb-1 font-bold'
      : 'text-[12px] text-slate-500 block mb-1 font-bold';
  const inputCls =
    variant === 'dark'
      ? 'w-full px-3 py-2 border border-neutral-800 bg-[#1C1C1E] text-white rounded-xl focus:outline-none focus:ring-1 focus:ring-amber-500/40 text-xs'
      : 'w-full px-3 py-2 border border-slate-200 bg-white text-slate-900 rounded-xl focus:outline-none focus:ring-1 focus:ring-indigo-500 text-xs';
  const panelCls =
    variant === 'dark'
      ? 'rounded-xl border border-neutral-850 bg-[#131315] p-3 space-y-3'
      : 'rounded-xl border border-slate-200 bg-white p-3 space-y-3';

  return (
    <div className={panelCls}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-black text-amber-500">{label}</span>
        <span className="text-[10px] text-zinc-500">B2C 거리순 정렬 기준</span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>
            터미널까지 거리 (km) <span className="text-rose-400">*</span>
          </label>
          <input
            type="text"
            inputMode="decimal"
            value={form.distanceKm}
            onChange={(e) => set('distanceKm', e.target.value.replace(/[^\d.]/g, ''))}
            className={`${inputCls} font-mono font-bold`}
            placeholder="예: 2.5"
          />
        </div>
        <div>
          <label className={labelCls}>승용차 이동 시간 (분)</label>
          <input
            type="text"
            inputMode="numeric"
            value={form.driveMinutes}
            onChange={(e) => set('driveMinutes', e.target.value.replace(/\D/g, ''))}
            className={`${inputCls} font-mono`}
            placeholder="예: 8"
          />
        </div>
      </div>
    </div>
  );
}

export default function ParkingDistancesFormFields({
  airportId = 'ICN',
  distances,
  onChange,
  variant = 'light',
  title = '터미널별 주차장 거리',
  hint = 'B2C 비교 화면 거리순 탭에서 사용합니다. 핀으로 자동 계산된 km·분을 필요 시 수정하세요.',
  nested = false,
}: Props) {
  const terminals = getAirportTerminals(airportId);
  const sectionCls = nested
    ? 'space-y-3'
    : variant === 'dark'
      ? 'rounded-xl border border-neutral-850 bg-neutral-900/40 p-3 space-y-3'
      : 'rounded-xl border border-slate-100 bg-slate-50/80 p-3 space-y-3';

  return (
    <div className={sectionCls}>
      <div>
        <label
          className={
            variant === 'dark'
              ? 'text-[12px] text-zinc-200 block font-black'
              : 'text-[12px] text-slate-700 block font-black'
          }
        >
          {title}
        </label>
        <p className="text-[11px] text-slate-400 mt-1">{hint}</p>
      </div>

      {terminals.map((t) => (
        <TerminalSection
          key={t.code}
          terminal={t.code}
          label={t.label}
          form={distances[t.code] || {
            distanceKm: '',
            driveMinutes: '',
            parkingLotName: '',
            parkingLotAddress: '',
            effectiveFrom: '',
          }}
          onChange={(next) => onChange(t.code, next)}
          variant={variant}
        />
      ))}
    </div>
  );
}
