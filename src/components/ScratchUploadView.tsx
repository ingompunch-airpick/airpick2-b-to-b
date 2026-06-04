import React, { useRef, useState } from 'react';
import { ArrowLeft, Camera, RefreshCw, ChevronDown } from 'lucide-react';
import { Reservation, ScratchPhotoSet } from '../types';
import { uploadScratchViewPhoto, type ScratchView } from '../lib/reservationPhotos';
import { ensureFirestoreAuth } from '../lib/reservationFirestore';

interface ScratchUploadViewProps {
  onBack: () => void;
  reservations: Reservation[];
  onUpdateScratchPhotos: (id: string, photos: ScratchPhotoSet) => Promise<void>;
}

const SCRATCH_SLOTS: { id: ScratchView; label: string; short: string }[] = [
  { id: 'front', label: '① 전면', short: '전면' },
  { id: 'rear', label: '② 후면', short: '후면' },
  { id: 'left', label: '③ 좌측', short: '좌측' },
  { id: 'right', label: '④ 우측', short: '우측' },
];

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === 'string') resolve(reader.result);
      else reject(new Error('사진을 읽지 못했습니다.'));
    };
    reader.onerror = () => reject(new Error('사진을 읽지 못했습니다.'));
    reader.readAsDataURL(file);
  });
}

/** 예전 데모(unsplash) URL — 실제 촬영으로 간주하지 않음 */
function isDemoScratchUrl(url?: string): boolean {
  if (!url) return false;
  return url.includes('unsplash.com') || url.includes('images.unsplash');
}

function realScratchUrl(url?: string): string | undefined {
  return url && !isDemoScratchUrl(url) ? url : undefined;
}

function normalizeScratchSet(set: ScratchPhotoSet | undefined): ScratchPhotoSet | undefined {
  if (!set) return undefined;
  const front = realScratchUrl(set.front);
  const rear = realScratchUrl(set.rear);
  const left = realScratchUrl(set.left);
  const right = realScratchUrl(set.right);
  const hasAny = !!(front || rear || left || right);
  if (!hasAny && !set.synced) return undefined;
  return {
    ...set,
    front,
    rear,
    left,
    right,
    synced: !!(set.synced && front && rear && left && right),
  };
}

function getPhotoSet(
  res: Reservation,
  photosCache: { [id: string]: ScratchPhotoSet }
): ScratchPhotoSet | undefined {
  if (!res.id) return undefined;
  const raw = photosCache[res.id] || res.scratchPhotos;
  return normalizeScratchSet(raw);
}

function isFullySynced(cache: ScratchPhotoSet | undefined): boolean {
  return !!(cache?.synced && cache.front && cache.rear && cache.left && cache.right);
}

export default function ScratchUploadView({ onBack, reservations, onUpdateScratchPhotos }: ScratchUploadViewProps) {
  const [expandedResId, setExpandedResId] = useState<string | null>(null);
  const [photosCache, setPhotosCache] = useState<{ [id: string]: ScratchPhotoSet }>({});
  const [syncFailedList, setSyncFailedList] = useState<{ [id: string]: boolean }>({});
  const [isSyncing, setIsSyncing] = useState<string | null>(null);
  const [uploadingKey, setUploadingKey] = useState<string | null>(null);
  const [captureTargetRes, setCaptureTargetRes] = useState<Reservation | null>(null);
  const [pendingView, setPendingView] = useState<ScratchView | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const activeReservations = reservations.filter(
    (r) => r.id && !['cancelled', 'completed_out'].includes(r.status)
  );

  const openUpload = (res: Reservation, view?: ScratchView) => {
    if (!res.id) return;
    setExpandedResId(res.id);
    const cache = getPhotoSet(res, photosCache);
    const nextView =
      view ||
      SCRATCH_SLOTS.find((s) => !cache?.[s.id])?.id ||
      'front';
    setCaptureTargetRes(res);
    setPendingView(nextView);
    fileInputRef.current?.click();
  };

  const handleCaptureSlot = (res: Reservation, view: ScratchView) => {
    setCaptureTargetRes(res);
    setExpandedResId(res.id ?? null);
    setPendingView(view);
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const view = pendingView;
    const res = captureTargetRes;
    if (e.target) e.target.value = '';
    setPendingView(null);
    if (!file || !view || !res?.id) return;

    const uploadKey = `${res.id}-${view}`;
    setUploadingKey(uploadKey);
    try {
      await ensureFirestoreAuth();
      const dataUrl = await readFileAsDataUrl(file);
      const downloadUrl = await uploadScratchViewPhoto(
        res.id,
        res.companyId || 'wawa',
        view,
        dataUrl
      );

      const timestamp = new Date().toLocaleTimeString('ko-KR');
      const currentPhotos = getPhotoSet(res, photosCache) || { synced: false };
      const updatedPhotos: ScratchPhotoSet = {
        ...currentPhotos,
        [view]: downloadUrl,
        synced: false,
        updatedAt: timestamp,
      };

      setPhotosCache((prev) => ({
        ...prev,
        [res.id!]: updatedPhotos,
      }));

      setSyncFailedList((prev) => {
        const next = { ...prev };
        delete next[res.id!];
        return next;
      });
      setExpandedResId(res.id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '사진 업로드에 실패했습니다.';
      alert(msg);
      setSyncFailedList((prev) => ({ ...prev, [res.id!]: true }));
    } finally {
      setUploadingKey(null);
      setCaptureTargetRes(null);
    }
  };

  const handleSyncPhotos = async (resId: string, customPhotos?: ScratchPhotoSet) => {
    setIsSyncing(resId);

    const res = reservations.find((r) => r.id === resId);
    const set =
      customPhotos ||
      photosCache[resId] ||
      res?.scratchPhotos || {
        synced: false,
      };

    const hasAllSides = !!(set.front && set.rear && set.left && set.right);
    if (!hasAllSides) {
      setIsSyncing(null);
      alert('전·후·좌·우 4면 사진을 모두 올린 뒤 저장해 주세요.');
      return;
    }

    try {
      const finalizedSet: ScratchPhotoSet = { ...set, synced: true };
      await onUpdateScratchPhotos(resId, finalizedSet);

      setSyncFailedList((prev) => {
        const c = { ...prev };
        delete c[resId];
        return c;
      });

      setPhotosCache((prev) => ({
        ...prev,
        [resId]: finalizedSet,
      }));

      setIsSyncing(null);
      setExpandedResId(null);
      alert('사방 스크래치 사진이 저장되었습니다.');
    } catch {
      setSyncFailedList((prev) => ({ ...prev, [resId]: true }));
      setIsSyncing(null);
      alert('저장에 실패했습니다. 재전송해 주세요.');
    }
  };

  const renderInlineCapture = (res: Reservation) => {
    const cache = getPhotoSet(res, photosCache);
    const allFour = !!(cache?.front && cache?.rear && cache?.left && cache?.right);

    return (
      <div
        className="mt-3 pt-3 border-t border-neutral-800 space-y-3"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="grid grid-cols-4 gap-2">
          {SCRATCH_SLOTS.map((view) => {
            const capturedUrl = cache?.[view.id];
            const isUploading = uploadingKey === `${res.id}-${view.id}`;

            return (
              <button
                type="button"
                key={view.id}
                disabled={!!isUploading}
                onClick={() => handleCaptureSlot(res, view.id)}
                className="relative aspect-square rounded-lg bg-neutral-950 border border-neutral-800 overflow-hidden flex flex-col items-center justify-center gap-0.5 hover:border-amber-500/60 transition-all disabled:opacity-50"
              >
                {isUploading ? (
                  <RefreshCw className="animate-spin text-amber-500" size={16} />
                ) : capturedUrl ? (
                  <>
                    <img
                      src={capturedUrl}
                      alt={view.short}
                      className="absolute inset-0 w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                    <span className="absolute bottom-0 inset-x-0 bg-black/70 text-[7px] font-bold py-0.5 text-center text-zinc-300">
                      {view.short}
                    </span>
                  </>
                ) : (
                  <>
                    <Camera size={14} className="text-amber-500/80" />
                    <span className="text-[8px] font-bold text-zinc-500">{view.short}</span>
                  </>
                )}
              </button>
            );
          })}
        </div>
        <button
          type="button"
          disabled={isSyncing === res.id || !allFour}
          onClick={() => handleSyncPhotos(res.id!, cache)}
          className={`w-full py-2.5 rounded-xl text-[11px] font-black flex items-center justify-center gap-1.5 transition-all ${
            allFour
              ? 'bg-amber-500 text-neutral-950 hover:bg-amber-400'
              : 'bg-neutral-850 text-zinc-600 cursor-not-allowed'
          }`}
        >
          {isSyncing === res.id ? (
            <RefreshCw className="animate-spin" size={12} />
          ) : (
            <>4면 저장 완료</>
          )}
        </button>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-white p-5 pb-24">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleFileChange}
      />

      <div className="flex items-center gap-3.5 mb-5">
        <button
          type="button"
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

      <div className="space-y-3">
        <h3 className="text-[10px] uppercase font-black tracking-widest text-zinc-500 px-1">
          입고차량 ({activeReservations.length}건) · 촬영 대기는 「촬영·업로드」 탭
        </h3>

        <div className="space-y-2.5">
          {activeReservations.length === 0 ? (
            <p className="text-xs text-zinc-500 font-bold px-1">촬영 대상 입고 차량이 없습니다.</p>
          ) : (
            activeReservations.map((res, idx) => {
              if (!res.id) return null;
              const cache = getPhotoSet(res, photosCache);
              const hasPhotos = !!(cache?.front || cache?.rear || cache?.left || cache?.right);
              const allFour = !!(cache?.front && cache?.rear && cache?.left && cache?.right);
              const synced = isFullySynced(cache);
              const isFailed = syncFailedList[res.id];
              const isExpanded = expandedResId === res.id;
              const needsUpload = !synced && !isFailed;

              return (
                <div
                  key={`${res.id}-${idx}`}
                  className={`rounded-2xl border transition-all ${
                    isExpanded
                      ? 'bg-neutral-900 border-amber-500/80 ring-1 ring-amber-500/25'
                      : 'bg-neutral-900/60 border-neutral-850'
                  }`}
                >
                  <div
                    className="p-3.5 flex items-center justify-between gap-2 cursor-pointer"
                    onClick={() => {
                      if (needsUpload) {
                        setExpandedResId(isExpanded ? null : res.id);
                      }
                    }}
                  >
                    <div className="space-y-1 min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-zinc-200">{res.carNumber}</span>
                        <span className="text-[10px] text-zinc-500 truncate">({res.carModel})</span>
                      </div>
                      <p className="text-[9.5px] text-zinc-500 truncate">
                        {res.userName} · {res.companyName || '제휴주차장'}
                      </p>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {isFailed ? (
                        <button
                          type="button"
                          disabled={isSyncing === res.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            setExpandedResId(res.id);
                            handleSyncPhotos(res.id!);
                          }}
                          className="px-3 py-2 bg-amber-500 text-neutral-950 rounded-xl text-[10px] font-black"
                        >
                          {isSyncing === res.id ? (
                            <RefreshCw className="animate-spin" size={10} />
                          ) : (
                            '재전송'
                          )}
                        </button>
                      ) : synced ? (
                        <span className="text-[9.5px] font-medium px-2.5 py-1.5 rounded-lg border text-emerald-400 bg-emerald-500/5 border-emerald-500/15">
                          동기 완료
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            openUpload(res);
                          }}
                          className="px-3 py-2 bg-amber-500 text-neutral-950 hover:bg-amber-400 rounded-xl text-[10px] font-black flex items-center gap-1 shadow-sm active:scale-95 transition-all"
                        >
                          <Camera size={12} />
                          {hasPhotos && !allFour ? '이어서 촬영' : '촬영·업로드'}
                        </button>
                      )}
                    </div>
                  </div>

                  {isExpanded && needsUpload && renderInlineCapture(res)}

                  {isExpanded && needsUpload && (
                    <button
                      type="button"
                      className="w-full py-1 flex items-center justify-center text-zinc-600"
                      onClick={() => setExpandedResId(null)}
                    >
                      <ChevronDown size={14} className="rotate-180" />
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
