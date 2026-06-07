import { ParkingLotSite } from '../types';

interface ParkingLotsReadOnlyProps {
  lots: ParkingLotSite[];
}

export default function ParkingLotsReadOnly({ lots }: ParkingLotsReadOnlyProps) {
  const filled = lots.filter((lot) => lot.parkingAddress.trim());

  if (filled.length === 0) {
    return (
      <p className="text-[12px] text-white/50 py-2">등록된 주차장 위치가 없습니다. 에어픽 본사에 문의해 주세요.</p>
    );
  }

  return (
    <div className="space-y-2">
      {filled.map((lot) => (
        <div key={lot.id} className="p-3 bg-[#131315] border border-neutral-850 rounded-xl">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-[12px] font-bold text-amber-500">{lot.label}</span>
            <span className="text-[10px] px-2 py-0.5 rounded-md bg-neutral-900 text-zinc-400 font-bold">
              {lot.type === 'indoor' ? '실내' : '실외'}
            </span>
          </div>
          <p className="text-[12px] text-white/90 leading-relaxed whitespace-pre-wrap">{lot.parkingAddress}</p>
        </div>
      ))}
    </div>
  );
}
