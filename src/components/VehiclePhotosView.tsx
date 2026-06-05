import { useState } from 'react';
import { ArrowLeft, Camera } from 'lucide-react';
import type { Reservation } from '../types';
import { cn } from '../lib/utils';
import ScratchUploadView from './ScratchUploadView';
import PhotoSearchView from './PhotoSearchView';

type PhotoTab = 'register' | 'search';

interface Props {
  onBack: () => void;
  reservations: Reservation[];
  onUpdateImages: (resId: string, imageUrls: string[]) => Promise<void>;
}

export default function VehiclePhotosView({ onBack, reservations, onUpdateImages }: Props) {
  const [tab, setTab] = useState<PhotoTab>('register');

  return (
    <div className="min-h-screen bg-neutral-950 text-white pb-24">
      <div className="sticky top-0 z-10 border-b border-neutral-900/80 bg-neutral-950/95 px-5 pb-3 pt-5 backdrop-blur-md">
        <div className="flex items-center gap-3.5 mb-4">
          <button
            type="button"
            onClick={onBack}
            className="rounded-2xl border border-neutral-800 bg-neutral-900/60 p-2 text-zinc-400 transition-all hover:text-white"
          >
            <ArrowLeft size={16} />
          </button>
          <div>
            <h2 className="text-sm font-black tracking-tight text-white">차량 사진</h2>
            <p className="text-[12px] font-bold text-zinc-500">등록 · 조회</p>
          </div>
          <Camera size={18} className="ml-auto text-amber-500/80" />
        </div>

        <div className="grid grid-cols-2 gap-1 rounded-2xl bg-neutral-900 p-1 ring-1 ring-neutral-800">
          <button
            type="button"
            onClick={() => setTab('register')}
            className={cn(
              'rounded-xl py-2.5 text-xs font-black transition-all',
              tab === 'register'
                ? 'bg-amber-500 text-neutral-950 shadow-sm'
                : 'text-zinc-500 hover:text-zinc-300'
            )}
          >
            등록
          </button>
          <button
            type="button"
            onClick={() => setTab('search')}
            className={cn(
              'rounded-xl py-2.5 text-xs font-black transition-all',
              tab === 'search'
                ? 'bg-amber-500 text-neutral-950 shadow-sm'
                : 'text-zinc-500 hover:text-zinc-300'
            )}
          >
            조회
          </button>
        </div>
      </div>

      <div className="px-5 pt-4">
        {tab === 'register' ? (
          <ScratchUploadView
            embedded
            reservations={reservations}
            onUpdateImages={onUpdateImages}
          />
        ) : (
          <PhotoSearchView reservations={reservations} />
        )}
      </div>
    </div>
  );
}
