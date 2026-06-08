import { useRef, useState } from 'react';
import { Camera, Loader2, X } from 'lucide-react';
import { ParkingLotSite } from '../types';
import {
  getMaxParkingLotPhotos,
  uploadParkingLotPhoto,
} from '../lib/parkingLotPhotos';
import {
  countParkingLotsByType,
  resizeParkingLotsByType,
} from '../utils/parkingLots';

interface ParkingLotsEditorProps {
  value: ParkingLotSite[];
  onChange: (lots: ParkingLotSite[]) => void;
  companyId: string;
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

function LotPhotoUploader({
  lot,
  companyId,
  onPhotosChange,
}: {
  lot: ParkingLotSite;
  companyId: string;
  onPhotosChange: (photos: string[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const photos = lot.photos || [];
  const maxPhotos = getMaxParkingLotPhotos();
  const canAdd = photos.length < maxPhotos && !!companyId?.trim();

  const handleFiles = async (files: FileList | null) => {
    if (!files?.length || !companyId?.trim()) return;

    setUploading(true);
    const next = [...photos];
    try {
      for (const file of Array.from(files)) {
        if (next.length >= maxPhotos) break;
        const url = await uploadParkingLotPhoto(companyId, lot.id, file);
        next.push(url);
      }
      onPhotosChange(next);
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const removePhoto = (index: number) => {
    onPhotosChange(photos.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-2">
      <label className="text-[11px] text-zinc-500 font-bold block">주차장 사진 (B2C MY 노출)</label>
      {photos.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {photos.map((url, index) => (
            <div key={`${url}-${index}`} className="relative aspect-[4/3] rounded-lg overflow-hidden border border-neutral-800 bg-neutral-950">
              <img src={url} alt={`${lot.label} 사진 ${index + 1}`} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
              <button
                type="button"
                onClick={() => removePhoto(index)}
                className="absolute top-1 right-1 p-1 rounded-md bg-black/70 text-white hover:bg-red-900/80"
                aria-label="사진 삭제"
              >
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => void handleFiles(e.target.files)}
      />
      <button
        type="button"
        disabled={!canAdd || uploading}
        onClick={() => inputRef.current?.click()}
        className="w-full py-2.5 rounded-xl border border-dashed border-neutral-700 bg-neutral-950/60 text-[11px] font-bold text-zinc-400 hover:border-amber-500/40 hover:text-amber-400 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
      >
        {uploading ? (
          <>
            <Loader2 size={14} className="animate-spin" />
            업로드 중...
          </>
        ) : (
          <>
            <Camera size={14} />
            {photos.length === 0 ? '입구·주차장 사진 추가' : `사진 추가 (${photos.length}/${maxPhotos})`}
          </>
        )}
      </button>
      {!companyId?.trim() && (
        <p className="text-[10px] text-amber-500/80">업체 명을 입력하면 사진을 업로드할 수 있습니다.</p>
      )}
    </div>
  );
}

export default function ParkingLotsEditor({ value, onChange, companyId }: ParkingLotsEditorProps) {
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
          <LotPhotoUploader
            lot={lot}
            companyId={companyId}
            onPhotosChange={(photos) => updateLot(lot.id, { photos })}
          />
        </div>
      ))}
    </div>
  );
}
