import React, { useState, useEffect, useMemo } from 'react';
import { 
  ArrowLeft,
  Search, 
  FileText,
  PlusCircle,
  CheckCircle2,
  RefreshCw,
  X,
  Settings
} from 'lucide-react';
import { db } from '../firebase';
import { doc, updateDoc } from 'firebase/firestore';
import { createReservationId, persistReservation } from '../lib/reservationFirestore';
import { User } from 'firebase/auth';
import { Company, Reservation, AppView, CompanyInfo } from '../types';
import ReservationCard from './ReservationCard';
import CustomDatePickerModal from './CustomDatePickerModal';
import TimePickerModal from './TimePickerModal';
import { getCalculatePrice, checkIsNightSurcharge, mergePartnerPricing, getParkingDayCount } from '../utils/pricing';
import { getKSTDateTimeLocalString } from '../utils/kstDate';
import { formatPartnerDisplayName } from '../utils/companyDisplay';
import { persistReservationStores } from '../utils/reservationScope';
import { getOperatorIntakeCompanyOptions } from '../utils/operatorHierarchy';

function cn(...classes: (string | boolean | undefined)[]) {
  return classes.filter(Boolean).join(' ');
}

import { airlineSelectOptions, DEFAULT_AIRLINES } from '../utils/flightFields';

const AIRLINES = [...DEFAULT_AIRLINES];

function isT2Route(departure: 'T1' | 'T2', arrival: 'T1' | 'T2') {
  return departure === 'T2' || arrival === 'T2';
}

import {
  bookingSourceBadgeClass,
  bookingSourceLabel,
  isAirpickB2CBooking,
  resolveBookingSourceFromReservation,
} from '../utils/bookingSource';

interface SearchReceptionViewProps {
  currentView: AppView;
  onNavigate: (view: AppView) => void;
  reservations: Reservation[];
  companies: Company[];
  currentCompanyId: string;
  companyInfo: CompanyInfo;
  isEmployee: boolean;
  employeeName: string;
  employeeRole?: 'admin' | 'driver';
  isSuperAdmin: boolean;
  user: User | null;
  blockedDates?: string[];
  receptionSubMode: 'search' | 'new_contract';
  setReceptionSubMode: (mode: 'search' | 'new_contract') => void;
  onUpdateReservations: React.Dispatch<React.SetStateAction<Reservation[]>>;
  
  // Handlers required by ReservationCard
  isAdminModeActive: boolean;
  setAdminEditingReservationId: (id: string | null) => void;
  handleUpdateValetStatus: (id: string, status: any, extra?: any) => void;
  getKSTDateTimeString: () => string;
  setScratchModalTargetId: (id: string | null) => void;
  setUploadedSpots: (spots: any) => void;
  setSelectedParkingSpace: (space: string) => void;
  operatorCompanyIds?: string[];
  showCompanyLabel?: boolean;
}

export default function SearchReceptionView({
  currentView,
  onNavigate,
  reservations,
  companies,
  currentCompanyId,
  companyInfo,
  isEmployee,
  employeeName,
  employeeRole = 'driver',
  isSuperAdmin,
  user,
  blockedDates = [],
  receptionSubMode,
  setReceptionSubMode,
  onUpdateReservations,
  isAdminModeActive,
  setAdminEditingReservationId,
  handleUpdateValetStatus,
  getKSTDateTimeString,
  setScratchModalTargetId,
  setUploadedSpots,
  setSelectedParkingSpace,
  operatorCompanyIds = [],
  showCompanyLabel = false,
}: SearchReceptionViewProps) {
  // Search input state
  const [receptionSearchText, setReceptionSearchText] = useState('');

  // Editing state for searched reservation inside local modal
  const [editingSearchedRes, setEditingSearchedRes] = useState<Reservation | null>(null);
  const [editSearchedUserName, setEditSearchedUserName] = useState('');
  const [editSearchedPhone, setEditSearchedPhone] = useState('');
  const [editSearchedCarModel, setEditSearchedCarModel] = useState('');
  const [editSearchedCarNumber, setEditSearchedCarNumber] = useState('');
  const [editSearchedDepartureDate, setEditSearchedDepartureDate] = useState('');
  const [editSearchedDepartureTime, setEditSearchedDepartureTime] = useState('');
  const [editSearchedDepartureTerminal, setEditSearchedDepartureTerminal] = useState<'T1' | 'T2'>('T1');
  const [editSearchedArrivalDate, setEditSearchedArrivalDate] = useState('');
  const [editSearchedArrivalTime, setEditSearchedArrivalTime] = useState('');
  const [editSearchedArrivalTerminal, setEditSearchedArrivalTerminal] = useState<'T1' | 'T2'>('T2');
  const [editSearchedIsIndoor, setEditSearchedIsIndoor] = useState(true);
  const [editSearchedDepartureAirline, setEditSearchedDepartureAirline] = useState('');
  const [editSearchedDepartureFlight, setEditSearchedDepartureFlight] = useState('');
  const [editSearchedArrivalAirline, setEditSearchedArrivalAirline] = useState('');
  const [editSearchedArrivalFlight, setEditSearchedArrivalFlight] = useState('');
  const [editSearchedDestination, setEditSearchedDestination] = useState('');
  const [editSearchedCustomerNotes, setEditSearchedCustomerNotes] = useState('');
  const [editSearchedReservationPassword, setEditSearchedReservationPassword] = useState('');
  // New Contract Intake Form states
  const [selectedCompanyId, setSelectedCompanyId] = useState('');

  const intakeCompanyOptions = useMemo(
    () => getOperatorIntakeCompanyOptions(currentCompanyId, companies),
    [currentCompanyId, companies]
  );

  useEffect(() => {
    if (intakeCompanyOptions.length > 1) {
      setSelectedCompanyId((prev) =>
        prev && intakeCompanyOptions.some((o) => o.id === prev) ? prev : currentCompanyId
      );
    } else {
      setSelectedCompanyId('');
    }
  }, [intakeCompanyOptions, currentCompanyId, receptionSubMode]);
  const [userName, setUserName] = useState('');
  const [carModel, setCarModel] = useState('');
  const [carNumber, setCarNumber] = useState('');
  const [phone, setPhone] = useState('');
  const [isIndoor, setIsIndoor] = useState<boolean>(true);
  const [isSubmittingBooking, setIsSubmittingBooking] = useState(false);
  
  const [intakeStartDate, setIntakeStartDate] = useState<string>(() => getKSTDateTimeLocalString(0));
  const [intakeEndDate, setIntakeEndDate] = useState<string>(() => getKSTDateTimeLocalString(3 * 24 * 60 * 60 * 1000));
  
  // Terminals — 홈페이지와 동일하게 출국/입국 분리
  const [departureTerminal, setDepartureTerminal] = useState<'T1' | 'T2'>('T1');
  const [arrivalTerminal, setArrivalTerminal] = useState<'T1' | 'T2'>('T1');
  const [departureAirline, setDepartureAirline] = useState('');
  const [departureFlight, setDepartureFlight] = useState('');
  const [arrivalAirline, setArrivalAirline] = useState('');
  const [arrivalFlight, setArrivalFlight] = useState('');
  const [destination, setDestination] = useState('');
  const [customerNotes, setCustomerNotes] = useState('');
  const [reservationPassword, setReservationPassword] = useState('');
  // Date and Time picker control states
  const [datePickerTarget, setDatePickerTarget] = useState<'intakeStart' | 'intakeEnd' | 'editSearchedDeparture' | 'editSearchedArrival' | null>(null);
  const [timePickerTarget, setTimePickerTarget] = useState<'intakeStart' | 'intakeEnd' | 'editDeparture' | 'editArrival' | null>(null);

  // Date / Time picker selections
  const handleDatePickerSelect = (selectedDateStr: string) => {
    if (datePickerTarget === 'intakeStart') {
      const activeBlocked = getActiveBlockedDates();
      if (activeBlocked.includes(selectedDateStr)) {
        alert(`[알림] 선택하신 입고일(${selectedDateStr})은 예약 차단(마감)된 날짜입니다. 접수 등록 전 유의하여 주십시오.`);
      }
      const timePart = intakeStartDate ? intakeStartDate.substring(11, 16) : '12:00';
      setIntakeStartDate(`${selectedDateStr}T${timePart}`);
    } else if (datePickerTarget === 'intakeEnd') {
      const activeBlocked = getActiveBlockedDates();
      if (activeBlocked.includes(selectedDateStr)) {
        alert(`[알림] 선택하신 출고일(${selectedDateStr})은 예약 차단(마감)된 날짜입니다. 접수 등록 전 유의하여 주십시오.`);
      }
      const timePart = intakeEndDate ? intakeEndDate.substring(11, 16) : '12:00';
      setIntakeEndDate(`${selectedDateStr}T${timePart}`);
    } else if (datePickerTarget === 'editSearchedDeparture') {
      setEditSearchedDepartureDate(selectedDateStr);
    } else if (datePickerTarget === 'editSearchedArrival') {
      setEditSearchedArrivalDate(selectedDateStr);
    }
    setDatePickerTarget(null);
  };

  const handleTimePickerSelect = (timeStr: string) => {
    if (timePickerTarget === 'intakeStart') {
      const datePart = intakeStartDate ? intakeStartDate.substring(0, 10) : new Date().toISOString().split('T')[0];
      setIntakeStartDate(`${datePart}T${timeStr}`);
    } else if (timePickerTarget === 'intakeEnd') {
      const datePart = intakeEndDate ? intakeEndDate.substring(0, 10) : new Date().toISOString().split('T')[0];
      setIntakeEndDate(`${datePart}T${timeStr}`);
    } else if (timePickerTarget === 'editDeparture') {
      setEditSearchedDepartureTime(timeStr);
    } else if (timePickerTarget === 'editArrival') {
      setEditSearchedArrivalTime(timeStr);
    }
    setTimePickerTarget(null);
  };

  const getDatePickerValue = () => {
    if (datePickerTarget === 'intakeStart') {
      return intakeStartDate ? intakeStartDate.substring(0, 10) : '';
    } else if (datePickerTarget === 'intakeEnd') {
      return intakeEndDate ? intakeEndDate.substring(0, 10) : '';
    } else if (datePickerTarget === 'editSearchedDeparture') {
      return editSearchedDepartureDate || '';
    } else if (datePickerTarget === 'editSearchedArrival') {
      return editSearchedArrivalDate || '';
    }
    return '';
  };

  const getTimePickerValue = () => {
    if (timePickerTarget === 'intakeStart') {
      return intakeStartDate ? intakeStartDate.substring(11, 16) : '';
    } else if (timePickerTarget === 'intakeEnd') {
      return intakeEndDate ? intakeEndDate.substring(11, 16) : '';
    } else if (timePickerTarget === 'editDeparture') {
      return editSearchedDepartureTime || '';
    } else if (timePickerTarget === 'editArrival') {
      return editSearchedArrivalTime || '';
    }
    return '';
  };

  // Extract active blocked dates for current company selection (companies/{id}.blockedDates)
  const getActiveBlockedDates = (): string[] => {
    const activeCompId = selectedCompanyId || currentCompanyId || 'wawa';
    const fromCompany = companies.find((c) => c.id === activeCompId);
    if (fromCompany && Array.isArray(fromCompany.blockedDates)) {
      return fromCompany.blockedDates;
    }
    if (activeCompId === currentCompanyId) {
      return blockedDates;
    }
    return [];
  };

  // Submit Driver Intake Registration
  const handleCreateIntakeBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmittingBooking(true);
    
    const activeCompId = selectedCompanyId || currentCompanyId || 'wawa';
    let partnerObj = companies.find(c => c.id === activeCompId);
    if (!partnerObj) {
      try {
        const savedString = window.localStorage.getItem('companies');
        if (savedString) {
          const parsed = JSON.parse(savedString);
          if (Array.isArray(parsed)) {
            partnerObj = parsed.find(c => c.id === activeCompId);
          }
        }
      } catch (_) {}
    }

    let partner: any = mergePartnerPricing({
      id: activeCompId,
      name: partnerObj?.name || formatPartnerDisplayName(companyInfo.name, activeCompId) || activeCompId,
      isOpen: true,
      outdoorExtraPrice: 5000,
      outdoorBasePrice: 10000,
      indoorExtraPrice: 10000,
      indoorBasePrice: 20000,
      base_price: 10000,
      extra_day_price: 5000,
      base_days: 1,
      outdoorBaseDays: 1,
      indoorBaseDays: 1,
      surchargeStartTime: '20:00',
      surchargeEndTime: '04:00',
      surchargePrice: 10000,
      t2Surcharge: 0,
      peakStartTime: '',
      peakEndTime: '',
      peakSurcharge: 0,
      ...(partnerObj || {})
    }, activeCompId);

    if (companyInfo && companyInfo.id === activeCompId) {
      const ci = companyInfo as any;
      if (ci.surchargePrice !== undefined) partner.surchargePrice = Number(ci.surchargePrice) ?? partner.surchargePrice;
      if (ci.surchargeStartTime) partner.surchargeStartTime = ci.surchargeStartTime;
      if (ci.surchargeEndTime) partner.surchargeEndTime = ci.surchargeEndTime;
      if (ci.indoorBasePrice !== undefined) partner.indoorBasePrice = Number(ci.indoorBasePrice) ?? partner.indoorBasePrice;
      if (ci.indoorBaseDays !== undefined) partner.indoorBaseDays = Number(ci.indoorBaseDays) ?? partner.indoorBaseDays;
      if (ci.indoorExtraPrice !== undefined) partner.indoorExtraPrice = Number(ci.indoorExtraPrice) ?? partner.indoorExtraPrice;
      if (ci.outdoorBasePrice !== undefined) partner.outdoorBasePrice = Number(ci.outdoorBasePrice) ?? partner.outdoorBasePrice;
      if (ci.outdoorBaseDays !== undefined) partner.outdoorBaseDays = Number(ci.outdoorBaseDays) ?? partner.outdoorBaseDays;
      if (ci.outdoorExtraPrice !== undefined) partner.outdoorExtraPrice = Number(ci.outdoorExtraPrice) ?? partner.outdoorExtraPrice;
      partner = mergePartnerPricing(partner, activeCompId);
    }

    const depDateStr = intakeStartDate.substring(0, 10);
    const depTimeStr = intakeStartDate.substring(11, 16);
    const arrDateStr = intakeEndDate.substring(0, 10);
    const arrTimeStr = intakeEndDate.substring(11, 16);

    const getDatesInRange = (startStr: string, endStr: string): string[] => {
      const dates: string[] = [];
      const start = new Date(startStr);
      const end = new Date(endStr);
      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        return [startStr];
      }
      start.setHours(0, 0, 0, 0);
      end.setHours(0, 0, 0, 0);
      const cur = new Date(start);
      while (cur <= end) {
        const y = cur.getFullYear();
        const m = String(cur.getMonth() + 1).padStart(2, '0');
        const d = String(cur.getDate()).padStart(2, '0');
        dates.push(`${y}-${m}-${d}`);
        cur.setDate(cur.getDate() + 1);
      }
      return dates;
    };

    const requestedDates = getDatesInRange(depDateStr, arrDateStr);
    const activeBlocked = getActiveBlockedDates();

    const foundBlockedDates = requestedDates.filter(d => activeBlocked.includes(d));
    if (foundBlockedDates.length > 0) {
      alert(`❌ 선택하신 기간(${depDateStr} ~ ${arrDateStr})에 예약이 마감된 날짜가 포함되어 있어 현장 접수가 불가능합니다.`);
      setIsSubmittingBooking(false);
      return;
    }

    if (partnerObj && partnerObj.isOpen === false) {
      alert('❌ 전체 예약이 마감된 상태입니다. 앱 예약 마감 설정 또는 홈페이지 마감과 동일하게 적용됩니다.');
      setIsSubmittingBooking(false);
      return;
    }

    const isT2 = isT2Route(departureTerminal, arrivalTerminal);
    const totalPrice = getCalculatePrice(partner, intakeStartDate, intakeEndDate, isIndoor, isT2);
    const id = createReservationId();
    const targetUserId = user ? user.uid : 'anonymous_guest';
    const randReceipt = `177020${Math.floor(1000 + Math.random() * 9000)}_BEIAKF`;

    const bookingPayload: Reservation = {
      userId: targetUserId,
      companyId: partner.id,
      companyName: partner.name,
      userName: userName.trim() || '테스트고객',
      carModel: carModel.trim() || '제네시스 GV80',
      carNumber: carNumber.trim() || '12가 3456',
      phone: phone.trim() || '010-1234-5678',
      departureDate: depDateStr,
      departureTime: depTimeStr,
      departureTerminal,
      arrivalDate: arrDateStr,
      arrivalTime: arrTimeStr,
      arrivalTerminal,
      totalPrice,
      status: 'pending' as const,
      createdAt: new Date().toISOString(),
      createdBy: isEmployee ? employeeName : (isSuperAdmin ? '본사 마스터(최고관리자)' : '업체 마스터'),
      paymentMethod: 'unpaid',
      receiptCode: randReceipt,
      scratchPhotos: { synced: false },
      isIndoor,
      startDate: intakeStartDate.replace('T', ' '),
      endDate: intakeEndDate.replace('T', ' '),
      departureAirline: departureAirline.trim() || undefined,
      departureFlight: departureFlight.trim() || undefined,
      arrivalAirline: arrivalAirline.trim() || undefined,
      arrivalFlight: arrivalFlight.trim() || undefined,
      destination: destination.trim() || undefined,
      customerNotes: customerNotes.trim() || undefined,
      userRequest: customerNotes.trim() || undefined,
      reservationPassword: reservationPassword.trim() || undefined,
    };

    try {
      await persistReservation(id, bookingPayload);
      alert(`차량 번호 ${bookingPayload.carNumber} 현장 접수가 완료됐습니다.`);
    } catch (err: any) {
      onUpdateReservations(prev => {
        const updated = [{ id, ...bookingPayload }, ...prev];
        persistReservationStores(window.localStorage, updated, currentCompanyId, {
          cacheFirestore: true,
          operatorCompanyIds,
        });
        return updated;
      });
      alert(`차량 번호 ${bookingPayload.carNumber} 접수가 이 폰에 저장됐습니다.\n\n인터넷 연결을 확인한 뒤, 목록에 안 보이면 한 번 더 접수해 주세요.`);
    } finally {
      setIsSubmittingBooking(false);
      onNavigate('timeline');
      setUserName('');
      setCarModel('');
      setCarNumber('');
      setPhone('');
      setReceptionSearchText('');
      setIsIndoor(true);
      setIntakeStartDate(getKSTDateTimeLocalString(0));
      setIntakeEndDate(getKSTDateTimeLocalString(3 * 24 * 60 * 60 * 1000));
      setDepartureTerminal('T1');
      setArrivalTerminal('T1');
      setDepartureAirline('');
      setDepartureFlight('');
      setArrivalAirline('');
      setArrivalFlight('');
      setDestination('');
      setCustomerNotes('');
      setReservationPassword('');
    }
  };

  // Save edit changes for searched reservation from local modal
  const handleSaveSearchedResEdit = async () => {
    if (!editingSearchedRes) return;

    const activeCompId = selectedCompanyId || currentCompanyId || 'wawa';
    let partnerObj = companies.find(c => c.id === activeCompId);
    const partner: any = {
      id: activeCompId,
      name: companyInfo.name,
      base_price: 15000,
      extra_day_price: 5000,
      ...(partnerObj || {})
    };

    const depFullStr = `${editSearchedDepartureDate}T${editSearchedDepartureTime}`;
    const arrFullStr = `${editSearchedArrivalDate}T${editSearchedArrivalTime}`;
    const isT2 = isT2Route(editSearchedDepartureTerminal, editSearchedArrivalTerminal);
    const computedPrice = getCalculatePrice(partner, depFullStr, arrFullStr, editSearchedIsIndoor, isT2);

    const updatePayload: Partial<Reservation> = {
      userName: editSearchedUserName.trim(),
      phone: editSearchedPhone.trim(),
      carModel: editSearchedCarModel.trim(),
      carNumber: editSearchedCarNumber.trim(),
      departureDate: editSearchedDepartureDate,
      departureTime: editSearchedDepartureTime,
      departureTerminal: editSearchedDepartureTerminal,
      arrivalDate: editSearchedArrivalDate,
      arrivalTime: editSearchedArrivalTime,
      arrivalTerminal: editSearchedArrivalTerminal,
      isIndoor: editSearchedIsIndoor,
      startDate: depFullStr.replace('T', ' '),
      endDate: arrFullStr.replace('T', ' '),
      totalPrice: computedPrice,
      departureAirline: editSearchedDepartureAirline.trim() || undefined,
      departureFlight: editSearchedDepartureFlight.trim() || undefined,
      arrivalAirline: editSearchedArrivalAirline.trim() || undefined,
      arrivalFlight: editSearchedArrivalFlight.trim() || undefined,
      destination: editSearchedDestination.trim() || undefined,
      customerNotes: editSearchedCustomerNotes.trim() || undefined,
      userRequest: editSearchedCustomerNotes.trim() || undefined,
      reservationPassword: editSearchedReservationPassword.trim() || undefined,
      updatedAt: new Date().toISOString(),
      updatedBy: isEmployee ? employeeName : (isSuperAdmin ? '본사 마스터(최고관리자)' : '업체 마스터')
    };

    try {
      await updateDoc(doc(db, 'reservations', editingSearchedRes.id || ''), updatePayload);
      alert('예약 정보가 수정됐습니다.');
    } catch (_) {
      onUpdateReservations(prev => {
        const updated = prev.map(r => r.id === editingSearchedRes.id ? { ...r, ...updatePayload } : r);
        persistReservationStores(window.localStorage, updated, activeCompId, { cacheFirestore: true });
        return updated;
      });
      alert('수정 내용이 이 폰에 저장됐습니다.\n\n인터넷 연결 후 다시 저장해 주세요.');
    } finally {
      setEditingSearchedRes(null);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3.5">
        <button 
          onClick={() => onNavigate('timeline')}
          className="p-2 bg-neutral-900 border border-neutral-800 rounded-2xl text-zinc-400 hover:text-white transition-all cursor-pointer"
        >
          <ArrowLeft size={16} />
        </button>
        <div>
          <h2 className="text-sm font-black tracking-tight text-white">
            {receptionSubMode === 'search' ? '🔍 차량 검색 및 정보 수정' : '신규 대행 위탁 수납계약서'}
          </h2>
          <p className="text-[11px] text-zinc-500 font-mono uppercase font-black">
            {receptionSubMode === 'search' ? 'Search & Edit Reservation' : 'New Intake Agreement'}
          </p>
        </div>
      </div>

      {/* Sub-mode Tab selectors */}
      <div className="grid grid-cols-2 gap-2 p-1 bg-neutral-900 border border-neutral-850 rounded-2xl">
        <button
          type="button"
          onClick={() => {
            setReceptionSubMode('search');
            setReceptionSearchText('');
          }}
          className={cn(
            "py-2 text-[13px] font-black rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer",
            receptionSubMode === 'search' ? "bg-amber-500 text-neutral-950 font-black shadow-sm" : "text-zinc-400 hover:text-white"
          )}
        >
          <Search size={12} />
          <span>차량 검색 및 예외 처리</span>
        </button>
        <button
          type="button"
          onClick={() => setReceptionSubMode('new_contract')}
          className={cn(
            "py-2 text-[13px] font-black rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer",
            receptionSubMode === 'new_contract' ? "bg-amber-500 text-neutral-950 font-black shadow-sm" : "text-zinc-400 hover:text-white"
          )}
        >
          <FileText size={12} />
          <span>신규 수납 계약서 작성</span>
        </button>
      </div>

      {/* 1. 차량 검색 모듈 */}
      {receptionSubMode === 'search' && (
        <div className="space-y-4">
          <div className="space-y-3">
            <div className="relative">
              <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500" />
              <input 
                type="text"
                placeholder="고객명, 예약번호, 또는 차량 뒷자리로 검색..."
                value={receptionSearchText}
                onChange={e => setReceptionSearchText(e.target.value)}
                className="w-full pl-10 pr-4 py-3 bg-neutral-900 border border-neutral-850 rounded-2xl text-xs sm:text-xs font-bold text-white focus:outline-none focus:border-amber-500 placeholder-zinc-650"
                id="reception-search-input"
              />
            </div>

            <div className="flex flex-wrap gap-1.5 p-1 bg-neutral-900/40 rounded-xl">
              {['321무', '45오', '8126', '그랜저', 'GV80'].map((chip) => (
                <button
                  key={chip}
                  onClick={() => setReceptionSearchText(chip)}
                  className="text-[11.5px] font-bold text-zinc-400 hover:text-white bg-neutral-900 border border-neutral-850 px-2 py-1 rounded-lg cursor-pointer"
                >
                  +{chip}
                </button>
              ))}
            </div>
          </div>

          {/* Search Results */}
          <div className="space-y-4 pt-1">
            {(() => {
              const normStr = receptionSearchText.trim().toLowerCase();
              if (!normStr) {
                return (
                  <div className="bg-neutral-900/30 p-10 rounded-3xl border border-neutral-850/50 text-center space-y-2">
                    <Search size={22} className="mx-auto text-zinc-600 mb-1" />
                    <p className="text-xs text-zinc-400 font-bold">검색어를 입력해 주세요.</p>
                    <p className="text-[12px] text-zinc-650">입차 수납 수정 대상 차량의 이름이나 차량번호 뒤 4자리를 기입하십시오.</p>
                  </div>
                );
              }

              const matchedList = reservations.filter(res => {
                return (
                  res.userName?.toLowerCase().includes(normStr) ||
                  res.carNumber?.toLowerCase().includes(normStr) ||
                  res.phone?.toLowerCase().includes(normStr) ||
                  res.carModel?.toLowerCase().includes(normStr) ||
                  res.receiptCode?.toLowerCase().includes(normStr)
                );
              });

              if (matchedList.length === 0) {
                return (
                  <div className="bg-neutral-900/50 p-10 rounded-3xl border border-neutral-850 text-center space-y-2">
                    <Search size={22} className="mx-auto text-zinc-500 mb-1" />
                    <p className="text-xs text-white font-black">검색된 일치 차량 정보가 존재하지 않습니다.</p>
                    <p className="text-[12px] text-zinc-500">고객명, 정확한 차량번호 또는 연락처 뒷자리를 다시 확인해 주십시오.</p>
                  </div>
                );
              }

              return (
                <div className="space-y-3.5">
                  <div className="text-[12px] font-black text-amber-500 px-1 uppercase tracking-wider">
                    일치 차량 ({matchedList.length}건)
                  </div>
                  {matchedList.map((res, idx) => (
                    <ReservationCard 
                      key={`${res.id || ''}-${idx}`}
                      res={res}
                      idx={idx}
                      isAdminModeActive={isAdminModeActive}
                      setAdminEditingReservationId={setAdminEditingReservationId}
                      setDriverDetailRes={(target) => {
                        // Intercept to display driver-driven edit details modal inside search subview
                        setEditingSearchedRes(target);
                        setEditSearchedUserName(target.userName || '');
                        setEditSearchedPhone(target.phone || '');
                        setEditSearchedCarModel(target.carModel || '');
                        setEditSearchedCarNumber(target.carNumber || '');
                        setEditSearchedDepartureDate(target.departureDate || '');
                        setEditSearchedDepartureTime(target.departureTime || '');
                        setEditSearchedDepartureTerminal(target.departureTerminal || 'T1');
                        setEditSearchedArrivalDate(target.arrivalDate || '');
                        setEditSearchedArrivalTime(target.arrivalTime || '');
                        setEditSearchedArrivalTerminal(target.arrivalTerminal || 'T1');
                        setEditSearchedIsIndoor(target.isIndoor !== false);
                        setEditSearchedDepartureAirline(target.departureAirline || '');
                        setEditSearchedDepartureFlight(target.departureFlight || '');
                        setEditSearchedArrivalAirline(target.arrivalAirline || '');
                        setEditSearchedArrivalFlight(
                          target.arrivalFlight || (target as { inboundFlight?: string }).inboundFlight || ''
                        );
                        setEditSearchedDestination(target.destination || '');
                        setEditSearchedCustomerNotes(target.customerNotes || target.userRequest || '');
                        setEditSearchedReservationPassword(target.reservationPassword || '');
                      }}
                      handleUpdateValetStatus={handleUpdateValetStatus}
                      getKSTDateTimeString={getKSTDateTimeString}
                      setScratchModalTargetId={setScratchModalTargetId}
                      setUploadedSpots={setUploadedSpots}
                      setSelectedParkingSpace={setSelectedParkingSpace}
                      showCompanyLabel={showCompanyLabel}
                    />
                  ))}
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* 2. 신규 대행 위탁 수납계약서 양식 */}
      {receptionSubMode === 'new_contract' && (
        <form onSubmit={handleCreateIntakeBooking} className="bg-neutral-900 border border-neutral-850 rounded-3xl p-5 space-y-4 shadow-xl">
          <div className="flex items-center gap-2 border-b border-neutral-850 pb-2.5">
            <PlusCircle size={14} className="text-amber-500" />
            <span className="text-[13px] font-black text-white uppercase tracking-wider">신규 대행 위탁 현장 수납계약서</span>
          </div>

          {intakeCompanyOptions.length > 1 && (
            <div>
              <label className="text-[12px] block mb-1 font-black text-zinc-500">접수 업체 *</label>
              <select
                required
                value={selectedCompanyId || currentCompanyId}
                onChange={(e) => setSelectedCompanyId(e.target.value)}
                className="w-full px-3 py-2 bg-neutral-950 border border-neutral-850 rounded-xl text-zinc-100 outline-none focus:border-amber-500 text-xs font-bold"
              >
                {intakeCompanyOptions.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <label className="text-[12px] block mb-1 font-black text-zinc-500">인계고객 실명 *</label>
              <input 
                required
                type="text" 
                value={userName}
                onChange={e => setUserName(e.target.value)}
                placeholder="신하림"
                className="w-full px-3 py-2 bg-neutral-950 border border-neutral-850 rounded-xl text-zinc-100 outline-none focus:border-amber-500"
              />
            </div>
            
            <div>
              <label className="text-[12px] block mb-1 font-black text-zinc-500">연락처 번호 *</label>
              <input 
                required
                type="text" 
                value={phone}
                onChange={e => setPhone(e.target.value)}
                placeholder="010-6545-2464"
                className="w-full px-3 py-2 bg-neutral-950 border border-neutral-850 rounded-xl text-zinc-100 outline-none focus:border-amber-500 font-mono"
              />
            </div>

            <div>
              <label className="text-[12px] block mb-1 font-black text-zinc-500">차량 브랜드 지목 *</label>
              <input 
                required
                type="text" 
                value={carModel}
                onChange={e => setCarModel(e.target.value)}
                placeholder="예: 그랜저 IG"
                className="w-full px-3 py-2 bg-neutral-950 border border-neutral-850 rounded-xl text-zinc-100 outline-none focus:border-amber-500"
              />
            </div>
            
            <div>
              <label className="text-[12px] block mb-1 font-bold text-zinc-500">차량번호 플레이트 번호 *</label>
              <input 
                required
                type="text" 
                value={carNumber}
                onChange={e => setCarNumber(e.target.value)}
                placeholder="321무 2177"
                className="w-full px-3 py-2 bg-neutral-950 border border-neutral-850 rounded-xl text-amber-500/90 font-medium outline-none focus:border-amber-500 placeholder-amber-550/30"
              />
            </div>

            <div className="col-span-2 pt-2 border-t border-neutral-850 mt-1">
              <label className="text-[12px] block mb-1 font-bold text-zinc-500">주차 공간 선택 *</label>
              <div className="grid grid-cols-2 gap-2 p-1 bg-neutral-955 rounded-xl border border-neutral-850">
                <button 
                  type="button" 
                  onClick={() => setIsIndoor(true)}
                  className={cn(
                    "py-1.5 text-[12.5px] font-bold rounded-lg transition-all cursor-pointer", 
                    isIndoor ? "bg-amber-500/95 text-neutral-950 shadow-sm" : "text-zinc-500 hover:text-zinc-350"
                  )}
                  id="btn-parking-indoor"
                >
                  실내 주차
                </button>
                <button 
                  type="button" 
                  onClick={() => setIsIndoor(false)}
                  className={cn(
                    "py-1.5 text-[12.5px] font-bold rounded-lg transition-all cursor-pointer", 
                    !isIndoor ? "bg-amber-500/95 text-neutral-950 shadow-sm" : "text-zinc-500 hover:text-zinc-350"
                  )}
                  id="btn-parking-outdoor"
                >
                  실외 주차
                </button>
              </div>
            </div>

            <div className="col-span-2 pt-2 border-t border-neutral-850 mt-1 space-y-3">
              <label className="text-[12px] block font-bold text-zinc-500">출국 정보 (공항 도착 예정) *</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <span className="text-[11.5px] text-zinc-500 font-bold block mb-1">입고 예정일 (출국일)</span>
                  <div className="grid grid-cols-2 gap-2">
                    <div 
                      onClick={() => setDatePickerTarget('intakeStart')}
                      className="relative flex items-center bg-[#1C1C1E] border border-neutral-850 hover:border-neutral-700 hover:bg-neutral-900 active:scale-[0.98] rounded-xl px-2.5 h-[42px] transition-all duration-100 cursor-pointer select-none overflow-hidden"
                    >
                      <div className="flex items-center w-full justify-center pointer-events-none z-10 text-zinc-100">
                        <span className="text-[13px] font-bold">
                          {intakeStartDate ? intakeStartDate.substring(0, 10) : '날짜 선택'}
                        </span>
                      </div>
                    </div>

                    <div 
                      onClick={() => setTimePickerTarget('intakeStart')}
                      className="relative flex items-center bg-[#1C1C1E] border border-neutral-850 hover:border-[#FF9F0A] hover:bg-[#2C2C2E]/50 active:scale-[0.98] rounded-xl px-2.5 h-[42px] transition-all duration-100 cursor-pointer select-none overflow-hidden"
                    >
                      <div className="flex items-center w-full justify-center z-10 text-zinc-100">
                        <span className="text-[13px] font-bold text-[#FF9F0A]">
                          {intakeStartDate ? intakeStartDate.substring(11, 16) : '시간 선택'}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="mt-2">
                    <span className="text-[11px] text-zinc-500 font-bold block mb-1">출국 터미널</span>
                    <div className="grid grid-cols-2 gap-2 p-1 bg-neutral-950 rounded-xl border border-neutral-850">
                      <button type="button" onClick={() => setDepartureTerminal('T1')} className={cn("py-1.5 text-[12px] font-bold rounded-lg", departureTerminal === 'T1' ? "bg-amber-500/95 text-neutral-950" : "text-zinc-500")}>제1터미널 (T1)</button>
                      <button type="button" onClick={() => setDepartureTerminal('T2')} className={cn("py-1.5 text-[12px] font-bold rounded-lg", departureTerminal === 'T2' ? "bg-amber-500/95 text-neutral-950" : "text-zinc-500")}>제2터미널 (T2)</button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="col-span-2 pt-2 border-t border-neutral-850 space-y-3">
              <label className="text-[12px] block font-bold text-zinc-500">입국 정보 (비행기 착륙 예정) *</label>
              <div className="grid grid-cols-1 gap-3">
                <div>
                  <span className="text-[11.5px] text-zinc-500 font-bold block mb-1">출고 예정일 (입국일)</span>
                  <div className="grid grid-cols-2 gap-2">
                    <div 
                      onClick={() => setDatePickerTarget('intakeEnd')}
                      className="relative flex items-center bg-[#1C1C1E] border border-neutral-850 hover:border-neutral-700 hover:bg-neutral-900 active:scale-[0.98] rounded-xl px-2.5 h-[42px] transition-all duration-100 cursor-pointer select-none overflow-hidden"
                    >
                      <div className="flex items-center w-full justify-center pointer-events-none z-10 text-zinc-100">
                        <span className="text-[13px] font-bold">
                          {intakeEndDate ? intakeEndDate.substring(0, 10) : '날짜 선택'}
                        </span>
                      </div>
                    </div>

                    <div 
                      onClick={() => setTimePickerTarget('intakeEnd')}
                      className="relative flex items-center bg-[#1C1C1E] border border-neutral-850 hover:border-[#FF9F0A] hover:bg-[#2C2C2E]/50 active:scale-[0.98] rounded-xl px-2.5 h-[42px] transition-all duration-100 cursor-pointer select-none overflow-hidden"
                    >
                      <div className="flex items-center w-full justify-center z-10 text-zinc-100">
                        <span className="text-[13px] font-bold text-[#FF9F0A]">
                          {intakeEndDate ? intakeEndDate.substring(11, 16) : '시간 선택'}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="mt-2">
                    <span className="text-[11px] text-zinc-500 font-bold block mb-1">입국 터미널</span>
                    <div className="grid grid-cols-2 gap-2 p-1 bg-neutral-950 rounded-xl border border-neutral-850">
                      <button type="button" onClick={() => setArrivalTerminal('T1')} className={cn("py-1.5 text-[12px] font-bold rounded-lg", arrivalTerminal === 'T1' ? "bg-amber-500/95 text-neutral-950" : "text-zinc-500")}>제1터미널 (T1)</button>
                      <button type="button" onClick={() => setArrivalTerminal('T2')} className={cn("py-1.5 text-[12px] font-bold rounded-lg", arrivalTerminal === 'T2' ? "bg-amber-500/95 text-neutral-950" : "text-zinc-500")}>제2터미널 (T2)</button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="col-span-2 pt-2 border-t border-neutral-850 space-y-3">
              <label className="text-[12px] block font-bold text-zinc-500">항공편 · 여행 정보</label>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] text-zinc-500 font-bold block mb-1">출국 항공사</label>
                  <select value={departureAirline} onChange={(e) => setDepartureAirline(e.target.value)} className="w-full px-3 py-2 bg-neutral-950 border border-neutral-850 rounded-xl text-zinc-100 text-xs font-bold outline-none focus:border-amber-500">
                    <option value="">선택 안 함</option>
                    {airlineSelectOptions(departureAirline, AIRLINES).map((a) => (
                      <option key={a} value={a}>{a}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[11px] text-zinc-500 font-bold block mb-1">출국 항공편명</label>
                  <input type="text" value={departureFlight} onChange={(e) => setDepartureFlight(e.target.value)} placeholder="예: KE101" className="w-full px-3 py-2 bg-neutral-950 border border-neutral-850 rounded-xl text-zinc-100 text-xs font-bold outline-none focus:border-amber-500 font-mono" />
                </div>
                <div>
                  <label className="text-[11px] text-zinc-500 font-bold block mb-1">입국 항공사</label>
                  <select value={arrivalAirline} onChange={(e) => setArrivalAirline(e.target.value)} className="w-full px-3 py-2 bg-neutral-950 border border-neutral-850 rounded-xl text-zinc-100 text-xs font-bold outline-none focus:border-amber-500">
                    <option value="">선택 안 함</option>
                    {airlineSelectOptions(arrivalAirline, AIRLINES).map((a) => (
                      <option key={a} value={a}>{a}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[11px] text-zinc-500 font-bold block mb-1">입국 항공편명</label>
                  <input type="text" value={arrivalFlight} onChange={(e) => setArrivalFlight(e.target.value)} placeholder="예: KE102" className="w-full px-3 py-2 bg-neutral-950 border border-neutral-850 rounded-xl text-zinc-100 text-xs font-bold outline-none focus:border-amber-500 font-mono" />
                </div>
                <div className="col-span-2">
                  <label className="text-[11px] text-zinc-500 font-bold block mb-1">여행지</label>
                  <input type="text" value={destination} onChange={(e) => setDestination(e.target.value)} placeholder="예: 오사카, 싱가포르" className="w-full px-3 py-2 bg-neutral-950 border border-neutral-850 rounded-xl text-zinc-100 text-xs font-bold outline-none focus:border-amber-500" />
                </div>
                <div className="col-span-2">
                  <label className="text-[11px] text-zinc-500 font-bold block mb-1">기타 요청사항</label>
                  <input type="text" value={customerNotes} onChange={(e) => setCustomerNotes(e.target.value)} placeholder="고객 요청 메모" className="w-full px-3 py-2 bg-neutral-950 border border-neutral-850 rounded-xl text-zinc-100 text-xs font-bold outline-none focus:border-amber-500" />
                </div>
                <div>
                  <label className="text-[11px] text-zinc-500 font-bold block mb-1">예약 비밀번호 (취소용)</label>
                  <input type="text" value={reservationPassword} onChange={(e) => setReservationPassword(e.target.value)} placeholder="4자리 숫자" maxLength={8} className="w-full px-3 py-2 bg-neutral-950 border border-neutral-850 rounded-xl text-zinc-100 text-xs font-bold outline-none focus:border-amber-500 font-mono" />
                </div>
              </div>
            </div>
          </div>

          {/* Real-time fare display statement */}
          {(selectedCompanyId || currentCompanyId) && (() => {
            const activeCompId = selectedCompanyId || currentCompanyId || 'wawa';
            let partnerObj = companies.find(c => c.id === activeCompId);
            if (!partnerObj) {
              try {
                const savedString = window.localStorage.getItem('companies');
                if (savedString) {
                  const parsed = JSON.parse(savedString);
                  if (Array.isArray(parsed)) {
                    partnerObj = parsed.find(c => c.id === activeCompId);
                  }
                }
              } catch (_) {}
            }

            let partner: any = mergePartnerPricing({
              id: activeCompId,
              name: formatPartnerDisplayName(companyInfo.name, activeCompId) || activeCompId,
              isOpen: true,
              outdoorExtraPrice: 5000,
              outdoorBasePrice: 10000,
              indoorExtraPrice: 10000,
              indoorBasePrice: 20000,
              base_price: 10000,
              extra_day_price: 5000,
              base_days: 1,
              outdoorBaseDays: 1,
              indoorBaseDays: 1,
              surchargeStartTime: '20:00',
              surchargeEndTime: '04:00',
              surchargePrice: 10000,
              t2Surcharge: 0,
              peakStartTime: '',
              peakEndTime: '',
              peakSurcharge: 0,
              ...(partnerObj || {})
            }, activeCompId);

            if (companyInfo && companyInfo.id === activeCompId) {
              const ci = companyInfo as any;
              if (ci.surchargePrice !== undefined) partner.surchargePrice = Number(ci.surchargePrice) ?? partner.surchargePrice;
              if (ci.surchargeStartTime) partner.surchargeStartTime = ci.surchargeStartTime;
              if (ci.surchargeEndTime) partner.surchargeEndTime = ci.surchargeEndTime;
              if (ci.indoorBasePrice !== undefined) partner.indoorBasePrice = Number(ci.indoorBasePrice) ?? partner.indoorBasePrice;
              if (ci.indoorBaseDays !== undefined) partner.indoorBaseDays = Number(ci.indoorBaseDays) ?? partner.indoorBaseDays;
              if (ci.indoorExtraPrice !== undefined) partner.indoorExtraPrice = Number(ci.indoorExtraPrice) ?? partner.indoorExtraPrice;
              if (ci.outdoorBasePrice !== undefined) partner.outdoorBasePrice = Number(ci.outdoorBasePrice) ?? partner.outdoorBasePrice;
              if (ci.outdoorBaseDays !== undefined) partner.outdoorBaseDays = Number(ci.outdoorBaseDays) ?? partner.outdoorBaseDays;
              if (ci.outdoorExtraPrice !== undefined) partner.outdoorExtraPrice = Number(ci.outdoorExtraPrice) ?? partner.outdoorExtraPrice;
              partner = mergePartnerPricing(partner, activeCompId);
            }
            
            const diffDays = getParkingDayCount(intakeStartDate, intakeEndDate);

            const isT2 = isT2Route(departureTerminal, arrivalTerminal);
            const baseDays = isIndoor ? (Number(partner.indoorBaseDays) || 1) : (Number(partner.outdoorBaseDays) || 1);
            const basePrice = isIndoor ? (Number(partner.indoorBasePrice) ?? 20000) : (Number(partner.outdoorBasePrice) ?? 10000);
            const extraPrice = isIndoor ? (Number(partner.indoorExtraPrice) ?? 10000) : (Number(partner.outdoorExtraPrice) ?? 5000);

            const t2Charge = isT2 ? (Number(partner.t2Surcharge) || 0) : 0;
            const finalTotalPrice = getCalculatePrice(partner, intakeStartDate, intakeEndDate, isIndoor, isT2);

            return (
              <div className="col-span-2 p-4 bg-[#141416] border border-neutral-850 rounded-2xl space-y-2 text-xs text-zinc-350 font-sans">
                <div className="flex items-center justify-between border-b border-neutral-850 pb-2">
                  <span className="font-black text-amber-500 text-[12px] uppercase tracking-wider">🧮 실시간 자동 요금 명세표</span>
                  <span className="text-[12px] text-zinc-500 font-mono">총 {diffDays}일 주차 기간</span>
                </div>
                <div className="space-y-1 text-[12.5px]">
                  <div className="flex justify-between font-bold">
                    <span>선택 공간 ({isIndoor ? '실내' : '실외'} 주차)</span>
                    <span className="text-zinc-200 font-mono">{basePrice.toLocaleString()}원 (기본 {baseDays}일)</span>
                  </div>
                  {diffDays > baseDays && (
                    <div className="flex justify-between font-bold">
                      <span>초과일수 추가금 (+{diffDays - baseDays}일)</span>
                      <span className="text-zinc-200 font-mono">{((diffDays - baseDays) * extraPrice).toLocaleString()}원</span>
                    </div>
                  )}
                  {(() => {
                    const surPrice = Number(partner.surchargePrice) || 0;
                    const surStart = partner.surchargeStartTime || '19:00';
                    const surEnd = partner.surchargeEndTime || '05:00';
                    
                    const isStartNight = checkIsNightSurcharge(intakeStartDate, surStart, surEnd);
                    const isEndNight = checkIsNightSurcharge(intakeEndDate, surStart, surEnd);
                    
                    let totalSurcharge = 0;
                    const details: string[] = [];
                    if (isStartNight) {
                      totalSurcharge += surPrice;
                      details.push(`입차 할증 +${surPrice.toLocaleString()}원`);
                    }
                    if (isEndNight) {
                      totalSurcharge += surPrice;
                      details.push(`출차 할증 +${surPrice.toLocaleString()}원`);
                    }
                    
                    return (
                      <div className="flex justify-between items-center text-[12.5px] font-bold">
                        <div className="flex flex-col">
                          <span>야간/새벽 할증 추가금 {details.length > 0 && <span className="text-[11px] text-zinc-500 font-normal">({details.join(', ')})</span>}</span>
                        </div>
                        <span className={cn("font-mono", totalSurcharge > 0 ? "text-amber-500 font-black" : "text-zinc-500")}>
                          {totalSurcharge > 0 ? `+${totalSurcharge.toLocaleString()}원` : '0원'}
                        </span>
                      </div>
                    );
                  })()}
                  <div className="flex justify-between font-semibold">
                    <span>제2여객터미널(T2) 이동 추가요금</span>
                    <span className={cn("font-mono", isT2 ? "text-amber-400" : "text-zinc-500")}>
                      {isT2 ? `+${t2Charge.toLocaleString()}원` : '0원'}
                    </span>
                  </div>
                </div>
                <div className="flex justify-between items-center pt-2 border-t border-dashed border-neutral-800 text-sm mt-1">
                  <span className="font-extrabold text-white">최종 주차 요금 합계</span>
                  <span className="font-black text-amber-500 text-[15px] font-mono">{finalTotalPrice.toLocaleString()}원</span>
                </div>
              </div>
            );
          })()}

          {/* Submit Action */}
          <div className="pt-2">
            <button
              type="submit"
              disabled={isSubmittingBooking}
              className="w-full py-3.5 bg-amber-500 text-neutral-950 hover:bg-amber-400 rounded-2xl text-xs font-black transition-all flex items-center justify-center gap-1.5 cursor-pointer"
            >
              {isSubmittingBooking ? <RefreshCw className="animate-spin" size={14} /> : <CheckCircle2 size={14} />}
              <span>현장접수하기</span>
            </button>
          </div>
        </form>
      )}

      {/* Date and Time Picker Modals inside local state */}
      {datePickerTarget && (
        <CustomDatePickerModal
          isOpen={!!datePickerTarget}
          onClose={() => setDatePickerTarget(null)}
          initialValue={getDatePickerValue()}
          onSelect={handleDatePickerSelect}
          title={
            datePickerTarget === 'intakeStart'
              ? '입고 날짜 선택'
              : datePickerTarget === 'intakeEnd'
              ? '반납 날짜 선택'
              : datePickerTarget === 'editSearchedDeparture'
              ? '입고(출발) 날짜 수정'
              : datePickerTarget === 'editSearchedArrival'
              ? '반납(도착) 날짜 수정'
              : '날짜 선택'
          }
          blockedDates={getActiveBlockedDates()}
        />
      )}

      {timePickerTarget && (
        <TimePickerModal
          isOpen={!!timePickerTarget}
          onClose={() => setTimePickerTarget(null)}
          initialValue={getTimePickerValue()}
          onSelect={handleTimePickerSelect}
          title={
            timePickerTarget === 'intakeStart'
              ? '입고 시각 설정'
              : timePickerTarget === 'intakeEnd'
              ? '출고 시각 설정'
              : timePickerTarget === 'editDeparture'
              ? '입고 시간 수정'
              : timePickerTarget === 'editArrival'
              ? '출고 시간 수정'
              : '시간 정밀 세팅'
          }
        />
      )}

      {/* SEARCHED RESERVATION EDIT MODAL (DRIVER DRIVEN) */}
      {editingSearchedRes && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 z-[150]">
          <div 
            onClick={() => setEditingSearchedRes(null)}
            className="absolute inset-x-0 inset-y-0 bg-neutral-950/80 backdrop-blur-xs cursor-pointer"
          />
          <div className="relative bg-neutral-900 border border-neutral-800 w-full max-w-md rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-4 border-b border-neutral-800 flex items-center justify-between bg-neutral-900/50">
              <div className="flex items-center gap-2">
                <Settings className="text-amber-500" size={16} />
                <span className="text-xs font-black text-white">현장/전화 수납 정보 수정</span>
              </div>
              <button 
                onClick={() => setEditingSearchedRes(null)}
                className="p-1 px-2.5 bg-neutral-950 hover:bg-zinc-800 text-zinc-500 rounded-lg text-[12px] font-black cursor-pointer"
              >
                닫기
              </button>
            </div>

            <div className="overflow-y-auto p-5 flex-1 space-y-4 text-xs font-sans">
              <div className="p-3 bg-neutral-950 border border-neutral-850/60 rounded-2xl flex items-center justify-between font-sans">
                <div>
                  <span className="text-[11px] text-zinc-500 block">고객 고유 예약 코드</span>
                  <span className="text-xs font-black text-white font-mono">{editingSearchedRes.receiptCode || editingSearchedRes.id}</span>
                  {(() => {
                    const source = resolveBookingSourceFromReservation(editingSearchedRes);
                    if (source === 'unknown') return null;
                    return (
                      <span
                        className={cn(
                          'mt-1 inline-block text-[10px] font-black border px-2 py-0.5 rounded-md',
                          bookingSourceBadgeClass(source)
                        )}
                      >
                        {isAirpickB2CBooking(editingSearchedRes.createdBy) ? '★ ' : ''}
                        {bookingSourceLabel(source)} 예약
                      </span>
                    );
                  })()}
                </div>
                <span className="text-[12px] text-zinc-400 bg-neutral-900 px-2.5 py-1 rounded-lg border border-neutral-800 font-bold">
                  {editingSearchedRes.companyName}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3 font-sans">
                <div>
                  <label className="text-[11.5px] font-bold text-zinc-500 block mb-1">인계 고객명</label>
                  <input 
                    type="text" 
                    value={editSearchedUserName}
                    onChange={e => setEditSearchedUserName(e.target.value)}
                    className="w-full px-3 py-2 bg-neutral-955 border border-neutral-800 rounded-xl text-zinc-200 font-bold focus:border-amber-500 outline-none"
                  />
                </div>
                <div>
                  <label className="text-[11.5px] font-bold text-zinc-500 block mb-1">고객 연락처</label>
                  <input 
                    type="text" 
                    value={editSearchedPhone}
                    onChange={e => setEditSearchedPhone(e.target.value)}
                    className="w-full px-3 py-2 bg-neutral-955 border border-neutral-800 rounded-xl text-zinc-200 font-bold focus:border-amber-500 outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 font-sans">
                <div>
                  <label className="text-[11.5px] font-bold text-zinc-500 block mb-1">차량 번호</label>
                  <input 
                    type="text" 
                    value={editSearchedCarNumber}
                    onChange={e => setEditSearchedCarNumber(e.target.value)}
                    className="w-full px-3 py-2 bg-neutral-955 border border-neutral-800 rounded-xl text-zinc-200 font-bold focus:border-amber-500 outline-none"
                  />
                </div>
                <div>
                  <label className="text-[11.5px] font-bold text-zinc-500 block mb-1">차량 모델</label>
                  <input 
                    type="text" 
                    value={editSearchedCarModel}
                    onChange={e => setEditSearchedCarModel(e.target.value)}
                    className="w-full px-3 py-2 bg-neutral-955 border border-neutral-800 rounded-xl text-zinc-200 font-bold focus:border-amber-500 outline-none"
                  />
                </div>
              </div>

              <div className="space-y-1.5 p-3.5 bg-[#141416] border border-neutral-850 rounded-2xl font-sans">
                <span className="text-[11.5px] font-black text-amber-500 block">✈️ 입/출항 여정 동선 지정</span>
                <div className="grid grid-cols-2 gap-2 text-xs pt-1">
                  <div>
                    <span className="text-[11px] text-zinc-500 block mb-1 font-bold">입고일 (출발일)</span>
                    <div 
                      onClick={() => setDatePickerTarget('editSearchedDeparture')}
                      className="relative flex items-center bg-[#1C1C1E] border border-neutral-850 hover:border-neutral-700 hover:bg-neutral-900 active:scale-[0.98] rounded-xl px-2.5 h-[42px] transition-all duration-100 cursor-pointer select-none overflow-hidden"
                    >
                      <div className="flex items-center w-full justify-center pointer-events-none z-10 text-zinc-100">
                        <span className="text-[13px] font-bold">
                          {editSearchedDepartureDate || '날짜 선택'}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div>
                    <span className="text-[11px] text-zinc-500 block mb-1 font-bold">입고 시각</span>
                    <div 
                      onClick={() => setTimePickerTarget('editDeparture')}
                      className="relative flex items-center bg-[#1C1C1E] border border-neutral-850 hover:border-[#FF9F0A] hover:bg-[#2C2C2E]/50 active:scale-[0.98] rounded-xl px-2.5 h-[42px] transition-all duration-100 cursor-pointer select-none overflow-hidden"
                    >
                      <div className="flex items-center w-full justify-center z-10 text-zinc-100">
                        <span className="text-[13px] font-bold text-[#FF9F0A]">
                          {editSearchedDepartureTime || '시간 선택'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex gap-2.5 pt-1 text-[12px]">
                  <span className="text-zinc-500 font-bold my-auto">입고 터미널:</span>
                  <button 
                    type="button" 
                    onClick={() => setEditSearchedDepartureTerminal('T1')} 
                    className={cn("px-2.5 py-1 rounded-md transition-all font-black cursor-pointer", editSearchedDepartureTerminal === 'T1' ? "bg-[#00D2FF] text-neutral-950" : "bg-[#2C2C2E] text-zinc-400")}
                  >1터미널</button>
                  <button 
                    type="button" 
                    onClick={() => setEditSearchedDepartureTerminal('T2')} 
                    className={cn("px-2.5 py-1 rounded-md transition-all font-black cursor-pointer", editSearchedDepartureTerminal === 'T2' ? "bg-[#FFB800] text-neutral-950" : "bg-[#2C2C2E] text-zinc-400")}
                  >2터미널</button>
                </div>
              </div>

              <div className="space-y-1.5 p-3.5 bg-[#141416] border border-neutral-850 rounded-2xl font-sans">
                <span className="text-[11.5px] font-black text-emerald-500 block">✨ 고객 반납일</span>
                <div className="grid grid-cols-2 gap-2 text-xs pt-1">
                  <div>
                    <span className="text-[11px] text-zinc-500 block mb-1 font-bold">출고일 (반납일)</span>
                    <div 
                      onClick={() => setDatePickerTarget('editSearchedArrival')}
                      className="relative flex items-center bg-[#1C1C1E] border border-neutral-850 hover:border-neutral-700 hover:bg-neutral-900 active:scale-[0.98] rounded-xl px-2.5 h-[42px] transition-all duration-100 cursor-pointer select-none overflow-hidden"
                    >
                      <div className="flex items-center w-full justify-center pointer-events-none z-10 text-zinc-100">
                        <span className="text-[13px] font-bold">
                          {editSearchedArrivalDate || '날짜 선택'}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div>
                    <span className="text-[11px] text-zinc-500 block mb-1 font-bold">출고 시각</span>
                    <div 
                      onClick={() => setTimePickerTarget('editArrival')}
                      className="relative flex items-center bg-[#1C1C1E] border border-neutral-850 hover:border-[#FF9F0A] hover:bg-[#2C2C2E]/50 active:scale-[0.98] rounded-xl px-2.5 h-[42px] transition-all duration-100 cursor-pointer select-none overflow-hidden"
                    >
                      <div className="flex items-center w-full justify-center z-10 text-zinc-100">
                        <span className="text-[13px] font-bold text-[#FF9F0A]">
                          {editSearchedArrivalTime || '시간 선택'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex gap-2.5 pt-1 text-[12px]">
                  <span className="text-zinc-500 font-bold my-auto">반납 터미널:</span>
                  <button 
                    type="button" 
                    onClick={() => setEditSearchedArrivalTerminal('T1')} 
                    className={cn("px-2.5 py-1 rounded-md transition-all font-black cursor-pointer", editSearchedArrivalTerminal === 'T1' ? "bg-[#00D2FF] text-neutral-950" : "bg-[#2C2C2E] text-zinc-400")}
                  >1터미널</button>
                  <button 
                    type="button" 
                    onClick={() => setEditSearchedArrivalTerminal('T2')} 
                    className={cn("px-2.5 py-1 rounded-md transition-all font-black cursor-pointer", editSearchedArrivalTerminal === 'T2' ? "bg-[#FFB800] text-neutral-950" : "bg-[#2C2C2E] text-zinc-400")}
                  >2터미널</button>
                </div>
              </div>

              <div className="space-y-3 p-3.5 bg-[#141416] border border-neutral-850 rounded-2xl font-sans">
                <span className="text-[11.5px] font-black text-amber-500 block">✈️ 항공편 · 여행 정보</span>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[11px] text-zinc-500 font-bold block mb-1">출국 항공사</label>
                    <select value={editSearchedDepartureAirline} onChange={(e) => setEditSearchedDepartureAirline(e.target.value)} className="w-full px-2 py-2 bg-neutral-955 border border-neutral-800 rounded-xl text-zinc-200 text-xs font-bold outline-none focus:border-amber-500">
                      <option value="">선택 안 함</option>
                      {airlineSelectOptions(editSearchedDepartureAirline, AIRLINES).map((a) => (
                        <option key={a} value={a}>{a}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-[11px] text-zinc-500 font-bold block mb-1">출국 편명</label>
                    <input type="text" value={editSearchedDepartureFlight} onChange={(e) => setEditSearchedDepartureFlight(e.target.value)} className="w-full px-2 py-2 bg-neutral-955 border border-neutral-800 rounded-xl text-zinc-200 text-xs font-bold outline-none focus:border-amber-500 font-mono" />
                  </div>
                  <div>
                    <label className="text-[11px] text-zinc-500 font-bold block mb-1">입국 항공사</label>
                    <select value={editSearchedArrivalAirline} onChange={(e) => setEditSearchedArrivalAirline(e.target.value)} className="w-full px-2 py-2 bg-neutral-955 border border-neutral-800 rounded-xl text-zinc-200 text-xs font-bold outline-none focus:border-amber-500">
                      <option value="">선택 안 함</option>
                      {airlineSelectOptions(editSearchedArrivalAirline, AIRLINES).map((a) => (
                        <option key={a} value={a}>{a}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-[11px] text-zinc-500 font-bold block mb-1">입국 편명</label>
                    <input type="text" value={editSearchedArrivalFlight} onChange={(e) => setEditSearchedArrivalFlight(e.target.value)} className="w-full px-2 py-2 bg-neutral-955 border border-neutral-800 rounded-xl text-zinc-200 text-xs font-bold outline-none focus:border-amber-500 font-mono" />
                  </div>
                  <div className="col-span-2">
                    <label className="text-[11px] text-zinc-500 font-bold block mb-1">여행지</label>
                    <input type="text" value={editSearchedDestination} onChange={(e) => setEditSearchedDestination(e.target.value)} className="w-full px-2 py-2 bg-neutral-955 border border-neutral-800 rounded-xl text-zinc-200 text-xs font-bold outline-none focus:border-amber-500" />
                  </div>
                  <div className="col-span-2">
                    <label className="text-[11px] text-zinc-500 font-bold block mb-1">고객 요청사항</label>
                    <input type="text" value={editSearchedCustomerNotes} onChange={(e) => setEditSearchedCustomerNotes(e.target.value)} className="w-full px-2 py-2 bg-neutral-955 border border-neutral-800 rounded-xl text-zinc-200 text-xs font-bold outline-none focus:border-amber-500" />
                  </div>
                  <div>
                    <label className="text-[11px] text-zinc-500 font-bold block mb-1">예약 비밀번호</label>
                    <input type="text" value={editSearchedReservationPassword} onChange={(e) => setEditSearchedReservationPassword(e.target.value)} className="w-full px-2 py-2 bg-neutral-955 border border-neutral-800 rounded-xl text-zinc-200 text-xs font-bold outline-none focus:border-amber-500 font-mono" />
                  </div>
                </div>
              </div>

              <div className="col-span-2 font-sans">
                <label className="text-[11.5px] font-bold text-zinc-500 block mb-1">주차 보관 구역</label>
                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setEditSearchedIsIndoor(true)}
                    className={cn(
                      "py-2.5 rounded-xl border font-black flex items-center justify-center gap-1.5 transition-all text-xs cursor-pointer",
                      editSearchedIsIndoor ? "bg-purple-650/15 border-[#A855F7] text-purple-400 font-extrabold" : "bg-neutral-955 border-neutral-850 hover:border-neutral-800 text-zinc-400"
                    )}
                  >
                    <span>실내 주차 보관 권장</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditSearchedIsIndoor(false)}
                    className={cn(
                      "py-2.5 rounded-xl border font-black flex items-center justify-center gap-1.5 transition-all text-xs cursor-pointer",
                      !editSearchedIsIndoor ? "bg-[#22C55E]/10 border-[#22C55E] text-[#22C55E] font-extrabold" : "bg-neutral-955 border-neutral-850 hover:border-neutral-800 text-zinc-400"
                    )}
                  >
                    <span>야외 안전 주차 권장</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Action operations */}
            <div className="p-4 border-t border-neutral-800 flex gap-2 bg-neutral-900/60 shadow-lg">
              <button 
                type="button"
                onClick={() => setEditingSearchedRes(null)}
                className="px-4 py-3 bg-[#1C1C1E] border border-neutral-800 hover:bg-neutral-800 text-zinc-400 rounded-xl text-xs font-bold transition-all cursor-pointer"
              >
                변경 취소
              </button>
              <button 
                type="button"
                onClick={handleSaveSearchedResEdit}
                className="flex-1 py-3 bg-amber-500 hover:bg-amber-450 text-neutral-950 rounded-xl text-xs font-black shadow-lg shadow-amber-500/10 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <CheckCircle2 size={13} />
                정보 수정 완료 및 갱신
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
