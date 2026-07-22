import React from 'react';
import { MapPin, ShieldCheck } from 'lucide-react';
import type { Company, CompanyInsurance, ParkingDistanceEntry, ParkingDistances } from '../types';
import { inferFacilityType } from '../utils/companyProfile';

function formatPin(lat?: number, lng?: number): string {
  if (lat == null || lng == null || Number.isNaN(lat) || Number.isNaN(lng)) return '미등록';
  return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
}

function formatTerminal(entry?: ParkingDistanceEntry): string {
  if (!entry || entry.distanceKm == null || Number.isNaN(entry.distanceKm)) return '미등록';
  const parts = [`${entry.distanceKm} km`];
  if (entry.driveMinutes != null) parts.push(`약 ${entry.driveMinutes}분`);
  if (entry.parkingLotName?.trim()) parts.push(entry.parkingLotName.trim());
  return parts.join(' · ');
}

function distancesForLot(
  company: Company,
  lot: 'indoor' | 'outdoor'
): ParkingDistances | undefined {
  if (lot === 'indoor') return company.parkingDistancesIndoor ?? company.parkingDistances;
  return company.parkingDistancesOutdoor ?? company.parkingDistances;
}

function resolveInsuranceSummary(company: Company): {
  enrolled: boolean;
  detail: string;
} {
  const ins = company.insurance as CompanyInsurance | undefined;
  if (ins && typeof ins === 'object') {
    if (!ins.enrolled) return { enrolled: false, detail: '미가입' };
    const bits = [ins.provider, ins.productName]
      .map((s) => String(s ?? '').trim())
      .filter(Boolean);
    if (ins.coverageLimitWon != null) {
      bits.push(`한도 ${Number(ins.coverageLimitWon).toLocaleString()}원`);
    }
    return { enrolled: true, detail: bits.length ? bits.join(' · ') : '가입' };
  }
  if (company.hasInsurance === false) return { enrolled: false, detail: '미가입' };
  if (company.insuranceProvider || company.insuranceLimit) {
    const bits = [company.insuranceProvider?.trim()].filter(Boolean) as string[];
    if (company.insuranceLimit != null) {
      bits.push(`한도 ${Number(company.insuranceLimit).toLocaleString()}원`);
    }
    return { enrolled: true, detail: bits.length ? bits.join(' · ') : '가입' };
  }
  return { enrolled: false, detail: '미등록' };
}

function LotBlock({
  title,
  address,
  lat,
  lng,
  distances,
}: {
  title: string;
  address?: string;
  lat?: number;
  lng?: number;
  distances?: ParkingDistances;
}) {
  return (
    <div className="rounded-xl border border-neutral-800 bg-[#131315] p-3 space-y-2">
      <p className="text-[12px] font-black text-white flex items-center gap-1.5">
        <MapPin size={12} className="text-amber-500" />
        {title}
      </p>
      <dl className="space-y-1.5 text-[11px]">
        <div className="flex justify-between gap-3">
          <dt className="text-white/50 font-bold shrink-0">주소</dt>
          <dd className="text-white/90 font-semibold text-right">{address?.trim() || '미등록'}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-white/50 font-bold shrink-0">핀</dt>
          <dd className="text-white/90 font-mono font-semibold text-right">{formatPin(lat, lng)}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-white/50 font-bold shrink-0">T1</dt>
          <dd className="text-white/90 font-semibold text-right">{formatTerminal(distances?.T1)}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-white/50 font-bold shrink-0">T2</dt>
          <dd className="text-white/90 font-semibold text-right">{formatTerminal(distances?.T2)}</dd>
        </div>
      </dl>
    </div>
  );
}

/** 가맹점 마스터 — 보험·위치·핀·거리·사진 확인 전용 (수정은 최고관리자만) */
export default function PartnerParkingProfileReadonly({ company }: { company?: Company }) {
  const facilityType = inferFacilityType(company);
  const showIndoor = facilityType === 'indoor' || facilityType === 'mixed';
  const showOutdoor = facilityType === 'outdoor' || facilityType === 'mixed';
  const insurance = company ? resolveInsuranceSummary(company) : null;

  const photos = (() => {
    if (!company) return [] as string[];
    if (company.image_urls?.length) return company.image_urls.filter(Boolean);
    if (company.image_url?.trim()) return [company.image_url.trim()];
    return [];
  })();

  const facilityLabel =
    facilityType === 'outdoor' ? '실외' : facilityType === 'indoor' ? '실내' : '실내+실외';

  return (
    <div className="bg-neutral-900/40 p-5 rounded-3xl border border-neutral-850 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-xs font-black text-amber-500 tracking-wider uppercase">
            <MapPin size={14} className="text-amber-500" />
            <span>보험 · 위치 · 사진 (확인 전용)</span>
          </div>
          <p className="text-[12px] text-white/70 mt-1.5 leading-relaxed">
            B2C 손님 MY에 표시되는 보험·주소·지도 핀·터미널 거리·사진입니다. 수정은
            최고관리자만 가능합니다.
          </p>
        </div>
        <span className="shrink-0 text-[11px] font-black text-amber-400/90 bg-amber-500/10 border border-amber-500/20 px-2 py-1 rounded-lg">
          시설: {facilityLabel}
        </span>
      </div>

      {!company ? (
        <p className="text-[12px] text-rose-400 font-bold">업체 정보를 불러오지 못했습니다.</p>
      ) : (
        <div className="space-y-3">
          <div className="rounded-xl border border-neutral-800 bg-[#131315] p-3 space-y-2">
            <p className="text-[12px] font-black text-white flex items-center gap-1.5">
              <ShieldCheck size={12} className="text-amber-500" />
              보험 가입
            </p>
            <div className="flex items-start justify-between gap-3 text-[11px]">
              <span
                className={`font-black px-2 py-0.5 rounded-md ${
                  insurance?.enrolled
                    ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/25'
                    : 'bg-neutral-800 text-white/60 border border-neutral-700'
                }`}
              >
                {insurance?.enrolled ? '가입' : insurance?.detail === '미등록' ? '미등록' : '미가입'}
              </span>
              <span className="text-white/80 font-semibold text-right">
                {insurance?.enrolled ? insurance.detail : insurance?.detail || '미등록'}
              </span>
            </div>
          </div>

          {showIndoor && (
            <LotBlock
              title="실내 주차장"
              address={company.indoorParkingAddress}
              lat={company.indoorParkingLat}
              lng={company.indoorParkingLng}
              distances={distancesForLot(company, 'indoor')}
            />
          )}
          {showOutdoor && (
            <LotBlock
              title="실외(야외) 주차장"
              address={company.outdoorParkingAddress}
              lat={company.outdoorParkingLat}
              lng={company.outdoorParkingLng}
              distances={distancesForLot(company, 'outdoor')}
            />
          )}

          <div className="rounded-xl border border-neutral-800 bg-[#131315] p-3 space-y-2">
            <p className="text-[12px] font-black text-white">주차장 사진</p>
            {photos.length === 0 ? (
              <p className="text-[11px] text-white/50 font-semibold">등록된 사진 없음</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {photos.map((url, i) => (
                  <div
                    key={`${url.slice(0, 40)}_${i}`}
                    className="relative w-16 h-16 rounded-lg overflow-hidden border border-neutral-700 bg-neutral-800"
                  >
                    <img src={url} alt={`주차장 ${i + 1}`} className="w-full h-full object-cover" />
                    {i === 0 && (
                      <span className="absolute left-1 top-1 rounded bg-amber-500 px-1 text-[8px] font-black text-neutral-950">
                        대표
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
