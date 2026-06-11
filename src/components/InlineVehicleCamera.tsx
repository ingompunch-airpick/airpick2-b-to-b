import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, X } from 'lucide-react';

function frameToJpegDataUrl(video: HTMLVideoElement, maxDim = 1920, quality = 0.82): string | null {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh) return null;

  let width = vw;
  let height = vh;
  if (width > maxDim || height > maxDim) {
    const scale = maxDim / Math.max(width, height);
    width = Math.round(width * scale);
    height = Math.round(height * scale);
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(video, 0, 0, width, height);
  return canvas.toDataURL('image/jpeg', quality);
}

interface InlineVehicleCameraProps {
  isOpen: boolean;
  onClose: () => void;
  onCapture: (dataUrl: string) => void;
  sessionPhotos: string[];
  onFallbackNativeCamera?: () => void;
}

export default function InlineVehicleCamera({
  isOpen,
  onClose,
  onCapture,
  sessionPhotos,
  onFallbackNativeCamera,
}: InlineVehicleCameraProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState(false);
  const [starting, setStarting] = useState(false);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  useEffect(() => {
    if (!isOpen) {
      stopStream();
      setError(null);
      return;
    }

    let cancelled = false;
    setStarting(true);
    setError(null);

    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError('이 기기/브라우저는 앱 내 연속 촬영을 지원하지 않습니다.');
        setStarting(false);
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          await video.play();
        }
      } catch {
        setError('카메라 권한이 필요합니다. 아래 버튼으로 기본 카메라를 사용해 주세요.');
      } finally {
        if (!cancelled) setStarting(false);
      }
    })();

    return () => {
      cancelled = true;
      stopStream();
    };
  }, [isOpen, stopStream]);

  const takePhoto = () => {
    const video = videoRef.current;
    if (!video) return;
    const dataUrl = frameToJpegDataUrl(video);
    if (!dataUrl) return;

    onCapture(dataUrl);
    setFlash(true);
    window.setTimeout(() => setFlash(false), 100);
    if (navigator.vibrate) navigator.vibrate(25);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[145] bg-black flex flex-col select-none">
      {error ? (
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center gap-4">
          <p className="text-sm text-zinc-300 leading-relaxed">{error}</p>
          <div className="flex flex-col gap-2 w-full max-w-xs">
            {onFallbackNativeCamera && (
              <button
                type="button"
                onClick={onFallbackNativeCamera}
                className="py-3 rounded-xl bg-amber-500 text-neutral-950 text-xs font-black"
              >
                기본 카메라로 촬영
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="py-3 rounded-xl bg-neutral-800 text-zinc-300 text-xs font-bold border border-neutral-700"
            >
              돌아가기
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="relative flex-1 min-h-0 bg-black">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="absolute inset-0 w-full h-full object-cover"
            />
            {starting && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/60 text-xs font-bold text-zinc-300">
                카메라 준비 중…
              </div>
            )}
            {flash && (
              <div className="absolute inset-0 bg-white/35 pointer-events-none transition-opacity" />
            )}

            <div className="absolute top-0 inset-x-0 p-4 flex items-center justify-between bg-gradient-to-b from-black/70 to-transparent">
              <div className="text-xs font-black text-white">
                연속 촬영 · {sessionPhotos.length}장
              </div>
              <button
                type="button"
                onClick={onClose}
                className="p-2 rounded-full bg-black/50 text-white border border-white/20"
                aria-label="촬영 종료"
              >
                <X size={18} />
              </button>
            </div>
          </div>

          {sessionPhotos.length > 0 && (
            <div className="shrink-0 px-3 py-2 bg-neutral-950 border-t border-neutral-800">
              <div className="flex gap-2 overflow-x-auto scrollbar-thin">
                {sessionPhotos.map((url, idx) => (
                  <img
                    key={`${idx}-${url.slice(-12)}`}
                    src={url}
                    alt={`촬영 ${idx + 1}`}
                    className="w-14 h-14 rounded-lg object-cover border border-neutral-700 shrink-0"
                  />
                ))}
              </div>
            </div>
          )}

          <div className="shrink-0 px-4 py-5 bg-neutral-950 border-t border-neutral-800 flex items-center justify-between gap-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-3 rounded-xl bg-neutral-800 text-zinc-200 text-xs font-black border border-neutral-700 min-w-[88px]"
            >
              촬영 완료
            </button>

            <button
              type="button"
              onClick={takePhoto}
              disabled={starting}
              className="relative w-[72px] h-[72px] rounded-full border-4 border-white flex items-center justify-center active:scale-95 transition-transform disabled:opacity-40"
              aria-label="사진 촬영"
            >
              <span className="w-[58px] h-[58px] rounded-full bg-white" />
            </button>

            <div className="min-w-[88px] flex justify-end">
              <Camera className="text-amber-400" size={22} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
