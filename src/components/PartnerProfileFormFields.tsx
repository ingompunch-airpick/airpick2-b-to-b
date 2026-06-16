import React from 'react';
import type { FacilityType } from '../types';
import type { PartnerProfileInput } from '../utils/companyProfile';
import ParkingDistancesFormFields from './ParkingDistancesFormFields';

type Props = {
  profile: PartnerProfileInput;
  onChange: (next: PartnerProfileInput) => void;
  variant?: 'light' | 'dark';
};

const FACILITY_OPTIONS: { value: FacilityType; label: string; desc: string }[] = [
  { value: 'indoor', label: '실내', desc: '실내 주차장만 운영' },
  { value: 'outdoor', label: '실외', desc: '야외 주차장만 운영' },
  { value: 'mixed', label: '실내+실외', desc: '실내·야외 모두 운영' },
];

export default function PartnerProfileFormFields({
  profile,
  onChange,
  variant = 'light',
}: Props) {
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

      <ParkingDistancesFormFields
        t1={profile.parkingDistances.T1}
        t2={profile.parkingDistances.T2}
        onChangeT1={(T1) =>
          onChange({ ...profile, parkingDistances: { ...profile.parkingDistances, T1 } })
        }
        onChangeT2={(T2) =>
          onChange({ ...profile, parkingDistances: { ...profile.parkingDistances, T2 } })
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
