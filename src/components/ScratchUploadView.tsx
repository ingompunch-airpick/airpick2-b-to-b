import React, { useRef, useState } from 'react';
import { ArrowLeft, Camera, RefreshCw, X, CheckCircle2 } from 'lucide-react';
import { Reservation } from '../types';
import { uploadReservationImages } from '../lib/reservationPhotos';
import { ensureFirestoreAuth } from '../lib/reservationFirestore';

interface Props {
  onBack: () => void;
  reservations: Reservation[];
  onUpdateImages: (resId: string, imageUrls: string[]) => Promise<void>;
}

// ── 카드 1개 ───────────────────────────────────────────
function PhotoCard({
  res,
  onUpdateImages,
}: {
  res: Reservation;
  onUpdateImages: (resId: string, imageUrls: string[]) => Promise<void>;
}) {
  const [previews, setPreviews] = useState<string[]>(res.images ?? []);
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const triggerPicker = () => {
    setError(null);
    inputRef.current?.click();
  };

  const handleFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawFiles = Array.from(e.target.files ?? []);
    if (e.target) e.target.value = '';
    if (!rawFiles.length) return;

    const imageFiles = rawFiles.filter(
      (f) => f.type.startsWith('image/') || /\.(jpe?g|png|webp|heic|gif)$/i.test(f.name)
    );
    if (!imageFiles.length) {
      setError('이미지 파일(JPG·PNG 등)만 선택할 수 있습니다.');
      return;
    }

    // 1) base64 미리보기
    const dataUrls = await Promise.all(
      imageFiles.map(
        (f) =>
          new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () =>
              typeof reader.result === 'string'
                ? resolve(reader.result)
                : reject(new Error('읽기 실패'));
            reader.onerror = () => reject(new Error('파일 읽기 오류'));
            reader.readAsDataURL(f);
          })
      )
    );

    const next = [...previews, ...dataUrls];
    setPreviews(next);
    setSaved(false);
    setError(null);

    // 2) Storage 업로드 → Firestore 저장
    setIsSaving(true);
    try {
      await ensureFirestoreAuth();
      const uploaded = await uploadReservationImages(res.id!, res.companyId || 'wawa', next);
      await onUpdateImages(res.id!, uploaded);
      setPreviews(uploaded);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : '저장에 실패했습니다. 재시도해 주세요.');
    } finally {
      setIsSaving(false);
    }
  };

  const removePhoto = (idx: number) => {
    setPreviews((p) => p.filter((_, i) => i !== idx));
    setSaved(false);
  };

  return (
    <div className="rounded-2xl border border-neutral-800 bg-neutral-900/60 overflow-hidden">
      {/* 차량 헤더 */}
      <div className="p-3.5 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-zinc-200">{res.carNumber}</span>
            <span className="text-[12px] text-zinc-500">({res.carModel})</span>
          </div>
          <p className="text-[11.5px] text-zinc-500 truncate mt-0.5">
            {res.userName} · {res.companyName || '제휴주차장'}
          </p>
        </div>

        <div className="shrink-0">
          {saved ? (
            <span className="text-[11px] font-bold px-2.5 py-1.5 rounded-lg border text-emerald-400 bg-emerald-500/5 border-emerald-500/20 flex items-center gap-1">
              <CheckCircle2 size={11} />
              저장 완료
            </span>
          ) : (
            <button
              type="button"
              disabled={isSaving}
              onClick={triggerPicker}
              className="px-3 py-2 bg-amber-500 hover:bg-amber-400 active:scale-95 text-neutral-950 rounded-xl text-[12px] font-black flex items-center gap-1.5 transition-all disabled:opacity-50"
            >
              {isSaving ? (
                <RefreshCw className="animate-spin" size={12} />
              ) : (
                <>
                  <Camera size={12} />
                  {previews.length > 0 ? '추가' : '업로드'}
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* 업로드 영역 */}
      <div className="px-3.5 pb-3.5 space-y-2.5">
        {/* 업로드 버튼 (크게) */}
        {!saved && (
          <button
            type="button"
            disabled={isSaving}
            onClick={triggerPicker}
            className="w-full border-2 border-dashed border-neutral-750 hover:border-amber-500/60 rounded-xl py-4 flex flex-col items-center gap-1.5 bg-neutral-950/50 transition-all disabled:opacity-40"
          >
            {isSaving ? (
              <>
                <RefreshCw className="animate-spin text-amber-500" size={22} />
                <span className="text-[12px] text-amber-500 font-bold">Storage 업로드 중…</span>
              </>
            ) : (
              <>
                <Camera className="text-amber-500/80" size={22} />
                <span className="text-[13px] font-black text-zinc-200">사진 추가하기</span>
                <span className="text-[11px] text-zinc-500">여러 장 선택 가능</span>
              </>
            )}
          </button>
        )}

        {/* 에러 */}
        {error && (
          <p className="text-[12px] text-rose-400 font-bold bg-rose-500/10 rounded-lg px-3 py-2">
            ⚠ {error}
          </p>
        )}

        {/* 저장 완료 */}
        {saved && (
          <div className="flex items-center gap-1.5 text-[12px] text-emerald-400 font-bold">
            <CheckCircle2 size={13} />
            {previews.length}장 저장 완료 — 사진 더 추가하려면 오른쪽 「추가」 버튼
          </div>
        )}

        {/* 썸네일 */}
        {previews.length > 0 && (
          <div className="grid grid-cols-4 gap-2 max-h-[200px] overflow-y-auto p-1 bg-neutral-950 rounded-xl border border-neutral-850">
            {previews.map((url, idx) => (
              <div
                key={idx}
                className="relative aspect-square rounded-lg overflow-hidden border border-neutral-800 bg-neutral-900"
              >
                <img
                  src={url}
                  alt={`#${idx + 1}`}
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                />
                <span className="absolute bottom-0.5 left-0.5 bg-black/70 px-1 rounded text-[10px] font-mono text-zinc-400">
                  #{idx + 1}
                </span>
                {!isSaving && (
                  <button
                    type="button"
                    onClick={() => removePhoto(idx)}
                    className="absolute top-0.5 right-0.5 bg-rose-600 text-white p-0.5 rounded-full"
                  >
                    <X size={9} />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 파일 input — 이 카드 전용 */}
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,image/*"
        multiple
        className="hidden"
        onChange={handleFiles}
      />
    </div>
  );
}

// ── 뷰 전체 ─────────────────────────────────────────────
export default function ScratchUploadView({ onBack, reservations, onUpdateImages }: Props) {
  const [doneIds, setDoneIds] = useState<Set<string>>(new Set());

  const targets = reservations.filter(
    (r) =>
      r.id &&
      !['cancelled', 'completed_out'].includes(r.status) &&
      !(r.images && r.images.length > 0) &&
      !doneIds.has(r.id)
  );

  const handleUpdateImages = async (resId: string, urls: string[]) => {
    await onUpdateImages(resId, urls);
    setDoneIds((prev) => new Set([...prev, resId]));
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-white p-5 pb-24">
      <div className="flex items-center gap-3.5 mb-5">
        <button
          type="button"
          onClick={onBack}
          className="p-2 rounded-2xl text-zinc-400 hover:text-white bg-neutral-900/60 border border-neutral-800 transition-all"
        >
          <ArrowLeft size={16} />
        </button>
        <div>
          <h2 className="text-sm font-black tracking-tight text-white">차량 사진 업로드</h2>
          <p className="text-[12px] text-zinc-500 font-bold">사진 미등록 입고차량 후속 업로드</p>
        </div>
      </div>

      <div className="space-y-3">
        <h3 className="text-[12px] uppercase font-black tracking-widest text-zinc-500 px-1">
          사진 미등록 입고차량 ({targets.length}건)
        </h3>

        {targets.length === 0 ? (
          <div className="p-8 text-center bg-neutral-900/30 border border-dashed border-neutral-800 rounded-2xl">
            <CheckCircle2 className="mx-auto text-emerald-500/50 mb-3" size={28} />
            <p className="text-xs text-zinc-400 font-bold">모든 차량에 사진이 등록됐습니다</p>
          </div>
        ) : (
          <div className="space-y-3">
            {targets.map((res) => (
              <PhotoCard key={res.id} res={res} onUpdateImages={handleUpdateImages} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
