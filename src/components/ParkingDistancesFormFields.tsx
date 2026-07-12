import React from 'react';
import type { AirportTerminal } from '../utils/parkingDistances';
import type { TerminalParkingDistanceForm } from '../utils/parkingDistances';

type Props = {
  t1: TerminalParkingDistanceForm;
  t2: TerminalParkingDistanceForm;
  onChangeT1: (next: TerminalParkingDistanceForm) => void;
  onChangeT2: (next: TerminalParkingDistanceForm) => void;
  variant?: 'light' | 'dark';
  title?: string;
  hint?: string;
  /** 핀 섹션 안에 넣을 때 바깥 테두리 제거 */
  nested?: boolean;
};

function TerminalSection({
  terminal,
  form,
  onChange,
  variant,
}: {
  terminal: AirportTerminal;
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
        <span className="text-xs font-black text-amber-500">{terminal} 터미널</span>
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
  t1,
  t2,
  onChangeT1,
  onChangeT2,
  variant = 'light',
  title = '터미널별 주차장 거리',
  hint = 'B2C 비교 화면 거리순 탭에서 사용합니다. 핀으로 자동 계산된 km·분을 필요 시 수정하세요.',
  nested = false,
}: Props) {
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

      <TerminalSection terminal="T1" form={t1} onChange={onChangeT1} variant={variant} />
      <TerminalSection terminal="T2" form={t2} onChange={onChangeT2} variant={variant} />
    </div>
  );
}
