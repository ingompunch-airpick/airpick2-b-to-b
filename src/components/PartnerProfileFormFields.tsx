import React, { useRef, useState } from 'react';
import { ImagePlus, Loader2, X } from 'lucide-react';
import type { FacilityType } from '../types';
import type { PartnerProfileInput } from '../utils/companyProfile';
import ParkingPinDistanceFields from './ParkingPinDistanceFields';
import {
  MAX_PARKING_PHOTOS,
  normalizeCompanyParkingPhotos,
  uploadCompanyParkingImages,
} from '../lib/companyPhotos';
import { readImageFilesAsDataUrls } from '../utils/imageFile';

type Props = {
  profile: PartnerProfileInput;
  onChange: (next: PartnerProfileInput) => void;
  /** Storage 업로드 경로용 — 없으면 로컬 미리보기만 유지 후 저장 시 업로드 */
  companyId?: string;
  variant?: 'light' | 'dark';
};

const FACILITY_OPTIONS: { value: FacilityType; label: string; desc: string }[] = [
  { value: 'indoor', label: '실내', desc: '실내 주차장만 운영' },
  { value: 'outdoor', label: '실외', desc: '야외 주차장만 운영' },
  { value: 'mixed', label: '실내+실외', desc: '실내·야외 모두 운영' },
];

function photosFromProfile(profile: PartnerProfileInput): string[] {
  if (profile.imageUrls.length > 0) return normalizeCompanyParkingPhotos(profile.imageUrls);
  if (profile.imageUrl.trim()) return [profile.imageUrl.trim()];
  return [];
}

function withPhotos(profile: PartnerProfileInput, urls: string[]): PartnerProfileInput {
  const imageUrls = normalizeCompanyParkingPhotos(urls);
  return {
    ...profile,
    imageUrls,
    imageUrl: imageUrls[0] || '',
  };
}

export default function PartnerProfileFormFields({
  profile,
  onChange,
  companyId,
  variant = 'light',
}: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const set = <K extends keyof PartnerProfileInput>(key: K, value: PartnerProfileInput[K]) => {
    onChange({ ...profile, [key]: value });
  };

  const labelCls =
    variant === 'dark'
      ? 'text-[12px] text-slate-300 block mb-1 font-bold'
      : 'text-[12px] text-slate-500 block mb-1 font-bold';
  const inputCls =
    variant === 'dark'
      ? 'w-full px-3 py-2 border border-slate-600 bg-slate-800 text-white rounded-xl focus:outline-none focus:ring-1 focus:ring-indigo-400'
      : 'w-full px-3 py-2 border border-slate-200 bg-white text-slate-900 rounded-xl focus:outline-none focus:ring-1 focus:ring-indigo-500';
  const sectionCls =
    variant === 'dark'
      ? 'rounded-xl border border-slate-700 bg-slate-800/50 p-3 space-y-3'
      : 'rounded-xl border border-slate-100 bg-slate-50/80 p-3 space-y-3';

  const showIndoor = profile.facilityType === 'indoor' || profile.facilityType === 'mixed';
  const showOutdoor = profile.facilityType === 'outdoor' || profile.facilityType === 'mixed';
  const photos = photosFromProfile(profile);
  const canAddMore = photos.length < MAX_PARKING_PHOTOS;

  const handlePickPhotos = async (files: FileList | null) => {
    if (!files?.length) return;
    const remaining = MAX_PARKING_PHOTOS - photos.length;
    if (remaining <= 0) {
      alert(`주차장 사진은 최대 ${MAX_PARKING_PHOTOS}장까지 등록할 수 있습니다.`);
      return;
    }

    try {
      setUploading(true);
      const dataUrls = (await readImageFilesAsDataUrls(files)).slice(0, remaining);
      const merged = [...photos, ...dataUrls];
      const safeId = (companyId || '').trim().toLowerCase();

      if (safeId) {
        const uploaded = await uploadCompanyParkingImages(safeId, merged);
        onChange(withPhotos(profile, uploaded));
      } else {
        onChange(withPhotos(profile, merged));
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : '사진 업로드에 실패했습니다.';
      alert(msg);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const removePhotoAt = (index: number) => {
    const next = photos.filter((_, i) => i !== index);
    onChange(withPhotos(profile, next));
  };

  return (
    <div className="space-y-3">
      <div className={sectionCls}>
        <div>
          <label className={labelCls}>주차 시설 유형 *</label>
          <p className="text-[11px] text-slate-400 mb-2">
            B2C 비교·기사 현장에서 실내/야외 구분에 사용됩니다.
          </p>
          <div className="grid grid-cols-3 gap-2">
            {FACILITY_OPTIONS.map((opt) => {
              const active = profile.facilityType === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => set('facilityType', opt.value)}
                  className={`px-2 py-2 rounded-xl text-left border transition-all ${
                    active
                      ? 'border-indigo-500 bg-indigo-50 text-indigo-800 shadow-xs'
                      : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                  }`}
                >
                  <span className="block text-[12px] font-black">{opt.label}</span>
                  <span className="block text-[10px] font-medium mt-0.5 opacity-80">{opt.desc}</span>
                </button>
              );
            })}
          </div>
        </div>

        {showIndoor && (
          <div>
            <label className={labelCls}>실내 주차장 도로명 주소</label>
            <input
              type="text"
              value={profile.indoorParkingAddress}
              onChange={(e) => set('indoorParkingAddress', e.target.value)}
              className={inputCls}
              placeholder="예: 인천광역시 중구 공항로 272"
            />
          </div>
        )}

        {showOutdoor && (
          <div>
            <label className={labelCls}>실외(야외) 주차장 도로명 주소</label>
            <input
              type="text"
              value={profile.outdoorParkingAddress}
              onChange={(e) => set('outdoorParkingAddress', e.target.value)}
              className={inputCls}
              placeholder="예: 인천광역시 중구 공항동로 295"
            />
          </div>
        )}
      </div>

      <div className={sectionCls}>
        <div>
          <label className={labelCls}>주차장 사진 (B2C 노출)</label>
          <p className="text-[11px] text-slate-400 mb-2">
            첫 장이 대표 사진입니다. 최고관리자만 등록·변경할 수 있습니다. (최대 {MAX_PARKING_PHOTOS}장)
          </p>
          <div className="flex flex-wrap gap-2">
            {photos.map((url, index) => (
              <div
                key={`${url.slice(0, 48)}_${index}`}
                className="relative w-20 h-20 rounded-xl overflow-hidden border border-slate-200 bg-slate-100"
              >
                <img src={url} alt={`주차장 사진 ${index + 1}`} className="w-full h-full object-cover" />
                {index === 0 && (
                  <span className="absolute left-1 top-1 rounded bg-indigo-600 px-1 py-0.5 text-[9px] font-black text-white">
                    대표
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => removePhotoAt(index)}
                  className="absolute right-1 top-1 rounded-full bg-black/60 p-0.5 text-white hover:bg-black/80"
                  aria-label={`사진 ${index + 1} 삭제`}
                >
                  <X size={12} />
                </button>
              </div>
            ))}
            {canAddMore && (
              <button
                type="button"
                disabled={uploading}
                onClick={() => fileInputRef.current?.click()}
                className="w-20 h-20 rounded-xl border border-dashed border-slate-300 bg-white text-slate-500 hover:border-indigo-400 hover:text-indigo-600 flex flex-col items-center justify-center gap-1 disabled:opacity-60"
              >
                {uploading ? <Loader2 size={18} className="animate-spin" /> : <ImagePlus size={18} />}
                <span className="text-[10px] font-bold">{uploading ? '업로드…' : '추가'}</span>
              </button>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => void handlePickPhotos(e.target.files)}
          />
        </div>
      </div>

      <ParkingPinDistanceFields
        indoor={{ lat: profile.indoorParkingLat, lng: profile.indoorParkingLng }}
        outdoor={{ lat: profile.outdoorParkingLat, lng: profile.outdoorParkingLng }}
        showIndoor={showIndoor}
        showOutdoor={showOutdoor}
        onChangeIndoor={({ lat, lng }) =>
          onChange({ ...profile, indoorParkingLat: lat, indoorParkingLng: lng })
        }
        onChangeOutdoor={({ lat, lng }) =>
          onChange({ ...profile, outdoorParkingLat: lat, outdoorParkingLng: lng })
        }
        indoorDistances={profile.parkingDistancesByLot.indoor}
        outdoorDistances={profile.parkingDistancesByLot.outdoor}
        onChangeIndoorDistances={(indoor) =>
          onChange({
            ...profile,
            parkingDistancesByLot: { ...profile.parkingDistancesByLot, indoor },
          })
        }
        onChangeOutdoorDistances={(outdoor) =>
          onChange({
            ...profile,
            parkingDistancesByLot: { ...profile.parkingDistancesByLot, outdoor },
          })
        }
        variant={variant}
      />

      <div className={sectionCls}>
        <div className="flex items-center justify-between gap-2">
          <label className={labelCls}>보험 가입 여부</label>
          <button
            type="button"
            onClick={() => set('insuranceEnrolled', !profile.insuranceEnrolled)}
            className={`px-3 py-1.5 rounded-lg text-[11px] font-black border transition-all ${
              profile.insuranceEnrolled
                ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                : 'bg-slate-100 border-slate-200 text-slate-500'
            }`}
          >
            {profile.insuranceEnrolled ? '가입' : '미가입'}
          </button>
        </div>

        {profile.insuranceEnrolled && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>보험사</label>
                <input
                  type="text"
                  value={profile.insuranceProvider}
                  onChange={(e) => set('insuranceProvider', e.target.value)}
                  className={inputCls}
                  placeholder="예: DB손해보험"
                />
              </div>
              <div>
                <label className={labelCls}>보험 종류</label>
                <input
                  type="text"
                  value={profile.insuranceProductName}
                  onChange={(e) => set('insuranceProductName', e.target.value)}
                  className={inputCls}
                  placeholder="예: 영업용 종합보험"
                />
              </div>
            </div>
            <div>
              <label className={labelCls}>보상 한도 (원)</label>
              <input
                type="text"
                inputMode="numeric"
                value={profile.insuranceCoverageLimitWon}
                onChange={(e) => set('insuranceCoverageLimitWon', e.target.value.replace(/[^\d,]/g, ''))}
                className={`${inputCls} font-mono`}
                placeholder="예: 100000000"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
