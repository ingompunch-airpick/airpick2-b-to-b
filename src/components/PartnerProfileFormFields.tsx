import React, { useRef, useState } from 'react';
import { ImagePlus, Loader2, X } from 'lucide-react';
import type { FacilityType } from '../types';
import type { PartnerProfileInput } from '../utils/companyProfile';
import ParkingLotsFields from './ParkingLotsFields';
import {
  MAX_PARKING_PHOTOS,
  normalizeCompanyParkingPhotos,
} from '../lib/companyPhotos';
import { readImageFilesAsDataUrls } from '../utils/imageFile';
import { getEnabledAirports, type AirportId } from '../utils/airport';

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
  variant = 'light',
}: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const certInputRef = useRef<HTMLInputElement>(null);
  const profileRef = useRef(profile);
  profileRef.current = profile;
  const [uploading, setUploading] = useState(false);

  const set = <K extends keyof PartnerProfileInput>(key: K, value: PartnerProfileInput[K]) => {
    onChange({ ...profile, [key]: value });
  };

  const labelCls =
    variant === 'dark'
      ? 'text-[12px] text-zinc-300 block mb-1 font-bold'
      : 'text-[12px] text-slate-500 block mb-1 font-bold';
  const inputCls =
    variant === 'dark'
      ? 'w-full px-3 py-2 border border-neutral-700 bg-[#1C1C1E] text-zinc-100 rounded-xl focus:outline-none focus:ring-1 focus:ring-amber-500/50'
      : 'w-full px-3 py-2 border border-slate-200 bg-white text-slate-900 rounded-xl focus:outline-none focus:ring-1 focus:ring-indigo-500';
  const sectionCls =
    variant === 'dark'
      ? 'rounded-xl border border-neutral-800 bg-[#1C1C1E]/60 p-3 space-y-3'
      : 'rounded-xl border border-slate-100 bg-slate-50/80 p-3 space-y-3';
  const hintCls = variant === 'dark' ? 'text-[11px] text-zinc-500 mb-2' : 'text-[11px] text-slate-400 mb-2';
  const facilityActiveCls =
    variant === 'dark'
      ? 'border-amber-500/60 bg-amber-500/10 text-amber-200 shadow-xs'
      : 'border-indigo-500 bg-indigo-50 text-indigo-800 shadow-xs';
  const facilityIdleCls =
    variant === 'dark'
      ? 'border-neutral-700 bg-[#141416] text-zinc-400 hover:border-neutral-600'
      : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300';
  const photoBoxCls =
    variant === 'dark'
      ? 'relative w-20 h-20 rounded-xl overflow-hidden border border-neutral-700 bg-neutral-900'
      : 'relative w-20 h-20 rounded-xl overflow-hidden border border-slate-200 bg-slate-100';
  const addPhotoCls =
    variant === 'dark'
      ? 'w-20 h-20 rounded-xl border border-dashed border-neutral-600 bg-[#141416] text-zinc-500 hover:border-amber-500/50 hover:text-amber-400 flex flex-col items-center justify-center gap-1 disabled:opacity-60'
      : 'w-20 h-20 rounded-xl border border-dashed border-slate-300 bg-white text-slate-500 hover:border-indigo-400 hover:text-indigo-600 flex flex-col items-center justify-center gap-1 disabled:opacity-60';

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
      // 선택 직후는 미리보기만 반영. Storage 업로드는 「저장」 시 처리
      // (즉시 업로드는 Auth/권한 실패 시 미리보기조차 안 남는 문제가 있음)
      onChange(withPhotos(profileRef.current, [...photos, ...dataUrls]));
    } catch (err) {
      const msg = err instanceof Error ? err.message : '사진 추가에 실패했습니다.';
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
          <label className={labelCls}>운영 공항 *</label>
          <p className={hintCls}>
            업체당 공항 1곳. 선택하면 터미널(T1·T2 / 국내선·국제선)이 자동으로 맞춰집니다.
          </p>
          <div className="grid grid-cols-2 gap-2">
            {getEnabledAirports().map((a) => {
              const active = profile.airport === a.id;
              return (
                <button
                  key={a.id}
                  type="button"
                  onClick={() =>
                    onChange({
                      ...profile,
                      airport: a.id as AirportId,
                    })
                  }
                  className={`px-2 py-2 rounded-xl text-left border transition-all ${
                    active ? facilityActiveCls : facilityIdleCls
                  }`}
                >
                  <span className="block text-[12px] font-black">{a.shortName}</span>
                  <span className="block text-[10px] font-medium mt-0.5 opacity-80">
                    {a.terminals.map((t) => t.shortLabel).join(' · ')}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className={sectionCls}>
        <div>
          <label className={labelCls}>주차 시설 유형 *</label>
          <p className={hintCls}>
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
                    active ? facilityActiveCls : facilityIdleCls
                  }`}
                >
                  <span className="block text-[12px] font-black">{opt.label}</span>
                  <span className="block text-[10px] font-medium mt-0.5 opacity-80">{opt.desc}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* 도로명 주소는 아래 지도 핀에서 자동 채움 */}
      </div>

      <div className={sectionCls}>
        <div>
          <label className={labelCls}>주차장 사진 (B2C 노출)</label>
          <p className={hintCls}>
            첫 장이 대표 사진입니다. 본사 계정으로 「변경 내용 저장」할 때 Storage에
            올라갑니다. (최대 {MAX_PARKING_PHOTOS}장 · JPG/PNG 권장)
          </p>
          <div className="flex flex-wrap gap-2">
            {photos.map((url, index) => (
              <div
                key={`${url.slice(0, 48)}_${index}`}
                className={photoBoxCls}
              >
                <img src={url} alt={`주차장 사진 ${index + 1}`} className="w-full h-full object-cover" />
                {index === 0 && (
                  <span className="absolute left-1 top-1 rounded bg-amber-500 px-1 py-0.5 text-[9px] font-black text-black">
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
                className={addPhotoCls}
              >
                {uploading ? <Loader2 size={18} className="animate-spin" /> : <ImagePlus size={18} />}
                <span className="text-[10px] font-bold">{uploading ? '추가 중…' : '추가'}</span>
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

      <ParkingLotsFields
        airportId={profile.airport}
        lots={profile.parkingLots}
        showIndoor={showIndoor}
        showOutdoor={showOutdoor}
        onChange={(parkingLots) =>
          onChange({
            ...profileRef.current,
            parkingLots,
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
                ? variant === 'dark'
                  ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                  : 'bg-emerald-50 border-emerald-200 text-emerald-700'
                : variant === 'dark'
                  ? 'bg-neutral-900 border-neutral-700 text-zinc-500'
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
                  placeholder="예: 배상책임보험"
                />
              </div>
            </div>
            <div>
              <label className={labelCls}>보상 한도 (원) · 내부용</label>
              <input
                type="text"
                inputMode="numeric"
                value={profile.insuranceCoverageLimitWon}
                onChange={(e) => set('insuranceCoverageLimitWon', e.target.value.replace(/[^\d,]/g, ''))}
                className={`${inputCls} font-mono`}
                placeholder="예: 100000000"
              />
              <p className={`mt-1 text-[10px] font-medium ${hintCls}`}>
                손님 앱 목록에는 금액을 노출하지 않습니다. 보험증권으로 확인합니다.
              </p>
            </div>
            <div>
              <label className={labelCls}>보험증권 이미지</label>
              {profile.insuranceCertificateUrl ? (
                <div className="relative mb-2 overflow-hidden rounded-xl ring-1 ring-slate-200">
                  <img
                    src={profile.insuranceCertificateUrl}
                    alt="보험증권"
                    className="max-h-40 w-full object-contain bg-slate-50"
                  />
                  <button
                    type="button"
                    onClick={() => set('insuranceCertificateUrl', '')}
                    className="absolute right-2 top-2 rounded-full bg-black/60 p-1 text-white"
                    aria-label="보험증권 삭제"
                  >
                    <X size={14} />
                  </button>
                </div>
              ) : null}
              <input
                ref={certInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  void (async () => {
                    const file = e.target.files?.[0];
                    e.target.value = '';
                    if (!file) return;
                    try {
                      const [dataUrl] = await readImageFilesAsDataUrls([file]);
                      if (dataUrl) set('insuranceCertificateUrl', dataUrl);
                    } catch {
                      /* ignore */
                    }
                  })();
                }}
              />
              <button
                type="button"
                onClick={() => certInputRef.current?.click()}
                className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-[11px] font-bold ring-1 ${
                  variant === 'dark'
                    ? 'bg-neutral-900 text-zinc-200 ring-neutral-700'
                    : 'bg-white text-slate-700 ring-slate-200'
                }`}
              >
                <ImagePlus size={14} />
                {profile.insuranceCertificateUrl ? '증권 다시 선택' : '증권 이미지 올리기'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
