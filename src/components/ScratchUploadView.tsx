import React, { useState } from 'react';
import { ArrowLeft, Camera, RefreshCw, CheckCircle, AlertTriangle, CloudRain, UploadCloud } from 'lucide-react';
import { Reservation, ScratchPhotoSet } from '../types';

interface ScratchUploadViewProps {
  onBack: () => void;
  reservations: Reservation[];
  onUpdateScratchPhotos: (id: string, photos: ScratchPhotoSet) => Promise<void>;
}

export default function ScratchUploadView({ onBack, reservations, onUpdateScratchPhotos }: ScratchUploadViewProps) {
  const [selectedRes, setSelectedRes] = useState<Reservation | null>(null);
  const [photosCache, setPhotosCache] = useState<{ [id: string]: ScratchPhotoSet }>({});
  const [syncFailedList, setSyncFailedList] = useState<{ [id: string]: boolean }>({
    // Prefill some items as failed to demonstrate the compulsory Photo 6 retry mechanism immediately!
  });
  const [isSimulatingFailure, setIsSimulatingFailure] = useState(true);
  const [isSyncing, setIsSyncing] = useState<string | null>(null);

  // Initialize failure state for reservations to give the user a live sandbox experience immediately
  React.useEffect(() => {
    if (reservations.length > 0) {
      const initialFailed: { [id: string]: boolean } = {};
      reservations.slice(0, 2).forEach((res, i) => {
        if (res.id && !photosCache[res.id]) {
          initialFailed[res.id] = true;
        }
      });
      setSyncFailedList(prev => ({ ...initialFailed, ...prev }));
    }
  }, [reservations]);

  const handleCapturePhoto = (view: 'front' | 'rear' | 'left' | 'right') => {
    if (!selectedRes?.id) return;

    // Simulate taking a photo by using a descriptive mock base64 or Unsplash url
    const timestamp = new Date().toLocaleTimeString();
    const urls = {
      front: 'https://images.unsplash.com/photo-1549399542-7e3f8b79c341?q=80&w=400&fit=crop',
      rear: 'https://images.unsplash.com/photo-1541899481282-d53bffe3c35d?q=80&w=400&fit=crop',
      left: 'https://images.unsplash.com/photo-1503376780353-7e6692767b70?q=80&w=400&fit=crop',
      right: 'https://images.unsplash.com/photo-1552519507-da3b142c6e3d?q=80&w=400&fit=crop'
    };

    const currentPhotos = photosCache[selectedRes.id] || selectedRes.scratchPhotos || { synced: false };
    const updatedPhotos = {
      ...currentPhotos,
      [view]: urls[view],
      synced: false,
      updatedAt: timestamp
    };

    setPhotosCache(prev => ({
      ...prev,
      [selectedRes.id!]: updatedPhotos
    }));

    // If simulating failure, mark this vehicle as failed immediately after capturing photos!
    if (isSimulatingFailure) {
      setSyncFailedList(prev => ({
        ...prev,
        [selectedRes.id!]: true
      }));
    }
  };

  const handleSyncPhotos = async (resId: string, customPhotos?: ScratchPhotoSet) => {
    setIsSyncing(resId);
    
    // Find current set
    const res = reservations.find(r => r.id === resId);
    const set = customPhotos || photosCache[resId] || res?.scratchPhotos || { 
      front: 'https://images.unsplash.com/photo-1549399542-7e3f8b79c341?q=80&w=400&fit=crop', 
      rear: 'https://images.unsplash.com/photo-1541899481282-d53bffe3c35d?q=80&w=400&fit=crop',
      synced: false
    };

    // Simulate network latency
    await new Promise(resolve => setTimeout(resolve, 1500));

    if (isSimulatingFailure && !customPhotos) {
      // Failed! Maintain the warning
      setSyncFailedList(prev => ({ ...prev, [resId]: true }));
      setIsSyncing(null);
      alert("인천공항 지하 유해 전파 방해로 인해 전송이 실패했습니다. 재전송 버튼을 이용바랍니다.");
    } else {
      // Successful transaction
      try {
        const finalizedSet = { ...set, synced: true };
        await onUpdateScratchPhotos(resId, finalizedSet);
        
        // Remove from failed list
        setSyncFailedList(prev => {
          const c = { ...prev };
          delete c[resId];
          return c;
        });

        // Update local cache
        setPhotosCache(prev => ({
          ...prev,
          [resId]: finalizedSet
        }));

        setIsSyncing(null);
        alert("사방 스크래치 고해상도 이미지가 AWS 안전 클라우드로 동기화되었습니다!");
      } catch (err) {
        setSyncFailedList(prev => ({ ...prev, [resId]: true }));
        setIsSyncing(null);
      }
    }
  };

  const getSyncStatusBadge = (resId: string, hasPhotos: boolean) => {
    const isFailed = syncFailedList[resId];
    if (isFailed) {
      return { text: '△ 삭제 / 미동기', color: 'text-amber-550/90 bg-amber-500/5 border-amber-500/15' };
    }
    if (hasPhotos) {
      return { text: '● 동기 완수', color: 'text-emerald-400 bg-emerald-500/5 border-emerald-500/15' };
    }
    return { text: '촬영 대기', color: 'text-zinc-500 bg-neutral-900/60 border-neutral-850/80' };
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-white p-5 pb-24">
      {/* Header */}
      <div className="flex items-center gap-3.5 mb-6">
        <button 
          onClick={onBack}
          className="p-2 hover:bg-neutral-900 rounded-2xl text-zinc-400 hover:text-white transition-all bg-neutral-900/60 border border-neutral-800"
        >
          <ArrowLeft size={16} />
        </button>
        <div>
          <h2 className="text-sm font-black tracking-tight text-white">사방 스크래치 사진 업로드</h2>
          <p className="text-[10px] text-zinc-500 font-bold uppercase">scratch damage camera</p>
        </div>
      </div>

      {/* Simulator controller sandbox alert box */}
      <div className="mb-6 p-4 bg-neutral-900 border border-neutral-800 rounded-2xl">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-xs font-black text-white flex items-center gap-1.5">
              <UploadCloud size={13} className="text-amber-500" />
              네트워크 장애 모의 시뮬레이터
            </h4>
            <p className="text-[9.5px] text-neutral-400 mt-1 max-w-[200px]">
              체험 시 업로드 실패 후 우측 <strong className="text-amber-500">재전송</strong> 버튼 시연이 원활하도록 장애 모드를 강제 활성화합니다.
            </p>
          </div>
          <button
            onClick={() => setIsSimulatingFailure(!isSimulatingFailure)}
            className={`px-3 py-1.5 rounded-xl text-[10px] font-bold border transition-all ${
              isSimulatingFailure 
                ? 'bg-amber-600/15 border-amber-500/30 text-amber-500' 
                : 'bg-zinc-800 border-neutral-750 text-zinc-400'
            }`}
          >
            {isSimulatingFailure ? '장애 활성화됨' : '정상 전송모드'}
          </button>
        </div>
      </div>

      {/* Main split-screen grid layout */}
      <div className="space-y-6">
        
        {/* Step List of Active Cars */}
        <div className="space-y-3">
          <h3 className="text-[10px] uppercase font-black tracking-widest text-zinc-500 px-1">입고차량 목록 ({reservations.length}건)</h3>
          
          <div className="space-y-2.5 max-h-[220px] overflow-y-auto no-scrollbar">
            {reservations.map((res, idx) => {
              if (!res.id) return null;
              const cache = photosCache[res.id] || res.scratchPhotos;
              const hasPhotos = !!(cache?.front || cache?.rear || cache?.left || cache?.right);
              const isFailed = syncFailedList[res.id];
              const statusBadge = getSyncStatusBadge(res.id, hasPhotos);
              const isSelected = selectedRes?.id === res.id;

              return (
                <div 
                  key={`${res.id || ''}-${idx}`}
                  onClick={() => setSelectedRes(res)}
                  className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex items-center justify-between ${
                    isSelected 
                      ? 'bg-neutral-900 border-amber-500' 
                      : 'bg-neutral-900/60 hover:bg-neutral-900 hover:border-neutral-750 border-neutral-850'
                  }`}
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-zinc-200">{res.carNumber}</span>
                      <span className="text-[10px] text-zinc-450 font-normal">({res.carModel})</span>
                    </div>
                    <p className="text-[9.5px] text-zinc-500">
                      고객명: {res.userName} • 주차장: <span className="text-zinc-450 font-medium">{res.companyName || '제휴주차장'}</span>
                    </p>
                  </div>

                  <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                    {isFailed ? (
                      <button 
                        disabled={isSyncing === res.id}
                        onClick={() => handleSyncPhotos(res.id!, {
                          front: 'https://images.unsplash.com/photo-1549399542-7e3f8b79c341?q=80&w=400&fit=crop',
                          rear: 'https://images.unsplash.com/photo-1541899481282-d53bffe3c35d?q=80&w=400&fit=crop',
                          left: 'https://images.unsplash.com/photo-1503376780353-7e6692767b70?q=80&w=400&fit=crop',
                          right: 'https://images.unsplash.com/photo-1552519507-da3b142c6e3d?q=80&w=400&fit=crop',
                          synced: true
                        })}
                        className="px-3 py-1.5 bg-amber-500/90 text-neutral-950 hover:bg-amber-600 rounded-xl text-[10px] font-medium tracking-tight flex items-center gap-1 shadow-sm transition-all animate-pulse"
                      >
                        {isSyncing === res.id ? (
                          <RefreshCw className="animate-spin" size={10} />
                        ) : (
                          <>재전송 (AWS)</>
                        )}
                      </button>
                    ) : (
                      <span className={`text-[9.5px] font-mono font-medium px-3.5 py-1.5 rounded-lg border leading-none ${statusBadge.color}`}>
                        {statusBadge.text}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Selected vehicle photography panel */}
        {selectedRes ? (
          <div className="p-4 bg-neutral-900 border border-neutral-800 rounded-2xl space-y-4 animate-in fade-in slide-in-from-bottom-2">
            <div className="flex justify-between items-center">
              <div>
                <p className="text-[10px] text-zinc-500 uppercase font-bold tracking-tight">선택차량 사방촬영</p>
                <h4 className="text-sm font-black text-white">{selectedRes.carNumber} ({selectedRes.carModel})</h4>
              </div>
              <button 
                onClick={() => handleSyncPhotos(selectedRes.id!, photosCache[selectedRes.id!])}
                disabled={isSyncing === selectedRes.id}
                className="px-3.5 py-2 bg-neutral-850 hover:bg-neutral-800 rounded-xl border border-neutral-750 text-xs font-black text-zinc-300 flex items-center gap-1 hover:text-white"
              >
                {isSyncing === selectedRes.id ? (
                  <RefreshCw className="animate-spin" size={12} />
                ) : (
                  <>수동 동기화</>
                )}
              </button>
            </div>

            {/* 4 Quadrants of the car: Front, Back, Left, Right */}
            <div className="grid grid-cols-2 gap-3.5">
              {[
                { id: 'front' as const, label: '① 전면 스크래치' },
                { id: 'rear' as const, label: '② 후면 스크래치' },
                { id: 'left' as const, label: '③ 좌측면 스크래치' },
                { id: 'right' as const, label: '④ 우측면 스크래치' }
              ].map((view) => {
                const imgSet = photosCache[selectedRes.id!] || selectedRes.scratchPhotos;
                const capturedUrl = imgSet?.[view.id];

                return (
                  <div 
                    key={view.id}
                    onClick={() => handleCapturePhoto(view.id)}
                    className="relative aspect-video rounded-xl bg-neutral-950 border border-neutral-850 overflow-hidden group cursor-pointer flex flex-col justify-center items-center gap-1.5 text-zinc-500 hover:text-white hover:border-neutral-700 transition-all select-none"
                  >
                    {capturedUrl ? (
                      <>
                        <img 
                          src={capturedUrl} 
                          alt={view.label}
                          className="w-full h-full object-cover"
                          referrerPolicy="no-referrer"
                        />
                        <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                          <p className="text-[10px] font-black text-amber-500 uppercase">재촬영 하기</p>
                        </div>
                        <span className="absolute bottom-1.5 left-2 bg-black/60 px-2 py-0.5 rounded text-[8px] font-mono tracking-tight text-zinc-400">
                          {view.label.split(' ')[1]}
                        </span>
                      </>
                    ) : (
                      <>
                        <Camera size={18} className="text-neutral-700 group-hover:text-amber-500 transition-colors" />
                        <span className="text-[10px] font-bold tracking-tight">{view.label}</span>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
            <p className="text-[9px] text-zinc-500 text-center">각 슬롯을 누르면 가칭 검증 사진 촬영을 자동 시뮬레이션 기록합니다.</p>
          </div>
        ) : (
          <div className="p-10 text-center bg-neutral-900/30 border border-dashed border-neutral-800 rounded-2xl">
            <Camera className="mx-auto text-neutral-850 mb-3" size={32} />
            <p className="text-xs text-neutral-500 font-bold">사방 스크래치를 촬영할 차량을 위 목록에서 선택해 주십시오</p>
          </div>
        )}
      </div>
    </div>
  );
}
