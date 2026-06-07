import { ParkingLotSite } from '../types';
import {
  countParkingLotsByType,
  resizeParkingLotsByType,
} from '../utils/parkingLots';

interface ParkingLotsEditorProps {
  value: ParkingLotSite[];
  onChange: (lots: ParkingLotSite[]) => void;
}

function CounterRow({
  label,
  count,
  onChange,
}: {
  label: string;
  count: number;
  onChange: (next: number) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 p-2.5 bg-[#1C1C1E] border border-neutral-800 rounded-xl">
      <span className="text-[12px] text-zinc-300 font-bold">{label}</span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onChange(Math.max(0, count - 1))}
          className="w-8 h-8 rounded-lg bg-neutral-900 border border-neutral-800 text-white font-black hover:bg-neutral-800"
        >
          −
        </button>
        <span className="w-6 text-center text-sm font-black text-amber-500">{count}</span>
        <button
          type="button"
          onClick={() => onChange(Math.min(10, count + 1))}
          className="w-8 h-8 rounded-lg bg-neutral-900 border border-neutral-800 text-white font-black hover:bg-neutral-800"
        >
          +
        </button>
      </div>
    </div>
  );
}

export default function ParkingLotsEditor({ value, onChange }: ParkingLotsEditorProps) {
  const indoorCount = countParkingLotsByType(value, 'indoor');
  const outdoorCount = countParkingLotsByType(value, 'outdoor');

  const updateLot = (lotId: string, patch: Partial<ParkingLotSite>) => {
    onChange(value.map((lot) => (lot.id === lotId ? { ...lot, ...patch } : lot)));
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <CounterRow
          label="실내 주차장 개수"
          count={indoorCount}
          onChange={(next) => onChange(resizeParkingLotsByType(value, 'indoor', next))}
        />
        <CounterRow
          label="실외 주차장 개수"
          count={outdoorCount}
          onChange={(next) => onChange(resizeParkingLotsByType(value, 'outdoor', next))}
        />
      </div>

      {value.length === 0 && (
        <p className="text-[11px] text-zinc-500">실내 또는 실외 주차장을 1곳 이상 추가해주세요.</p>
      )}

      {value.map((lot) => (
        <div key={lot.id} className="space-y-2 p-3 bg-[#1C1C1E] border border-neutral-800 rounded-xl">
          <div className="flex items-center gap-2">
            <span className="text-[12px] font-bold text-amber-500">{lot.label}</span>
            <span className="text-[10px] px-2 py-0.5 rounded-md bg-neutral-900 text-zinc-400 font-bold">
              {lot.type === 'indoor' ? '실내' : '실외'}
            </span>
          </div>
          <div>
            <label className="text-[11px] text-zinc-500 font-bold block mb-1">주차장 주소 *</label>
            <textarea
              value={lot.parkingAddress}
              onChange={(e) => updateLot(lot.id, { parkingAddress: e.target.value })}
              rows={3}
              className="w-full bg-neutral-950 border border-neutral-850 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500 resize-none"
              placeholder="예: 인천광역시 중구 공항로 424, 제1여객터미널 P1 주차타워 B2"
            />
          </div>
        </div>
      ))}
    </div>
  );
}
