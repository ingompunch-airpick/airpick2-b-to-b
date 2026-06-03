import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Menu,
  ShieldCheck, 
  AlertCircle,
  X,
  Lock,
  CalendarRange
} from 'lucide-react';
import { 
  collection, 
  onSnapshot, 
  doc, 
  setDoc, 
  getDocs, 
  deleteDoc,
  updateDoc,
  query
} from 'firebase/firestore';
import { 
  onAuthStateChanged, 
  signOut, 
  signInAnonymously,
  signInWithEmailAndPassword,
  User
} from 'firebase/auth';
import { db, auth, handleFirestoreError, OperationType } from './firebase';
import { motion, AnimatePresence } from 'motion/react';

// --- Modular Typed Constants and Data ---
import { Company, Reservation, ReservationStatus, PaymentMethod, ScratchPhotoSet, AppView, CompanyInfo, PartnerCompany } from './types';
import { SEED_RESERVATIONS } from './data';
import { formatPartnerDisplayName } from './utils/companyDisplay';
import { getParkingDayCount, mergePartnerPricing } from './utils/pricing';
import { AIRPICK_HQ_ID, isAirpickHeadquarters, normalizePlatformCompanyId } from './constants/platform';
import { ensureFirestoreAuth } from './lib/reservationFirestore';

// --- Sub-views Imports ---
import Sidebar from './components/Sidebar';
import PaymentChangeView from './components/PaymentChangeView';
import ScratchUploadView from './components/ScratchUploadView';
import ServiceHistoryView from './components/ServiceHistoryView';
import ParkingDepartureView from './components/ParkingDepartureView';
import ScratchModal from './components/ScratchModal';
import BlockoutCalendarModal from './components/BlockoutCalendarModal';
import AdminMode from './components/AdminMode';
import ConsolidatedGate from './components/ConsolidatedGate';
import CustomDatePickerModal from './components/CustomDatePickerModal';
import AdminDashboardComponent from './components/AdminDashboard';
import ReservationCard from './components/ReservationCard';
import EditModal from './components/EditModal';
import SearchReceptionView from './components/SearchReceptionView';
import TimelineView from './components/TimelineView';
import AdminReservationEditModal from './components/AdminReservationEditModal';
import DriverReservationEditModal from './components/DriverReservationEditModal';

// --- KST Date Utility Helpers ---
export const getKSTDateOnlyString = () => {
  const kstDate = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return kstDate.toISOString().split('T')[0];
};

// --- Utility: cn ---
const isDummyCompany = (id?: string, name?: string) => {
  return false;
};
function cn(...classes: (string | boolean | undefined)[]) {
  return classes.filter(Boolean).join(' ');
}

// --- Safe Storage Fallback for Sandboxed Web Views & Private Browsing Mode ---
const safeStorage = (() => {
  const memStore: Record<string, string> = {};
  
  let isSupported = false;
  try {
    const testKey = '__sandbox_test__';
    window.localStorage.setItem(testKey, testKey);
    window.localStorage.removeItem(testKey);
    isSupported = true;
  } catch (e) {
    // Local storage is restricted or sandboxed in this environment. Falling back to secure in-memory context silently.
  }

  return {
    getItem: (key: string): string | null => {
      try {
        if (isSupported) return window.localStorage.getItem(key);
      } catch (e) {
        // quiet fallback
      }
      return memStore[key] !== undefined ? memStore[key] : null;
    },
    setItem: (key: string, value: string): void => {
      try {
        if (isSupported) {
          window.localStorage.setItem(key, value);
          return;
        }
      } catch (e) {
        // quiet fallback
      }
      memStore[key] = String(value);
    },
    removeItem: (key: string): void => {
      try {
        if (isSupported) {
          window.localStorage.removeItem(key);
          return;
        }
      } catch (e) {
        // quiet fallback
      }
      delete memStore[key];
    },
    getAllKeys: (): string[] => {
      if (isSupported) {
        try {
          const keys: string[] = [];
          for (let i = 0; i < window.localStorage.length; i++) {
            const k = window.localStorage.key(i);
            if (k) keys.push(k);
          }
          return keys;
        } catch (_) {}
      }
      return Object.keys(memStore);
    }
  };
})();

// Shadow standard localStorage with safeStorage wrapper
const localStorage = safeStorage;

const DEFAULT_PARTNERS: PartnerCompany[] = [];

// --- Component: AdminDashboard (Contained in modal) ---
function AdminDashboard({ 
  onClose, 
  companies, 
  onSync,
  partners,
  onUpdatePartners,
  onUpdateCompanies
}: { 
  onClose: () => void; 
  companies: Company[]; 
  onSync: () => Promise<void>;
  partners: PartnerCompany[];
  onUpdatePartners: (updated: PartnerCompany[]) => void;
  onUpdateCompanies: (updated: Company[]) => void;
}) {
  return (
    <AdminDashboardComponent
      onClose={onClose}
      companies={companies}
      onSync={onSync}
      partners={partners}
      onUpdatePartners={onUpdatePartners}
      onUpdateCompanies={onUpdateCompanies}
    />
  );
}

// --- Photo capture sequence for auto advance ---
const SPOT_SEQUENCE = [
  'front',
  'rear',
  'left',
  'right',
  'front_wheel_l',
  'front_wheel_r',
  'rear_wheel_l',
  'rear_wheel_r'
];

// --- Helper: Check if time is within Night Surcharge range ---
export const checkIsNightSurcharge = (timeStr: string, startTime: string, endTime: string): boolean => {
  try {
    if (!timeStr || !startTime || !endTime) return false;
    
    let timePart = "";
    if (timeStr.includes('T')) {
      timePart = timeStr.split('T')[1];
    } else if (timeStr.includes(' ')) {
      timePart = timeStr.trim().split(/\s+/)[1] || "";
    } else if (timeStr.includes(':')) {
      timePart = timeStr;
    }

    if (!timePart) return false;
    
    const hourStr = timePart.substring(0, 5); // "HH:MM"
    const [h, m] = hourStr.split(':').map(Number);
    if (isNaN(h) || isNaN(m)) return false;
    const currentMinutes = h * 60 + m;

    const [sth, stm] = startTime.split(':').map(Number);
    const startTimeMinutes = sth * 60 + stm;

    const [eth, etm] = endTime.split(':').map(Number);
    const endTimeMinutes = eth * 60 + etm;

    if (isNaN(startTimeMinutes) || isNaN(endTimeMinutes)) return false;

    if (startTimeMinutes > endTimeMinutes) {
      // Cross-midnight range (e.g. 19:00 ~ 05:00)
      return currentMinutes >= startTimeMinutes || currentMinutes < endTimeMinutes;
    } else {
      // Standard range (e.g. 00:00 ~ 05:00)
      return currentMinutes >= startTimeMinutes && currentMinutes < endTimeMinutes;
    }
  } catch (err) {
    console.warn("Time boundaries evaluation error:", err);
    return false;
  }
};

// --- Helper: Calculate dynamic pricing for a given reservation duration and tier ---
export const getCalculatePrice = (company: Company, start: string, end: string, indoor: boolean = true, isT2: boolean = false) => {
  if (!company) return 0;
  const priced = mergePartnerPricing(company as Record<string, unknown>, company.id) as Company;
  const diffDays = getParkingDayCount(start, end);
  
  let basePrice = 0;
  let extraPrice = 0;
  let baseDays = 0;

  if (indoor) {
    basePrice = priced.indoorBasePrice ?? priced.base_price ?? 0;
    baseDays = priced.indoorBaseDays ?? priced.base_days ?? 0;
    extraPrice = priced.indoorExtraPrice ?? priced.extra_day_price ?? 0;
  } else {
    basePrice = priced.outdoorBasePrice ?? priced.base_price ?? 0;
    baseDays = priced.outdoorBaseDays ?? priced.base_days ?? 0;
    extraPrice = priced.outdoorExtraPrice ?? priced.extra_day_price ?? 0;
  }

  let calculated = Number(basePrice) || 0;
  const cleanBaseDays = Number(baseDays) || 0;
  const cleanExtraPrice = Number(extraPrice) || 0;

  if (diffDays > cleanBaseDays) {
    calculated += (diffDays - cleanBaseDays) * cleanExtraPrice;
  }

  if (isT2 && priced.t2Surcharge) {
    calculated += Number(priced.t2Surcharge) || 0;
  }

  if (priced.surchargePrice && priced.surchargeStartTime && priced.surchargeEndTime) {
    const charge = Number(priced.surchargePrice) || 0;
    
    const isStartNight = checkIsNightSurcharge(start, priced.surchargeStartTime, priced.surchargeEndTime);
    const isEndNight = checkIsNightSurcharge(end, priced.surchargeStartTime, priced.surchargeEndTime);

    if (isStartNight) {
      calculated += charge;
    }
    if (isEndNight) {
      calculated += charge;
    }
  }

  // Dynamic Peak Season check (MM-DD date boundaries)
  if (priced.peakSurcharge && priced.peakStartTime && priced.peakEndTime) {
    try {
      const checkInDateObj = new Date(start);
      const mm = String(checkInDateObj.getMonth() + 1).padStart(2, '0');
      const dd = String(checkInDateObj.getDate()).padStart(2, '0');
      const checkInMD = `${mm}-${dd}`; // e.g., "07-20"

      let isPeak = false;
      if (priced.peakStartTime > priced.peakEndTime) {
        // Cross-year peak season (e.g., "12-15" to "02-15")
        if (checkInMD >= priced.peakStartTime || checkInMD <= priced.peakEndTime) {
          isPeak = true;
        }
      } else {
        // Same-year peak season (e.g., "07-15" to "08-31")
        if (checkInMD >= priced.peakStartTime && checkInMD <= priced.peakEndTime) {
          isPeak = true;
        }
      }

      if (isPeak) {
        calculated += Number(priced.peakSurcharge) || 0;
      }
    } catch (err) {
      console.warn("Peak surcharge calculation failed:", err);
    }
  }

  return calculated;
};

// --- Normalization Utility to Synchronize Web Submission and Dashboard Specifications ---
export const getSafeDateString = (val: any): string => {
  if (!val) return new Date().toISOString();
  if (typeof val === 'string') return val;
  if (val instanceof Date) return val.toISOString();
  if (typeof val === 'object') {
    if (typeof val.toDate === 'function') {
      try {
        return val.toDate().toISOString();
      } catch (_) {}
    }
    if (val.seconds !== undefined) {
      try {
        return new Date(val.seconds * 1000).toISOString();
      } catch (_) {}
    }
  }
  try {
    const d = new Date(val);
    if (!isNaN(d.getTime())) return d.toISOString();
  } catch (_) {}
  return new Date().toISOString();
};

export const normalizeDateString = (dStr: string | undefined | null): string => {
  if (!dStr) return '';
  // Clean up and convert to YYYY-MM-DD
  let clean = dStr.trim().replace(/[\.\/]/g, '-');
  
  // if format contains date and time, take the first part
  if (clean.includes(' ')) {
    clean = clean.split(' ')[0];
  }
  if (clean.includes('T')) {
    clean = clean.split('T')[0];
  }

  const parts = clean.split('-');
  if (parts.length === 3) {
    const y = parts[0];
    const m = parts[1].padStart(2, '0');
    const d = parts[2].padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return clean;
};

export const normalizeDocsArray = (items: any[]): Reservation[] => {
  if (!items || !Array.isArray(items)) return [];
  return items.map((r): Reservation => {
    const finalName = r.name || r.userName || "미지정";
    const finalDate = normalizeDateString(r.entryDate || r.departureDate || "");
    const arrivalDate = normalizeDateString(r.exitDate || r.arrivalDate || '');
    const departureTime = r.entryTime || r.departureTime || '';
    const arrivalTime = r.exitTime || r.arrivalTime || '';
    
    let statusNorm: any = 'pending';
    const s = String(r.status || '').trim();
    if (s === 'pending' || s === '입고예정' || s === '예약완료' || s === '접수' || s === '입고대기') {
      statusNorm = 'pending';
    } else if (s === 'pending_in' || s === '입고요청') {
      statusNorm = 'pending_in';
    } else if (s === 'request_out' || s === '출고요청') {
      statusNorm = 'request_out';
    } else if (s === 'completed_in' || s === '출고예정' || s === '주차완료') {
      statusNorm = 'completed_in';
    } else if (s === 'completed_out' || s === '인도완료' || s === '출차완료') {
      statusNorm = 'completed_out';
    } else if (s === 'cancelled' || s === '취소') {
      statusNorm = 'cancelled';
    } else {
      statusNorm = s || 'pending';
    }

    const createdAtStr = getSafeDateString(r.createdAt);
    const updatedAtStr = r.updatedAt ? getSafeDateString(r.updatedAt) : undefined;

    const finalCarNumber = r.carNumber || r.carNo || r.vehicleNo || r.car_number || '';
    const finalPrice = typeof r.totalPrice === 'number' ? r.totalPrice : (Number(r.totalPrice) || 0);

    return {
      ...r,
      userId: r.userId || r.uid || 'external_system',
      phone: r.phone || r.userPhone || '',
      carNumber: finalCarNumber,
      departureTerminal: r.departureTerminal || r.entryTerminal || 'T1',
      arrivalTerminal: r.arrivalTerminal || r.exitTerminal || 'T1',
      totalPrice: finalPrice,
      departureDate: finalDate,
      arrivalDate,
      departureTime,
      arrivalTime,
      userName: finalName,
      status: statusNorm as any,
      createdAt: createdAtStr,
      updatedAt: updatedAtStr,
      companyId: (() => {
        const rawCompId = String(r.companyId || r.company || '').trim();
        const isWawa = !rawCompId || 
                       rawCompId === 'wawa' || 
                       rawCompId === 'wawa_valet' || 
                       rawCompId === '와와발렛' || 
                       rawCompId === '와와';
        return isWawa ? 'wawa' : rawCompId;
      })(),
      companyName: (() => {
        const rawCompId = String(r.companyId || r.company || '').trim();
        const isWawa = !rawCompId || 
                       rawCompId === 'wawa' || 
                       rawCompId === 'wawa_valet' || 
                       rawCompId === '와와발렛' || 
                       rawCompId === '와와';
        return isWawa ? '와와' : (r.companyName || r.company || '');
      })()
    };
  });
};

// --- Main Core App Component ---
export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [companies, setCompanies] = useState<Company[]>(() => {
    const saved = localStorage.getItem('companies');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed && Array.isArray(parsed)) {
          return parsed.filter(c => !isDummyCompany(c.id, c.name));
        }
      } catch (_) {}
    }
    return [];
  });

  const [partners, setPartners] = useState<PartnerCompany[]>(() => {
    const saved = localStorage.getItem('super_partners_list');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed && Array.isArray(parsed) && parsed.length > 0) return parsed;
      } catch (_) {}
    }
    localStorage.setItem('super_partners_list', JSON.stringify(DEFAULT_PARTNERS));
    return DEFAULT_PARTNERS;
  });

  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(() => {
    return localStorage.getItem('is_logged_in') === 'true';
  });
  
  // Track currently active company ID for dynamic partition isolation
  const [currentCompanyId, setCurrentCompanyId] = useState<string>(() => {
    return normalizePlatformCompanyId(localStorage.getItem('current_company_id')) || 'wawa';
  });

  const [companyInfo, setCompanyInfo] = useState<CompanyInfo>(() => {
    const saved = localStorage.getItem('master_company_info');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed === 'object') {
          return {
            ...parsed,
            id: parsed.id || 'wawa',
            name: parsed.name ? formatPartnerDisplayName(parsed.name, parsed.id) : '와와',
            region: parsed.region || '인천공항 1터미널',
            phone: parsed.phone || '1545-5746',
            logo: parsed.logo || '',
          };
        }
      } catch (e) {}
    }
    return {
      id: 'wawa',
      name: '와와',
      region: '인천공항 1터미널',
      phone: '1545-5746',
      logo: '',
    };
  });

  const [reservations, setReservations] = useState<Reservation[]>(() => {
    const compId = localStorage.getItem('current_company_id') || 'wawa';
    if (isAirpickHeadquarters(compId)) {
      const allRes: Reservation[] = [];
      const seenIds = new Set<string>();
      const keys = localStorage.getAllKeys();
      keys.forEach((key) => {
        if (key && key.endsWith('_reservations')) {
          try {
            const items = JSON.parse(localStorage.getItem(key) || '[]');
            if (Array.isArray(items)) {
              items.forEach((item: Reservation) => {
                if (item && item.id && !seenIds.has(item.id)) {
                  seenIds.add(item.id);
                  allRes.push(item);
                }
              });
            }
          } catch (_) {}
        }
      });
      if (allRes.length > 0) return normalizeDocsArray(allRes);
      return normalizeDocsArray(SEED_RESERVATIONS);
    }

    const local = localStorage.getItem(`${compId}_reservations`);
    if (local) {
      try {
        const parsed = JSON.parse(local);
        if (parsed && parsed.length > 0) return normalizeDocsArray(parsed);
      } catch (_) {}
    }

    // Find matching template based on saved company name or id
    const saved = localStorage.getItem('master_company_info');
    let compName = '';
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        compName = parsed.name || '';
      } catch (_) {}
    }
    const filtered = SEED_RESERVATIONS.filter(r => 
      (r.companyId && r.companyId.toLowerCase().includes(compId.toLowerCase())) ||
      (r.companyName && r.companyName.toLowerCase().includes(compName.toLowerCase()))
    );
    return normalizeDocsArray(filtered.length > 0 ? filtered : []);
  });

  const getDropdownOptions = () => {
    const options = [
      { id: AIRPICK_HQ_ID, name: '에어픽' },
    ];
    
    // Add other companies dynamically from Firestore
    (companies || []).forEach(c => {
      if (c.id && !isAirpickHeadquarters(c.id)) {
        options.push({
          id: c.id,
          name: formatPartnerDisplayName(c.name, c.id)
        });
      }
    });
    
    return options;
  };

  const handleCompanySwitch = (selectedId: string) => {
    let targetCompanyInfo: CompanyInfo = {
      id: selectedId,
      name: '',
      region: '인천공항 전역',
      phone: '1545-5746',
      logo: '',
      isIndoor: true,
      facilityType: 'mixed',
      ratePolicy: ''
    };

    if (isAirpickHeadquarters(selectedId)) {
      targetCompanyInfo.name = '에어픽';
      setCurrentView('statistics');
    } else {
      const foundComp = (companies || []).find(c => c.id === selectedId);
      if (foundComp) {
        targetCompanyInfo.name = formatPartnerDisplayName(foundComp.name, foundComp.id);
        targetCompanyInfo.phone = foundComp.phone || '1545-5746';
        targetCompanyInfo.logo = foundComp.image_url || '';
      } else {
        targetCompanyInfo.name = selectedId;
      }
    }

    // Update states
    setCurrentCompanyId(selectedId);
    setCompanyInfo(targetCompanyInfo);

    // Sync with localStorage
    localStorage.setItem('current_company_id', selectedId);
    localStorage.setItem('master_company_info', JSON.stringify(targetCompanyInfo));
  };

  // 레거시: gayu를 본사 ID로 저장해 둔 브라우저 → airpick 본사로 교정
  useEffect(() => {
    const stored = localStorage.getItem('current_company_id');
    const normalized = normalizePlatformCompanyId(stored);
    if (stored && normalized !== stored) {
      localStorage.setItem('current_company_id', normalized);
      setCurrentCompanyId(normalized);
      if (normalized === AIRPICK_HQ_ID) {
        const hqInfo: CompanyInfo = {
          id: AIRPICK_HQ_ID,
          name: '에어픽',
          region: '플랫폼 본사',
          phone: '1545-5746',
          logo: '',
        };
        localStorage.setItem('master_company_info', JSON.stringify(hqInfo));
        setCompanyInfo(hqInfo);
      }
    }
  }, []);
  
  // Custom navigation structure: 'timeline' serves as the default driver dashboard (WORKER)
  const [currentView, setCurrentView] = useState<AppView>('timeline');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [showAdminModal, setShowAdminModal] = useState(false);

  // Custom Date Picker State
  const [datePickerTarget, setDatePickerTarget] = useState<'selectedDate' | null>(null);

  const getActiveDatePickerInitialValue = () => {
    if (datePickerTarget === 'selectedDate') {
      return selectedDate || '';
    }
    return '';
  };

  const handleDatePickerSelect = (selectedDateStr: string) => {
    if (datePickerTarget === 'selectedDate') {
      setSelectedDate(selectedDateStr);
    }
    setDatePickerTarget(null);
  };
  
  // High-level filtering state for the 4 status counters in the timeline tab
  // Selected counter filter can be 'pending', 'pending_in', 'request_out', 'confirmed'
  const [activeCounterTab, setActiveCounterTab] = useState<ReservationStatus>('pending');
  const [isAdminModeActive, setIsAdminModeActive] = useState<boolean>(() => {
    return localStorage.getItem('is_logged_in') === 'true' && localStorage.getItem('local_is_admin_mode_active') === 'true';
  });
  const [isLocalAdmin, setIsLocalAdmin] = useState<boolean>(() => {
    return localStorage.getItem('is_logged_in') === 'true' && localStorage.getItem('local_is_admin') === 'true';
  });
  const [isMasterAdmin, setIsMasterAdmin] = useState<boolean>(() => {
    return localStorage.getItem('is_logged_in') === 'true' && localStorage.getItem('local_is_master_admin') === 'true';
  });

  // Check Admin claims
  const [isSuperAdmin, setIsSuperAdmin] = useState<boolean>(() => {
    return localStorage.getItem('is_logged_in') === 'true' && localStorage.getItem('local_is_super_admin') === 'true';
  });

  const [isEmployee, setIsEmployee] = useState<boolean>(() => {
    return localStorage.getItem('is_logged_in') === 'true' && localStorage.getItem('local_is_employee') === 'true';
  });

  const [employeeName, setEmployeeName] = useState<string>(() => {
    return localStorage.getItem('is_logged_in') === 'true' ? (localStorage.getItem('local_employee_name') || '') : '';
  });

  const [employeeRole, setEmployeeRole] = useState<'admin' | 'driver'>(() => {
    return localStorage.getItem('is_logged_in') === 'true' 
      ? ((localStorage.getItem('local_employee_role') as 'admin' | 'driver') || 'driver') 
      : 'driver';
  });

  const isAdmin = isLocalAdmin || isSuperAdmin || isMasterAdmin || user?.email === 'drive5746@gmail.com' || user?.email === 'ingompunch@gmail.com' || (isEmployee && employeeRole === 'admin');



  useEffect(() => {
    if (!isAdmin) {
      setIsAdminModeActive(false);
    }
  }, [isAdmin]);

  // Safety redirect: If showAdminModal is true but isSuperAdmin is false, reset showAdminModal to false.
  useEffect(() => {
    if (!isSuperAdmin) {
      setShowAdminModal(false);
    }
  }, [isSuperAdmin]);

  // Synchronize browser/app back button behaviors to safely return to standard dashboards
  useEffect(() => {
    if (!window.history.state || !window.history.state.controlled) {
      window.history.replaceState({ view: currentView, controlled: true }, '');
    }

    const handlePopState = () => {
      if (isAdminModeActive && isAdmin) {
        // If they are inside Admin Mode, and on any sub-views (like master_settings, parkingRegister, cancelled_list),
        // they must return to 'statistics' (the primary Dashboard).
        if (currentView !== 'statistics') {
          setCurrentView('statistics');
          window.history.pushState({ view: 'statistics', controlled: true }, '');
        } else {
          // If already on statistics, go back to the standard main driver view ('timeline')
          setCurrentView('timeline');
          window.history.pushState({ view: 'timeline', controlled: true }, '');
        }
      } else {
        // Non-admin back behavior defaults safely to timeline
        if (currentView !== 'timeline') {
          setCurrentView('timeline');
          window.history.pushState({ view: 'timeline', controlled: true }, '');
        }
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [currentView, isAdminModeActive, isAdmin]);

  // Keep pushing view state changes into standard history tracking
  useEffect(() => {
    if (window.history.state && window.history.state.view !== currentView) {
      window.history.pushState({ view: currentView, controlled: true }, '');
    }
  }, [currentView]);

  // Watch for currentCompanyId and companyInfo changes (do not overwrite Firestore sync with stale local cache)
  useEffect(() => {
    localStorage.setItem('current_company_id', currentCompanyId);

    if (!isLoggedIn) {
      if (isAirpickHeadquarters(currentCompanyId)) {
        const allRes: Reservation[] = [];
        const seenIds = new Set<string>();
        const keys = localStorage.getAllKeys();
        keys.forEach((key) => {
          if (key && key.endsWith('_reservations')) {
            try {
              const items = JSON.parse(localStorage.getItem(key) || '[]');
              if (Array.isArray(items)) {
                items.forEach((item: Reservation) => {
                  if (item && item.id && !seenIds.has(item.id)) {
                    seenIds.add(item.id);
                    allRes.push(item);
                  }
                });
              }
            } catch (_) {}
          }
        });
        if (allRes.length > 0) {
          setReservations(normalizeDocsArray(allRes));
        } else {
          setReservations(normalizeDocsArray(SEED_RESERVATIONS));
        }
      } else {
        const cached = localStorage.getItem('firestore_reservations_cache');
        if (cached) {
          try {
            setReservations(normalizeDocsArray(JSON.parse(cached)));
          } catch (_) {
            setReservations([]);
          }
        } else {
          const local = localStorage.getItem(`${currentCompanyId}_reservations`);
          if (local) {
            try {
              setReservations(normalizeDocsArray(JSON.parse(local)));
            } catch (_) {
              setReservations([]);
            }
          }
        }
      }
    }

    // Save/Initialize drivers roster for isolation compliance
    const driverKey = `${currentCompanyId}_drivers`;
    if (!localStorage.getItem(driverKey)) {
      const defaultDrivers = [
        { id: '1', name: `${companyInfo.name || currentCompanyId} 대기기사`, phone: companyInfo.phone, rating: 4.9 },
        { id: '2', name: '이민수 기사', phone: '010-8765-4321', rating: 4.8 },
        { id: '3', name: '박진영 기사', phone: '010-4321-8765', rating: 4.7 }
      ];
      localStorage.setItem(driverKey, JSON.stringify(defaultDrivers));
    }
  }, [currentCompanyId, companyInfo.id, companyInfo.name, isLoggedIn]);

  // 플랫폼 본사(airpick) 관리 모드: 업체 CRM·타임라인 대신 통계 대시보드 고정
  useEffect(() => {
    if (isAdminModeActive && isAirpickHeadquarters(currentCompanyId)) {
      const allowedHQViews: AppView[] = ['statistics', 'master_settings'];
      if (!allowedHQViews.includes(currentView)) {
        setCurrentView('statistics');
      }
    }
  }, [isAdminModeActive, currentCompanyId, currentView]);

  // Filter core reservations array based on active companyInfo depending on whether user is Master or B2B Partner
  const visibleReservations = useMemo(() => {
    const normalizedDocs = normalizeDocsArray(reservations);
    
    if (isAirpickHeadquarters(currentCompanyId)) {
      return normalizedDocs;
    }

    const targetCompId = (currentCompanyId || '').trim().toLowerCase();

    return normalizedDocs.filter(r => {
      const rCompId = (r.companyId || '').trim().toLowerCase();
      
      // Fallback matching for wawa
      const belongsToWawa = !rCompId || 
                            rCompId === 'wawa' || 
                            rCompId === 'wawa_valet' || 
                            rCompId === '와와발렛' || 
                            rCompId === '와와';
                            
      if (targetCompId === 'wawa' || targetCompId === 'wawa_valet') {
        return belongsToWawa;
      }

      return rCompId === targetCompId;
    });
  }, [reservations, currentCompanyId]);

  // Itcha style real-time filter states
  const [filterType, setFilterType] = useState<'주/출차일자' | '주차예약' | '출차예약' | '등록일시'>('주/출차일자');
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    return getKSTDateOnlyString();
  });

  const [searchKeyword, setSearchKeyword] = useState<string>('');

  // Scratch Photo Upload Modal states
  const [scratchModalTargetId, setScratchModalTargetId] = useState<string | null>(null);
  const [uploadedSpots, setUploadedSpots] = useState<Record<string, string>>({});
  const [selectedParkingSpace, setSelectedParkingSpace] = useState<string>('');

  // Continuous shooting (Auto-Advance) states
  const [activeSpotKey, setActiveSpotKey] = useState<string>('front');
  const autoShootTimeoutRef = useRef<any>(null);

  useEffect(() => {
    if (scratchModalTargetId) {
      setActiveSpotKey('front');
    } else {
      if (autoShootTimeoutRef.current) {
        clearTimeout(autoShootTimeoutRef.current);
        autoShootTimeoutRef.current = null;
      }
    }
    return () => {
      if (autoShootTimeoutRef.current) {
        clearTimeout(autoShootTimeoutRef.current);
      }
    };
  }, [scratchModalTargetId]);

  // Loading states
  const [loadingCompanies, setLoadingCompanies] = useState(true);
  const [loadingReservations, setLoadingReservations] = useState(false);

  // Business configuration and system_settings state
  const [blockedDates, setBlockedDates] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('blockedDates');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Dynamically resolve active blocked dates based on selected dropdown partner/company
  const activeBlockedDates = useMemo(() => {
    if (currentCompanyId && !isAirpickHeadquarters(currentCompanyId)) {
      const matched = companies.find(c => c.id === currentCompanyId);
      if (matched && Array.isArray(matched.blockedDates)) {
        return matched.blockedDates;
      }
      try {
        const local = localStorage.getItem(`${currentCompanyId}_blockedDates`);
        if (local) {
          const parsed = JSON.parse(local);
          if (Array.isArray(parsed)) return parsed;
        }
      } catch (_) {}
    }
    return blockedDates;
  }, [currentCompanyId, companies, blockedDates]);

  const [showBlockoutModal, setShowBlockoutModal] = useState<boolean>(false);

  // Admin Reservation Detail Editing states
  const [adminEditingReservationId, setAdminEditingReservationId] = useState<string | null>(null);
  
  const [receptionSubMode, setReceptionSubMode] = useState<'search' | 'new_contract'>('search');

  // Editing state for searched reservation inside Search/Edit Info
  const [editingSearchedRes, setEditingSearchedRes] = useState<Reservation | null>(null);

  // --- Driver Detail Modal State ---
  const [driverDetailRes, setDriverDetailRes] = useState<Reservation | null>(null);

  const handleSaveDriverReservationEdit = async (updateData: Partial<Reservation>) => {
    if (!driverDetailRes || !driverDetailRes.id) return;
    
    const docRef = doc(db, 'reservations', driverDetailRes.id);

    setReservations(prev => {
      const updated = prev.map(r => r.id === driverDetailRes.id ? { ...r, ...updateData } : r);
      localStorage.setItem(`${currentCompanyId}_reservations`, JSON.stringify(updated));
      return updated;
    });

    try {
      await updateDoc(docRef, updateData);
    } catch (err) {
      console.warn("Local storage updated. Firestore direct update failed/offline:", err);
    }

    setDriverDetailRes(null);
  };

  const handleDriverStatusAction = async () => {
    if (!driverDetailRes || !driverDetailRes.id) return;
    
    if (['pending', '입고예정', '예약완료', '접수', '입고대기'].includes(driverDetailRes.status)) {
      await handleUpdateValetStatus(driverDetailRes.id, 'pending_in');
    } else if (driverDetailRes.status === 'pending_in') {
      await handleUpdateValetStatus(driverDetailRes.id, 'completed_in');
    } else if (driverDetailRes.status === 'completed_in') {
      await handleUpdateValetStatus(driverDetailRes.id, 'request_out');
    } else if (driverDetailRes.status === 'request_out') {
      await handleUpdateValetStatus(driverDetailRes.id, 'completed_out', {
        actualExitTime: getKSTDateTimeString()
      });
    }
    
    setDriverDetailRes(null);
  };

  const handleDriverCancelReservation = async () => {
    if (!driverDetailRes?.id) return;
    const reason = window.prompt(
      '취소 사유를 입력하세요 (예: 고객 취소 요청):',
      '현장 취소 처리'
    );
    if (reason === null) return;

    await handleUpdateValetStatus(driverDetailRes.id, 'cancelled', {
      cancelReason: reason || '현장 취소 처리',
      cancelledAt: getKSTDateTimeString(),
    });
    setDriverDetailRes(null);
  };

  // Auth credentials form (for activating Admin setting options)
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [loginEmail, setLoginEmail] = useState('ingompunch@gmail.com');
  const [loginPassword, setLoginPassword] = useState('admin1234');
  const [loginError, setLoginError] = useState('');

  // 1. Monitor Authenticated State
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
    });
    return () => unsub();
  }, []);

  // Real-time synchronization of system_settings/config (Business Operation Status)
  useEffect(() => {
    const docRef = doc(db, 'system_settings', 'config');
    const unsub = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        const snapData = docSnap.data();
        if (Array.isArray(snapData.blockedDates)) {
          setBlockedDates(snapData.blockedDates);
          localStorage.setItem('blockedDates', JSON.stringify(snapData.blockedDates));
        }
      }
    }, (error) => {
      console.warn("Firestore system_settings/config sub failed:", error);
    });
    return () => unsub();
  }, []);

  const handleSaveBlockedDates = async (newBlockedDates: string[]) => {
    if (currentCompanyId && !isAirpickHeadquarters(currentCompanyId)) {
      // 1. Company-specific save
      localStorage.setItem(`${currentCompanyId}_blockedDates`, JSON.stringify(newBlockedDates));
      
      // Update local state in companies list optimistically
      setCompanies(prev => prev.map(c => c.id === currentCompanyId ? { ...c, blockedDates: newBlockedDates } : c));

      try {
        const docRef = doc(db, 'companies', currentCompanyId);
        await updateDoc(docRef, {
          blockedDates: newBlockedDates,
          updatedAt: new Date().toISOString()
        });
      } catch (err: any) {
        console.warn(`Firestore update for companies/${currentCompanyId} blockedDates failed, trying setDoc fallback:`, err);
        try {
          const docRef = doc(db, 'companies', currentCompanyId);
          await setDoc(docRef, {
            id: currentCompanyId,
            blockedDates: newBlockedDates,
            updatedAt: new Date().toISOString()
          }, { merge: true });
        } catch (innerErr: any) {
          console.warn("Firestore fallback setDoc failed:", innerErr);
        }
      }
    } else {
      // 2. Global fallback save
      setBlockedDates(newBlockedDates);
      localStorage.setItem('blockedDates', JSON.stringify(newBlockedDates));
      try {
        const docRef = doc(db, 'system_settings', 'config');
        await setDoc(docRef, {
          blockedDates: newBlockedDates,
          updatedAt: new Date().toISOString()
        }, { merge: true });
      } catch (err: any) {
        console.warn("Firestore setDoc for blockedDates failed:", err);
        throw err;
      }
    }
  };

  const handleToggleCompanyOpen = async (companyId: string, isOpen: boolean) => {
    // Optimistically update companies state to show instant toggles in UI
    setCompanies(prev => {
      const idx = prev.findIndex(c => c.id === companyId);
      if (idx > -1) {
        return prev.map(c => c.id === companyId ? { ...c, isOpen } : c);
      } else {
        const fallBackName = (companyInfo && companyInfo.id === companyId)
          ? companyInfo.name
          : formatPartnerDisplayName(companyInfo?.name, companyId) || companyId;
        return [...prev, { id: companyId, name: fallBackName, isOpen } as Company];
      }
    });

    try {
      const docRef = doc(db, 'companies', companyId);
      await setDoc(docRef, { isOpen }, { merge: true });
    } catch (err: any) {
      console.warn(`Firestore setDoc for companies/${companyId} failed:`, err);
    }
  };

  // 2. Perform Automatic Credentials Auth if missing, ensuring security conformance
  useEffect(() => {
    const checkAndAuth = async () => {
      if (!auth.currentUser) {
        try {
          await signInAnonymously(auth);
        } catch (e: any) {
          console.warn("Anonymous auth restricted or disabled (safe to ignore offline):", e);
          if (e && (e.code === 'auth/admin-restricted-operation' || e.message?.includes('admin-restricted-operation'))) {
            try {
              await signInWithEmailAndPassword(auth, 'ingompunch@gmail.com', 'admin1234');
            } catch (autoErr) {
              console.warn("Auto admin logging bypassed:", autoErr);
            }
          }
        }
      }
    };
    checkAndAuth();
  }, []);

  // Automated database clean-up routine triggered once on container boot (Now only ensures 'wawa' master company exists without sweeping or purging)
  useEffect(() => {
    const triggerDBCleanup = async () => {
      try {
        const compSnap = await getDocs(collection(db, 'companies'));
        let wawaExists = false;
        for (const d of compSnap.docs) {
          if (d.id === 'wawa') {
            wawaExists = true;
            break;
          }
        }
        // 3. Make sure 'wawa' exists
        if (!wawaExists) {
          await setDoc(doc(db, 'companies', 'wawa'), {
            id: 'wawa',
            name: '와와',
            outdoorBasePrice: 40000,
            outdoorBaseDays: 1,
            outdoorExtraPrice: 5000,
            indoorBasePrice: 40000,
            indoorBaseDays: 1,
            indoorExtraPrice: 10000,
            surchargePrice: 10000,
            surchargeStartTime: '20:00',
            surchargeEndTime: '04:00',
            is_indoor: true,
            supports_indoor: true,
            supports_outdoor: true,
            phone: '1545-5746',
            isOpen: true,
            blockedDates: [],
            updatedAt: new Date().toISOString()
          });
        }
      } catch (err) {
        console.warn("Automated master DB validation on load bypassed:", err);
      }
    };
    triggerDBCleanup();
  }, []);

  // 3. Load Available Partner Companies List from Firestore
  useEffect(() => {
    setLoadingCompanies(true);
    const unsub = onSnapshot(collection(db, 'companies'), (snap) => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() } as Company));
      const filtered = data.filter(c => {
        const dummy = isDummyCompany(c.id, c.name);
        if (dummy) {
          deleteDoc(doc(db, 'companies', c.id)).catch(err => {
            console.warn("Purge dummy company from Firestore failed:", err);
          });
          return false;
        }
        return true;
      });

      if (filtered.length > 0) {
        setCompanies(filtered);
        localStorage.setItem('companies', JSON.stringify(filtered));
      } else {
        const saved = localStorage.getItem('companies');
        if (saved) {
          try {
            const parsed = JSON.parse(saved);
            if (parsed && Array.isArray(parsed)) {
              const cleanSaved = parsed.filter(c => !isDummyCompany(c.id, c.name));
              setCompanies(cleanSaved);
              setLoadingCompanies(false);
              return;
            }
          } catch (_) {}
        }
        setCompanies([]);
      }

      // Automatically compile partner accounts from the dynamic companies fetched from Firestore
      const dynamicPartners: PartnerCompany[] = filtered
        .filter(c => !isAirpickHeadquarters(c.id))
        .map(c => {
          const rawCompanyData = c as any;
          return {
            companyId: c.id,
            password: rawCompanyData.password || '1234',
            name: c.name,
            representative: c.representative || '',
            phone: c.phone || '',
            settlementMemo: rawCompanyData.settlementMemo || '지급 기본 정산 기준 보류',
            status: rawCompanyData.status || 'active',
            employees: rawCompanyData.employees || []
          };
        });

      // Merge with any local partner data to avoid clearing passwords or employees that were local-only
      setPartners(prev => {
        const mergedMap = new Map<string, PartnerCompany>();
        
        // 1. Put local memory items in
        prev.forEach(p => mergedMap.set(p.companyId, p));
        
        // 2. Put local storage items in
        const saved = localStorage.getItem('super_partners_list');
        if (saved) {
          try {
            const parsed = JSON.parse(saved);
            if (Array.isArray(parsed)) {
              parsed.forEach((p: PartnerCompany) => mergedMap.set(p.companyId, p));
            }
          } catch (_) {}
        }
        
        // 3. Put dynamic db items in, overwriting/updating values from Firestore
        dynamicPartners.forEach(p => {
          const existing = mergedMap.get(p.companyId);
          mergedMap.set(p.companyId, {
            ...p,
            employees: existing?.employees || p.employees || []
          });
        });

        const mergedList = Array.from(mergedMap.values());
        localStorage.setItem('super_partners_list', JSON.stringify(mergedList));
        return mergedList;
      });

      setLoadingCompanies(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'companies');
      const saved = localStorage.getItem('companies');
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          if (parsed && Array.isArray(parsed)) {
            const cleanSaved = parsed.filter(c => !isDummyCompany(c.id, c.name));
            setCompanies(cleanSaved);
            setLoadingCompanies(false);
            return;
          }
        } catch (_) {}
      }
      setCompanies([]);
      setLoadingCompanies(false);
    });
    return () => unsub();
  }, []);



  // 4. Real-time Reservations Sync — runs on app login (not only when Firebase Auth user exists)
  useEffect(() => {
    if (!isLoggedIn) return;

    let cancelled = false;
    const q = query(collection(db, 'reservations'));

    const applySnapshot = (rawData: Record<string, unknown>[]) => {
      if (cancelled) return;
      const data = normalizeDocsArray(rawData).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      setReservations(data);
      localStorage.setItem('firestore_reservations_cache', JSON.stringify(data));
      setLoadingReservations(false);
    };

    const bootstrapAuthAndListen = async () => {
      setLoadingReservations(true);
      if (!auth.currentUser) {
        try {
          await signInAnonymously(auth);
        } catch (e: any) {
          console.warn('Anonymous auth before reservations sync:', e);
          if (e?.code === 'auth/admin-restricted-operation') {
            try {
              await signInWithEmailAndPassword(auth, 'ingompunch@gmail.com', 'admin1234');
            } catch (autoErr) {
              console.warn('Fallback email auth before reservations sync:', autoErr);
            }
          }
        }
      }

      if (cancelled) return;

      try {
        const snap = await getDocs(q);
        if (!cancelled) {
          applySnapshot(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.LIST, 'reservations');
        if (!cancelled) setLoadingReservations(false);
      }

      const unsub = onSnapshot(
        q,
        (snap) => applySnapshot(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
        (err) => {
          console.warn('reservations onSnapshot error:', err);
          handleFirestoreError(err, OperationType.LIST, 'reservations');
          if (!cancelled) setLoadingReservations(false);
        }
      );

      return unsub;
    };

    let unsub: (() => void) | undefined;
    bootstrapAuthAndListen().then((u) => {
      unsub = u;
    });

    return () => {
      cancelled = true;
      unsub?.();
    };
  }, [isLoggedIn]);

  // Deep/Master Purge Database handler (Clean and secure DB RESET)
  const seedData = async () => {
    try {
      console.log("Wiping dummy data & purges...");
      // 1. Purge all reservations from Firestore
      const resSnap = await getDocs(collection(db, 'reservations'));
      for (const d of resSnap.docs) {
        await deleteDoc(doc(db, 'reservations', d.id));
      }
      
      // 2. Purge all other companies from Firestore except 'wawa'
      const snap = await getDocs(collection(db, 'companies'));
      let wawaDocExists = false;
      for (const d of snap.docs) {
        if (d.id === 'wawa') {
          wawaDocExists = true;
          continue;
        }
        await deleteDoc(doc(db, 'companies', d.id));
      }

      // Ensure 'wawa' exists in DB (첫 제휴 업체)
      if (!wawaDocExists) {
        await setDoc(doc(db, 'companies', 'wawa'), {
          id: 'wawa',
          name: '와와',
          is_indoor: true,
          supports_indoor: true,
          supports_outdoor: true,
          phone: '1545-5746',
          isOpen: true,
          blockedDates: [],
          updatedAt: new Date().toISOString()
        });
      }

      // 3. Clear local caching states so that the user's dashboard refreshes beautifully
      localStorage.removeItem('companies');
      for (const key of Object.keys(localStorage)) {
        if (key.endsWith('_reservations') || key.endsWith('_blockedDates')) {
          localStorage.removeItem(key);
        }
      }
      
      setReservations([]);
      alert("✅ 모든 가짜 데이터, 매출, 제휴업체가 성공적으로 영구 삭제되었습니다.");
    } catch (e: any) {
      handleFirestoreError(e, OperationType.WRITE, 'companies');
    }
  };

  // Login handler
  const handleCredentialLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    
    const inputEmailClean = loginEmail.trim().toLowerCase();
    
    // First, check if input matches a dynamic partner company in super_partners_list
    const savedPartnersStr = localStorage.getItem('super_partners_list');
    let dynamicPartners: PartnerCompany[] = [];
    if (savedPartnersStr) {
      try {
        dynamicPartners = JSON.parse(savedPartnersStr);
      } catch (_) {}
    }
    
    const matchedPartner = dynamicPartners.find(
      p => p.companyId.toLowerCase() === inputEmailClean || p.name.toLowerCase() === loginEmail.trim().toLowerCase()
    );
    
    if (matchedPartner) {
      if (loginPassword !== matchedPartner.password) {
        setLoginError('인증번호/비밀번호가 일치하지 않습니다.');
        return;
      }
      
      if (matchedPartner.status === 'suspended') {
        setLoginError('해당 제휴업체 계정은 최고관리자에 의해 [정지] 처리되었습니다. 플랫폼 본사에 정산 조정을 문의바랍니다.');
        return;
      }
      
      // Validated dynamic partner login
      setIsSuperAdmin(false);
      setIsLocalAdmin(true);
      setIsMasterAdmin(true);
      setCurrentCompanyId(matchedPartner.companyId);
      
      const brandInfo: CompanyInfo = {
        id: matchedPartner.companyId,
        name: matchedPartner.name,
        region: '인천공항 1터미널',
        phone: matchedPartner.phone,
        logo: ''
      };
      setCompanyInfo(brandInfo);
      localStorage.setItem('master_company_info', JSON.stringify(brandInfo));
      localStorage.setItem('current_company_id', matchedPartner.companyId);
      localStorage.setItem('local_is_super_admin', 'false');
      localStorage.setItem('local_is_admin', 'true');
      localStorage.setItem('local_is_master_admin', 'true');
      setShowLoginModal(false);
      alert(`제휴업체 [${matchedPartner.name}]의 마스터 관리자 인증이 성공 통과하여 관리자 모드가 활성화되었습니다!`);
      return;
    }
    
    // Fallbacks
    const savedMasterEmail = (localStorage.getItem('master_account_email') || 'master@gayoo.com').trim().toLowerCase();
    const savedMasterPassword = localStorage.getItem('master_account_password') || 'master1234';
    
    if (loginEmail === 'airpick' && loginPassword === '9980') {
      setIsSuperAdmin(true);
      setIsLocalAdmin(true);
      setIsMasterAdmin(false);
      setIsAdminModeActive(true);
      const hqInfo: CompanyInfo = {
        id: AIRPICK_HQ_ID,
        name: '에어픽',
        region: '플랫폼 본사',
        phone: '1545-5746',
        logo: '',
      };
      setCurrentCompanyId(AIRPICK_HQ_ID);
      setCompanyInfo(hqInfo);
      localStorage.setItem('current_company_id', AIRPICK_HQ_ID);
      localStorage.setItem('master_company_info', JSON.stringify(hqInfo));
      localStorage.setItem('local_is_super_admin', 'true');
      localStorage.setItem('local_is_admin', 'true');
      localStorage.setItem('local_is_master_admin', 'false');
      localStorage.setItem('local_is_admin_mode_active', 'true');
      setCurrentView('statistics');
      setShowLoginModal(false);
      alert(`최고관리자 'airpick' 님 마스터 자격 인증이 완료되었습니다!`);
    } else if (inputEmailClean === savedMasterEmail && loginPassword === savedMasterPassword) {
      setIsSuperAdmin(false);
      setIsLocalAdmin(true);
      setIsMasterAdmin(true);
      setCurrentCompanyId(companyInfo.id || 'wawa');
      localStorage.setItem('local_is_super_admin', 'false');
      localStorage.setItem('local_is_admin', 'true');
      localStorage.setItem('local_is_master_admin', 'true');
      setShowLoginModal(false);
      alert(`제휴업체 [${companyInfo.name}]의 마스터 관리자 인증이 성공 통과하여 관리자 모드가 활성화되었습니다!`);
    } else if (loginPassword === 'admin1234') {
      setIsSuperAdmin(false);
      setIsLocalAdmin(true);
      setIsMasterAdmin(false);
      localStorage.setItem('local_is_super_admin', 'false');
      localStorage.setItem('local_is_admin', 'true');
      localStorage.setItem('local_is_master_admin', 'false');
      setShowLoginModal(false);
      alert(`${loginEmail} 님 서명이 성공 통과하여 업체 관리자 모드가 승인되었습니다!`);
    } else {
      setLoginError('인증이 기각되었습니다. 아이디와 보안 비밀번호를 재확인 바랍니다.');
    }
  };

  // Consolidated Gateway Login Success Handler
  const handleGateLoginSuccess = (roles: {
    isSuperAdmin: boolean;
    isLocalAdmin: boolean;
    isMasterAdmin: boolean;
    isAdminModeActive: boolean;
    companyId: string;
    companyInfo: CompanyInfo;
    isEmployee?: boolean;
    employeeName?: string;
    employeeRole?: 'admin' | 'driver';
  }) => {
    setIsLoggedIn(true);
    setIsSuperAdmin(roles.isSuperAdmin);
    setIsLocalAdmin(roles.isLocalAdmin);
    setIsMasterAdmin(roles.isMasterAdmin);
    setIsAdminModeActive(roles.isAdminModeActive);
    const normalizedCompanyId = normalizePlatformCompanyId(roles.companyId) || roles.companyId;
    const normalizedInfo =
      normalizedCompanyId === AIRPICK_HQ_ID
        ? { ...roles.companyInfo, id: AIRPICK_HQ_ID, name: '에어픽', region: '플랫폼 본사' }
        : roles.companyInfo;
    setCurrentCompanyId(normalizedCompanyId);
    setCompanyInfo(normalizedInfo);
    setIsEmployee(roles.isEmployee || false);
    setEmployeeName(roles.employeeName || '');
    setEmployeeRole(roles.employeeRole || 'driver');

    localStorage.setItem('is_logged_in', 'true');
    localStorage.setItem('local_is_super_admin', roles.isSuperAdmin ? 'true' : 'false');
    localStorage.setItem('local_is_admin', roles.isLocalAdmin ? 'true' : 'false');
    localStorage.setItem('local_is_master_admin', roles.isMasterAdmin ? 'true' : 'false');
    localStorage.setItem('local_is_admin_mode_active', roles.isAdminModeActive ? 'true' : 'false');
    localStorage.setItem('current_company_id', normalizedCompanyId);
    localStorage.setItem('master_company_info', JSON.stringify(normalizedInfo));
    localStorage.setItem('local_is_employee', roles.isEmployee ? 'true' : 'false');
    localStorage.setItem('local_employee_name', roles.employeeName || '');
    localStorage.setItem('local_employee_role', roles.employeeRole || 'driver');

    if (roles.isSuperAdmin) {
      setCurrentView('statistics');
    } else {
      setCurrentView('timeline');
    }

    ensureFirestoreAuth().catch((err) => {
      console.warn('Firebase auth after gate login:', err);
    });
  };

  // Logout handler
  const handleOperatorLogout = async () => {
    try {
      setIsLoggedIn(false);
      setIsSuperAdmin(false);
      setIsLocalAdmin(false);
      setIsMasterAdmin(false);
      setIsAdminModeActive(false);
      setIsEmployee(false);
      setEmployeeName('');
      setEmployeeRole('driver');
      
      localStorage.removeItem('is_logged_in');
      localStorage.removeItem('local_is_super_admin');
      localStorage.removeItem('local_is_admin');
      localStorage.removeItem('local_is_master_admin');
      localStorage.removeItem('local_is_admin_mode_active');
      localStorage.removeItem('local_is_employee');
      localStorage.removeItem('local_employee_name');
      localStorage.removeItem('local_employee_role');
      
      await signOut(auth);
      try {
        await signInAnonymously(auth);
      } catch (anonErr) {
        console.warn("Silent ignore: signInAnonymously restricted during logout", anonErr);
      }
      alert("👋 안전하게 로그아웃되었습니다. 통합 로그인 화면(Gate)으로 이동합니다.");
    } catch (err) {
      setIsLoggedIn(false);
      setIsSuperAdmin(false);
      setIsLocalAdmin(false);
      setIsMasterAdmin(false);
      setIsAdminModeActive(false);
      
      localStorage.removeItem('is_logged_in');
      localStorage.removeItem('local_is_super_admin');
      localStorage.removeItem('local_is_admin');
      localStorage.removeItem('local_is_master_admin');
      localStorage.removeItem('local_is_admin_mode_active');
      console.error(err);
    }
  };



  // Mutate schedule states (Worker transition flow)
  const handleUpdateValetStatus = async (
    resId: string, 
    nextStatus: ReservationStatus, 
    extraFields?: Partial<Reservation>
  ) => {
    const operatorName = isEmployee ? employeeName : (isSuperAdmin ? '본사 마스터(최고관리자)' : '업체 마스터');
    // Optimistically update React state and localStorage instantly
    setReservations(prev => {
      const updated = prev.map(r => r.id === resId ? { 
        ...r, 
        status: nextStatus, 
        ...extraFields,
        updatedBy: operatorName,
        updatedAt: new Date().toISOString() 
      } : r);
      localStorage.setItem(`${currentCompanyId}_reservations`, JSON.stringify(updated));
      return updated;
    });

    try {
      const docRef = doc(db, 'reservations', resId);
      await updateDoc(docRef, { 
        status: nextStatus,
        ...extraFields,
        updatedBy: operatorName,
        updatedAt: new Date().toISOString()
      });
    } catch (err: any) {
      console.warn("Firestore status update run locally or failed, state already migrated:", err);
    }
  };

  // Mutate payment methods (From 결제변경 subsystem)
  const handleUpdatePaymentMethod = async (resId: string, method: PaymentMethod) => {
    const operatorName = isEmployee ? employeeName : (isSuperAdmin ? '본사 마스터(최고관리자)' : '업체 마스터');
    try {
      const docRef = doc(db, 'reservations', resId);
      await updateDoc(docRef, { 
        paymentMethod: method,
        updatedBy: operatorName,
        updatedAt: new Date().toISOString()
      });
      setReservations(prev => {
        const updated = prev.map(r => r.id === resId ? { ...r, paymentMethod: method, updatedBy: operatorName, updatedAt: new Date().toISOString() } : r);
        localStorage.setItem(`${currentCompanyId}_reservations`, JSON.stringify(updated));
        return updated;
      });
    } catch (err: any) {
      setReservations(prev => {
        const updated = prev.map(r => r.id === resId ? { ...r, paymentMethod: method, updatedBy: operatorName, updatedAt: new Date().toISOString() } : r);
        localStorage.setItem(`${currentCompanyId}_reservations`, JSON.stringify(updated));
        return updated;
      });
    }
  };

  // Mutate scratch photo sync lists
  const handleUpdateScratchPhotos = async (resId: string, photos: ScratchPhotoSet) => {
    const operatorName = isEmployee ? employeeName : (isSuperAdmin ? '본사 마스터(최고관리자)' : '업체 마스터');
    try {
      const docRef = doc(db, 'reservations', resId);
      await updateDoc(docRef, { 
        scratchPhotos: photos,
        updatedBy: operatorName,
        updatedAt: new Date().toISOString()
      });
      setReservations(prev => {
        const updated = prev.map(r => r.id === resId ? { ...r, scratchPhotos: photos, updatedBy: operatorName, updatedAt: new Date().toISOString() } : r);
        localStorage.setItem(`${currentCompanyId}_reservations`, JSON.stringify(updated));
        return updated;
      });
    } catch (err: any) {
      setReservations(prev => {
        const updated = prev.map(r => r.id === resId ? { ...r, scratchPhotos: photos, updatedBy: operatorName, updatedAt: new Date().toISOString() } : r);
        localStorage.setItem(`${currentCompanyId}_reservations`, JSON.stringify(updated));
        return updated;
      });
    }
  };

  // Security Guard and Redirection Bouncer Engine:
  // Forced redirection when transitioning into Admin mode or out of Admin mode.
  // When Admin mode is active, make sure they skip 'timeline' and go directly to 'statistics'.
  // When transitioning out of Admin mode or not authenticated as admin, return to driver workplace ('timeline').
  useEffect(() => {
    if (isAdminModeActive && isAdmin) {
      if (currentView === 'timeline') {
        setCurrentView('statistics');
      }
    } else {
      if (currentView === 'statistics' || currentView === 'cancelled_list' || currentView === 'parkingRegister') {
        setCurrentView('timeline');
      }
    }
  }, [isAdminModeActive, isAdmin, currentView]);

  const targetReservationForScratch = useMemo(() => {
    return reservations.find(r => r.id === scratchModalTargetId);
  }, [reservations, scratchModalTargetId]);

  const handleSpotClick = (spotKey: string, mockUrl: string) => {
    if (autoShootTimeoutRef.current) {
      clearTimeout(autoShootTimeoutRef.current);
      autoShootTimeoutRef.current = null;
    }

    const isCurrentlyUploaded = !!uploadedSpots[spotKey];

    if (isCurrentlyUploaded) {
      setUploadedSpots(prev => {
        const copy = { ...prev };
        delete copy[spotKey];
        return copy;
      });
      setActiveSpotKey(spotKey);
    } else {
      setUploadedSpots(prev => ({
        ...prev,
        [spotKey]: mockUrl
      }));
      setActiveSpotKey(spotKey);

      const currentIndex = SPOT_SEQUENCE.indexOf(spotKey);
      if (currentIndex !== -1 && currentIndex < SPOT_SEQUENCE.length - 1) {
        const nextKey = SPOT_SEQUENCE[currentIndex + 1];
        const spotsList = [
          { key: 'front', mockUrl: 'https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?q=80&w=400&fit=crop' },
          { key: 'rear', mockUrl: 'https://images.unsplash.com/photo-1503376780353-7e6692767b70?q=80&w=400&fit=crop' },
          { key: 'left', mockUrl: 'https://images.unsplash.com/photo-1617788138017-80ad40651399?q=80&w=400&fit=crop' },
          { key: 'right', mockUrl: 'https://images.unsplash.com/photo-1542282088-fe8426682b8f?q=80&w=400&fit=crop' },
          { key: 'front_wheel_l', mockUrl: 'https://images.unsplash.com/photo-1552519507-da3b142c6e3d?q=80&w=400&fit=crop' },
          { key: 'front_wheel_r', mockUrl: 'https://images.unsplash.com/photo-1580273916550-e323be2ae537?q=80&w=400&fit=crop' },
          { key: 'rear_wheel_l', mockUrl: 'https://images.unsplash.com/photo-1621932953986-15fcfec8140f?q=80&w=400&fit=crop' },
          { key: 'rear_wheel_r', mockUrl: 'https://images.unsplash.com/photo-1616422285623-13ff0162193c?q=80&w=400&fit=crop' }
        ];

        const nextSpotObj = spotsList.find(s => s.key === nextKey);
        if (nextSpotObj) {
          setActiveSpotKey(nextKey);
          autoShootTimeoutRef.current = setTimeout(() => {
            triggerAutoAdvance(nextKey, nextSpotObj.mockUrl);
          }, 850);
        }
      }
    }
  };

  const triggerAutoAdvance = (spotKey: string, mockUrl: string) => {
    // If the modal was closed while waiting, stop immediately
    setUploadedSpots(prev => {
      // Return updated spots
      const nextSpots = {
        ...prev,
        [spotKey]: mockUrl
      };
      
      const currentIndex = SPOT_SEQUENCE.indexOf(spotKey);
      if (currentIndex !== -1 && currentIndex < SPOT_SEQUENCE.length - 1) {
        const nextKey = SPOT_SEQUENCE[currentIndex + 1];
        setActiveSpotKey(nextKey);

        const spotsList = [
          { key: 'front', mockUrl: 'https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?q=80&w=400&fit=crop' },
          { key: 'rear', mockUrl: 'https://images.unsplash.com/photo-1503376780353-7e6692767b70?q=80&w=400&fit=crop' },
          { key: 'left', mockUrl: 'https://images.unsplash.com/photo-1617788138017-80ad40651399?q=80&w=400&fit=crop' },
          { key: 'right', mockUrl: 'https://images.unsplash.com/photo-1542282088-fe8426682b8f?q=80&w=400&fit=crop' },
          { key: 'front_wheel_l', mockUrl: 'https://images.unsplash.com/photo-1552519507-da3b142c6e3d?q=80&w=400&fit=crop' },
          { key: 'front_wheel_r', mockUrl: 'https://images.unsplash.com/photo-1580273916550-e323be2ae537?q=80&w=400&fit=crop' },
          { key: 'rear_wheel_l', mockUrl: 'https://images.unsplash.com/photo-1621932953986-15fcfec8140f?q=80&w=400&fit=crop' },
          { key: 'rear_wheel_r', mockUrl: 'https://images.unsplash.com/photo-1616422285623-13ff0162193c?q=80&w=400&fit=crop' }
        ];

        const nextSpotObj = spotsList.find(s => s.key === nextKey);
        if (nextSpotObj) {
          if (autoShootTimeoutRef.current) {
            clearTimeout(autoShootTimeoutRef.current);
          }
          autoShootTimeoutRef.current = setTimeout(() => {
            triggerAutoAdvance(nextKey, nextSpotObj.mockUrl);
          }, 850);
        }
      }
      return nextSpots;
    });
  };

  const getKSTDateTimeString = () => {
    const kstDate = new Date(Date.now() + 9 * 60 * 60 * 1000);
    return kstDate.toISOString().replace('T', ' ').substring(0, 19);
  };

  // 4-step counters and counts
  const countPending = useMemo(() => {
    return visibleReservations.filter(r => {
      const rDep = normalizeDateString(r.departureDate);
      const selDate = normalizeDateString(selectedDate);
      const isExpected = ['pending', '입고예정', '예약완료', '접수', '입고대기'].includes(r.status);
      if (!isExpected) return false;
      if (selDate) {
        if (rDep !== selDate) return false;
      }
      return true;
    }).length;
  }, [visibleReservations, selectedDate]);

  const countPendingIn = useMemo(() => {
    return visibleReservations.filter(r => {
      const rDep = normalizeDateString(r.departureDate);
      const selDate = normalizeDateString(selectedDate);
      if (r.status !== 'pending_in') return false;
      if (selDate) {
        if (rDep !== selDate) return false;
      }
      return true;
    }).length;
  }, [visibleReservations, selectedDate]);

  const countRequestOut = useMemo(() => {
    return visibleReservations.filter(r => {
      const rArr = normalizeDateString(r.arrivalDate);
      const selDate = normalizeDateString(selectedDate);
      if (r.status !== 'request_out') return false;
      if (selDate) {
        if (rArr !== selDate) return false;
      }
      return true;
    }).length;
  }, [visibleReservations, selectedDate]);

  const countConfirmed = useMemo(() => {
    return visibleReservations.filter(r => {
      const rArr = normalizeDateString(r.arrivalDate);
      const selDate = normalizeDateString(selectedDate);
      if (r.status !== 'completed_in') return false;
      if (selDate) {
        if (rArr !== selDate) return false;
      }
      return true;
    }).length;
  }, [visibleReservations, selectedDate]);

  // Filter and sort reservations based on selected tab and filters
  const computedList = useMemo(() => {
    return visibleReservations.filter(res => {
      const rDep = normalizeDateString(res.departureDate);
      const rArr = normalizeDateString(res.arrivalDate);
      const selDate = normalizeDateString(selectedDate);

      // 1. Admin Mode Filtering Strategy
      if (isAdminModeActive) {
        if (filterType === '주/출차일자') {
          if (rDep !== selDate && rArr !== selDate) return false;
        } else if (filterType === '주차예약') {
          // 상태 제한 없이 입고예정일이 selectedDate와 일치
          if (rDep !== selDate) return false;
        } else if (filterType === '출차예약') {
          // 상태 제한 없이 출고예정일이 selectedDate와 일치
          if (rArr !== selDate) return false;
        } else if (filterType === '등록일시') {
          // createdAt의 날짜와 selectedDate 일치
          if (!res.createdAt || !normalizeDateString(res.createdAt).startsWith(selDate)) return false;
        }
      } else {
        // 2. Driver Mode Filtering Strategy
        // 2-1. Filter by active tab status strictly
        if (activeCounterTab === 'pending') {
          const isExpected = ['pending', '입고예정', '예약완료', '접수', '입고대기'].includes(res.status);
          if (!isExpected) return false;
        } else {
          if (res.status !== activeCounterTab) return false;
        }

        // 2-2. Filter by date-matching rules
        if (selDate) {
          if (activeCounterTab === 'pending' || activeCounterTab === 'pending_in') {
            if (rDep !== selDate) return false;
          } else if (activeCounterTab === 'request_out' || activeCounterTab === 'completed_in') {
            if (rArr !== selDate) return false;
          }
        }
      }

      // 3. Admin-only Search keywords
      if (isAdminModeActive) {
        const keyword = searchKeyword.trim().toLowerCase();
        if (keyword) {
          const matchesKeyword = 
            (res.carNumber || '').toLowerCase().includes(keyword) ||
            (res.userName || '').toLowerCase().includes(keyword) ||
            (res.carModel || '').toLowerCase().includes(keyword) ||
            (res.phone || '').includes(keyword) ||
            (res.companyName || '').toLowerCase().includes(keyword);
          
          if (!matchesKeyword) return false;
        }
      }

      return true;
    }).sort((a, b) => {
      const aDep = normalizeDateString(a.departureDate);
      const bDep = normalizeDateString(b.departureDate);
      const aArr = normalizeDateString(a.arrivalDate);
      const bArr = normalizeDateString(b.arrivalDate);
      if (filterType === '출차예약') {
        const timeA = `${aArr || ''} ${a.arrivalTime || ''}`;
        const timeB = `${bArr || ''} ${b.arrivalTime || ''}`;
        return timeA.localeCompare(timeB);
      } else {
        const timeA = `${aDep || ''} ${a.departureTime || ''}`;
        const timeB = `${bDep || ''} ${b.departureTime || ''}`;
        return timeA.localeCompare(timeB);
      }
    });
  }, [visibleReservations, activeCounterTab, filterType, selectedDate, searchKeyword, isAdminModeActive]);

  const activeTimelineReservations = computedList;

  if (!isLoggedIn) {
    return (
      <ConsolidatedGate 
        onLoginSuccess={handleGateLoginSuccess} 
        partners={partners} 
        companies={companies} 
      />
    );
  }

  return (
    <div className="min-h-screen bg-black font-sans text-white pb-24 selection:bg-amber-500 selection:text-neutral-950 antialiased">
      
      {/* 1. Header with Sidebar Trigger Button & Embedded Status Tabs */}
      <div className="sticky top-0 z-40 bg-black/95 backdrop-blur-md border-b border-neutral-900/30">
        <header className="px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button 
              type="button"
              onClick={() => setIsSidebarOpen(true)}
              className="p-2.5 hover:bg-neutral-900 rounded-[14px] text-neutral-400 hover:text-white transition-all bg-neutral-950 border border-neutral-900/40"
              title="사이드바 열기"
              id="sidebar-trigger"
            >
              <Menu size={18} />
            </button>
            
            <div className="flex flex-col">
              {isSuperAdmin ? (
                <div className="flex items-center gap-1.5">
                  <select
                    value={currentCompanyId}
                    onChange={(e) => handleCompanySwitch(e.target.value)}
                    className="bg-[#1C1C1E] text-white text-xs font-black px-2 sm:px-3 py-1 sm:py-1.5 rounded-xl border border-neutral-800 focus:outline-none focus:border-amber-500 font-sans cursor-pointer max-w-[95px] sm:max-w-[130px] truncate"
                    id="global-switching-hub"
                  >
                    {getDropdownOptions().map((opt, idx) => (
                      <option key={`${opt.id}-${idx}`} value={opt.id}>
                        {opt.name}
                      </option>
                    ))}
                  </select>
                  <span className="text-[8px] text-amber-500/95 font-bold bg-amber-500/10 px-1.5 py-0.5 rounded uppercase font-sans tracking-wide shrink-0">
                    MASTER
                  </span>
                </div>
              ) : (
                <h1 className="text-toss-title flex items-center gap-1.5 leading-none" id="partner-header-brand">
                  {formatPartnerDisplayName(companyInfo.name, companyInfo.id)} 
                  <span className="text-toss-caption text-amber-400 font-semibold bg-amber-500/10 px-2 py-0.5 rounded-[6px]">
                    인천
                  </span>
                </h1>
              )}
              <p className="text-toss-caption mt-1 mb-0">인천공항 발렛 B2B</p>
            </div>
          </div>

          {/* Outer Admin Mode status trigger */}
          <div className="flex items-center gap-1 sm:gap-2 shrink-0">
            {isLoggedIn ? (
              <div className="flex items-center gap-1 sm:gap-1.5">
                {isAdminModeActive && isAdmin && (!isEmployee || employeeRole === 'admin') && !isAirpickHeadquarters(currentCompanyId) && (
                  <button
                    type="button"
                    onClick={() => setShowBlockoutModal(true)}
                    className="p-1 bg-[#1C1C1E] hover:bg-[#2C2C2E] text-zinc-300 hover:text-white rounded-[12px] border border-neutral-800/80 transition-all flex items-center justify-center gap-1 shrink-0 px-2 sm:px-3 py-1 sm:py-1.5 shadow-sm active:scale-[0.98]"
                    title="예약 마감 및 날짜별 승인 설정"
                    id="blockout-calendar-trigger"
                  >
                    <CalendarRange size={11} className="text-[#10B981] animate-pulse" />
                    <span className="text-[9px] sm:text-[9.5px] font-black tracking-tight flex items-center gap-0.5 text-zinc-200">
                      ⚙️ <span className="hidden sm:inline">예약 관리</span><span className="sm:hidden">예약</span>
                      <span className="w-1 h-1 rounded-full inline-block ml-0.5 bg-[#10B981]" />
                    </span>
                  </button>
                )}
                {isAdmin && (!isEmployee || employeeRole === 'admin') && !isAirpickHeadquarters(currentCompanyId) && (
                  <div className="flex bg-[#121214] p-0.5 rounded-xl border border-neutral-800/65 font-black shrink-0" id="admin-mode-toggle">
                    <button
                      type="button"
                      onClick={() => setIsAdminModeActive(true)}
                      className={cn(
                        "px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-lg text-[9px] sm:text-[10px] font-black transition-all cursor-pointer flex items-center justify-center gap-1",
                        isAdminModeActive 
                          ? "bg-amber-500 text-neutral-950 shadow-md font-bold" 
                          : "text-zinc-500 hover:text-zinc-300"
                      )}
                    >
                      <span className={cn("w-1 h-1 rounded-full", isAdminModeActive ? "bg-neutral-950" : "bg-transparent")} />
                      관리자
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsAdminModeActive(false)}
                      className={cn(
                        "px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-lg text-[9px] sm:text-[10px] font-black transition-all cursor-pointer flex items-center justify-center gap-1",
                        !isAdminModeActive 
                          ? "bg-amber-500 text-neutral-950 shadow-md font-bold" 
                          : "text-zinc-500 hover:text-zinc-300"
                      )}
                    >
                      <span className={cn("w-1 h-1 rounded-full", !isAdminModeActive ? "bg-neutral-950 animate-pulse" : "bg-transparent")} />
                      기사
                    </button>
                  </div>
                )}
                
                {isEmployee && (
                  <div className="px-2 sm:px-3.5 py-1 sm:py-1.5 bg-amber-500/10 text-amber-500 border border-amber-500/25 rounded-[12px] text-[9px] sm:text-[10px] font-black flex items-center gap-0.5 sm:gap-1 select-none shrink-0">
                    <span className="w-1 h-1 rounded-full bg-amber-500 animate-pulse" />
                    <span>{employeeRole === 'admin' ? `부관리자 (${employeeName})` : `기사 (${employeeName})`}</span>
                  </div>
                )}
              </div>
            ) : (
              <button
                onClick={() => {
                  setLoginEmail('ingompunch@gmail.com');
                  setShowLoginModal(true);
                }}
                className="px-3 py-1.5 bg-neutral-900 hover:bg-neutral-850 text-neutral-300 text-[10px] font-bold rounded-[16px] border border-neutral-800 transition-colors flex items-center gap-1.5"
                id="login-modal-trigger"
              >
                <Lock size={10} className="text-amber-500" />
                관리자 계정 전환
              </button>
            )}
          </div>
        </header>

        {/* 2. TOP 4-Step Status tab counters integrated directly into header */}
        {currentView === 'timeline' && !isAdminModeActive && (
          <div className="mx-4 mb-3 bg-[#1C1C1E] rounded-[22px] p-1 grid grid-cols-4 gap-1 border border-neutral-900/30">
            {[
              { key: 'pending' as ReservationStatus, label: '입고예정', count: countPending, color: 'text-amber-400' },
              { key: 'pending_in' as ReservationStatus, label: '입고요청', count: countPendingIn, color: 'text-sky-450' },
              { key: 'request_out' as ReservationStatus, label: '출고요청', count: countRequestOut, color: 'text-rose-450' },
              { key: 'completed_in' as ReservationStatus, label: '출고예정', count: countConfirmed, color: 'text-emerald-450' }
            ].map((step) => {
              const isActive = activeCounterTab === step.key;
              return (
                <button
                  key={step.key}
                  onClick={() => setActiveCounterTab(step.key)}
                  className={cn(
                    "flex flex-col items-center justify-center pt-2 pb-2.5 transition-all focus:outline-none rounded-[18px] relative",
                    isActive ? "bg-[#2C2C2E] shadow-sm" : "hover:bg-neutral-800/20"
                  )}
                  id={`tab-${step.key}`}
                >
                  <span className={cn("text-toss-caption font-semibold mb-0.5", isActive ? "text-white" : "text-[var(--color-toss-fg-subtle)]")}>
                    {step.label}
                  </span>
                  <span className={cn("text-lg font-bold tabular-nums leading-none", isActive ? step.color : "text-[var(--color-toss-fg-subtle)]")}>
                    {step.count}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* 2. Slide Navigation Pages Drawer */}
      <Sidebar 
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        currentView={currentView}
        onNavigate={(view) => setCurrentView(view)}
        userEmail={user?.email}
        isAnonymous={user?.isAnonymous}
        isAdmin={isAdmin}
        isSuperAdmin={isSuperAdmin}
        onOpenAdmin={() => setShowAdminModal(true)}
        onLogout={handleOperatorLogout}
        onTriggerLogin={() => {
          setLoginEmail('ingompunch@gmail.com');
          setShowLoginModal(true);
        }}
        isAdminModeActive={isAdminModeActive}
        isEmployee={isEmployee}
        employeeName={employeeName}
        employeeRole={employeeRole}
        currentCompanyId={currentCompanyId}
        companyInfo={companyInfo}
      />

      {/* 3. Core Workspace Content Switcher - Dynamically widened for Timeline & Dashboards */}
      {(() => {
        const isWideView = ['timeline', 'statistics', 'cancelled_list', 'parkingRegister', 'master_settings', 'service_history', 'parking_departure', 'payment_change'].includes(currentView);
        return (
          <main className={cn("mx-auto p-4 mt-2 transition-all duration-200", isWideView ? "max-w-4xl" : "max-w-md")}>
            <AnimatePresence mode="wait">
              
              {/* VIEW A: Main Driver Valet Timeline */}
              {currentView === 'timeline' && (
                <motion.div
                  key="timeline_view"
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.98 }}
                  transition={{ duration: 0.15 }}
                >
                  <TimelineView
                    isAdminModeActive={isAdminModeActive}
                    reservations={reservations}
                    selectedDate={selectedDate}
                    setDatePickerTarget={setDatePickerTarget}
                    activeCounterTab={activeCounterTab}
                    loadingReservations={loadingReservations}
                    setCurrentView={setCurrentView}
                    setReceptionSubMode={setReceptionSubMode}
                    setDriverDetailRes={setDriverDetailRes}
                    setAdminEditingReservationId={setAdminEditingReservationId}
                    handleUpdateValetStatus={handleUpdateValetStatus}
                    getKSTDateTimeString={getKSTDateTimeString}
                    setScratchModalTargetId={setScratchModalTargetId}
                    setUploadedSpots={setUploadedSpots}
                    setSelectedParkingSpace={setSelectedParkingSpace}
                  />
                </motion.div>
              )}

              {/* VIEW B: Vehicle Searching & Reception Desk */}
              {currentView === 'search_reception' && (
                <motion.div
                  key="search_reception_view"
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.98 }}
                  transition={{ duration: 0.15 }}
                  className="space-y-5"
                >
                  <SearchReceptionView
                    currentView={currentView}
                    setCurrentView={setCurrentView}
                    reservations={reservations}
                    companies={companies}
                    currentCompanyId={currentCompanyId}
                    companyInfo={companyInfo}
                    isEmployee={isEmployee}
                    employeeName={employeeName}
                    employeeRole={employeeRole}
                    isSuperAdmin={isSuperAdmin}
                    user={user}
                    blockedDates={activeBlockedDates}
                    receptionSubMode={receptionSubMode}
                    setReceptionSubMode={setReceptionSubMode}
                    onUpdateReservations={setReservations}
                    isAdminModeActive={isAdminModeActive}
                    setAdminEditingReservationId={setAdminEditingReservationId}
                    handleUpdateValetStatus={handleUpdateValetStatus}
                    getKSTDateTimeString={getKSTDateTimeString}
                    setScratchModalTargetId={setScratchModalTargetId}
                    setUploadedSpots={setUploadedSpots}
                    setSelectedParkingSpace={setSelectedParkingSpace}
                  />
                </motion.div>
              )}

              {/* Unified Admin Mode routing (Security guarded) */}
              {isAdminModeActive && isAdmin && (
                <motion.div
                  key="admin_mode_view"
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.98 }}
                  transition={{ duration: 0.15 }}
                >
                  <AdminMode
                    currentView={currentView}
                    setCurrentView={setCurrentView}
                    reservations={visibleReservations}
                    allReservations={reservations}
                    onUpdateValetStatus={handleUpdateValetStatus}
                    companyInfo={companyInfo}
                    onUpdateCompany={(updated) => {
                      setCompanyInfo(updated);
                      localStorage.setItem('master_company_info', JSON.stringify(updated));
                    }}
                    companies={companies}
                    onUpdateCompanies={(updatedLists) => {
                      setCompanies(updatedLists);
                      localStorage.setItem('companies', JSON.stringify(updatedLists));
                    }}
                    partners={partners}
                    onUpdatePartners={(updatedPartners) => {
                      setPartners(updatedPartners);
                      localStorage.setItem('super_partners_list', JSON.stringify(updatedPartners));
                    }}
                    isSuperAdmin={isSuperAdmin}
                    isEmployee={isEmployee}
                    employeeRole={employeeRole}
                    currentCompanyId={currentCompanyId}
                    onCompanySwitch={handleCompanySwitch}
                    blockedDates={activeBlockedDates}
                    onSaveBlockedDates={handleSaveBlockedDates}
                  />
                </motion.div>
              )}

              {/* VIEW D: Offline-first payment changer */}
              {currentView === 'payment_change' && (
                <motion.div
                  key="payment_change_view"
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.98 }}
                  transition={{ duration: 0.15 }}
                >
                  <PaymentChangeView 
                    onBack={() => setCurrentView('timeline')}
                    reservations={visibleReservations}
                    onUpdatePayment={handleUpdatePaymentMethod}
                  />
                </motion.div>
              )}

              {/* VIEW E: Vehicle scratch camera reporter */}
              {currentView === 'scratch_images' && (
                <motion.div
                  key="scratch_images_view"
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.98 }}
                  transition={{ duration: 0.15 }}
                >
                  <ScratchUploadView 
                    onBack={() => setCurrentView('timeline')}
                    reservations={visibleReservations}
                    onUpdateScratchPhotos={handleUpdateScratchPhotos}
                  />
                </motion.div>
              )}

              {/* VIEW F: Historic completed log logs */}
              {currentView === 'service_history' && (
                <motion.div
                  key="service_history_view"
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.98 }}
                  transition={{ duration: 0.15 }}
                >
                  <ServiceHistoryView 
                    onBack={() => setCurrentView('timeline')}
                    reservations={visibleReservations}
                  />
                </motion.div>
              )}

              {/* VIEW G: Calendar timeline query searcher */}
              {currentView === 'parking_departure' && (
                <motion.div
                  key="parking_departure_view"
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.98 }}
                  transition={{ duration: 0.15 }}
                >
                  <ParkingDepartureView 
                    onBack={() => setCurrentView('timeline')}
                    reservations={visibleReservations}
                    companies={companies}
                    getCalculatePrice={getCalculatePrice}
                    onReservationPatch={(resId, patch) => {
                      setReservations(prev => {
                        const updated = prev.map(r =>
                          r.id === resId ? { ...r, ...patch } : r
                        );
                        localStorage.setItem(
                          `${currentCompanyId}_reservations`,
                          JSON.stringify(updated)
                        );
                        return updated;
                      });
                    }}
                  />
                </motion.div>
              )}

            </AnimatePresence>
          </main>
        );
      })()}

      {/* ADMIN CONTROL PANEL: Contained modal layer (As requested, strictly guarded using isSuperAdmin) */}
      <AnimatePresence>
        {showAdminModal && isSuperAdmin && (
          <div key="admin_modal_outer_wrapper" className="fixed inset-0 z-55 flex items-center justify-center p-4 z-[110]">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowAdminModal(false)}
              className="absolute inset-x-0 inset-y-0 bg-slate-950/70 backdrop-blur-xs"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="relative bg-slate-100 w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
            >
              <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-200/50">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="text-red-600" size={18} />
                  <span className="text-[11px] font-black font-mono text-slate-800">
                    최고관리자 데이터 보안 모드 (ADMIN PANEL)
                  </span>
                </div>
                <button 
                  type="button" 
                  onClick={() => setShowAdminModal(false)} 
                  className="p-1 text-slate-500 hover:bg-slate-300 rounded-full"
                >
                  <X size={16} />
                </button>
              </div>
              
              <div className="overflow-y-auto p-5 flex-1 select-none">
                <AdminDashboard 
                  onClose={() => setShowAdminModal(false)} 
                  companies={companies} 
                  onSync={seedData} 
                  partners={partners}
                  onUpdatePartners={(updatedPartners) => {
                    setPartners(updatedPartners);
                    localStorage.setItem('super_partners_list', JSON.stringify(updatedPartners));
                  }}
                  onUpdateCompanies={(updatedCompanies) => {
                    setCompanies(updatedCompanies);
                    localStorage.setItem('companies', JSON.stringify(updatedCompanies));
                  }}
                />
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* LOGIN SECURITY ACCREDITATION: Modals */}
      <AnimatePresence>
        {showLoginModal && (
          <div key="login_modal_outer_wrapper" className="fixed inset-0 z-50 flex items-center justify-center p-4 z-[120]">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowLoginModal(false)}
              className="absolute inset-x-0 inset-y-0 bg-slate-950/80 backdrop-blur-xs"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              className="relative bg-neutral-900 w-full max-w-xs rounded-2xl shadow-xl p-5 border border-neutral-800"
            >
              <h3 className="text-xs font-black text-white mb-1.5 flex items-center gap-2">
                <Lock className="text-amber-500 shrink-0" size={14} />
                대표 관리자 자격 증명
              </h3>
              <p className="text-[10px] text-zinc-500 leading-relaxed mb-4">제휴 대행사 데이터 및 고유 수수료 기준을 사후 승인 수정하는 최고 권한을 서명합니다.</p>
              
              <form onSubmit={handleCredentialLogin} className="space-y-3.5 text-xs">
                {loginError && (
                  <div className="p-2.5 bg-red-950/20 text-red-400 text-[10px] rounded-lg border border-red-900/30 flex items-center gap-1.5 font-sans">
                    <AlertCircle size={12} className="shrink-0" />
                    {loginError}
                  </div>
                )}
                
                <div className="space-y-1">
                  <label className="text-[9px] font-black text-zinc-500 uppercase">최고승인 ID / 이메일</label>
                  <input 
                    type="text"
                    value={loginEmail}
                    onChange={e => setLoginEmail(e.target.value)}
                    placeholder="마스터 ID ('airpick') 또는 이메일"
                    className="w-full px-3 py-2.5 bg-neutral-950 border border-neutral-850 rounded-xl text-zinc-200 outline-none focus:border-amber-500 font-bold text-xs"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[9px] font-black text-zinc-500 uppercase">보안 비밀번호</label>
                  <input 
                    type="password"
                    value={loginPassword}
                    onChange={e => setLoginPassword(e.target.value)}
                    placeholder="비밀번호"
                    className="w-full px-3 py-2.5 bg-neutral-950 border border-neutral-850 rounded-xl text-zinc-200 outline-none focus:border-amber-500 text-xs font-mono"
                  />
                  <p className="text-[8.5px] text-zinc-650">등록하신 B2B 최고운영자 2차 보안 비밀번호를 넣으십시오.</p>
                </div>

                <div className="flex gap-2 pt-2">
                  <button 
                    type="button"
                    onClick={() => setShowLoginModal(false)}
                    className="flex-1 py-2 bg-zinc-800 text-zinc-400 rounded-lg text-[10px] font-black transition-colors"
                  >
                    취소
                  </button>
                  <button 
                    type="submit"
                    className="flex-1 py-2 bg-amber-500 text-neutral-950 text-[10px] font-black shadow-md shadow-amber-500/10 transition-colors"
                  >
                    비밀 자격 서명
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* SCRATCH PHOTO REGISTRATION MODAL */}
      <ScratchModal
        scratchModalTargetId={scratchModalTargetId}
        targetReservationForScratch={targetReservationForScratch}
        setScratchModalTargetId={setScratchModalTargetId}
        setSelectedParkingSpace={setSelectedParkingSpace}
        selectedParkingSpace={selectedParkingSpace}
        uploadedSpots={uploadedSpots}
        activeSpotKey={activeSpotKey}
        handleSpotClick={handleSpotClick}
        handleUpdateValetStatus={handleUpdateValetStatus}
        getKSTDateTimeString={getKSTDateTimeString}
        setUploadedSpots={setUploadedSpots}
      />



      {/* CUSTOM DATE PICKER MODAL */}
      <CustomDatePickerModal
        isOpen={datePickerTarget !== null}
        onClose={() => setDatePickerTarget(null)}
        initialValue={getActiveDatePickerInitialValue()}
        onSelect={handleDatePickerSelect}
        blockedDates={activeBlockedDates}
        title="날짜 선택"
      />

      {/* SYSTEM BLOCKOUT CALENDAR CONFIG MODAL */}
      <BlockoutCalendarModal
        isOpen={showBlockoutModal}
        onClose={() => setShowBlockoutModal(false)}
        blockedDates={activeBlockedDates}
        onSave={handleSaveBlockedDates}
        companyIsOpen={(() => {
          const matched = companies.find(c => c.id === currentCompanyId);
          return matched ? (matched.isOpen !== false) : true;
        })()}
        onToggleCompanyOpen={async (nextOpen) => {
          await handleToggleCompanyOpen(currentCompanyId, nextOpen);
        }}
        companyName={(() => {
          const matched = companies.find(c => c.id === currentCompanyId);
          return matched ? matched.name : companyInfo.name;
        })()}
      />

      {/* ADMIN RESERVATION EDIT MODAL */}
      <AdminReservationEditModal
        isOpen={!!adminEditingReservationId}
        onClose={() => setAdminEditingReservationId(null)}
        reservationId={adminEditingReservationId}
        reservations={reservations}
        onUpdateReservations={setReservations}
        isEmployee={isEmployee}
        employeeName={employeeName}
        isSuperAdmin={isSuperAdmin}
        currentCompanyId={currentCompanyId}
        handleUpdateValetStatus={handleUpdateValetStatus}
        getKSTDateTimeString={getKSTDateTimeString}
      />

      {/* SEARCHED RESERVATION EDIT MODAL (DRIVER DRIVEN) */}
      <DriverReservationEditModal
        isOpen={!!editingSearchedRes}
        onClose={() => setEditingSearchedRes(null)}
        reservation={editingSearchedRes}
        companies={companies}
        currentCompanyId={currentCompanyId}
        isEmployee={isEmployee}
        employeeName={employeeName}
        isSuperAdmin={isSuperAdmin}
        getCalculatePrice={getCalculatePrice}
        onUpdateReservations={setReservations}
      />

      {/* DRIVER RESERVATION VIEW/EDIT MODAL (COMPETITOR BENCHMARK FOR WORKERS) */}
      <AnimatePresence>
        {driverDetailRes && (
          <EditModal
            key="universal_edit_modal"
            driverDetailRes={driverDetailRes}
            onClose={() => setDriverDetailRes(null)}
            isEmployee={isEmployee}
            employeeName={employeeName}
            isSuperAdmin={isSuperAdmin}
            onSave={handleSaveDriverReservationEdit}
            onStatusAction={handleDriverStatusAction}
            onCancelReservation={handleDriverCancelReservation}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
