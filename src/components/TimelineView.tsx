import React, { useState, useMemo, useEffect } from 'react';
import { Search, X, RefreshCw, Car, FileText } from 'lucide-react';
import { Reservation, ReservationStatus, AppView } from '../types';
import ReservationCard from './ReservationCard';
import DepartureImminentBanner from './DepartureImminentBanner';
import DateNavBar from './DateNavBar';
import { normalizeDateString } from '../utils/reservationNormalize';
import {
  isDriverTimelineHidden,
  isNotYetAdmitted,
  matchesDriverTab,
} from '../utils/reservationStatus';
import {
  collectDepartureAlerts,
  getDepartureAlertLevel,
  getMinutesUntilDeparture,
} from '../utils/departureImminent';

function cn(...classes: (string | boolean | undefined)[]) {
  return classes.filter(Boolean).join(' ');
}

interface TimelineViewProps {
  isAdminModeActive: boolean;
  reservations: Reservation[];
  selectedDate: string;
  setSelectedDate: (date: string) => void;
  setDatePickerTarget: (target: 'selectedDate' | null) => void;
  activeCounterTab: ReservationStatus;
  loadingReservations: boolean;
  
  // Navigation (handleNavigate 로 view 가드 통과)
  onNavigate: (view: AppView) => void;
  setReceptionSubMode: (mode: 'search' | 'new_contract') => void;

  // Actions for card
  setDriverDetailRes: (res: Reservation | null) => void;
  setAdminEditingReservationId: (id: string | null) => void;
  handleUpdateValetStatus: (id: string, nextStatus: any, extra?: any) => void;
  getKSTDateTimeString: () => string;
  setScratchModalTargetId: (id: string | null) => void;
  setSelectedParkingSpace: (space: string) => void;
  showCompanyLabel?: boolean;
  /** 로그인 대표 업체 id — 하위 예약 업체명 표시용 */
  primaryCompanyId?: string;
}

export default function TimelineView({
  isAdminModeActive,
  reservations,
  selectedDate,
  setSelectedDate,
  setDatePickerTarget,
  activeCounterTab,
  loadingReservations,
  onNavigate,
  setReceptionSubMode,
  setDriverDetailRes,
  setAdminEditingReservationId,
  handleUpdateValetStatus,
  getKSTDateTimeString,
  setScratchModalTargetId,
  setSelectedParkingSpace,
  showCompanyLabel = false,
  primaryCompanyId = '',
}: TimelineViewProps) {
  const [nowTick, setNowTick] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNowTick(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  // Local UI filters
  const [searchKeyword, setSearchKeyword] = useState('');
  const [filterType, setFilterType] = useState<'주/출차일자' | '주차예약' | '출차예약' | '등록일시'>('주/출차일자');

  // Compute filtered timeline list
  const activeTimelineReservations = useMemo(() => {
    return reservations.filter(res => {
      const rDep = normalizeDateString(res.departureDate);
      const rArr = normalizeDateString(res.arrivalDate);
      const selDate = normalizeDateString(selectedDate);

      // 1) Match view filter date & Match active status tab
      let matchesFilterDate = false;
      let matchesTab = false;

      if (isAdminModeActive) {
        // Admin Mode filters
        if (filterType === '주/출차일자') {
          matchesFilterDate = (rDep === selDate) || (rArr === selDate);
        } else if (filterType === '주차예약') {
          matchesFilterDate = (rDep === selDate);
        } else if (filterType === '출차예약') {
          matchesFilterDate = (rArr === selDate);
        } else if (filterType === '등록일시') {
          matchesFilterDate = res.createdAt?.split('T')[0] === selDate;
        }
        // In Admin Mode, activeCounterTab status restrictions do not apply (shows all statuses)
        matchesTab = true;
      } else {
        // Driver Mode filters
        // EXCLUSION: Already returned (completed_out) or cancelled (cancelled) vehicles are strictly hidden in driver active tabs
        if (isDriverTimelineHidden(res.status)) {
          return false;
        }

        matchesTab = matchesDriverTab(res.status, activeCounterTab);

        // Date matching matches characteristic of activeCounterTab to ensure 1:1 sync with tab counters
        if (selDate) {
          if (activeCounterTab === 'pending' || activeCounterTab === 'pending_in') {
            matchesFilterDate = (rDep === selDate);
          } else if (activeCounterTab === 'request_out' || activeCounterTab === 'completed_in') {
            matchesFilterDate = (rArr === selDate);
          } else {
            matchesFilterDate = true;
          }
        } else {
          matchesFilterDate = true;
        }
      }

      // 3) Match keywords typed in timeline searchbar (Only used in Admin Mode currently, but kept for robustness)
      let matchesKeyword = true;
      if (searchKeyword.trim()) {
        const keyword = searchKeyword.trim().toLowerCase();
        matchesKeyword = (
          res.userName?.toLowerCase().includes(keyword) ||
          res.carNumber?.toLowerCase().includes(keyword) ||
          res.carModel?.toLowerCase().includes(keyword) ||
          res.phone?.toLowerCase().includes(keyword) ||
          res.companyName?.toLowerCase().includes(keyword) ||
          res.receiptCode?.toLowerCase().includes(keyword)
        );
      }

      return matchesFilterDate && matchesTab && matchesKeyword;
    }).sort((a, b) => {
      const aDep = normalizeDateString(a.departureDate);
      const bDep = normalizeDateString(b.departureDate);
      const aArr = normalizeDateString(a.arrivalDate);
      const bArr = normalizeDateString(b.arrivalDate);

      // 출고예정: 주차중(작업 가능) 먼저, 미입고(예정만) 아래
      if (activeCounterTab === 'completed_in' && !isAdminModeActive) {
        const aPreview = isNotYetAdmitted(a.status) ? 1 : 0;
        const bPreview = isNotYetAdmitted(b.status) ? 1 : 0;
        if (aPreview !== bPreview) return aPreview - bPreview;
      }

      if (activeCounterTab === 'completed_in' || activeCounterTab === 'request_out') {
        const timeA = `${aArr || ''} ${a.arrivalTime || ''}`;
        const timeB = `${bArr || ''} ${b.arrivalTime || ''}`;
        return timeA.localeCompare(timeB);
      } else {
        const timeA = `${aDep || ''} ${a.departureTime || ''}`;
        const timeB = `${bDep || ''} ${b.departureTime || ''}`;
        return timeA.localeCompare(timeB);
      }
    });
  }, [reservations, selectedDate, filterType, activeCounterTab, searchKeyword, isAdminModeActive]);

  const departureAlerts = useMemo(
    () => collectDepartureAlerts(reservations, undefined, nowTick),
    [reservations, nowTick]
  );

  const sortedTimelineReservations = useMemo(() => {
    return [...activeTimelineReservations].sort((a, b) => {
      const aMin = getDepartureAlertLevel(a, undefined, nowTick)
        ? getMinutesUntilDeparture(a, nowTick) ?? 9999
        : 9999;
      const bMin = getDepartureAlertLevel(b, undefined, nowTick)
        ? getMinutesUntilDeparture(b, nowTick) ?? 9999
        : 9999;
      if (aMin !== bMin) return aMin - bMin;
      return 0;
    });
  }, [activeTimelineReservations, nowTick]);

  const handleDepartureAlertSelect = (res: Reservation) => {
    if (isAdminModeActive) {
      setAdminEditingReservationId(res.id!);
    } else {
      setDriverDetailRes(res);
    }
  };

  return (
    <div className="space-y-4">
      <DepartureImminentBanner
        alerts={departureAlerts}
        onSelect={handleDepartureAlertSelect}
      />
      {/* Search and filter toolbar in Admin Mode */}
      {isAdminModeActive && (
        <div className="overflow-hidden">
          <div className="bg-[#1C1C1E] rounded-[24px] p-4 grid grid-cols-1 md:grid-cols-12 gap-3.5 items-center shadow-lg border border-neutral-900/10 font-sans">
            {/* 1. Integrated Search Bar */}
            <div className="relative md:col-span-4">
              <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#8E8E93]" />
              <input
                type="text"
                placeholder="고객명, 차량번호, 모델, 연락처, 대행사 통합 검색"
                value={searchKeyword}
                onChange={(e) => setSearchKeyword(e.target.value)}
                className="w-full bg-[#2C2C2E] border-0 text-sm rounded-[16px] pl-10 pr-9 py-3 text-white placeholder-[#8E8E93] outline-none focus:ring-1 focus:ring-amber-500/20 transition-all font-semibold"
              />
              {searchKeyword && (
                <button
                  type="button"
                  onClick={() => setSearchKeyword('')}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-350 transition-colors cursor-pointer"
                >
                  <X size={13} />
                </button>
              )}
            </div>

            {/* 2. Query Date Picker Block — 어제/내일 + 달력 */}
            <div className="md:col-span-3">
              <DateNavBar
                selectedDate={selectedDate}
                onChangeDate={setSelectedDate}
                onOpenCalendar={() => setDatePickerTarget('selectedDate')}
                compact
                showLabel={false}
              />
            </div>

            {/* 3. Query Criterion Radio Buttons */}
            <div className="flex items-center gap-1 bg-[#2C2C2E] p-1 rounded-[16px] md:col-span-12 h-[42px]">
              {(['주/출차일자', '주차예약', '출차예약', '등록일시'] as const).map((type) => {
                const isSelected = filterType === type;
                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setFilterType(type)}
                    className={cn(
                      "flex-1 text-[11.5px] font-bold py-1.5 rounded-[12px] transition-all text-center cursor-pointer",
                      isSelected 
                        ? "bg-amber-500/15 text-amber-500 shadow-sm font-extrabold" 
                        : "text-[#8E8E93] hover:text-white"
                    )}
                  >
                    {type}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Driver Mode Date Picker Bar — 어제/내일 화살표 + 달력 + 오늘 */}
      {!isAdminModeActive && (
        <DateNavBar
          selectedDate={selectedDate}
          onChangeDate={setSelectedDate}
          onOpenCalendar={() => setDatePickerTarget('selectedDate')}
        />
      )}

      {/* Timeline list cards display */}
      {loadingReservations ? (
        <div className="py-20 text-center space-y-3 font-sans">
          <RefreshCw className="animate-spin text-amber-500 mx-auto" size={24} />
          <p className="text-toss-body">안전 배차 위탁장 동기화 중...</p>
        </div>
      ) : sortedTimelineReservations.length > 0 ? (
        <div className="space-y-4 font-sans">
          <div className="space-y-2.5">
            {sortedTimelineReservations.map((res, idx) => (
              <ReservationCard 
                key={`${res.id || ''}-${idx}`}
                res={res}
                idx={idx}
                isAdminModeActive={isAdminModeActive}
                activeCounterTab={activeCounterTab}
                departureAlert={getDepartureAlertLevel(res, undefined, nowTick)}
                setAdminEditingReservationId={setAdminEditingReservationId}
                setDriverDetailRes={setDriverDetailRes}
                handleUpdateValetStatus={handleUpdateValetStatus}
                getKSTDateTimeString={getKSTDateTimeString}
                setScratchModalTargetId={setScratchModalTargetId}
                setSelectedParkingSpace={setSelectedParkingSpace}
                showCompanyLabel={showCompanyLabel}
                primaryCompanyId={primaryCompanyId}
              />
            ))}
          </div>
        </div>
      ) : (
        <div className="bg-[#1C1C1E]/30 border border-neutral-900/40 rounded-[24px] p-10 text-center space-y-2 font-sans">
          <Car size={20} className="mx-auto text-neutral-[600] animate-pulse" />
          <p className="text-toss-label text-[var(--color-toss-fg-muted)]">조회된 차량 예약이 없습니다.</p>
          <p className="text-toss-caption">하단 버튼으로 차량 검색·신규 접수를 할 수 있습니다.</p>
        </div>
      )}

      {/* Bottom Fixed Action Panel */}
      {!isAdminModeActive && (
        <div className="pt-2 flex gap-3.5 font-sans">
          <button
            type="button"
            onClick={() => {
              setReceptionSubMode('search');
              onNavigate('search_reception');
            }}
            className="flex-1 py-4 bg-[#1C1C1E] border border-neutral-800 hover:border-neutral-700 text-amber-500 rounded-[22px] text-center text-sm font-black tracking-tight shadow-md hover:bg-neutral-900 active:scale-[0.98] duration-100 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
            id="bottom-search-edit-button"
          >
            <Search size={13} />
            <span>차량 검색 / 정보 수정</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setReceptionSubMode('new_contract');
              onNavigate('search_reception');
            }}
            className="flex-1 py-4 bg-amber-500 text-neutral-950 rounded-[22px] text-center text-sm font-black tracking-tight shadow-lg shadow-amber-500/10 hover:bg-amber-440 active:scale-[0.98] duration-100 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
            id="bottom-new-contract-button"
          >
            <FileText size={13} />
            <span>신규 현장/전화 접수</span>
          </button>
        </div>
      )}
    </div>
  );
}
