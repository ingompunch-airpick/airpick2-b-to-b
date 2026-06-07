import React, { useState, useEffect } from 'react';
import { CompanyInfo, Reservation, Company, PartnerCompany, Employee, ParkingLotSite } from '../types';
import { 
  Building2, 
  KeyRound, 
  CheckCircle2, 
  Save, 
  Users, 
  FileSpreadsheet,
  Lock,
  Sliders,
  ChevronUp,
  ChevronDown,
  Edit,
  Trash2,
  MapPin,
  ChevronLeft
} from 'lucide-react';
import { FALLBACK_COMPANIES } from '../data';
import { doc, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import TimePickerModal from './TimePickerModal';
import ParkingLotsEditor from './ParkingLotsEditor';
import ParkingLotsReadOnly from './ParkingLotsReadOnly';
import {
  createEmptyParkingLot,
  deriveLegacyParkingFields,
  normalizeParkingLotsFromCompany,
  validateParkingLots,
} from '../utils/parkingLots';
import { isAirpickHeadquarters } from '../constants/platform';

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


interface MasterSettingsViewProps {
  companyInfo: CompanyInfo;
  onUpdateCompany: (info: CompanyInfo) => void;
  reservations: Reservation[];
  companies?: Company[];
  onUpdateCompanies?: (updated: Company[]) => void;
  partners?: PartnerCompany[];
  onUpdatePartners?: (updated: PartnerCompany[]) => void;
  isSuperAdmin?: boolean;
  currentCompanyId?: string;
  onBack?: () => void;
  isEmployee?: boolean;
  employeeRole?: 'admin' | 'driver';
}

export default function MasterSettingsView({ 
  companyInfo, 
  onUpdateCompany,
  reservations,
  companies,
  onUpdateCompanies,
  partners,
  onUpdatePartners,
  isSuperAdmin = false,
  currentCompanyId,
  onBack,
  isEmployee = false,
  employeeRole = 'driver'
}: MasterSettingsViewProps) {
  const activeCompanyId = currentCompanyId || companyInfo.id;
  /** 본사(airpick) 컨텍스트에서만 제휴업체 등록·수정 화면. wawa 등 제휴업체를 볼 때는 업체 화면과 동일 */
  const isHqPartnerManagement = isSuperAdmin && isAirpickHeadquarters(activeCompanyId);
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

  const handleAddEmployee = (e: React.FormEvent) => {
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

    let found = false;
    const updatedPartners = (partners || []).map(p => {
      if (p.companyId === companyInfo.id) {
        found = true;
        const currentEmployees = p.employees || [];
        return {
          ...p,
          employees: [...currentEmployees, newEmployee]
        };
      }
      return p;
    });

    if (!found) {
      updatedPartners.push({
        companyId: companyInfo.id,
        password: partnerPassword || 'master1234',
        name: companyInfo.name,
        representative: '제휴 사장님',
        phone: partnerPhone || companyInfo.phone || '1545-5746',
        settlementMemo: '',
        status: 'active',
        employees: [newEmployee]
      });
    }

    // Direct Firestore update for this partner company's employee list with strict sanitization of undefined values
    const targetEmployees = [...employeeList, newEmployee].map(emp => ({
      id: emp.id || '',
      name: emp.name || '',
      loginId: emp.loginId || '',
      password: emp.password || '',
      role: emp.role || 'driver'
    }));

    setDoc(doc(db, 'companies', companyInfo.id), {
      employees: targetEmployees
    }, { merge: true }).catch(err => {
      console.warn("Firestore update for adding employee failed:", err);
    });

    if (onUpdatePartners) {
      onUpdatePartners(updatedPartners);
    }
    localStorage.setItem('super_partners_list', JSON.stringify(updatedPartners));

    setEmpName('');
    setEmpLoginId('');
    setEmpPassword('');
    setEmpIsAdmin(false);
    alert(`👥 신규 직원 [${cleanName}] 기사가 성료 등록되었습니다.`);
  };

  const handleDeleteEmployee = (empId: string, empName: string) => {
    if (!window.confirm(`👥 소속 직원 [${empName}] 기사를 정말 삭제(퇴사 처리)하시겠습니까?`)) {
      return;
    }

    const updatedPartners = (partners || []).map(p => {
      if (p.companyId === companyInfo.id) {
        return {
          ...p,
          employees: (p.employees || []).filter(emp => emp.id !== empId)
        };
      }
      return p;
    });

    // Direct Firestore update for this partner company's employee list with strict sanitization of undefined values
    const targetEmployees = employeeList.filter(emp => emp.id !== empId).map(emp => ({
      id: emp.id || '',
      name: emp.name || '',
      loginId: emp.loginId || '',
      password: emp.password || '',
      role: emp.role || 'driver'
    }));

    setDoc(doc(db, 'companies', companyInfo.id), {
      employees: targetEmployees
    }, { merge: true }).catch(err => {
      console.warn("Firestore update for deleting employee failed:", err);
    });

    if (onUpdatePartners) {
      onUpdatePartners(updatedPartners);
    }
    localStorage.setItem('super_partners_list', JSON.stringify(updatedPartners));
    alert(`👥 [${empName}] 기사가 안전하게 해임(삭제)되었습니다.`);
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

  useEffect(() => {
    if (!isHqPartnerManagement) {
      const p = (partners || []).find(x => x.companyId === companyInfo.id);
      if (p) {
        setPartnerPassword(p.password || '');
        setPartnerPhone(p.phone || companyInfo.phone || '');
      } else {
        setPartnerPhone(companyInfo.phone || '');
      }

      const c = (companies || []).find(x => x.id === companyInfo.id);
      if (c) {
        setPartnerRateText((c.features && c.features[0]) || '');
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
      }
    }
  }, [isHqPartnerManagement, partners, companies, companyInfo]);

  const handleSavePartnerSelf = async () => {
    try {
      const cleanPassword = (partnerPassword || '').trim() || 'master1234';
      const cleanPhone = (partnerPhone || companyInfo.phone || '1544-5746').trim();

      let found = false;
      const updatedPartners = (partners || []).map(p => {
        if (p.companyId === companyInfo.id) {
          found = true;
          return {
            ...p,
            password: isEmployee ? (p.password || 'master1234') : (partnerPassword ? cleanPassword : p.password),
            phone: cleanPhone
          };
        }
        return p;
      });
      if (!found) {
        updatedPartners.push({
          companyId: companyInfo.id,
          password: isEmployee ? 'master1234' : (cleanPassword || 'master1234'),
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
      localStorage.setItem('super_partners_list', JSON.stringify(updatedPartners));

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

      const updatedCompanies = dbCompanies.map(c => {
        if (c.id === companyInfo.id) {
          return {
            ...c,
            base_price: Number(outdoorBasePrice) || 0,
            extra_day_price: Number(outdoorExtraPrice) || 0,
            base_days: Number(outdoorBaseDays) || 0,
            outdoorBasePrice: Number(outdoorBasePrice) || 0,
            outdoorBaseDays: Number(outdoorBaseDays) || 0,
            outdoorExtraPrice: Number(outdoorExtraPrice) || 0,
            indoorBasePrice: Number(indoorBasePrice) || 0,
            indoorBaseDays: Number(indoorBaseDays) || 0,
            indoorExtraPrice: Number(indoorExtraPrice) || 0,
            surchargeStartTime: surchargeStartTime || '00:00',
            surchargeEndTime: surchargeEndTime || '00:00',
            surchargePrice: Number(surchargePrice) || 0,
            t2Surcharge: Number(t2Surcharge) || 0,
            peakStartTime: peakStartTime || '',
            peakEndTime: peakEndTime || '',
            peakSurcharge: Number(peakSurcharge) || 0
          };
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

      // Direct Firestore update for this partner company item, sanitizing all undefined values
      try {
        const docRef = doc(db, 'companies', companyInfo.id);
        await setDoc(docRef, {
          base_price: Number(outdoorBasePrice) || 0,
          extra_day_price: Number(outdoorExtraPrice) || 0,
          base_days: Number(outdoorBaseDays) || 0,
          outdoorBasePrice: Number(outdoorBasePrice) || 0,
          outdoorBaseDays: Number(outdoorBaseDays) || 0,
          outdoorExtraPrice: Number(outdoorExtraPrice) || 0,
          indoorBasePrice: Number(indoorBasePrice) || 0,
          indoorBaseDays: Number(indoorBaseDays) || 0,
          indoorExtraPrice: Number(indoorExtraPrice) || 0,
          surchargeStartTime: surchargeStartTime || '00:00',
          surchargeEndTime: surchargeEndTime || '00:00',
          surchargePrice: Number(surchargePrice) || 0,
          t2Surcharge: Number(t2Surcharge) || 0,
          peakStartTime: peakStartTime || '',
          peakEndTime: peakEndTime || '',
          peakSurcharge: Number(peakSurcharge) || 0,
          employees: (employeeList || []).map(emp => ({
            id: emp.id || '',
            name: emp.name || '',
            loginId: emp.loginId || '',
            password: emp.password || '',
            role: emp.role || 'driver'
          }))
        }, { merge: true });
      } catch (err: any) {
        handleFirestoreError(err, OperationType.WRITE, `companies/${companyInfo.id}`);
      }

      alert(`🎉 [${companyInfo.name}] 자율 주차 요금 및 터미널 정보 등의 변경 사항이 파이어베이스(Firestore) 및 로컬스토리지에 안전하게 성공적으로 실시간 업데이트 저장되었습니다.`);
      if (onBack) {
        onBack();
      }
    } catch (unexpectedErr: any) {
      console.error("Error in handleSavePartnerSelf:", unexpectedErr);
      alert(`❌ 저장 도중 오류가 발생했습니다: ${unexpectedErr?.message || unexpectedErr}`);
    }
  };

  // 1. Form fields for Company
  const [id, setId] = useState(companyInfo.id || 'wawa');
  const [name, setName] = useState(companyInfo.name || '');
  const [phone, setPhone] = useState(companyInfo.phone || '');
  const [facilityType, setFacilityType] = useState<'indoor' | 'outdoor' | 'mixed'>(() => {
    if (companyInfo.facilityType) return companyInfo.facilityType;
    return companyInfo.isIndoor ? 'indoor' : 'outdoor';
  });
  const [parkingLots, setParkingLots] = useState<ParkingLotSite[]>(() => [createEmptyParkingLot('indoor', 0)]);
  const [hqTab, setHqTab] = useState<'register' | 'manage'>('manage');
  const [lockedCompanyId, setLockedCompanyId] = useState<string | null>(null);

  useEffect(() => {
    if (!isHqPartnerManagement || !id || !lockedCompanyId) return;
    const c = (companies || []).find((x) => x.id === id);
    if (!c) {
      setParkingLots([createEmptyParkingLot('indoor', 0)]);
      return;
    }
    setParkingLots(normalizeParkingLotsFromCompany(c));
    if (c.facilityType) {
      setFacilityType(c.facilityType);
    }
  }, [isHqPartnerManagement, companies, id, lockedCompanyId]);

  // Auto-generate companyId from name (신규 등록 시에만)
  useEffect(() => {
    if (lockedCompanyId || !name.trim()) return;
    const cleanId = name.trim().toLowerCase().includes('가유')
      ? 'gayu'
      : name.trim().toLowerCase().includes('에어') 
      ? 'air25' 
      : name.trim().toLowerCase().includes('케어') 
      ? 'care' 
      : name.trim().toLowerCase().includes('와와')
      ? 'wawa'
      : name.trim().toLowerCase().replace(/[^a-z0-9]/g, '') || 'wawa';
    setId(cleanId);
  }, [name, lockedCompanyId]);

  const resetRegisterForm = () => {
    setLockedCompanyId(null);
    setName('');
    setPhone('');
    setFacilityType('indoor');
    setParkingLots([createEmptyParkingLot('indoor', 0)]);
    setMasterEmail('');
    setMasterPassword('');
    setId('');
  };

  const resolveCompanyById = (companyId: string): Company | undefined => {
    const fromState = (companies || []).find((c) => c.id === companyId);
    if (fromState) return fromState;
    try {
      const saved = localStorage.getItem('companies');
      if (saved) {
        const parsed = JSON.parse(saved) as Company[];
        return parsed.find((c) => c.id === companyId);
      }
    } catch (_) {}
    return undefined;
  };

  const loadPartnerForEdit = (companyId: string) => {
    const partner = (partners || []).find((p) => p.companyId === companyId);
    const company = resolveCompanyById(companyId);
    if (!partner) return;

    setLockedCompanyId(companyId);
    setId(companyId);
    setName(partner.name);
    setPhone(partner.phone);
    setMasterPassword(partner.password || '');
    setMasterEmail(localStorage.getItem(`master_account_email_${companyId}`) || '');

    if (company?.facilityType) {
      setFacilityType(company.facilityType);
    } else if (company?.supports_indoor && company?.supports_outdoor) {
      setFacilityType('mixed');
    } else if (company?.supports_outdoor) {
      setFacilityType('outdoor');
    } else {
      setFacilityType('indoor');
    }

    setParkingLots(normalizeParkingLotsFromCompany(company));
    setHqTab('manage');
  };

  const computePartnerStats = (compId: string) => {
    const list = (reservations || []).filter(
      (r) =>
        r.companyId === compId ||
        (r.companyName && compId === 'wawa' && r.companyName.includes('와와'))
    );
    const kstDate = new Date(Date.now() + 9 * 60 * 60 * 1000);
    const todayStr = kstDate.toISOString().split('T')[0];
    const thisMonthStr = kstDate.toISOString().substring(0, 7);

    const todayCompleted = list.filter((r) => {
      const isCompleted = r.status === 'completed_out' || r.status === 'completed_in';
      const isToday =
        r.departureDate === todayStr ||
        r.arrivalDate === todayStr ||
        (r.createdAt && r.createdAt.includes(todayStr));
      return isCompleted && isToday;
    }).length;

    const monthlyCompleted = list.filter((r) => {
      const isCompleted = r.status === 'completed_out' || r.status === 'completed_in';
      const isThisMonth =
        (r.departureDate && r.departureDate.startsWith(thisMonthStr)) ||
        (r.arrivalDate && r.arrivalDate.startsWith(thisMonthStr)) ||
        (r.createdAt && r.createdAt.includes(thisMonthStr));
      return isCompleted && isThisMonth;
    }).length;

    return { todayCompleted, monthlyCompleted };
  };

  const handleTogglePartnerStatus = (companyId: string) => {
    let nextStatus: 'active' | 'suspended' = 'active';
    const updated = (partners || []).map((p) => {
      if (p.companyId === companyId) {
        nextStatus = p.status === 'active' ? 'suspended' : 'active';
        return { ...p, status: nextStatus };
      }
      return p;
    });
    if (onUpdatePartners) onUpdatePartners(updated);
    localStorage.setItem('super_partners_list', JSON.stringify(updated));
    updateDoc(doc(db, 'companies', companyId), {
      status: nextStatus,
      updatedAt: new Date().toISOString(),
    }).catch((err) => console.warn('Firestore status toggle failed:', err));
  };

  const handleDeletePartner = async (companyId: string, companyName: string) => {
    if (
      !window.confirm(
        `⚠️ [${companyName} (${companyId})] 제휴업체를 완전히 삭제하시겠습니까?\n삭제 즉시 계정 정보가 영구 폐기되며 복구할 수 없습니다.`
      )
    ) {
      return;
    }

    const nextPartners = (partners || []).filter((p) => p.companyId !== companyId);
    const nextCompanies = (companies || []).filter((c) => c.id !== companyId);
    if (onUpdatePartners) onUpdatePartners(nextPartners);
    if (onUpdateCompanies) onUpdateCompanies(nextCompanies);
    localStorage.setItem('super_partners_list', JSON.stringify(nextPartners));
    localStorage.setItem('companies', JSON.stringify(nextCompanies));

    try {
      await deleteDoc(doc(db, 'companies', companyId));
    } catch (err) {
      console.warn('Firestore deleteDoc failed:', err);
    }

    try {
      localStorage.removeItem(`${companyId}_reservations`);
      localStorage.removeItem(`${companyId}_drivers`);
    } catch (_) {}

    if (lockedCompanyId === companyId) resetRegisterForm();
    alert(`🏢 [${companyName}] 업체 정보가 삭제되었습니다.`);
  };

  // 2. Master Account values from local storage
  const [masterEmail, setMasterEmail] = useState(() => {
    return localStorage.getItem('master_account_email') || '';
  });
  const [masterPassword, setMasterPassword] = useState(() => {
    return localStorage.getItem('master_account_password') || '';
  });

  // 3. Status Flags
  const [isSaved, setIsSaved] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const handleSave = async () => {
    if (isSaving) return;
    setSaveError(null);

    const cleanName = name.trim();
    const cleanPhone = phone.trim();
    const cleanEmail = masterEmail.trim().toLowerCase();
    const cleanPassword = masterPassword.trim();

    if (!cleanName) {
      setSaveError('업체 명을 입력해주세요.');
      return;
    }
    if (!cleanPhone) {
      setSaveError('대표전화 번호를 입력해주세요.');
      return;
    }
    if (!lockedCompanyId && !cleanEmail) {
      setSaveError('마스터 로그인 이메일을 입력해주세요.');
      return;
    }
    if (!cleanPassword) {
      setSaveError('마스터 로그인 보안 암호를 입력해주세요.');
      return;
    }

    const addressError = validateParkingLots(parkingLots);
    if (addressError) {
      setSaveError(addressError);
      return;
    }

    setIsSaving(true);
    try {
      const parkingAddressFields = deriveLegacyParkingFields(parkingLots);

      const generatedId =
        lockedCompanyId ||
        (cleanName.includes('와와')
          ? 'wawa'
          : cleanName.includes('가유')
          ? 'gayu'
          : cleanName.includes('에어')
          ? 'air25'
          : cleanName.includes('케어')
          ? 'care'
          : cleanName.replace(/[^a-zA-Z0-9]/g, '').toLowerCase() || 'co_' + Math.random().toString(36).substring(2, 7));

      const settlementMemo = `시설 유형: ${facilityType === 'indoor' ? '실내' : facilityType === 'outdoor' ? '실외' : '실내+실외 혼합'}`;

      const savedCompaniesStr = localStorage.getItem('companies');
      let dbCompanies: Company[] = [];
      if (savedCompaniesStr) {
        try {
          dbCompanies = JSON.parse(savedCompaniesStr);
        } catch (_) {}
      }
      if (!dbCompanies || dbCompanies.length === 0) {
        dbCompanies = [...FALLBACK_COMPANIES];
      }

      const existingCompany =
        dbCompanies.find((c) => c.id === generatedId) || resolveCompanyById(generatedId);

      const newCompanyObj: Company = {
        ...(existingCompany || {}),
        id: generatedId,
        name: cleanName,
        phone: cleanPhone,
        representative: existingCompany?.representative || '제휴 사장님',
        is_indoor: facilityType === 'indoor' || facilityType === 'mixed',
        supports_indoor: facilityType === 'indoor' || facilityType === 'mixed',
        supports_outdoor: facilityType === 'outdoor' || facilityType === 'mixed',
        base_price: existingCompany?.base_price ?? 15000,
        extra_day_price: existingCompany?.extra_day_price ?? 5000,
        base_days: existingCompany?.base_days ?? 1,
        rating: existingCompany?.rating ?? 4.8,
        reviews_count: existingCompany?.reviews_count ?? 14,
        features: existingCompany?.features?.length
          ? existingCompany.features
          : [facilityType === 'indoor' ? '실내 정식' : facilityType === 'outdoor' ? '실외 야외' : '실내+실외'],
        image_url:
          existingCompany?.image_url ||
          'https://images.unsplash.com/photo-1545179605-1296651e9d43?q=80&w=200&auto=format&fit=crop',
        terminals: existingCompany?.terminals || ['T1', 'T2'],
        isOpen: existingCompany?.isOpen ?? true,
        outdoorBasePrice: existingCompany?.outdoorBasePrice ?? existingCompany?.base_price ?? 15000,
        outdoorBaseDays: existingCompany?.outdoorBaseDays ?? existingCompany?.base_days ?? 1,
        outdoorExtraPrice: existingCompany?.outdoorExtraPrice ?? existingCompany?.extra_day_price ?? 5000,
        indoorBasePrice: existingCompany?.indoorBasePrice ?? 30000,
        indoorBaseDays: existingCompany?.indoorBaseDays ?? 1,
        indoorExtraPrice: existingCompany?.indoorExtraPrice ?? 10000,
        surchargeStartTime: existingCompany?.surchargeStartTime ?? '20:00',
        surchargeEndTime: existingCompany?.surchargeEndTime ?? '05:00',
        surchargePrice: existingCompany?.surchargePrice ?? 10000,
        t2Surcharge: existingCompany?.t2Surcharge ?? 0,
        peakStartTime: existingCompany?.peakStartTime ?? '',
        peakEndTime: existingCompany?.peakEndTime ?? '',
        peakSurcharge: existingCompany?.peakSurcharge ?? 0,
        facilityType,
        ...parkingAddressFields,
      };

      const existingIdx = dbCompanies.findIndex((c) => c.id === generatedId);
      if (existingIdx >= 0) {
        dbCompanies[existingIdx] = newCompanyObj;
      } else {
        dbCompanies.push(newCompanyObj);
      }
      localStorage.setItem('companies', JSON.stringify(dbCompanies));

      const savedPartnersStr = localStorage.getItem('super_partners_list');
      let dbPartners: PartnerCompany[] = [];
      if (savedPartnersStr) {
        try {
          dbPartners = JSON.parse(savedPartnersStr);
        } catch (_) {}
      }

      const extPartnerIdx = dbPartners.findIndex((p) => p.companyId === generatedId);
      const isNewPartner = extPartnerIdx < 0;
      const existingPartner = extPartnerIdx >= 0 ? dbPartners[extPartnerIdx] : undefined;

      const newPartnerObj: PartnerCompany = {
        companyId: generatedId,
        password: cleanPassword,
        name: cleanName,
        representative: existingPartner?.representative || '제휴 사장님',
        phone: cleanPhone,
        settlementMemo,
        status: existingPartner?.status || 'active',
        employees: existingPartner?.employees || [],
      };

      if (extPartnerIdx >= 0) {
        dbPartners[extPartnerIdx] = newPartnerObj;
      } else {
        dbPartners.push(newPartnerObj);
      }
      localStorage.setItem('super_partners_list', JSON.stringify(dbPartners));

      let firestoreSynced = true;
      try {
        const firestorePayload: Record<string, unknown> = {
          ...newCompanyObj,
          facilityType,
          ...parkingAddressFields,
          password: cleanPassword,
          ...(cleanEmail ? { masterEmail: cleanEmail } : {}),
          settlementMemo,
          status: newPartnerObj.status,
          updatedAt: new Date().toISOString(),
        };
        if (isNewPartner) {
          firestorePayload.blockedDates = [];
        }
        await setDoc(doc(db, 'companies', generatedId), firestorePayload, { merge: true });
      } catch (err: unknown) {
        firestoreSynced = false;
        handleFirestoreError(err, OperationType.WRITE, `companies/${generatedId}`);
      }

      if (isNewPartner) {
        const reservationsKey = `${generatedId}_reservations`;
        if (!localStorage.getItem(reservationsKey)) {
          localStorage.setItem(reservationsKey, JSON.stringify([]));
        }
        const driversKey = `${generatedId}_drivers`;
        if (!localStorage.getItem(driversKey)) {
          localStorage.setItem(driversKey, JSON.stringify([
            { id: '1', name: `${cleanName} 대기기사`, phone: cleanPhone, rating: 4.8 },
          ]));
        }
      }

      if (onUpdateCompanies) onUpdateCompanies(dbCompanies);
      if (onUpdatePartners) onUpdatePartners(dbPartners);
      if (onUpdateCompany) {
        onUpdateCompany({
          id: generatedId,
          name: cleanName,
          region: facilityType === 'indoor' ? '실내' : facilityType === 'outdoor' ? '실외' : '실내+실외 혼합',
          phone: cleanPhone,
          logo: '',
          isIndoor: facilityType === 'indoor' || facilityType === 'mixed',
          facilityType,
          ratePolicy: '',
          parkingLots: parkingAddressFields.parkingLots,
        });
      }

      if (cleanEmail) {
        localStorage.setItem('master_account_email', cleanEmail);
        localStorage.setItem(`master_account_email_${generatedId}`, cleanEmail);
      }
      localStorage.setItem('master_account_password', cleanPassword);

      alert(
        firestoreSynced
          ? isNewPartner
            ? `🎉 [${cleanName}] 등록이 완료되었습니다!\n아이디 '${generatedId}' 로 로그인할 수 있습니다.`
            : `🎉 [${cleanName}] 변경 내용이 저장되었습니다.`
          : `✅ [${cleanName}] 로컬에 저장되었습니다.\nFirebase 동기화는 연결 후 자동 반영됩니다.`
      );

      resetRegisterForm();
      setHqTab('manage');
      setIsSaved(true);
      setTimeout(() => setIsSaved(false), 3000);
    } catch (unexpectedErr: unknown) {
      console.error('handleSave failed:', unexpectedErr);
      setSaveError(`저장 중 오류: ${unexpectedErr instanceof Error ? unexpectedErr.message : String(unexpectedErr)}`);
    } finally {
      setIsSaving(false);
    }
  };

  const surchargeTimePicker = (
    <TimePickerModal
      isOpen={activePickerTarget !== null}
      onClose={() => setActivePickerTarget(null)}
      initialValue={
        activePickerTarget === 'surchargeStart' ? surchargeStartTime : surchargeEndTime
      }
      onSelect={(val) => {
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

  const partnerCompany = (companies || []).find((c) => c.id === companyInfo.id);
  const partnerParkingLots = normalizeParkingLotsFromCompany(partnerCompany);

  if (!isHqPartnerManagement) {
    return (
      <>
      <div className="bg-black min-h-screen text-white p-4 pb-20 selection:bg-amber-500 selection:text-neutral-950">
        {/* Header section */}
        <div className="flex items-center justify-between gap-3.5 mb-6 px-1">
          <div className="flex items-center gap-3.5">
            <div className="p-2.5 bg-neutral-900 border border-neutral-850 rounded-2xl text-white shadow-sm">
              <Sliders size={18} />
            </div>
            <div>
              <h2 className="text-sm font-black tracking-tight text-white">자율 요금 및 기사/직원 관리</h2>
              <p className="text-[12px] text-white/50 font-bold uppercase tracking-wider">Independent Rate & Dispatchers Configuration</p>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-neutral-900/40 p-5 rounded-3xl border border-neutral-850 space-y-3">
            <div className="flex items-center gap-2 text-xs font-black text-amber-500 tracking-wider uppercase">
              <MapPin size={14} />
              <span>내 주차장 위치</span>
            </div>
            <p className="text-[12px] text-white/60 leading-relaxed">
              주차장 위치는 에어픽 본사에서 등록합니다. 아래 내용만 확인할 수 있으며 직접 수정할 수 없습니다.
            </p>
            <ParkingLotsReadOnly lots={partnerParkingLots} />
          </div>

          <div className="bg-neutral-900/40 p-4.5 rounded-2xl border border-neutral-850 flex items-center justify-between">
            <div>
              <span className="text-[12px] text-white/70 font-black tracking-wider block uppercase mb-0.5">정식 로그인 업체</span>
              <span className="text-xs font-black text-white">{companyInfo.name || '와와'}</span>
            </div>
            <span className="text-[12px] bg-neutral-950 border border-neutral-850 text-white/80 px-3 py-1 rounded-xl font-mono font-bold">
              ID: {companyInfo.id}
            </span>
          </div>

          {/* 3. 주차 요금 설정 */}
          <div className="bg-neutral-900/40 p-5 rounded-3xl border border-neutral-850 space-y-4">
            <div className="flex items-center gap-2 text-xs font-black text-amber-500 tracking-wider uppercase">
              <FileSpreadsheet size={14} className="text-amber-500" />
              <span>[1] 인천공항 세부 요금제 매트릭스 설정</span>
            </div>
            <p className="text-[12.5px] text-white/80 leading-relaxed mb-1">
              공항 현장 실정에 맞춘 실외/실내 차등 요금제 및 야간 입출고 할증 기준표입니다.
            </p>
            
            <div className="space-y-4">
              {/* 실외 주차 요금 */}
              <div className="p-3 bg-[#131315] border border-neutral-850 rounded-xl space-y-3">
                <span className="text-[12px] text-white font-bold block">● 실외 주차 요금 (Outdoor Matrix)</span>
                <div className="grid grid-cols-3 gap-2">
                  <PriceInput
                    label="실외 기본요금 (원)"
                    value={outdoorBasePrice}
                    onChange={setOutdoorBasePrice}
                    focusColorClass="focus-within:border-neutral-600"
                  />
                  <div>
                    <label className="text-[11px] text-white/80 font-bold block mb-1">기본 일수 (일)</label>
                    <input 
                      type="number" 
                      value={outdoorBaseDays}
                      onChange={(e) => setOutdoorBaseDays(Number(e.target.value))}
                      className="w-full bg-[#1C1C1E] border border-neutral-800 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-neutral-600 font-mono font-bold" 
                    />
                  </div>
                  <PriceInput
                    label="이후 일 추가금 (원)"
                    value={outdoorExtraPrice}
                    onChange={setOutdoorExtraPrice}
                    focusColorClass="focus-within:border-neutral-600"
                  />
                </div>
              </div>

              {/* 실내 주차 요금 */}
              <div className="p-3 bg-[#131315] border border-neutral-850 rounded-xl space-y-3">
                <span className="text-[12px] text-white font-bold block">● 실내 주차 요금 (Indoor Matrix)</span>
                <div className="grid grid-cols-3 gap-2">
                  <PriceInput
                    label="실내 기본요금 (원)"
                    value={indoorBasePrice}
                    onChange={setIndoorBasePrice}
                    focusColorClass="focus-within:border-neutral-600"
                  />
                  <div>
                    <label className="text-[11px] text-white/80 font-bold block mb-1">기본 일수 (일)</label>
                    <input 
                      type="number" 
                      value={indoorBaseDays}
                      onChange={(e) => setIndoorBaseDays(Number(e.target.value))}
                      className="w-full bg-[#1C1C1E] border border-neutral-800 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-neutral-600 font-mono font-bold" 
                    />
                  </div>
                  <PriceInput
                    label="이후 일 추가금 (원)"
                    value={indoorExtraPrice}
                    onChange={setIndoorExtraPrice}
                    focusColorClass="focus-within:border-neutral-600"
                  />
                </div>
              </div>

              {/* 야간/새벽 입출고 할증 */}
              <div className="p-3 bg-[#131315] border border-neutral-850 rounded-xl space-y-3">
                <span className="text-[12px] text-white font-bold block">● 야간/새벽 할증 요율 (Surcharge Matrix)</span>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="flex flex-col items-center justify-center p-2.5 bg-neutral-900 border border-neutral-850 rounded-2xl shadow-sm">
                    <span className="text-[12px] text-white/80 font-extrabold mb-2 uppercase tracking-wide">시작 시간</span>
                    <button
                      type="button"
                      onClick={() => setActivePickerTarget('surchargeStart')}
                      className="w-full bg-[#1C1C1E] border border-neutral-800 hover:border-neutral-600 hover:bg-[#2C2C2E]/50 active:scale-[0.98] rounded-xl px-2.5 h-[42px] transition-all duration-100 cursor-pointer text-xs font-bold text-white select-none text-center flex items-center justify-center"
                    >
                      {surchargeStartTime || '시간 선택'}
                    </button>
                  </div>
                  <div className="flex flex-col items-center justify-center p-2.5 bg-neutral-900 border border-neutral-850 rounded-2xl shadow-sm">
                    <span className="text-[12px] text-white/80 font-extrabold mb-2 uppercase tracking-wide">종료 시간</span>
                    <button
                      type="button"
                      onClick={() => setActivePickerTarget('surchargeEnd')}
                      className="w-full bg-[#1C1C1E] border border-neutral-800 hover:border-neutral-600 hover:bg-[#2C2C2E]/50 active:scale-[0.98] rounded-xl px-2.5 h-[42px] transition-all duration-100 cursor-pointer text-xs font-bold text-white select-none text-center flex items-center justify-center"
                    >
                      {surchargeEndTime || '시간 선택'}
                    </button>
                  </div>
                  <PriceInput
                    label="추가 할증요금 (원)"
                    value={surchargePrice}
                    onChange={setSurchargePrice}
                    focusColorClass="focus-within:border-amber-500"
                    isXl={true}
                  />
                </div>
              </div>

              {/* 제2여객터미널(T2) 이동 추가요금 */}
              <div className="p-3 bg-[#131315] border border-neutral-850 rounded-xl space-y-3">
                <span className="text-[12px] text-white font-bold block">● 제2여객터미널(T2) 이동 추가요금 (Terminal Surcharge)</span>
                <PriceInput
                  label="💰 제2여객터미널(T2) 이동 추가요금 (원)"
                  value={t2Surcharge}
                  onChange={setT2Surcharge}
                  focusColorClass="focus-within:border-amber-500"
                  placeholder="예: 5000 (0원인 경우 추가요금 없음)"
                />
              </div>

              {/* 성수기 할증 설정 (Peak Season Surcharge) */}
              <div className="p-3 bg-[#131315] border border-neutral-850 rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[12px] text-white font-bold block">● 성수기 할증 설정 (Peak Season Surcharge)</span>
                </div>
                <p className="text-[11px] text-white/75 leading-relaxed font-semibold">
                  지정된 날짜 범위 내에 입출고 차량인 경우, 일괄 성수기 할증 금액이 자동으로 정산됩니다. (날짜 형식: MM-DD)
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="text-[11px] text-white/80 font-bold block mb-1.5">성수기 시작일 (MM-DD)</label>
                    <input 
                      type="text" 
                      placeholder="예: 07-15"
                      value={peakStartTime}
                      onChange={(e) => setPeakStartTime(e.target.value)}
                      className="w-full bg-[#1C1C1E] border border-neutral-800 rounded-xl px-2.5 py-2 text-xs text-white focus:outline-none focus:border-amber-500 font-mono font-bold text-center" 
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-white/80 font-bold block mb-1.5">성수기 종료일 (MM-DD)</label>
                    <input 
                      type="text" 
                      placeholder="예: 08-31"
                      value={peakEndTime}
                      onChange={(e) => setPeakEndTime(e.target.value)}
                      className="w-full bg-[#1C1C1E] border border-neutral-800 rounded-xl px-2.5 py-2 text-xs text-white focus:outline-none focus:border-amber-500 font-mono font-bold text-center" 
                    />
                  </div>
                  <PriceInput
                    label="성수기 할증요금 (원)"
                    value={peakSurcharge}
                    onChange={setPeakSurcharge}
                    focusColorClass="focus-within:border-amber-500"
                    placeholder="예: 10000"
                    isXl={true}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* 4. 소속 직원(기사) 계정 관리 */}
          <div className="bg-neutral-900/40 p-5 rounded-3xl border border-neutral-850 space-y-4">
            <div className="flex items-center gap-2 text-xs font-black text-amber-500 tracking-wider uppercase">
              <Users size={14} className="text-amber-500" />
              <span>👥 소속 직원(현장 기사) 계정 관리</span>
            </div>
            <p className="text-[12.5px] text-white/80 leading-relaxed">
              소속 직원의 개인 로그인 계정을 직접 생성하고 관리합니다. 직원으로 로그인 시, 요금 변경 권한이 통제된 기사 모드로 강제 진입합니다.
            </p>

            <form onSubmit={handleAddEmployee} className="p-4 bg-[#131315] border border-neutral-850 rounded-2xl space-y-3.5">
              <div className="text-[12.5px] font-bold text-white">신규 기사 직원 등록</div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-[11px] text-white/80 font-bold block mb-1">이름 (실명)</label>
                  <input 
                    type="text" 
                    placeholder="예: 홍길동"
                    value={empName}
                    onChange={(e) => setEmpName(e.target.value)}
                    className="w-full bg-[#1C1C1E] border border-neutral-800 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-amber-500 font-bold" 
                  />
                </div>
                <div>
                  <label className="text-[11px] text-white/80 font-bold block mb-1">로그인 ID</label>
                  <input 
                    type="text" 
                    placeholder="예: wawa_hong"
                    value={empLoginId}
                    onChange={(e) => setEmpLoginId(e.target.value)}
                    className="w-full bg-[#1C1C1E] border border-neutral-800 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-amber-500 font-mono font-bold" 
                  />
                </div>
                <div>
                  <label className="text-[11px] text-white/80 font-bold block mb-1">비밀번호</label>
                  <input 
                    type="password" 
                    placeholder="예: emp1234"
                    value={empPassword}
                    onChange={(e) => setEmpPassword(e.target.value)}
                    className="w-full bg-[#1C1C1E] border border-neutral-800 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-amber-500 font-mono" 
                  />
                </div>
              </div>
              <div className="flex items-center gap-2 pt-1.5 pb-0.5 px-1">
                <input 
                  type="checkbox" 
                  id="emp-is-admin-checkbox"
                  checked={empIsAdmin}
                  onChange={(e) => setEmpIsAdmin(e.target.checked)}
                  className="w-4 h-4 rounded border-neutral-800 text-amber-500 focus:ring-amber-500 bg-[#1C1C1E] cursor-pointer"
                />
                <label htmlFor="emp-is-admin-checkbox" className="text-[12px] text-white font-bold cursor-pointer select-none flex items-center gap-1">
                  <span>✅ 이 직원에게 관리자 권한 부여</span>
                  <span className="text-[11px] text-white/60 font-normal">(업체 정보 요금설정 및 다른 직원 관리 권한 포함)</span>
                </label>
              </div>
              <button 
                type="submit"
                className="w-full py-2 bg-amber-500 hover:bg-amber-600 text-neutral-950 font-black rounded-xl text-3xs font-extrabold uppercase transition-all flex items-center justify-center gap-1"
              >
                <span>➕ 신규 직원 기사 등록</span>
              </button>
            </form>

            <div className="space-y-2 mt-4">
              <div className="text-[12.5px] font-bold text-white flex items-center justify-between px-1">
                <span>등록된 소속 직원 리스트</span>
                <span className="text-[12px] text-white/70 font-mono">총 {employeeList.length}명</span>
              </div>
              
              {employeeList.length === 0 ? (
                <div className="text-center py-6 bg-neutral-950/20 border border-neutral-850/50 rounded-2xl text-white/50 text-[12.5px]">
                  등록된 직원이 없습니다. 첫 직원을 추가해 주세요.
                </div>
              ) : (
                <div className="overflow-x-auto border border-neutral-850 rounded-2xl bg-[#0F0F11]">
                  <table className="w-full text-left text-[13px] border-collapse">
                    <thead>
                      <tr className="border-b border-neutral-850 bg-neutral-900/60 text-white/80 font-bold">
                        <th className="p-3">이름/권한</th>
                        <th className="p-3">로그인 ID</th>
                        <th className="p-3">비밀번호</th>
                        <th className="p-3 text-right">인사 관리</th>
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
                          <td className="p-3 font-mono text-white/70">{emp.password}</td>
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

          <button
            onClick={handleSavePartnerSelf}
            className="w-full py-4 bg-gradient-to-r from-amber-500 to-amber-600 text-neutral-950 font-black rounded-2xl border border-amber-400/30 hover:brightness-110 shadow-lg shadow-amber-500/10 transition-all flex items-center justify-center gap-2 text-xs uppercase"
            id="save-partner-rates-btn"
          >
            <Save size={14} />
            <span>저장하기</span>
          </button>
        </div>
      </div>
      {surchargeTimePicker}
      </>
    );
  }

  return (
    <>
    <div className="bg-black min-h-screen text-zinc-100 p-4 pb-28">
      {/* Header section */}
      <div className="flex items-center gap-3.5 mb-6 px-1">
        <div>
          <h2 className="text-sm font-black tracking-tight text-white">마스터 업체 및 계정 설정</h2>
          <p className="text-[12px] text-zinc-500 font-bold uppercase">Master Company & Core Authorization</p>
        </div>
      </div>

      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-2 bg-[#1C1C1E] p-1 rounded-xl border border-neutral-800">
          <button
            type="button"
            onClick={() => {
              resetRegisterForm();
              setHqTab('register');
            }}
            className={`py-2.5 text-[12px] font-black rounded-lg transition-all ${
              hqTab === 'register' ? 'bg-amber-500 text-black' : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            신규 업체 등록
          </button>
          <button
            type="button"
            onClick={() => {
              resetRegisterForm();
              setHqTab('manage');
            }}
            className={`py-2.5 text-[12px] font-black rounded-lg transition-all ${
              hqTab === 'manage' ? 'bg-amber-500 text-black' : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            기존 업체 수정/삭제
          </button>
        </div>

        {/* Save success toast banner */}
        {isSaved && (
          <div className="bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 p-3.5 rounded-2xl flex items-center gap-2 text-xs font-semibold animate-fade-in">
            <CheckCircle2 size={16} className="text-emerald-500 shrink-0" />
            <span>업체 정보 및 마스터 계정 자격 규정이 성공적으로 갱신 보존되었습니다!</span>
          </div>
        )}

        {hqTab === 'manage' && !lockedCompanyId && (
          <div className="bg-neutral-900/40 p-5 rounded-3xl border border-neutral-850 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h3 className="text-xs font-black text-white">제휴사 통합 수정/삭제 관리</h3>
                <p className="text-[11px] text-zinc-500 mt-1">
                  등록된 제휴업체를 수정·삭제하고, 수정 시 주차장 위치도 함께 변경할 수 있습니다.
                </p>
              </div>
              <span className="text-[11px] bg-red-500/10 border border-red-500/30 text-red-400 px-2.5 py-1 rounded-xl font-bold shrink-0">
                총 {(partners || []).length}개
              </span>
            </div>

            <div className="border border-neutral-800 bg-[#0F0F11] rounded-2xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-neutral-900/60 border-b border-neutral-800 text-[11px] text-zinc-500 font-extrabold">
                      <th className="py-2.5 px-3">제휴업체</th>
                      <th className="py-2.5 px-2 text-center">상태</th>
                      <th className="py-2.5 px-2 text-center">통계</th>
                      <th className="py-2.5 px-3 text-right">제어</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-800/60">
                    {(partners || [])
                      .filter((p) => p?.companyId)
                      .map((p) => {
                        const stats = computePartnerStats(p.companyId);
                        const isSuspended = p.status === 'suspended';
                        return (
                          <tr
                            key={p.companyId}
                            className={`hover:bg-neutral-900/30 ${isSuspended ? 'text-zinc-500' : 'text-zinc-300'}`}
                          >
                            <td className="py-3 px-3">
                              <div className="font-bold text-white flex items-center gap-1.5 flex-wrap">
                                <span>{p.name}</span>
                                <span className="text-[10px] font-mono text-amber-500/90 bg-amber-500/10 px-1.5 py-0.5 rounded font-black">
                                  {p.companyId}
                                </span>
                              </div>
                              <div className="text-[11px] text-zinc-500 mt-0.5">
                                대표: {p.representative} · {p.phone}
                              </div>
                            </td>
                            <td className="py-3 px-2 text-center align-middle">
                              <button
                                type="button"
                                onClick={() => handleTogglePartnerStatus(p.companyId)}
                                className={`px-2.5 py-1.5 text-[11px] font-extrabold rounded-lg border transition-all ${
                                  isSuspended
                                    ? 'bg-red-500/10 border-red-500/30 text-red-400'
                                    : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                                }`}
                              >
                                {isSuspended ? '정지' : '활성'}
                              </button>
                            </td>
                            <td className="py-3 px-2 text-center align-middle font-mono text-[11px]">
                              <div className="text-white font-black">금일 {stats.todayCompleted}건</div>
                              <div className="text-zinc-500 mt-0.5">월간 {stats.monthlyCompleted}건</div>
                            </td>
                            <td className="py-3 px-3 text-right align-middle whitespace-nowrap">
                              <button
                                type="button"
                                onClick={() => loadPartnerForEdit(p.companyId)}
                                className="px-2 py-1.5 bg-neutral-900 border border-neutral-800 text-zinc-300 hover:border-amber-500/40 hover:text-amber-400 rounded-lg text-[11px] font-black inline-flex items-center gap-1 mr-1.5"
                              >
                                <Edit size={11} />
                                수정
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeletePartner(p.companyId, p.name)}
                                className="px-2 py-1.5 bg-red-950/40 border border-red-900/30 text-red-400 hover:bg-red-900/30 rounded-lg text-[11px] font-black inline-flex items-center gap-1"
                              >
                                <Trash2 size={11} />
                                삭제
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {(hqTab === 'register' || (hqTab === 'manage' && lockedCompanyId)) && (
        <>
        {lockedCompanyId && (
          <button
            type="button"
            onClick={resetRegisterForm}
            className="w-full flex items-center gap-2 px-3 py-2.5 bg-neutral-900/60 border border-neutral-800 rounded-xl text-[12px] text-zinc-300 font-bold hover:border-amber-500/30 hover:text-amber-400 transition-all"
          >
            <ChevronLeft size={14} />
            <span>목록으로 돌아가기</span>
            <span className="ml-auto text-amber-500 font-black">{name || lockedCompanyId} 수정 중</span>
          </button>
        )}

        {/* Card 1: Company Profile Configuration */}
        <div className="bg-neutral-900/40 p-5 rounded-3xl border border-neutral-850 space-y-4">
          <div className="flex items-center gap-2 text-xs font-black text-amber-500 tracking-wider uppercase">
            <Building2 size={14} />
            <span>
              {lockedCompanyId
                ? `[수정] ${name || lockedCompanyId}`
                : '[1] 제휴 업체 브랜드 등록'}
            </span>
          </div>

          <div className="space-y-4 text-xs">
            {/* 1. 업체 명 */}
            <div>
              <label className="text-[12px] text-zinc-500 font-bold block mb-1.5 uppercase tracking-wider">
                [업체 명]
              </label>
              <input 
                type="text" 
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-[#1C1C1E] border border-neutral-800 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-amber-500 font-bold" 
                placeholder="업체 이름을 입력하세요" 
              />
            </div>

            {/* 2. 시설 유형 */}
            <div>
              <label className="text-[12px] text-zinc-500 font-bold block mb-1.5 uppercase tracking-wider">
                [시설 유형]
              </label>
              <div className="grid grid-cols-3 gap-2 bg-[#1C1C1E] p-1 rounded-xl border border-neutral-800 select-none">
                <button
                  type="button"
                  onClick={() => setFacilityType('indoor')}
                  className={`py-2 text-[13px] font-bold rounded-lg transition-all ${
                    facilityType === 'indoor' 
                      ? 'bg-amber-500 text-black shadow-xs' 
                      : 'text-zinc-500 hover:text-zinc-300'
                  }`}
                >
                  실내
                </button>
                <button
                  type="button"
                  onClick={() => setFacilityType('outdoor')}
                  className={`py-2 text-[13px] font-bold rounded-lg transition-all ${
                    facilityType === 'outdoor' 
                      ? 'bg-amber-500 text-black shadow-xs' 
                      : 'text-zinc-500 hover:text-zinc-300'
                  }`}
                >
                  실외
                </button>
                <button
                  type="button"
                  onClick={() => setFacilityType('mixed')}
                  className={`py-2 text-[13px] font-bold rounded-lg transition-all ${
                    facilityType === 'mixed' 
                      ? 'bg-amber-500 text-black shadow-xs' 
                      : 'text-zinc-500 hover:text-zinc-300'
                  }`}
                >
                  실내+실외 혼합
                </button>
              </div>
            </div>

            {/* 2-1. 주차장 주소 — 에어픽 본사 전용 */}
            <div className="space-y-3 p-3.5 bg-[#131315] border border-amber-500/20 rounded-xl">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[12px] text-amber-500 font-bold block">[주차장 주소]</span>
                  <span className="text-[10px] px-2 py-0.5 rounded-md bg-amber-500/10 border border-amber-500/30 text-amber-400 font-black">
                    에어픽 본사 전용
                  </span>
                </div>
                <p className="text-[11px] text-zinc-500 mt-1 leading-relaxed">
                  실내·실외 주차장 개수를 직접 정하고, 각 주차장마다 주소와 입구·주차장 사진을 등록합니다. 저장 시 네이버 지도 링크와 사진이 B2C MY 「주차 위치」에 자동 노출됩니다. 제휴 업체는 이 항목을 수정할 수 없습니다.
                </p>
              </div>
              <ParkingLotsEditor
                value={parkingLots}
                onChange={setParkingLots}
                companyId={lockedCompanyId || id}
              />
            </div>

            {/* 3. 전화번호 */}
            <div>
              <label className="text-[12px] text-zinc-500 font-bold block mb-1.5 uppercase tracking-wider">
                [전화번호]
              </label>
              <input 
                type="text" 
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full bg-[#1C1C1E] border border-neutral-800 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-amber-500 font-mono" 
                placeholder="대표 번호를 입력하세요" 
              />
            </div>
          </div>
        </div>

        {/* Card 2: Master Authorization Link (Account Association) */}
        <div className="bg-neutral-900/40 p-5 rounded-3xl border border-neutral-850 space-y-4">
          <div className="flex items-center gap-2 text-xs font-black text-purple-400 tracking-wider uppercase">
            <Lock size={14} />
            <span>{lockedCompanyId ? '[2] 마스터 계정 정보' : '[2] 마스터 관리 사장님 계정 생성'}</span>
          </div>

          <p className="text-[12px] text-zinc-400/80 leading-relaxed">
            {lockedCompanyId
              ? '해당 업체 마스터 계정의 로그인 이메일·비밀번호를 변경할 수 있습니다.'
              : '아래 이메일과 패스워드로 로그인 시, 해당 업체의 소속 기사 목록과 주차 접수 데이터(대시보드)만 안전하게 격리 노출되는 고유 보증 주차공간 마케팅 시스템이 실행됩니다.'}
          </p>

          <div className="space-y-3">
            <div>
              <label className="text-[12px] text-zinc-500 font-bold block mb-1">마스터 로그인 이메일 (Master ID)</label>
              <div className="relative">
                <input 
                  type="email" 
                  value={masterEmail}
                  onChange={(e) => setMasterEmail(e.target.value)}
                  className="w-full bg-[#1C1C1E] border border-neutral-800 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-purple-500 font-mono" 
                  placeholder="예: master@gayoo.com" 
                />
              </div>
            </div>

            <div>
              <label className="text-[12px] text-zinc-500 font-bold block mb-1">보안 암호 (Master Secret Pin)</label>
              <div className="relative">
                <input 
                  type="text" 
                  value={masterPassword}
                  onChange={(e) => setMasterPassword(e.target.value)}
                  className="w-full bg-[#1C1C1E] border border-neutral-800 rounded-xl px-3.5 py-2.5 text-xs text-zinc-300 focus:outline-none focus:border-purple-500 font-mono" 
                  placeholder="예: master1234" 
                />
                <KeyRound size={12} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-zinc-600" />
              </div>
            </div>
          </div>
        </div>

        {saveError && (
          <div className="bg-red-500/10 border border-red-500/30 text-red-400 p-3 rounded-xl text-[12px] font-semibold">
            {saveError}
          </div>
        )}

        <button
          type="button"
          onClick={handleSave}
          disabled={isSaving}
          className="w-full py-3.5 bg-gradient-to-r from-amber-500 to-amber-600 text-neutral-950 font-black rounded-2xl border border-amber-400/40 hover:brightness-110 shadow-lg shadow-amber-500/10 transition-all flex items-center justify-center gap-2 text-xs uppercase disabled:opacity-60 disabled:cursor-not-allowed"
        >
          <Save size={14} />
          <span>
            {isSaving
              ? '저장 중...'
              : lockedCompanyId
              ? '변경 내용 저장하기'
              : '신규 업체 등록 및 저장하기'}
          </span>
        </button>
        </>
        )}
      </div>
    </div>
    {surchargeTimePicker}
    </>
  );
}
