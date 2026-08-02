import React, { useState, useEffect, useMemo, useRef } from 'react';
import { CompanyInfo, Reservation, Company, PartnerCompany, Employee, FacilityType } from '../types';
import { 
  Save, 
  Users, 
  FileSpreadsheet,
  Sliders,
  ChevronUp,
  ChevronDown
} from 'lucide-react';
import { doc, setDoc, deleteField } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import TimePickerModal from './TimePickerModal';
import AdminDashboard from './AdminDashboard';
import PartnerParkingProfileReadonly from './PartnerParkingProfileReadonly';
import { isAirpickHeadquarters } from '../constants/platform';
import { ensureFirestoreAuth } from '../lib/firebaseAuth';
import { upsertCompanyEmployees } from '../lib/partnerLoginApi';
import { writePartnersToStorage } from '../utils/partnerSync';
import { inferFacilityType } from '../utils/companyProfile';
import {
  airportShortName,
  getAirport,
  getAirportTerminals,
  resolveCompanyAirportId,
} from '../utils/airport';

/** 최고관리자(제휴 가맹점 수정)만 companies에 쓰는 필드 — 가맹점 자체 저장에서 제외 */
export const HQ_ONLY_COMPANY_PARKING_KEYS = [
  'facilityType',
  'is_indoor',
  'supports_indoor',
  'supports_outdoor',
  'features',
  'indoorParkingAddress',
  'outdoorParkingAddress',
  'indoorParkingLat',
  'indoorParkingLng',
  'outdoorParkingLat',
  'outdoorParkingLng',
  'parkingLots',
  'parkingDistances',
  'parkingDistancesIndoor',
  'parkingDistancesOutdoor',
  'image_url',
  'image_urls',
  'sharesParkingLocation',
  'sharesPhotos',
  'insurance',
  'hasInsurance',
  'insuranceProvider',
  'insuranceLimit',
  'sharesInsurance',
] as const;

// TimeSpinner is deprecated and replaced by unified TimePickerModal with firm Confirm actions.

interface PriceInputProps {
  label: string;
  value: number;
  onChange: (val: number) => void;
  className?: string;
  focusColorClass?: string;
  placeholder?: string;
  isXl?: boolean;
}

function PriceInput({
  label,
  value,
  onChange,
  className = "",
  focusColorClass = "focus-within:border-amber-500",
  placeholder = "0",
  isXl = false,
}: PriceInputProps) {
  const formatValue = (num: number) => {
    if (num === 0) return '0';
    if (!num) return '';
    return num.toLocaleString();
  };

  const parseValue = (str: string): number => {
    const cleanStr = str.replace(/,/g, '');
    const num = Number(cleanStr);
    return isNaN(num) ? 0 : num;
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseValue(e.target.value);
    onChange(val);
  };

  const increment = () => {
    onChange((value || 0) + 1000);
  };

  const decrement = () => {
    const next = (value || 0) - 1000;
    onChange(next < 0 ? 0 : next);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      increment();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      decrement();
    }
  };

  const handleWheel = (e: React.WheelEvent<HTMLInputElement>) => {
    if (document.activeElement === e.currentTarget) {
      e.preventDefault();
      if (e.deltaY < 0) {
        increment();
      } else {
        decrement();
      }
    }
  };

  const wrapperRound = isXl ? "rounded-xl" : "rounded-lg";
  const wrapperPadding = isXl ? "py-1 bg-[#1C1C1E] border border-neutral-800" : "py-0 bg-[#1C1C1E] border border-neutral-800";
  const inputPadding = isXl ? "px-2.5 py-1.5" : "px-2.5 py-1.5";

  return (
    <div className={className}>
      <label className={`text-[11px] text-white/80 font-bold block ${isXl ? 'mb-1.5' : 'mb-1'}`}>{label}</label>
      <div 
        className={`relative w-full flex items-center pr-8 overflow-hidden transition-all duration-200 ${wrapperRound} ${wrapperPadding} border border-neutral-800 focus-within:ring-1 focus-within:ring-amber-500/30 ${focusColorClass}`}
      >
        <input 
          type="text" 
          value={formatValue(value)}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onWheel={handleWheel}
          placeholder={placeholder}
          className={`w-full bg-transparent ${inputPadding} text-xs text-white focus:outline-none font-mono font-bold`} 
        />
        <div className="absolute right-0 top-0 bottom-0 w-8 border-l border-neutral-800/80 flex flex-col divide-y divide-neutral-800/80 bg-neutral-900/10">
          <button
            type="button"
            onClick={increment}
            className="flex-1 flex items-center justify-center hover:bg-neutral-800 active:bg-neutral-700 text-zinc-500 hover:text-white transition-all cursor-pointer"
          >
            <ChevronUp size={11} />
          </button>
          <button
            type="button"
            onClick={decrement}
            className="flex-1 flex items-center justify-center hover:bg-neutral-800 active:bg-neutral-700 text-zinc-500 hover:text-white transition-all cursor-pointer"
          >
            <ChevronDown size={11} />
          </button>
        </div>
      </div>
    </div>
  );
}

function resolveLegacyPricingFields(
  facilityType: FacilityType,
  outdoorBasePrice: number,
  outdoorBaseDays: number,
  outdoorExtraPrice: number,
  indoorBasePrice: number,
  indoorBaseDays: number,
  indoorExtraPrice: number
) {
  if (facilityType === 'indoor') {
    return {
      base_price: Number(indoorBasePrice) || 0,
      extra_day_price: Number(indoorExtraPrice) || 0,
      base_days: Number(indoorBaseDays) || 0,
    };
  }
  return {
    base_price: Number(outdoorBasePrice) || 0,
    extra_day_price: Number(outdoorExtraPrice) || 0,
    base_days: Number(outdoorBaseDays) || 0,
  };
}

function companyHasPricingFields(c: Company): boolean {
  return (
    typeof c.outdoorBasePrice === 'number' ||
    typeof c.indoorBasePrice === 'number' ||
    typeof c.base_price === 'number' ||
    typeof c.outdoorExtraPrice === 'number' ||
    typeof c.indoorExtraPrice === 'number' ||
    typeof c.surchargePrice === 'number'
  );
}

function buildMatrixPricingPayload(
  facilityType: FacilityType,
  values: {
    outdoorBasePrice: number;
    outdoorBaseDays: number;
    outdoorExtraPrice: number;
    indoorBasePrice: number;
    indoorBaseDays: number;
    indoorExtraPrice: number;
    surchargeStartTime: string;
    surchargeEndTime: string;
    surchargePrice: number;
    t2Surcharge: number;
    peakStartTime: string;
    peakEndTime: string;
    peakSurcharge: number;
  }
) {
  const includeOutdoor = facilityType === 'outdoor' || facilityType === 'mixed';
  const includeIndoor = facilityType === 'indoor' || facilityType === 'mixed';
  // 화면에 안 보이는 쪽은 payload에서 빼서 merge 저장 시 기존 Firestore 값을 0으로 덮지 않음
  const matrix: Record<string, string | number> = {
    ...resolveLegacyPricingFields(
      facilityType,
      values.outdoorBasePrice,
      values.outdoorBaseDays,
      values.outdoorExtraPrice,
      values.indoorBasePrice,
      values.indoorBaseDays,
      values.indoorExtraPrice
    ),
    surchargeStartTime: values.surchargeStartTime || '00:00',
    surchargeEndTime: values.surchargeEndTime || '00:00',
    surchargePrice: Number(values.surchargePrice) || 0,
    t2Surcharge: Number(values.t2Surcharge) || 0,
    peakStartTime: values.peakStartTime || '',
    peakEndTime: values.peakEndTime || '',
    peakSurcharge: Number(values.peakSurcharge) || 0,
  };
  if (includeOutdoor) {
    matrix.outdoorBasePrice = Number(values.outdoorBasePrice) || 0;
    matrix.outdoorBaseDays = Number(values.outdoorBaseDays) || 0;
    matrix.outdoorExtraPrice = Number(values.outdoorExtraPrice) || 0;
  }
  if (includeIndoor) {
    matrix.indoorBasePrice = Number(values.indoorBasePrice) || 0;
    matrix.indoorBaseDays = Number(values.indoorBaseDays) || 0;
    matrix.indoorExtraPrice = Number(values.indoorExtraPrice) || 0;
  }
  return matrix;
}


interface MasterSettingsViewProps {
  companyInfo: CompanyInfo;
  onUpdateCompany: (info: CompanyInfo) => void;
  reservations: Reservation[];
  companies?: Company[];
  onUpdateCompanies?: (updated: Company[]) => void;
  partners?: PartnerCompany[];
  onUpdatePartners?: (updated: PartnerCompany[]) => void;
  isSuperAdmin?: boolean;
  onBack?: () => void;
  isEmployee?: boolean;
  employeeRole?: 'admin' | 'driver';
}

type PartnerSettingsTab = 'basic' | 'pricing' | 'staff';

const PARTNER_SETTINGS_TABS: { id: PartnerSettingsTab; label: string }[] = [
  { id: 'basic', label: '기본' },
  { id: 'pricing', label: '요금' },
  { id: 'staff', label: '직원' },
];

export default function MasterSettingsView({ 
  companyInfo, 
  onUpdateCompany,
  reservations,
  companies,
  onUpdateCompanies,
  partners,
  onUpdatePartners,
  isSuperAdmin = false,
  onBack,
  isEmployee = false,
  employeeRole = 'driver'
}: MasterSettingsViewProps) {
  const [settingsTab, setSettingsTab] = useState<PartnerSettingsTab>('basic');

  // Core States for Partner View (Self rate/profile management redirect)
  const [partnerPassword, setPartnerPassword] = useState('');
  const [partnerPhone, setPartnerPhone] = useState('');
  const [partnerRateText, setPartnerRateText] = useState('');

  // Employee Management States
  const [empName, setEmpName] = useState('');
  const [empLoginId, setEmpLoginId] = useState('');
  const [empPassword, setEmpPassword] = useState('');
  const [empIsAdmin, setEmpIsAdmin] = useState(false);

  const currentPartner = (partners || []).find(p => p.companyId === companyInfo.id);
  const employeeList: Employee[] = currentPartner?.employees || [];

  const handleAddEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = empName.trim();
    const cleanLoginId = empLoginId.trim();
    const cleanPassword = empPassword.trim();

    if (!cleanName) {
      alert('직원 이름을 입력해 주세요.');
      return;
    }
    if (!cleanLoginId) {
      alert('직원 로그인 ID를 입력해 주세요.');
      return;
    }
    if (!cleanPassword) {
      alert('직원 로그인 비밀번호를 입력해 주세요.');
      return;
    }

    let exists = false;
    (partners || []).forEach(p => {
      if (p.companyId.toLowerCase() === cleanLoginId.toLowerCase()) exists = true;
      if (p.employees?.some(emp => emp.loginId.toLowerCase() === cleanLoginId.toLowerCase())) exists = true;
    });

    if (exists || cleanLoginId.toLowerCase() === 'airpick' || cleanLoginId.toLowerCase() === 'wawa') {
      alert('이미 사용 중인 로그인 ID입니다. 다른 ID를 입력해 주세요.');
      return;
    }

    const newEmployee: Employee = {
      id: `emp_${Date.now()}`,
      name: cleanName,
      loginId: cleanLoginId,
      password: cleanPassword,
      role: empIsAdmin ? 'admin' : 'driver'
    };

    const nextEmployees = [...employeeList, newEmployee];

    try {
      await upsertCompanyEmployees({
        companyId: companyInfo.id,
        employees: nextEmployees,
      });
    } catch (err) {
      alert(
        `직원 저장 실패: ${err instanceof Error ? err.message : String(err)}\n\n업체 마스터/부관리자로 Gate에서 다시 로그인한 뒤 시도해 주세요.`
      );
      return;
    }

    let found = false;
    const updatedPartners = (partners || []).map(p => {
      if (p.companyId === companyInfo.id) {
        found = true;
        return { ...p, employees: nextEmployees };
      }
      return p;
    });

    if (!found) {
      updatedPartners.push({
        companyId: companyInfo.id,
        password: '',
        name: companyInfo.name,
        representative: '제휴 사장님',
        phone: partnerPhone || companyInfo.phone || '1545-5746',
        settlementMemo: '',
        status: 'active',
        employees: nextEmployees
      });
    }

    if (onUpdatePartners) {
      onUpdatePartners(updatedPartners);
    }
    writePartnersToStorage(updatedPartners);

    setEmpName('');
    setEmpLoginId('');
    setEmpPassword('');
    setEmpIsAdmin(false);
    alert(`신규 직원 [${cleanName}] 기사가 등록되었습니다.`);
  };

  const handleDeleteEmployee = async (empId: string, empName: string) => {
    if (!window.confirm(`소속 직원 [${empName}] 기사를 정말 삭제(퇴사 처리)하시겠습니까?`)) {
      return;
    }

    const nextEmployees = employeeList.filter(emp => emp.id !== empId);

    try {
      await upsertCompanyEmployees({
        companyId: companyInfo.id,
        employees: nextEmployees,
      });
    } catch (err) {
      alert(
        `직원 삭제 실패: ${err instanceof Error ? err.message : String(err)}\n\n업체 마스터/부관리자로 Gate에서 다시 로그인한 뒤 시도해 주세요.`
      );
      return;
    }

    const updatedPartners = (partners || []).map(p => {
      if (p.companyId === companyInfo.id) {
        return { ...p, employees: nextEmployees };
      }
      return p;
    });

    if (onUpdatePartners) {
      onUpdatePartners(updatedPartners);
    }
    writePartnersToStorage(updatedPartners);
    alert(`[${empName}] 기사가 안전하게 해임(삭제)되었습니다.`);
  };

  // Matrix pricing settings
  const [outdoorBasePrice, setOutdoorBasePrice] = useState(0);
  const [outdoorBaseDays, setOutdoorBaseDays] = useState(0);
  const [outdoorExtraPrice, setOutdoorExtraPrice] = useState(0);
  const [indoorBasePrice, setIndoorBasePrice] = useState(0);
  const [indoorBaseDays, setIndoorBaseDays] = useState(0);
  const [indoorExtraPrice, setIndoorExtraPrice] = useState(0);
  const [surchargeStartTime, setSurchargeStartTime] = useState('00:00');
  const [surchargeEndTime, setSurchargeEndTime] = useState('00:00');
  const [surchargePrice, setSurchargePrice] = useState(0);
  const [t2Surcharge, setT2Surcharge] = useState(0);
  const [peakStartTime, setPeakStartTime] = useState('');
  const [peakEndTime, setPeakEndTime] = useState('');
  const [peakSurcharge, setPeakSurcharge] = useState(0);
  const [activePickerTarget, setActivePickerTarget] = useState<'surchargeStart' | 'surchargeEnd' | null>(null);

  // 대면 입고 제공 설정 (T1/T2 각각 · 0=무료 대면)
  const [valetEnabled, setValetEnabled] = useState(false);
  const [valetT1Enabled, setValetT1Enabled] = useState(false);
  const [valetT2Enabled, setValetT2Enabled] = useState(false);
  const [valetFeeT1, setValetFeeT1] = useState(0);
  const [valetFeeT2, setValetFeeT2] = useState(0);
  const [pickupLocation, setPickupLocation] = useState('');

  /** 편집 중 Firestore/캐시 스냅샷이 입력값을 0으로 덮지 않게 */
  const formDirtyRef = useRef(false);
  const hydratedCompanyIdRef = useRef<string | null>(null);
  const hydratedWithPricingRef = useRef(false);

  const markFormDirty = () => {
    formDirtyRef.current = true;
  };

  useEffect(() => {
    formDirtyRef.current = false;
    hydratedCompanyIdRef.current = null;
    hydratedWithPricingRef.current = false;
    setSettingsTab('basic');
  }, [companyInfo.id]);

  useEffect(() => {
    if (formDirtyRef.current) return;

    const id = companyInfo.id;
    const p = (partners || []).find((x) => x.companyId === id);
    if (p) {
      setPartnerPassword(typeof p.password === 'string' ? p.password : '');
      setPartnerPhone(
        typeof p.phone === 'string' ? p.phone : companyInfo.phone || ''
      );
    } else if (hydratedCompanyIdRef.current !== id) {
      setPartnerPhone(companyInfo.phone || '');
    }

    const c = (companies || []).find((x) => x.id === id);
    if (!c) return;

    if (
      hydratedCompanyIdRef.current === id &&
      hydratedWithPricingRef.current
    ) {
      return;
    }

    hydratedCompanyIdRef.current = id;
    hydratedWithPricingRef.current = companyHasPricingFields(c);

    setPartnerRateText((c.features && c.features[0]) || '');
    setPickupLocation(
      typeof c.pickupLocation === 'string' ? c.pickupLocation : ''
    );
    setOutdoorBasePrice(c.outdoorBasePrice ?? c.base_price ?? 0);
    setOutdoorBaseDays(c.outdoorBaseDays ?? c.base_days ?? 0);
    setOutdoorExtraPrice(c.outdoorExtraPrice ?? c.extra_day_price ?? 0);
    setIndoorBasePrice(c.indoorBasePrice ?? 0);
    setIndoorBaseDays(c.indoorBaseDays ?? 0);
    setIndoorExtraPrice(c.indoorExtraPrice ?? 0);
    setSurchargeStartTime(c.surchargeStartTime ?? '00:00');
    setSurchargeEndTime(c.surchargeEndTime ?? '00:00');
    setSurchargePrice(c.surchargePrice ?? 0);
    setT2Surcharge(c.t2Surcharge ?? 0);
    setPeakStartTime(c.peakStartTime ?? '');
    setPeakEndTime(c.peakEndTime ?? '');
    setPeakSurcharge(c.peakSurcharge ?? 0);

    const hasT1 = typeof c.valetFeeT1 === 'number';
    const hasT2 = typeof c.valetFeeT2 === 'number';
    setValetT1Enabled(hasT1);
    setValetT2Enabled(hasT2);
    setValetEnabled(hasT1 || hasT2);
    setValetFeeT1(hasT1 ? (c.valetFeeT1 as number) : 0);
    setValetFeeT2(hasT2 ? (c.valetFeeT2 as number) : 0);
  }, [partners, companies, companyInfo.id, companyInfo.phone]);

  const currentCompany = useMemo(
    () => (companies || []).find((c) => c.id === companyInfo.id),
    [companies, companyInfo.id]
  );
  const airportId = resolveCompanyAirportId(currentCompany);
  const airportShort = airportShortName(airportId);
  const airportTerminals = getAirportTerminals(airportId);
  const surchargeTerminal = airportTerminals.find((t) =>
    getAirport(airportId).surchargeTerminalCodes.includes(t.code)
  );
  const primaryTerminal = airportTerminals[0];
  const secondaryTerminal = airportTerminals[1];
  const facilityType = useMemo(() => inferFacilityType(currentCompany), [currentCompany]);
  const showOutdoorMatrix = facilityType === 'outdoor' || facilityType === 'mixed';
  const showIndoorMatrix = facilityType === 'indoor' || facilityType === 'mixed';
  const facilityTypeLabel =
    facilityType === 'outdoor' ? '실외 전용' : facilityType === 'indoor' ? '실내 전용' : '실내+실외';

  const settingsSummary = useMemo(() => {
    const parts: string[] = [facilityTypeLabel];
    if (pickupLocation.trim()) parts.push('픽업 등록');
    parts.push(`직원 ${employeeList.length}명`);
    if (valetEnabled) parts.push('대면 ON');
    return parts.join(' · ');
  }, [facilityTypeLabel, pickupLocation, employeeList.length, valetEnabled]);

  const handleSavePartnerSelf = async () => {
    try {
      // 대면 입고 검증: ON이면 T1·T2 중 최소 1개, 각 요금은 0 이상 정수
      if (valetEnabled) {
        if (!valetT1Enabled && !valetT2Enabled) {
          alert('대면 입고를 제공하려면 터미널을 최소 한 곳 선택해 주세요.');
          return;
        }
        const feeInvalid = (fee: number, on: boolean) =>
          on && (!Number.isInteger(fee) || fee < 0);
        if (feeInvalid(valetFeeT1, valetT1Enabled) || feeInvalid(valetFeeT2, valetT2Enabled)) {
          alert('대면 추가요금은 0 이상의 정수(원)로 입력해 주세요. (무료 대면이면 0)');
          return;
        }
      }

      // 대면 미제공 터미널은 Firestore에서 필드 삭제 (deleteField), 로컬은 키 제거
      const valetT1On = valetEnabled && valetT1Enabled;
      const valetT2On = valetEnabled && valetT2Enabled;
      const valetFirestorePayload: Record<string, unknown> = {
        valetFeeT1: valetT1On ? Math.trunc(valetFeeT1) : deleteField(),
        valetFeeT2: valetT2On ? Math.trunc(valetFeeT2) : deleteField(),
      };

      const cleanPhone = String(
        partnerPhone || companyInfo.phone || '1544-5746'
      ).trim();

      let found = false;
      const updatedPartners = (partners || []).map(p => {
        if (p.companyId === companyInfo.id) {
          found = true;
          return {
            ...p,
            // 비밀번호는 secrets/Callable로만 관리 — 로컬 캐시에 저장하지 않음
            password: '',
            phone: cleanPhone
          };
        }
        return p;
      });
      if (!found) {
        updatedPartners.push({
          companyId: companyInfo.id,
          password: '',
          name: companyInfo.name,
          representative: '제휴 사장님',
          phone: cleanPhone,
          settlementMemo: '',
          status: 'active',
          employees: []
        });
      }
      if (onUpdatePartners) {
        onUpdatePartners(updatedPartners);
      }
      writePartnersToStorage(updatedPartners);

      const savedCompaniesStr = localStorage.getItem('companies');
      let dbCompanies: Company[] = [];
      if (savedCompaniesStr) {
        try {
          dbCompanies = JSON.parse(savedCompaniesStr);
        } catch (_) {}
      }
      if (!dbCompanies || dbCompanies.length === 0) {
        dbCompanies = [...(companies || [])];
      }

      const pricingPayload = buildMatrixPricingPayload(facilityType, {
        outdoorBasePrice,
        outdoorBaseDays,
        outdoorExtraPrice,
        indoorBasePrice,
        indoorBaseDays,
        indoorExtraPrice,
        surchargeStartTime,
        surchargeEndTime,
        surchargePrice,
        t2Surcharge,
        peakStartTime,
        peakEndTime,
        peakSurcharge,
      });

      const cleanPickupLocation = pickupLocation.trim();

      const updatedCompanies = dbCompanies.map(c => {
        if (c.id === companyInfo.id) {
          const next: Company = {
            ...c,
            ...pricingPayload,
          };
          if (cleanPickupLocation) next.pickupLocation = cleanPickupLocation;
          else delete next.pickupLocation;
          if (valetT1On) next.valetFeeT1 = Math.trunc(valetFeeT1);
          else delete next.valetFeeT1;
          if (valetT2On) next.valetFeeT2 = Math.trunc(valetFeeT2);
          else delete next.valetFeeT2;
          return next;
        }
        return c;
      });
      if (onUpdateCompanies) {
        onUpdateCompanies(updatedCompanies);
      }
      localStorage.setItem('companies', JSON.stringify(updatedCompanies));

      if (onUpdateCompany) {
        onUpdateCompany({
          ...companyInfo,
          phone: cleanPhone
        });
        localStorage.setItem('master_company_info', JSON.stringify({
          ...companyInfo,
          phone: cleanPhone
        }));
      }

      // Direct Firestore update for this partner company item (cross-account sync source of truth)
      // NOTE: 로컬스토리지는 보조 캐시일 뿐이며, Firestore 저장 실패 시 타 기기/본사 화면에 반영되지 않습니다.
      // 주소·핀·T1/T2 거리·사진·시설유형·보험은 최고관리자만 저장 (아래 payload에 포함하지 않음).
      try {
        await ensureFirestoreAuth();
        const docRef = doc(db, 'companies', companyInfo.id);
        await setDoc(
          docRef,
          {
            ...pricingPayload,
            ...valetFirestorePayload,
            pickupLocation: cleanPickupLocation || deleteField(),
            updatedAt: new Date().toISOString(),
          },
          { merge: true }
        );
      } catch (err: any) {
        handleFirestoreError(err, OperationType.WRITE, `companies/${companyInfo.id}`);
        alert(
          `Firestore 저장에 실패했습니다. (다른 계정/본사 화면에 연동되지 않습니다)\n\n` +
            `네트워크/로그인 상태를 확인 후 다시 저장해 주세요.\n` +
            `오류: ${err?.message || String(err)}`
        );
        return;
      }

      formDirtyRef.current = false;
      hydratedCompanyIdRef.current = companyInfo.id;
      hydratedWithPricingRef.current = true;

      alert(`[${companyInfo.name}] 변경 사항이 Firestore에 저장되어 본사/다른 기기에도 실시간으로 연동됩니다.`);
      if (onBack) {
        onBack();
      }
    } catch (unexpectedErr: any) {
      console.error("Error in handleSavePartnerSelf:", unexpectedErr);
      alert(`저장 도중 오류가 발생했습니다: ${unexpectedErr?.message || unexpectedErr}`);
    }
  };

  const isHqOnboardingMode = isSuperAdmin && isAirpickHeadquarters(companyInfo.id);

  if (isHqOnboardingMode) {
    return (
      <div className="bg-black min-h-screen text-zinc-100 p-4 pb-20">
        <div className="mb-5 px-1">
          <h2 className="text-sm font-black text-white">제휴업체 관리</h2>
          <p className="text-[12px] text-zinc-500 font-bold uppercase tracking-wider mt-0.5">
            신규 제휴사 등록 · 기존 업체 수정/삭제
          </p>
        </div>
        <AdminDashboard
          onClose={() => onBack?.()}
          companies={companies || []}
          partners={partners || []}
          reservations={reservations}
          onUpdatePartners={(updated) => {
            onUpdatePartners?.(updated);
            writePartnersToStorage(updated);
          }}
          onUpdateCompanies={(updated) => {
            onUpdateCompanies?.(updated);
            localStorage.setItem('companies', JSON.stringify(updated));
          }}
        />
      </div>
    );
  }

  const surchargeTimePicker = (
    <TimePickerModal
      isOpen={activePickerTarget !== null}
      onClose={() => setActivePickerTarget(null)}
      initialValue={
        activePickerTarget === 'surchargeStart' ? surchargeStartTime : surchargeEndTime
      }
      onSelect={(val) => {
        markFormDirty();
        if (activePickerTarget === 'surchargeStart') {
          setSurchargeStartTime(val);
        } else if (activePickerTarget === 'surchargeEnd') {
          setSurchargeEndTime(val);
        }
        setActivePickerTarget(null);
      }}
      title={
        activePickerTarget === 'surchargeStart'
          ? '야간 할증 시작시간 설정'
          : '야간 할증 종료시간 설정'
      }
    />
  );

  return (
      <>
      <div className="bg-black min-h-screen text-white p-4 pb-28 selection:bg-amber-500 selection:text-neutral-950">
        <div className="flex items-center gap-3.5 mb-4 px-1">
          <div className="p-2.5 bg-neutral-900 border border-neutral-850 rounded-2xl text-white shadow-sm shrink-0">
            <Sliders size={18} />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-black tracking-tight text-white">업체 정보 설정</h2>
            <p className="text-[12px] text-white/50 font-bold truncate">
              {companyInfo.name || companyInfo.id}
              {isSuperAdmin ? ' · 원격 지원' : ''}
            </p>
          </div>
        </div>

        <p className="text-[11px] text-zinc-400 font-semibold px-1 mb-3 leading-relaxed">
          {settingsSummary}
        </p>

        <div className="grid grid-cols-3 gap-1 p-1 mb-4 bg-neutral-900/80 rounded-xl border border-neutral-800/60">
          {PARTNER_SETTINGS_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setSettingsTab(tab.id)}
              className={`py-2.5 rounded-lg text-[12px] font-black transition-all ${
                settingsTab === tab.id
                  ? 'bg-amber-500 text-neutral-950'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="space-y-4">
          {settingsTab === 'basic' && (
            <>
              <div className="bg-neutral-900/40 p-4.5 rounded-2xl border border-neutral-850 flex items-center justify-between">
                <div>
                  <span className="text-[11px] text-white/60 font-black tracking-wider block mb-0.5">
                    로그인 업체
                  </span>
                  <span className="text-xs font-black text-white">{companyInfo.name || '와와'}</span>
                </div>
                <span className="text-[12px] bg-neutral-950 border border-neutral-850 text-white/80 px-3 py-1 rounded-xl font-mono font-bold">
                  ID: {companyInfo.id}
                </span>
              </div>

              {!isAirpickHeadquarters(companyInfo.id) && (
                <>
                  <p className="text-[11px] text-amber-500/90 font-bold px-1">
                    {isSuperAdmin
                      ? '본사 원격 지원 · 보험·주소·핀은 제휴업체 관리에서 수정'
                      : '보험·주소·핀·거리·사진은 최고관리자만 수정'}
                  </p>
                  <PartnerParkingProfileReadonly company={currentCompany} />
                </>
              )}

              {!isAirpickHeadquarters(companyInfo.id) && (
                <div className="bg-neutral-900/40 p-5 rounded-3xl border border-neutral-850 space-y-3">
                  <div className="flex items-center gap-2 text-xs font-black text-amber-500 tracking-wider">
                    <FileSpreadsheet size={14} className="text-amber-500" />
                    <span>고객 만남 픽업지</span>
                  </div>
                  <p className="text-[12px] text-white/70 leading-relaxed">
                    접수증에 표시됩니다. 비우면 「업체로 연락해 안내받으세요」
                  </p>
                  <div>
                    <label className="text-[11px] text-white/80 font-bold block mb-1">
                      픽업지 안내 문구
                    </label>
                    <input
                      type="text"
                      value={pickupLocation}
                      onChange={(e) => {
                        markFormDirty();
                        setPickupLocation(e.target.value);
                      }}
                      placeholder="예: T1 3번 출구 앞"
                      maxLength={120}
                      className="w-full px-3 py-2.5 bg-[#131315] border border-neutral-850 rounded-xl text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-amber-500/50"
                    />
                  </div>
                </div>
              )}
            </>
          )}

          {settingsTab === 'pricing' && (
            <>
              <div className="bg-neutral-900/40 p-5 rounded-3xl border border-neutral-850 space-y-4">
                <div className="flex items-center gap-2 text-xs font-black text-amber-500 tracking-wider">
                  <FileSpreadsheet size={14} className="text-amber-500" />
                  <span>{airportShort} 주차 요금</span>
                </div>
                <p className="text-[12px] text-white/70 leading-relaxed">
                  시설: {facilityTypeLabel}
                </p>

                <div className="space-y-4">
                  {showOutdoorMatrix && (
                  <div className="p-3 bg-[#131315] border border-neutral-850 rounded-xl space-y-3">
                    <span className="text-[12px] text-white font-bold block">실외 주차 요금</span>
                    <div className="grid grid-cols-3 gap-2">
                      <PriceInput
                        label="기본요금 (원)"
                        value={outdoorBasePrice}
                        onChange={(v) => {
                          markFormDirty();
                          setOutdoorBasePrice(v);
                        }}
                        focusColorClass="focus-within:border-neutral-600"
                      />
                      <div>
                        <label className="text-[11px] text-white/80 font-bold block mb-1">기본 일수</label>
                        <input
                          type="number"
                          value={outdoorBaseDays}
                          onChange={(e) => {
                            markFormDirty();
                            setOutdoorBaseDays(Number(e.target.value));
                          }}
                          className="w-full bg-[#1C1C1E] border border-neutral-800 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-neutral-600 font-mono font-bold"
                        />
                      </div>
                      <PriceInput
                        label="이후 일 추가금"
                        value={outdoorExtraPrice}
                        onChange={(v) => {
                          markFormDirty();
                          setOutdoorExtraPrice(v);
                        }}
                        focusColorClass="focus-within:border-neutral-600"
                      />
                    </div>
                  </div>
                  )}

                  {showIndoorMatrix && (
                  <div className="p-3 bg-[#131315] border border-neutral-850 rounded-xl space-y-3">
                    <span className="text-[12px] text-white font-bold block">실내 주차 요금</span>
                    <div className="grid grid-cols-3 gap-2">
                      <PriceInput
                        label="기본요금 (원)"
                        value={indoorBasePrice}
                        onChange={(v) => {
                          markFormDirty();
                          setIndoorBasePrice(v);
                        }}
                        focusColorClass="focus-within:border-neutral-600"
                      />
                      <div>
                        <label className="text-[11px] text-white/80 font-bold block mb-1">기본 일수</label>
                        <input
                          type="number"
                          value={indoorBaseDays}
                          onChange={(e) => {
                            markFormDirty();
                            setIndoorBaseDays(Number(e.target.value));
                          }}
                          className="w-full bg-[#1C1C1E] border border-neutral-800 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-neutral-600 font-mono font-bold"
                        />
                      </div>
                      <PriceInput
                        label="이후 일 추가금"
                        value={indoorExtraPrice}
                        onChange={(v) => {
                          markFormDirty();
                          setIndoorExtraPrice(v);
                        }}
                        focusColorClass="focus-within:border-neutral-600"
                      />
                    </div>
                  </div>
                  )}

                  <div className="p-3 bg-[#131315] border border-neutral-850 rounded-xl space-y-3">
                    <span className="text-[12px] text-white font-bold block">야간/새벽 할증</span>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div className="flex flex-col items-center justify-center p-2.5 bg-neutral-900 border border-neutral-850 rounded-2xl shadow-sm">
                        <span className="text-[12px] text-white/80 font-extrabold mb-2">시작</span>
                        <button
                          type="button"
                          onClick={() => setActivePickerTarget('surchargeStart')}
                          className="w-full bg-[#1C1C1E] border border-neutral-800 hover:border-neutral-600 rounded-xl px-2.5 h-[42px] text-xs font-bold text-white flex items-center justify-center"
                        >
                          {surchargeStartTime || '시간 선택'}
                        </button>
                      </div>
                      <div className="flex flex-col items-center justify-center p-2.5 bg-neutral-900 border border-neutral-850 rounded-2xl shadow-sm">
                        <span className="text-[12px] text-white/80 font-extrabold mb-2">종료</span>
                        <button
                          type="button"
                          onClick={() => setActivePickerTarget('surchargeEnd')}
                          className="w-full bg-[#1C1C1E] border border-neutral-800 hover:border-neutral-600 rounded-xl px-2.5 h-[42px] text-xs font-bold text-white flex items-center justify-center"
                        >
                          {surchargeEndTime || '시간 선택'}
                        </button>
                      </div>
                      <PriceInput
                        label="할증요금 (원)"
                        value={surchargePrice}
                        onChange={(v) => {
                          markFormDirty();
                          setSurchargePrice(v);
                        }}
                        focusColorClass="focus-within:border-amber-500"
                        isXl={true}
                      />
                    </div>
                  </div>

                  <div className="p-3 bg-[#131315] border border-neutral-850 rounded-xl space-y-3">
                    <span className="text-[12px] text-white font-bold block">
                      {surchargeTerminal?.label || '터미널'} 이동 추가요금
                    </span>
                    <PriceInput
                      label="추가요금 (원)"
                      value={t2Surcharge}
                      onChange={(v) => {
                        markFormDirty();
                        setT2Surcharge(v);
                      }}
                      focusColorClass="focus-within:border-amber-500"
                      placeholder="0이면 없음"
                    />
                  </div>

                  <div className="p-3 bg-[#131315] border border-neutral-850 rounded-xl space-y-3">
                    <span className="text-[12px] text-white font-bold block">성수기 할증</span>
                    <p className="text-[11px] text-white/60 font-semibold">날짜 형식 MM-DD</p>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="text-[11px] text-white/80 font-bold block mb-1.5">시작일</label>
                        <input
                          type="text"
                          placeholder="07-15"
                          value={peakStartTime}
                          onChange={(e) => {
                            markFormDirty();
                            setPeakStartTime(e.target.value);
                          }}
                          className="w-full bg-[#1C1C1E] border border-neutral-800 rounded-xl px-2.5 py-2 text-xs text-white focus:outline-none focus:border-amber-500 font-mono font-bold text-center"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] text-white/80 font-bold block mb-1.5">종료일</label>
                        <input
                          type="text"
                          placeholder="08-31"
                          value={peakEndTime}
                          onChange={(e) => {
                            markFormDirty();
                            setPeakEndTime(e.target.value);
                          }}
                          className="w-full bg-[#1C1C1E] border border-neutral-800 rounded-xl px-2.5 py-2 text-xs text-white focus:outline-none focus:border-amber-500 font-mono font-bold text-center"
                        />
                      </div>
                      <PriceInput
                        label="할증요금 (원)"
                        value={peakSurcharge}
                        onChange={(v) => {
                          markFormDirty();
                          setPeakSurcharge(v);
                        }}
                        focusColorClass="focus-within:border-amber-500"
                        placeholder="예: 10000"
                        isXl={true}
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-neutral-900/40 p-5 rounded-3xl border border-neutral-850 space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-xs font-black text-amber-500 tracking-wider">
                    <FileSpreadsheet size={14} className="text-amber-500" />
                    <span>대면 입고</span>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={valetEnabled}
                    onClick={() => {
                      markFormDirty();
                      setValetEnabled((v) => !v);
                    }}
                    className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${valetEnabled ? 'bg-amber-500' : 'bg-neutral-700'}`}
                  >
                    <span
                      className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${valetEnabled ? 'translate-x-5' : ''}`}
                    />
                  </button>
                </div>
                <p className="text-[12px] text-white/70 leading-relaxed">
                  터미널에서 직접 인계·인수. 무료면 0원
                </p>

                {valetEnabled && (
                  <div className="space-y-3">
                    <div className="p-3 bg-[#131315] border border-neutral-850 rounded-xl space-y-3">
                      <label className="flex items-center gap-2 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={valetT1Enabled}
                          onChange={(e) => {
                            markFormDirty();
                            setValetT1Enabled(e.target.checked);
                          }}
                          className="w-4 h-4 rounded border-neutral-800 text-amber-500 focus:ring-amber-500 bg-[#1C1C1E] cursor-pointer"
                        />
                        <span className="text-[12px] text-white font-bold">
                          {primaryTerminal?.label || '제1터미널'} 대면
                        </span>
                      </label>
                      {valetT1Enabled && (
                        <PriceInput
                          label={`${primaryTerminal?.shortLabel || 'T1'} 추가요금`}
                          value={valetFeeT1}
                          onChange={(v) => {
                            markFormDirty();
                            setValetFeeT1(v);
                          }}
                          focusColorClass="focus-within:border-amber-500"
                          placeholder="무료면 0"
                        />
                      )}
                    </div>

                    <div className="p-3 bg-[#131315] border border-neutral-850 rounded-xl space-y-3">
                      <label className="flex items-center gap-2 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={valetT2Enabled}
                          onChange={(e) => {
                            markFormDirty();
                            setValetT2Enabled(e.target.checked);
                          }}
                          className="w-4 h-4 rounded border-neutral-800 text-amber-500 focus:ring-amber-500 bg-[#1C1C1E] cursor-pointer"
                        />
                        <span className="text-[12px] text-white font-bold">
                          {secondaryTerminal?.label || '제2터미널'} 대면
                        </span>
                      </label>
                      {valetT2Enabled && (
                        <PriceInput
                          label={`${secondaryTerminal?.shortLabel || 'T2'} 추가요금`}
                          value={valetFeeT2}
                          onChange={(v) => {
                            markFormDirty();
                            setValetFeeT2(v);
                          }}
                          focusColorClass="focus-within:border-amber-500"
                          placeholder="무료면 0"
                        />
                      )}
                    </div>

                    {!valetT1Enabled && !valetT2Enabled && (
                      <p className="text-[11px] text-red-400 font-bold px-1">
                        터미널을 최소 한 곳 선택해 주세요.
                      </p>
                    )}
                  </div>
                )}
              </div>
            </>
          )}

          {settingsTab === 'staff' && (
            <div className="bg-neutral-900/40 p-5 rounded-3xl border border-neutral-850 space-y-4">
              <div className="flex items-center gap-2 text-xs font-black text-amber-500 tracking-wider">
                <Users size={14} className="text-amber-500" />
                <span>직원 계정</span>
              </div>
              <p className="text-[12px] text-white/70 leading-relaxed">
                직원 로그인 시 기사 모드로 진입합니다. 추가·삭제는 바로 저장됩니다.
              </p>

              <form onSubmit={handleAddEmployee} className="p-4 bg-[#131315] border border-neutral-850 rounded-2xl space-y-3.5">
                <div className="text-[12.5px] font-bold text-white">신규 직원 등록</div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="text-[11px] text-white/80 font-bold block mb-1">이름</label>
                    <input
                      type="text"
                      placeholder="홍길동"
                      value={empName}
                      onChange={(e) => setEmpName(e.target.value)}
                      className="w-full bg-[#1C1C1E] border border-neutral-800 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-amber-500 font-bold"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-white/80 font-bold block mb-1">로그인 ID</label>
                    <input
                      type="text"
                      placeholder="wawa_hong"
                      value={empLoginId}
                      onChange={(e) => setEmpLoginId(e.target.value)}
                      className="w-full bg-[#1C1C1E] border border-neutral-800 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-amber-500 font-mono font-bold"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-white/80 font-bold block mb-1">비밀번호</label>
                    <input
                      type="password"
                      placeholder="••••••"
                      value={empPassword}
                      onChange={(e) => setEmpPassword(e.target.value)}
                      className="w-full bg-[#1C1C1E] border border-neutral-800 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-amber-500 font-mono"
                    />
                  </div>
                </div>
                <div className="flex items-center gap-2 pt-1.5 px-1">
                  <input
                    type="checkbox"
                    id="emp-is-admin-checkbox"
                    checked={empIsAdmin}
                    onChange={(e) => setEmpIsAdmin(e.target.checked)}
                    className="w-4 h-4 rounded border-neutral-800 text-amber-500 focus:ring-amber-500 bg-[#1C1C1E] cursor-pointer"
                  />
                  <label htmlFor="emp-is-admin-checkbox" className="text-[12px] text-white font-bold cursor-pointer select-none">
                    부관리자 권한 (요금·직원 관리)
                  </label>
                </div>
                <button
                  type="submit"
                  className="w-full py-2.5 bg-amber-500 hover:bg-amber-600 text-neutral-950 font-black rounded-xl text-xs transition-all"
                >
                  직원 등록
                </button>
              </form>

              <div className="space-y-2 mt-2">
                <div className="text-[12.5px] font-bold text-white flex items-center justify-between px-1">
                  <span>등록된 직원</span>
                  <span className="text-[12px] text-white/70 font-mono">{employeeList.length}명</span>
                </div>

                {employeeList.length === 0 ? (
                  <div className="text-center py-6 bg-neutral-950/20 border border-neutral-850/50 rounded-2xl text-white/50 text-[12.5px]">
                    등록된 직원이 없습니다.
                  </div>
                ) : (
                  <div className="overflow-x-auto border border-neutral-850 rounded-2xl bg-[#0F0F11]">
                    <table className="w-full text-left text-[13px] border-collapse">
                      <thead>
                        <tr className="border-b border-neutral-850 bg-neutral-900/60 text-white/80 font-bold">
                          <th className="p-3">이름/권한</th>
                          <th className="p-3">로그인 ID</th>
                          <th className="p-3">비밀번호</th>
                          <th className="p-3 text-right">관리</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-neutral-850/50">
                        {employeeList.map((emp) => (
                          <tr key={emp.id} className="hover:bg-neutral-900/30 text-white font-medium">
                            <td className="p-3 text-white font-bold">
                              <div className="flex items-center gap-2">
                                <span>{emp.name}</span>
                                {emp.role === 'admin' ? (
                                  <span className="text-[11px] text-white bg-neutral-800 px-1.5 py-0.5 rounded font-black border border-neutral-700 shrink-0">부관리자</span>
                                ) : (
                                  <span className="text-[11px] text-white/70 bg-neutral-900 px-1.5 py-0.5 rounded font-bold border border-neutral-800 shrink-0">기사</span>
                                )}
                              </div>
                            </td>
                            <td className="p-3 font-mono text-white">{emp.loginId}</td>
                            <td className="p-3 font-mono text-white/70">
                              {emp.password ? '••••••' : '서버 보관'}
                            </td>
                            <td className="p-3 text-right">
                              <button
                                type="button"
                                onClick={() => handleDeleteEmployee(emp.id, emp.name)}
                                className="px-2.5 py-1 bg-red-950/40 hover:bg-red-900/30 text-red-500 rounded-lg border border-red-900/25 transition-all text-[12px] font-bold"
                              >
                                삭제
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="fixed bottom-0 left-0 right-0 z-40 p-4 bg-gradient-to-t from-black via-black/95 to-transparent pointer-events-none">
          <div className="max-w-lg mx-auto pointer-events-auto">
            <button
              type="button"
              onClick={handleSavePartnerSelf}
              className="w-full py-4 bg-gradient-to-r from-amber-500 to-amber-600 text-neutral-950 font-black rounded-2xl border border-amber-400/30 hover:brightness-110 shadow-lg shadow-amber-500/10 transition-all flex items-center justify-center gap-2 text-xs"
              id="save-partner-rates-btn"
            >
              <Save size={14} />
              <span>저장하기</span>
            </button>
            {settingsTab === 'staff' && (
              <p className="text-[10px] text-zinc-500 text-center mt-2 font-semibold">
                직원 추가·삭제는 즉시 반영 · 저장은 요금·픽업·대면용
              </p>
            )}
          </div>
        </div>
      </div>
      {surchargeTimePicker}
      </>
    );
}
