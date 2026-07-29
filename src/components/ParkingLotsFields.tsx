import React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import ParkingPinMap from './ParkingPinMap';
import type { PartnerParkingLotForm } from '../utils/companyProfile';
import {
  createEmptyParkingLotForm,
  nextParkingLotName,
} from '../utils/companyProfile';
import type { AirportId } from '../utils/airport';

type Props = {
  airportId?: AirportId | string | null;
  lots: PartnerParkingLotForm[];
  showIndoor: boolean;
  showOutdoor: boolean;
  onChange: (lots: PartnerParkingLotForm[]) => void;
  variant?: 'light' | 'dark';
};

function LotCard({
  lot,
  index,
  variant,
  airportId,
  onPatch,
  onRemove,
  canRemove,
}: {
  lot: PartnerParkingLotForm;
  index: number;
  variant: 'light' | 'dark';
  airportId?: AirportId | string | null;
  onPatch: (patch: Partial<PartnerParkingLotForm>) => void;
  onRemove: () => void;
  canRemove: boolean;
}) {
  const panelCls =
    variant === 'dark'
      ? 'rounded-xl border border-neutral-850 bg-[#131315] p-3 space-y-3'
      : 'rounded-xl border border-slate-200 bg-white p-3 space-y-3';
  const inputCls =
    variant === 'dark'
      ? 'w-full px-3 py-2 bg-neutral-950 border border-neutral-800 rounded-xl text-sm text-zinc-100 outline-none focus:border-amber-500'
      : 'w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm text-slate-800 outline-none focus:border-indigo-400';
  const labelCls =
    variant === 'dark'
      ? 'text-[11px] text-zinc-400 font-bold block mb-1'
      : 'text-[11px] text-slate-500 font-bold block mb-1';

  return (
    <div className={panelCls}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-black text-indigo-500">
          {lot.type === 'indoor' ? '실내' : '야외'} #{index + 1}
        </span>
        {canRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-bold text-rose-400 hover:bg-rose-500/10"
          >
            <Trash2 size={12} />
            삭제
          </button>
        )}
      </div>

      <div>
        <label className={labelCls}>주차장 이름 *</label>
        <input
          type="text"
          value={lot.name}
          onChange={(e) => onPatch({ name: e.target.value })}
          className={inputCls}
          placeholder={lot.type === 'indoor' ? '예: 실내1' : '예: 실외1'}
        />
      </div>

      <div>
        <div className="flex items-center justify-between gap-2 mb-1">
          <label className={labelCls + ' mb-0'}>지도 핀</label>
          <span className="text-[10px] text-slate-400">검색·지도 탭으로 위치 지정</span>
        </div>
        <ParkingPinMap
          airportId={airportId}
          lat={lot.lat}
          lng={lot.lng}
          onChange={(lat, lng, address) =>
            onPatch({
              lat,
              lng,
              ...(address != null ? { parkingAddress: address } : {}),
            })
          }
        />
      </div>

      <div>
        <label className={labelCls}>주소</label>
        <input
          type="text"
          value={lot.parkingAddress}
          onChange={(e) => onPatch({ parkingAddress: e.target.value })}
          className={inputCls}
          placeholder="검색·핀 선택 시 자동 입력 · 필요하면 수정"
        />
      </div>
    </div>
  );
}

/**
 * 실내/야외 주차장을 여러 개 등록 (이름 + 핀 + 주소).
 * 터미널 거리(km) 입력은 사용하지 않음.
 */
export default function ParkingLotsFields({
  airportId = 'ICN',
  lots,
  showIndoor,
  showOutdoor,
  onChange,
  variant = 'light',
}: Props) {
  const sectionCls =
    variant === 'dark'
      ? 'rounded-xl border border-neutral-850 bg-neutral-900/40 p-3 space-y-3'
      : 'rounded-xl border border-slate-100 bg-slate-50/80 p-3 space-y-3';
  const titleCls =
    variant === 'dark'
      ? 'text-[12px] text-zinc-200 block font-black'
      : 'text-[12px] text-slate-700 block font-black';
  const addBtnCls =
    variant === 'dark'
      ? 'inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-black border border-neutral-700 text-zinc-200 hover:bg-neutral-800'
      : 'inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-black border border-slate-200 text-slate-700 hover:bg-white';

  const indoorLots = lots.filter((l) => l.type === 'indoor');
  const outdoorLots = lots.filter((l) => l.type === 'outdoor');

  const patchLot = (id: string, patch: Partial<PartnerParkingLotForm>) => {
    onChange(lots.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  };

  const removeLot = (id: string) => {
    onChange(lots.filter((l) => l.id !== id));
  };

  const addLot = (type: 'indoor' | 'outdoor') => {
    const name = nextParkingLotName(lots, type);
    onChange([...lots, createEmptyParkingLotForm(type, name)]);
  };

  return (
    <div className={sectionCls}>
      <div>
        <label className={titleCls}>주차장 목록</label>
        <p className="text-[11px] text-slate-400 mt-1">
          실내·야외 각각 여러 곳을 등록할 수 있습니다. 이름 예: 실내1, 실외2. (공항까지
          거리는 더 이상 입력하지 않습니다.)
        </p>
      </div>

      {showIndoor && (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-black text-zinc-400">실내 주차장</span>
            <button type="button" className={addBtnCls} onClick={() => addLot('indoor')}>
              <Plus size={12} />
              실내 추가
            </button>
          </div>
          {indoorLots.length === 0 ? (
            <p className="text-[11px] text-zinc-500 font-semibold px-1">등록된 실내 주차장 없음</p>
          ) : (
            indoorLots.map((lot, i) => (
              <LotCard
                key={lot.id}
                lot={lot}
                index={i}
                variant={variant}
                airportId={airportId}
                onPatch={(p) => patchLot(lot.id, p)}
                onRemove={() => removeLot(lot.id)}
                canRemove
              />
            ))
          )}
        </div>
      )}

      {showOutdoor && (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-black text-zinc-400">야외 주차장</span>
            <button type="button" className={addBtnCls} onClick={() => addLot('outdoor')}>
              <Plus size={12} />
              야외 추가
            </button>
          </div>
          {outdoorLots.length === 0 ? (
            <p className="text-[11px] text-zinc-500 font-semibold px-1">등록된 야외 주차장 없음</p>
          ) : (
            outdoorLots.map((lot, i) => (
              <LotCard
                key={lot.id}
                lot={lot}
                index={i}
                variant={variant}
                airportId={airportId}
                onPatch={(p) => patchLot(lot.id, p)}
                onRemove={() => removeLot(lot.id)}
                canRemove
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}
