import React, { useState, useEffect, useRef } from 'react';
import { Camera, Images, X, CheckCircle2, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Reservation } from '../types';
import {
  paymentChoiceToMethod,
  reservationToPaymentChoice,
} from '../utils/paymentStatus';
import {
  mergeReservationImageUrls,
  uploadReservationImages,
} from '../lib/reservationPhotos';
import { ensureFirestoreAuth } from '../lib/reservationFirestore';
import { resolveRequiredCompanyId } from '../utils/companyDisplay';
import { readImageFilesAsDataUrls, safePersistPhotoDraft } from '../utils/imageFile';
import { buildScratchPhotoSet } from '../lib/scratchPhotos';
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
  handleUpdateValetStatus: (id: string, status: any, extData?: any) => Promise<void>;
  getKSTDateTimeString: () => string;
}

export default function ScratchModal({
  scratchModalTargetId,
  targetReservationForScratch,
  setScratchModalTargetId,
  setSelectedParkingSpace,
  selectedParkingSpace,
  handleUpdateValetStatus,
  getKSTDateTimeString,
}: ScratchModalProps) {
  /** 입고 사진 최소 장수 — 0장 입고는 사고 대응 불가 */
  const MIN_CHECKIN_PHOTOS = 1;
  /** 이보다 적으면 입고 전 확인 (전·후·좌·우 등) */
  const RECOMMENDED_CHECKIN_PHOTOS = 4;

  const [uploadedPhotos, setUploadedPhotos] = useState<string[]>([]);
  const [paymentChoice, setPaymentChoice] = useState<'unpaid' | 'paid'>('unpaid');
  const [isUploading, setIsUploading] = useState(false);
  const [inlineCameraOpen, setInlineCameraOpen] = useState(false);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  /** 모달 세션 중 한 번이라도 쌓인 최대 장수 — 스냅샷/초안이 줄어든 값으로 덮어쓰지 않게 */
  const sessionMaxPhotoCountRef = useRef(0);

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

  // 모달을 연 직후(대상 ID 변경 시)에만 초안/기존 사진을 불러옴.
  // targetReservationForScratch 객체는 onSnapshot마다 바뀌므로 deps에 넣으면
  // 촬영 중 localStorage 옛 초안(1장)으로 메모리上的 여러 장이 덮어씌워질 수 있음.
  useEffect(() => {
    if (!scratchModalTargetId) {
      setUploadedPhotos([]);
      setInlineCameraOpen(false);
      sessionMaxPhotoCountRef.current = 0;
      return;
    }

    sessionMaxPhotoCountRef.current = 0;

    if (targetReservationForScratch) {
      setPaymentChoice(reservationToPaymentChoice(targetReservationForScratch));
    }

    const serverImages = targetReservationForScratch?.images || [];
    let draftImages: string[] = [];
    const tempKey = `reservation_temp_photos_${scratchModalTargetId}`;
    const savedTemp = localStorage.getItem(tempKey);
    if (savedTemp) {
      try {
        const parsed = JSON.parse(savedTemp);
        if (Array.isArray(parsed) && parsed.length > 0) {
          draftImages = parsed;
        }
      } catch {
        /* ignore */
      }
    }

    // 짧은 초안(용량 초과로 1장만 남은 경우)이 서버/긴 목록을 덮지 않게 장수가 많은 쪽을 사용
    const initial =
      draftImages.length >= serverImages.length ? draftImages : serverImages;
    sessionMaxPhotoCountRef.current = initial.length;
    setUploadedPhotos(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 모달 오픈(ID) 시에만 초기화
  }, [scratchModalTargetId]);

  // 결제 선택만 예약 스냅샷과 동기화 (사진 배열은 건드리지 않음)
  useEffect(() => {
    if (!scratchModalTargetId || !targetReservationForScratch) return;
    setPaymentChoice(reservationToPaymentChoice(targetReservationForScratch));
  }, [scratchModalTargetId, targetReservationForScratch]);

  // 다른 폰에서 이미 올린 사진이 서버에 더 많으면 화면 목록을 그쪽으로 맞춤 (절대 줄이지 않음)
  const serverImageCount = targetReservationForScratch?.images?.length ?? 0;
  useEffect(() => {
    if (!scratchModalTargetId || !targetReservationForScratch) return;
    const serverImages = targetReservationForScratch.images || [];
    setUploadedPhotos((prev) => {
      if (serverImages.length <= prev.length) return prev;
      sessionMaxPhotoCountRef.current = Math.max(
        sessionMaxPhotoCountRef.current,
        serverImages.length
      );
      return serverImages;
    });
  }, [scratchModalTargetId, serverImageCount, targetReservationForScratch]);

  // Live save to localStorage whenever uploadedPhotos changes
  useEffect(() => {
    if (!scratchModalTargetId) return;
    if (uploadedPhotos.length > sessionMaxPhotoCountRef.current) {
      sessionMaxPhotoCountRef.current = uploadedPhotos.length;
    }
    const tempKey = `reservation_temp_photos_${scratchModalTargetId}`;
    safePersistPhotoDraft(tempKey, uploadedPhotos);
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
            <div className="p-4 border-t border-neutral-850 space-y-2.5 bg-neutral-900/60">
              <p
                className={cn(
                  'text-center text-[11px] font-bold',
                  uploadedPhotos.length === 0
                    ? 'text-rose-400'
                    : uploadedPhotos.length < RECOMMENDED_CHECKIN_PHOTOS
                      ? 'text-amber-400'
                      : 'text-emerald-400'
                )}
              >
                {uploadedPhotos.length === 0
                  ? '사진 없음 — 촬영 후 입고하세요'
                  : `촬영 ${uploadedPhotos.length}장${
                      uploadedPhotos.length < RECOMMENDED_CHECKIN_PHOTOS
                        ? ` · ${RECOMMENDED_CHECKIN_PHOTOS}장 이상 권장`
                        : ''
                    }`}
              </p>
              <div className="flex gap-2.5">
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

                  if (uploadedPhotos.length < MIN_CHECKIN_PHOTOS) {
                    alert(
                      '차량 사진이 없습니다.\n사고·클레임 대비를 위해 사진을 찍은 뒤 입고해 주세요.'
                    );
                    return;
                  }

                  if (uploadedPhotos.length < RECOMMENDED_CHECKIN_PHOTOS) {
                    const ok = window.confirm(
                      `지금 ${uploadedPhotos.length}장만 있습니다.\n` +
                        `보통 전·후·좌·우 등 ${RECOMMENDED_CHECKIN_PHOTOS}장 이상 촬영합니다.\n\n` +
                        `이대로 입고할까요? (취소하면 사진을 더 추가할 수 있습니다)`
                    );
                    if (!ok) return;
                  }

                  const isIndoorVal = targetReservationForScratch.isIndoor !== false;
                  setIsUploading(true);
                  try {
                    const companyId = resolveRequiredCompanyId(
                      targetReservationForScratch.companyId
                    );
                    if (!companyId) {
                      alert('예약에 업체 정보가 없어 사진을 업로드할 수 없습니다.');
                      return;
                    }
                    const imageUrls = await uploadReservationImages(
                      scratchModalTargetId,
                      companyId,
                      uploadedPhotos
                    );

                    if (imageUrls.length < uploadedPhotos.length) {
                      throw new Error(
                        `올린 사진 ${uploadedPhotos.length}장 중 ${imageUrls.length}장만 저장됐습니다. 다시 시도해 주세요.`
                      );
                    }

                    // 다른 기기에서 이미 저장된 사진을 짧은 목록으로 덮어쓰지 않음
                    const finalImages = mergeReservationImageUrls(
                      targetReservationForScratch.images,
                      imageUrls
                    );

                    await handleUpdateValetStatus(scratchModalTargetId, 'completed_in', {
                      parkingSpace: isIndoorVal ? '실내 주차장' : '실외 주차장',
                      isIndoor: isIndoorVal,
                      actualParkingTime: getKSTDateTimeString(),
                      images: finalImages,
                      scratchPhotos: buildScratchPhotoSet(finalImages, true),
                      paymentMethod: paymentChoiceToMethod(paymentChoice),
                    });

                    const tempKey = `reservation_temp_photos_${scratchModalTargetId}`;
                    localStorage.removeItem(tempKey);
                    setScratchModalTargetId(null);
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
