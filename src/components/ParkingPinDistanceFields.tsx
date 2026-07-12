import React from 'react';
import ParkingPinMap from './ParkingPinMap';
import ParkingDistancesFormFields from './ParkingDistancesFormFields';
import {
  distancesFromParkingPin,
  parseLatLng,
} from '../utils/airportDistance';
import type { ParkingDistancesFormInput } from '../utils/parkingDistances';

type LotCoords = { lat: string; lng: string };

type Props = {
  indoor: LotCoords;
  outdoor: LotCoords;
  showIndoor: boolean;
  showOutdoor: boolean;
  onChangeIndoor: (next: LotCoords) => void;
  onChangeOutdoor: (next: LotCoords) => void;
  indoorDistances: ParkingDistancesFormInput;
  outdoorDistances: ParkingDistancesFormInput;
  onChangeIndoorDistances: (next: ParkingDistancesFormInput) => void;
  onChangeOutdoorDistances: (next: ParkingDistancesFormInput) => void;
  variant?: 'light' | 'dark';
};

function LotPinSection({
  title,
  coords,
  onChange,
  distances,
  onChangeDistances,
  variant,
}: {
  title: string;
  coords: LotCoords;
  onChange: (next: LotCoords) => void;
  distances: ParkingDistancesFormInput;
  onChangeDistances: (next: ParkingDistancesFormInput) => void;
  variant: 'light' | 'dark';
}) {
  const labelCls =
    variant === 'dark'
      ? 'text-[12px] text-zinc-300 block mb-1 font-bold'
      : 'text-[12px] text-slate-500 block mb-1 font-bold';
  const inputCls =
    variant === 'dark'
      ? 'w-full px-3 py-2 border border-neutral-800 bg-[#1C1C1E] text-white rounded-xl focus:outline-none focus:ring-1 focus:ring-amber-500/40 text-xs font-mono'
      : 'w-full px-3 py-2 border border-slate-200 bg-white text-slate-900 rounded-xl focus:outline-none focus:ring-1 focus:ring-indigo-500 text-xs font-mono';
  const panelCls =
    variant === 'dark'
      ? 'rounded-xl border border-neutral-850 bg-[#131315] p-3 space-y-3'
      : 'rounded-xl border border-slate-200 bg-white p-3 space-y-3';

  const applyFromPin = () => {
    const pin = parseLatLng(coords.lat, coords.lng);
    if (!pin) {
      alert('위도·경도를 먼저 입력하거나 지도에서 핀을 찍어 주세요.');
      return;
    }
    const d = distancesFromParkingPin(pin);
    onChangeDistances({
      T1: {
        ...distances.T1,
        distanceKm: String(d.T1.distanceKm),
        driveMinutes: String(d.T1.driveMinutes),
      },
      T2: {
        ...distances.T2,
        distanceKm: String(d.T2.distanceKm),
        driveMinutes: String(d.T2.driveMinutes),
      },
    });
  };

  return (
    <div className={panelCls}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-black text-indigo-600">{title}</span>
        <span className="text-[10px] text-slate-400">지도를 탭해 핀 이동</span>
      </div>
      <ParkingPinMap
        lat={coords.lat}
        lng={coords.lng}
        onChange={(lat, lng) => onChange({ lat, lng })}
      />
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>위도 (lat)</label>
          <input
            type="text"
            inputMode="decimal"
            value={coords.lat}
            onChange={(e) =>
              onChange({ ...coords, lat: e.target.value.replace(/[^\d.-]/g, '') })
            }
            className={inputCls}
            placeholder="37.44...."
          />
        </div>
        <div>
          <label className={labelCls}>경도 (lng)</label>
          <input
            type="text"
            inputMode="decimal"
            value={coords.lng}
            onChange={(e) =>
              onChange({ ...coords, lng: e.target.value.replace(/[^\d.-]/g, '') })
            }
            className={inputCls}
            placeholder="126.45...."
          />
        </div>
      </div>
      <button
        type="button"
        onClick={applyFromPin}
        className="w-full rounded-xl bg-indigo-600 py-2.5 text-xs font-black text-white hover:bg-indigo-500"
      >
        이 핀으로 T1·T2 거리 자동 계산
      </button>
      <ParkingDistancesFormFields
        t1={distances.T1}
        t2={distances.T2}
        onChangeT1={(T1) => onChangeDistances({ ...distances, T1 })}
        onChangeT2={(T2) => onChangeDistances({ ...distances, T2 })}
        variant={variant}
        title={`${title.replace(' 핀', '')} · 터미널 거리`}
        hint="이 주차장(실내 또는 야외) 기준입니다. 자동 계산 후 분·km는 수동 수정 가능합니다."
        nested
      />
    </div>
  );
}

export default function ParkingPinDistanceFields({
  indoor,
  outdoor,
  showIndoor,
  showOutdoor,
  onChangeIndoor,
  onChangeOutdoor,
  indoorDistances,
  outdoorDistances,
  onChangeIndoorDistances,
  onChangeOutdoorDistances,
  variant = 'light',
}: Props) {
  const sectionCls =
    variant === 'dark'
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
          주차장 핀 · 터미널 거리
        </label>
        <p className="text-[11px] text-slate-400 mt-1">
          저장하면 B2C 손님 MY·비교에 바로 반영됩니다. 실내·야외 위치가 다르면 각각 핀을 찍고
          거리를 계산하세요.
        </p>
      </div>

      {showIndoor && (
        <LotPinSection
          title="실내 주차장 핀"
          coords={indoor}
          onChange={onChangeIndoor}
          distances={indoorDistances}
          onChangeDistances={onChangeIndoorDistances}
          variant={variant}
        />
      )}
      {showOutdoor && (
        <LotPinSection
          title="야외 주차장 핀"
          coords={outdoor}
          onChange={onChangeOutdoor}
          distances={outdoorDistances}
          onChangeDistances={onChangeOutdoorDistances}
          variant={variant}
        />
      )}
    </div>
  );
}
