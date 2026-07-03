import React, { useState, useEffect, useRef } from 'react';
import { Camera, Images, X, CheckCircle2, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Reservation } from '../types';
import {
  paymentChoiceToMethod,
  reservationToPaymentChoice,
} from '../utils/paymentStatus';
import { uploadReservationImages } from '../lib/reservationPhotos';
import { ensureFirestoreAuth } from '../lib/reservationFirestore';
import { readImageFilesAsDataUrls, safePersistPhotoDraft } from '../utils/imageFile';
import InlineVehicleCamera from './InlineVehicleCamera';

// Standalone class-combiner utility for safe use within components
function cn(...classes: (string | boolean | undefined | null)[]) {
  return classes.filter(Boolean).join(' ');
}

interface ScratchModalProps {
  scratchModalTargetId: string | null;
  targetReservationForScratch: Reservation | undefined;
  setScratchModalTargetId: (id: string | null) => void;
  setSelectedParkingSpace: (space: string) => void;
  selectedParkingSpace: string;
  uploadedSpots: Record<string, string>;
  activeSpotKey: string | null;
  handleSpotClick: (spotKey: string, mockUrl: string) => void;
  handleUpdateValetStatus: (id: string, status: any, extData?: any) => Promise<void>;
  getKSTDateTimeString: () => string;
  setUploadedSpots: React.Dispatch<React.SetStateAction<Record<string, string>>>;
}

export default function ScratchModal({
  scratchModalTargetId,
  targetReservationForScratch,
  setScratchModalTargetId,
  setSelectedParkingSpace,
  selectedParkingSpace,
  uploadedSpots,
  activeSpotKey,
  handleSpotClick,
  handleUpdateValetStatus,
  getKSTDateTimeString,
  setUploadedSpots
}: ScratchModalProps) {
  const [uploadedPhotos, setUploadedPhotos] = useState<string[]>([]);
  const [paymentChoice, setPaymentChoice] = useState<'unpaid' | 'paid'>('unpaid');
  const [isUploading, setIsUploading] = useState(false);
  const [inlineCameraOpen, setInlineCameraOpen] = useState(false);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  const addImageFiles = async (files: FileList | null) => {
    if (!files?.length) return;

    try {
      const dataUrls = await readImageFilesAsDataUrls(files);
      setUploadedPhotos((prev) => [...prev, ...dataUrls]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '사진을 불러오지 못했습니다.';
      alert(msg);
    }
  };

  const handleCameraChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    await addImageFiles(e.target.files);
    if (e.target) e.target.value = '';
  };

  const handleGalleryChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    await addImageFiles(e.target.files);
    if (e.target) e.target.value = '';
  };

  // 사진 업로드 전 Firebase Auth(익명) 선연결 — 앱 로그인만 하고 Auth 없을 때 Storage 멈춤 방지
  useEffect(() => {
    if (!scratchModalTargetId) return;
    ensureFirestoreAuth().catch((err) => {
      console.warn('Firebase auth before photo modal:', err);
    });
  }, [scratchModalTargetId]);

  // Synchronize when the target reservation changes
  useEffect(() => {
    if (scratchModalTargetId && targetReservationForScratch) {
      setPaymentChoice(reservationToPaymentChoice(targetReservationForScratch));
      const tempKey = `reservation_temp_photos_${scratchModalTargetId}`;
      const savedTemp = localStorage.getItem(tempKey);
      if (savedTemp) {
        try {
          const parsed = JSON.parse(savedTemp);
          if (Array.isArray(parsed)) {
            setUploadedPhotos(parsed);
            return;
          }
        } catch (_) {}
      }
      setUploadedPhotos(targetReservationForScratch.images || []);
    } else {
      setUploadedPhotos([]);
      setInlineCameraOpen(false);
    }
  }, [scratchModalTargetId, targetReservationForScratch]);

  // Live save to localStorage whenever uploadedPhotos changes
  useEffect(() => {
    if (scratchModalTargetId) {
      const tempKey = `reservation_temp_photos_${scratchModalTargetId}`;
      safePersistPhotoDraft(tempKey, uploadedPhotos);
    }
  }, [uploadedPhotos, scratchModalTargetId]);

  // Remove a photo from list
  const handleRemovePhoto = (indexToRemove: number) => {
    setUploadedPhotos(prev => prev.filter((_, idx) => idx !== indexToRemove));
  };

  const PhotoCaptureButtons = () => (
    <div className="grid grid-cols-2 gap-2 mt-1">
      <button
        type="button"
        onClick={() => setInlineCameraOpen(true)}
        className="rounded-xl border font-black transition-all active:scale-[0.98] flex flex-col items-center justify-center gap-1.5 py-4 px-3 bg-neutral-950 border-amber-500/40 text-amber-400 hover:bg-amber-500/10"
      >
        <Camera size={22} />
        <span className="text-xs">촬영</span>
      </button>
      <button
        type="button"
        onClick={() => galleryInputRef.current?.click()}
        className="rounded-xl border font-black transition-all active:scale-[0.98] flex flex-col items-center justify-center gap-1.5 py-4 px-3 bg-neutral-950 border-sky-500/35 text-sky-400 hover:bg-sky-500/10"
      >
        <Images size={22} />
        <span className="text-xs">앨범</span>
      </button>
    </div>
  );

  return (
    <AnimatePresence>
      {scratchModalTargetId && targetReservationForScratch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 z-[130]">
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => {
              setScratchModalTargetId(null);
              setSelectedParkingSpace('');
            }}
            className="absolute inset-x-0 inset-y-0 bg-slate-950/85 backdrop-blur-xs"
          />
          <motion.div 
            initial={{ opacity: 0, scale: 0.96, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 15 }}
            className="relative bg-neutral-900 w-full max-w-xl rounded-2xl shadow-2xl border border-neutral-800 flex flex-col max-h-[92vh] overflow-hidden"
          >
            {isUploading && (
              <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-2.5 rounded-2xl bg-neutral-950/80 backdrop-blur-sm pointer-events-auto">
                <Loader2 size={36} className="animate-spin text-amber-500" />
                <p className="text-sm font-black text-white">사진 업로드 중</p>
                <p className="text-xs text-zinc-400">잠시만 기다려 주세요</p>
              </div>
            )}
            {/* Header */}
            <div className="p-4 border-b border-neutral-800 flex items-center justify-between bg-neutral-900/40">
              <div className="flex items-center gap-2">
                <Camera className="text-amber-500 animate-pulse" size={16} />
                <span className="text-[13px] font-bold font-mono text-zinc-350">
                  사진 등록 ({targetReservationForScratch.userName} 고객님 • {targetReservationForScratch.carNumber})
                </span>
              </div>
              <button 
                type="button" 
                onClick={() => {
                  setScratchModalTargetId(null);
                  setSelectedParkingSpace('');
                }}
                className="p-1 text-zinc-550 hover:text-zinc-350 rounded-full transition-colors"
              >
                <X size={15} />
              </button>
            </div>

            {/* Body */}
            <div className="overflow-y-auto p-5 space-y-4 select-none scrollbar-thin">
              <input
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleCameraChange}
                className="hidden"
                ref={cameraInputRef}
              />
              <input
                type="file"
                multiple
                accept="image/jpeg,image/png,image/webp,image/heic,image/heif,image/*"
                onChange={handleGalleryChange}
                className="hidden"
                ref={galleryInputRef}
              />

              <PhotoCaptureButtons />

              <div className="space-y-2">
                <p className="text-[12px] font-black uppercase text-zinc-500 tracking-wider">수납 상태</p>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setPaymentChoice('unpaid')}
                    className={cn(
                      'py-3 rounded-xl text-xs font-black border transition-all',
                      paymentChoice === 'unpaid'
                        ? 'bg-rose-500/15 border-rose-500 text-rose-400'
                        : 'bg-neutral-950 border-neutral-800 text-zinc-400 hover:border-neutral-700'
                    )}
                  >
                    미납
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaymentChoice('paid')}
                    className={cn(
                      'py-3 rounded-xl text-xs font-black border transition-all',
                      paymentChoice === 'paid'
                        ? 'bg-emerald-500/15 border-emerald-500 text-emerald-400'
                        : 'bg-neutral-950 border-neutral-800 text-zinc-400 hover:border-neutral-700'
                    )}
                  >
                    완납
                  </button>
                </div>
                <p className="text-[11px] text-zinc-550 leading-relaxed">
                  선택하지 않은 차량은 목록에 「미납」으로 표시됩니다. 선결·현장 수납 완료는 「완납」을 선택하세요.
                </p>
              </div>

              {/* Real-time photo counter info line */}
              <div className="flex items-center justify-between text-[12.5px] font-mono border-t border-neutral-850/60 pt-2.5 text-zinc-400">
                <div className="flex items-center gap-1.5">
                  <span className="text-amber-500 text-xs">◆</span>
                  <span>등록된 사진 수 :</span>
                  <span className="text-amber-500/90 font-black">{uploadedPhotos.length}장</span>
                </div>
              </div>

              {/* Render lists of thumbnails */}
              {uploadedPhotos.length > 0 && (
                <div className="space-y-1.5">
                  <span className="text-[12px] uppercase font-black tracking-wider text-zinc-500 px-0.5">촬영 내역 (바둑판식 배열)</span>
                  <div className="grid grid-cols-4 gap-2 max-h-[180px] overflow-y-auto p-1 bg-neutral-950 rounded-xl border border-neutral-850/60">
                    {uploadedPhotos.map((url, idx) => (
                      <div key={idx} className="relative aspect-video rounded-lg border border-neutral-850/60 bg-neutral-900 overflow-hidden group">
                        <img 
                          src={url} 
                          alt={`Vehicle photo ${idx + 1}`} 
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                        <div className="absolute inset-0 bg-neutral-950/20 group-hover:bg-neutral-950/0 transition-colors" />
                        
                        {/* Bullet badge count */}
                        <span className="absolute bottom-1 left-1 bg-neutral-950/85 px-1 py-0.5 rounded text-[11px] font-mono font-bold text-zinc-450 border border-neutral-800">
                          #{idx + 1}
                        </span>

                        {/* Top Right Small (X) Button to discard */}
                        <button
                          type="button"
                          onClick={() => handleRemovePhoto(idx)}
                          className="absolute top-1 right-1 bg-rose-600 hover:bg-rose-500 text-white p-1 rounded-full shadow-lg transition-all active:scale-90"
                        >
                          <X size={8} className="stroke-[3.5]" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-neutral-850 flex gap-2.5 bg-neutral-900/60">
              <button 
                type="button"
                disabled={isUploading}
                onClick={() => {
                  setScratchModalTargetId(null);
                  setSelectedParkingSpace('');
                }}
                className="flex-1 py-3 bg-neutral-950 hover:bg-zinc-900 text-zinc-400 rounded-lg text-xs font-bold border border-neutral-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                취소
              </button>
              <button 
                type="button"
                disabled={isUploading}
                onClick={async () => {
                  if (!scratchModalTargetId) return;
                  const isIndoorVal = targetReservationForScratch.isIndoor !== false;
                  setIsUploading(true);
                  try {
                    let imageUrls: string[] = [];
                    if (uploadedPhotos.length > 0) {
                      imageUrls = await uploadReservationImages(
                        scratchModalTargetId,
                        targetReservationForScratch.companyId || 'wawa',
                        uploadedPhotos
                      );
                    }

                    await handleUpdateValetStatus(scratchModalTargetId, 'completed_in', {
                      parkingSpace: isIndoorVal ? '실내 주차장' : '실외 주차장',
                      isIndoor: isIndoorVal,
                      actualParkingTime: getKSTDateTimeString(),
                      images: imageUrls,
                      scratchPhotos: {
                        synced: true,
                        updatedAt: new Date().toISOString(),
                      },
                      paymentMethod: paymentChoiceToMethod(paymentChoice),
                    });

                    const tempKey = `reservation_temp_photos_${scratchModalTargetId}`;
                    localStorage.removeItem(tempKey);
                    setScratchModalTargetId(null);
                    setUploadedSpots({});
                    setSelectedParkingSpace('');
                  } catch (err) {
                    console.error('Photo upload failed:', err);
                    const msg = err instanceof Error ? err.message : String(err);
                    alert(`사진 업로드 실패\n\n${msg}`);
                  } finally {
                    setIsUploading(false);
                  }
                }}
                className="flex-1 min-h-[44px] py-3 bg-amber-500 hover:bg-amber-450 disabled:opacity-70 disabled:cursor-not-allowed text-neutral-950 rounded-lg text-xs font-bold shadow-md shadow-amber-500/15 transition-all flex items-center justify-center gap-1.5"
                aria-busy={isUploading}
              >
                {isUploading ? (
                  <>
                    <Loader2 size={14} className="animate-spin shrink-0" />
                    <span className="whitespace-nowrap">처리 중…</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 size={13} className="shrink-0" />
                    <span className="whitespace-nowrap">입고 완료</span>
                  </>
                )}
              </button>
            </div>
          </motion.div>
        </div>
      )}
      <InlineVehicleCamera
        isOpen={!!scratchModalTargetId && inlineCameraOpen}
        onClose={() => setInlineCameraOpen(false)}
        onCapture={(dataUrl) => setUploadedPhotos((prev) => [...prev, dataUrl])}
        sessionPhotos={uploadedPhotos}
        onFallbackNativeCamera={() => {
          setInlineCameraOpen(false);
          cameraInputRef.current?.click();
        }}
      />
    </AnimatePresence>
  );
}
