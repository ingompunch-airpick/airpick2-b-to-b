import React from 'react';
import ParkingPinMap from './ParkingPinMap';
import ParkingDistancesFormFields from './ParkingDistancesFormFields';
import {
  distancesFromParkingPin,
  parseLatLng,
} from '../utils/airportDistance';
import type {
  ParkingDistancesFormInput,
  TerminalParkingDistanceForm,
} from '../utils/parkingDistances';
import { EMPTY_TERMINAL_PARKING_FORM } from '../utils/parkingDistances';
import { getAirportTerminals, type AirportId } from '../utils/airport';

type LotCoords = { lat: string; lng: string };

/** 핀·주소·거리를 한 번에 반영 (연속 setState로 좌표가 덮이는 문제 방지) */
export type LotPinUpdate = {
  lat: string;
  lng: string;
  address?: string;
  distances: ParkingDistancesFormInput;
};

type Props = {
  airportId?: AirportId | string | null;
  indoor: LotCoords;
  outdoor: LotCoords;
  showIndoor: boolean;
  showOutdoor: boolean;
  onUpdateIndoor: (next: LotPinUpdate) => void;
  onUpdateOutdoor: (next: LotPinUpdate) => void;
  indoorDistances: ParkingDistancesFormInput;
  outdoorDistances: ParkingDistancesFormInput;
  variant?: 'light' | 'dark';
};

function withPinDistances(
  distances: ParkingDistancesFormInput,
  lat: string,
  lng: string,
  airportId: AirportId | string | null | undefined
): ParkingDistancesFormInput {
  const pin = parseLatLng(lat, lng);
  if (!pin) return distances;
  const d = distancesFromParkingPin(pin, airportId);
  const next: ParkingDistancesFormInput = { ...distances };
  for (const t of getAirportTerminals(airportId)) {
    const calc = d[t.code];
    next[t.code] = {
      ...(distances[t.code] || { ...EMPTY_TERMINAL_PARKING_FORM }),
      distanceKm: calc != null ? String(calc.distanceKm) : '',
      driveMinutes: calc != null ? String(calc.driveMinutes) : '',
      parkingLotName: '',
      parkingLotAddress: '',
    };
  }
  return next;
}

function LotPinSection({
  title,
  airportId,
  coords,
  distances,
  onUpdate,
  variant,
}: {
  title: string;
  airportId: AirportId | string | null | undefined;
  coords: LotCoords;
  distances: ParkingDistancesFormInput;
  onUpdate: (next: LotPinUpdate) => void;
  variant: 'light' | 'dark';
}) {
  const panelCls =
    variant === 'dark'
      ? 'rounded-xl border border-neutral-850 bg-[#131315] p-3 space-y-3'
      : 'rounded-xl border border-slate-200 bg-white p-3 space-y-3';

  return (
    <div className={panelCls}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-black text-indigo-600">{title}</span>
        <span className="text-[10px] text-slate-400">네이버 지도 · 탭/검색</span>
      </div>
      <ParkingPinMap
        airportId={airportId}
        lat={coords.lat}
        lng={coords.lng}
        onChange={(lat, lng, address) => {
          const samePin = lat === coords.lat && lng === coords.lng;
          onUpdate({
            lat,
            lng,
            address,
            // 역지오코딩 후속 호출은 주소만 반영 (수동 수정한 km·분 유지)
            distances:
              samePin && address != null
                ? distances
                : withPinDistances(distances, lat, lng, airportId),
          });
        }}
      />
      <ParkingDistancesFormFields
        airportId={airportId}
        distances={distances}
        onChange={(code: string, next: TerminalParkingDistanceForm) =>
          onUpdate({
            lat: coords.lat,
            lng: coords.lng,
            distances: { ...distances, [code]: next },
          })
        }
        variant={variant}
        title={`${title.replace(' 핀', '')} · 터미널 거리`}
        hint="핀을 찍으면 km·분이 자동 계산됩니다. 필요하면 수동으로 수정하세요."
        nested
      />
    </div>
  );
}

export default function ParkingPinDistanceFields({
  airportId = 'ICN',
  indoor,
  outdoor,
  showIndoor,
  showOutdoor,
  onUpdateIndoor,
  onUpdateOutdoor,
  indoorDistances,
  outdoorDistances,
  variant = 'light',
}: Props) {
  const sectionCls =
    variant === 'dark'
      ? 'rounded-xl border border-neutral-850 bg-neutral-900/40 p-3 space-y-3'
      : 'rounded-xl border border-slate-100 bg-slate-50/80 p-3 space-y-3';

  const terminalHint = getAirportTerminals(airportId)
    .map((t) => t.shortLabel)
    .join('/');

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
          주차장당 지도에서 핀 1개만 찍으면 됩니다. 주소와 {terminalHint} 거리가 함께
          채워집니다.
        </p>
      </div>

      {showIndoor && (
        <LotPinSection
          title="실내 주차장 핀"
          airportId={airportId}
          coords={indoor}
          distances={indoorDistances}
          onUpdate={onUpdateIndoor}
          variant={variant}
        />
      )}
      {showOutdoor && (
        <LotPinSection
          title="야외 주차장 핀"
          airportId={airportId}
          coords={outdoor}
          distances={outdoorDistances}
          onUpdate={onUpdateOutdoor}
          variant={variant}
        />
      )}
    </div>
  );
}
