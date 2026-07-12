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
  getDoc,
  getDocs,
  updateDoc,
} from 'firebase/firestore';
import { 
  onAuthStateChanged, 
  signOut, 
  signInAnonymously,
  User
} from 'firebase/auth';
import { db, auth, handleFirestoreError, OperationType } from './firebase';
import { motion, AnimatePresence } from 'motion/react';

// --- Modular Typed Constants and Data ---
import { Company, Reservation, ReservationStatus, PaymentMethod, AppView, CompanyInfo, PartnerCompany } from './types';
import { formatPartnerDisplayName, resolveRequiredCompanyId } from './utils/companyDisplay';
import { persistReservationStores } from './utils/reservationScope';
import {
  filterReservationsForOperatorGroup,
  formatOperatorGroupLabel,
  isSubOperatorLoginBlocked,
  resolveOperatorCompanyIds,
} from './utils/operatorHierarchy';
import {
  mergePartnersFromFirestore,
  readPartnersFromStorage,
  resolveBlockedDatesForCompany,
} from './utils/partnerSync';
import { getCalculatePrice } from './utils/pricing';
import { getKSTDateOnlyString, getKSTDateTimeString } from './utils/kstDate';
import { normalizeDateString, normalizeDocsArray } from './utils/reservationNormalize';
import {
  fetchScopedReservations,
  subscribeScopedReservations,
} from './utils/reservationQuery';
import { buildCheckoutRetentionFields } from './lib/reservationRetention';
import { AIRPICK_HQ_ID, isAirpickHeadquarters, normalizePlatformCompanyId } from './constants/platform';
import { ensureFirestoreAuth, ensurePlatformAdminAuth, tryPlatformAdminAuthFallback } from './lib/firebaseAuth';
import { isPending, normalizeReservationStatus } from './utils/reservationStatus';
import { cn } from './lib/utils';
import {
  areReservationAlertsEnabled,
  findNewIncomingReservations,
  notifyNewReservation,
  requestReservationNotificationPermission,
  setReservationAlertsEnabled,
  wasNotificationPermissionAsked,
  markNotificationPermissionAsked,
} from './utils/reservationNotifications';

// --- Sub-views Imports ---
import Sidebar from './components/Sidebar';
import PaymentChangeView from './components/PaymentChangeView';
import VehiclePhotosView from './components/VehiclePhotosView';
import ServiceHistoryView from './components/ServiceHistoryView';
import ParkingDepartureView from './components/ParkingDepartureView';
import CancelledListView from './components/CancelledListView';
import ScratchModal from './components/ScratchModal';
import BlockoutCalendarModal from './components/BlockoutCalendarModal';
import AdminMode from './components/AdminMode';
import ConsolidatedGate from './components/ConsolidatedGate';
import CustomDatePickerModal from './components/CustomDatePickerModal';
import AdminDashboardComponent from './components/AdminDashboard';
import EditModal from './components/EditModal';
import SearchReceptionView from './components/SearchReceptionView';
import TimelineView from './components/TimelineView';
import AdminReservationEditModal from './components/AdminReservationEditModal';

/** 관리자 모드 전용 화면 — 기사 모드에서 진입 시 timeline으로 보냄 */
const ADMIN_ONLY_VIEWS: AppView[] = ['statistics', 'master_settings'];
/** 기사 모드 전용 화면 — 관리자 모드에서 진입 시 statistics로 보냄 */
const DRIVER_ONLY_VIEWS: AppView[] = [
  'timeline',
  'search_reception',
  'payment_change',
  'scratch_images',
  'service_history',
  'parking_departure',
  'cancelled_list',
];
const HQ_ADMIN_VIEWS: AppView[] = ['statistics', 'master_settings'];

/** dead code 정리 전 localStorage·history에 남을 수 있는 레거시 화면 */
function resolveLegacyAppView(view: AppView | string): AppView {
  if (view === 'parkingRegister') return 'statistics';
  return view as AppView;
}

function isLegacyAdminOnlyView(view: AppView | string): boolean {
  return ADMIN_ONLY_VIEWS.includes(resolveLegacyAppView(view));
}

function isPartnerDriverContext(companyId: string, adminModeActive: boolean): boolean {
  return !adminModeActive && !isAirpickHeadquarters(companyId);
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
  partners,
  onUpdatePartners,
  onUpdateCompanies
}: { 
  onClose: () => void; 
  companies: Company[]; 
  partners: PartnerCompany[];
  onUpdatePartners: (updated: PartnerCompany[]) => void;
  onUpdateCompanies: (updated: Company[]) => void;
}) {
  return (
    <AdminDashboardComponent
      onClose={onClose}
      companies={companies}
      partners={partners}
      onUpdatePartners={onUpdatePartners}
      onUpdateCompanies={onUpdateCompanies}
    />
  );
}

// --- Main Core App Component ---
export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [companies, setCompanies] = useState<Company[]>(() => {
    const saved = localStorage.getItem('companies');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed && Array.isArray(parsed)) {
          return parsed;
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
    return normalizePlatformCompanyId(localStorage.getItem('current_company_id')) || '';
  });

  const [companyInfo, setCompanyInfo] = useState<CompanyInfo>(() => {
    const saved = localStorage.getItem('master_company_info');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed === 'object') {
          const id = String(parsed.id || '').trim();
          return {
            ...parsed,
            id,
            name: parsed.name
              ? formatPartnerDisplayName(parsed.name, id)
              : formatPartnerDisplayName('', id) || '',
            region: parsed.region || '',
            phone: parsed.phone || '',
            logo: parsed.logo || '',
          };
        }
      } catch (e) {}
    }
    return {
      id: '',
      name: '',
      region: '',
      phone: '',
      logo: '',
    };
  });

  const [reservations, setReservations] = useState<Reservation[]>(() => {
    const compId = localStorage.getItem('current_company_id') || '';
    if (!compId) return [];
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
      return [];
    }

    const local = localStorage.getItem(`${compId}_reservations`);
    if (local) {
      try {
        const parsed = JSON.parse(local);
        if (parsed && parsed.length > 0) return normalizeDocsArray(parsed);
      } catch (_) {}
    }

    return [];
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
      // 본사는 기사 타임라인이 아닌 통합 관제(관리자) 화면만 허용
      setIsAdminModeActive(true);
      localStorage.setItem('local_is_admin_mode_active', 'true');
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
      if (isSuperAdmin) {
        setCurrentView(isAdminModeActive ? 'statistics' : 'timeline');
      }
    }

    // Update states
    setCurrentCompanyId(selectedId);
    setCompanyInfo(targetCompanyInfo);

    // Sync with localStorage
    localStorage.setItem('current_company_id', selectedId);
    localStorage.setItem('master_company_info', JSON.stringify(targetCompanyInfo));
  };

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
      if (isSuperAdmin && isAirpickHeadquarters(currentCompanyId)) {
        if (currentView !== 'statistics') {
          setCurrentView('statistics');
          window.history.pushState({ view: 'statistics', controlled: true }, '');
        }
        return;
      }

      if (isAdminModeActive && isAdmin) {
        // If they are inside Admin Mode, and on any sub-views (like master_settings, cancelled_list),
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
  }, [currentView, isAdminModeActive, isAdmin, isSuperAdmin, currentCompanyId]);

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
          setReservations([]);
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

  }, [currentCompanyId, companyInfo.id, companyInfo.name, isLoggedIn]);

  // View/mode sync: 관리자↔기사 전환·본사 모드 시 currentView를 허용된 화면으로 강제 정렬 (빈 화면 방지)
  useEffect(() => {
    if (!isLoggedIn) return;

    if ((currentView as string) === 'parkingRegister') {
      setCurrentView(isAdminModeActive && isAdmin ? 'statistics' : 'timeline');
      return;
    }

    // 슈퍼관리자 + 에어픽 본사: 기사 타임라인 등 제휴업체 전용 화면 차단
    if (isSuperAdmin && isAirpickHeadquarters(currentCompanyId)) {
      if (!isAdminModeActive) {
        setIsAdminModeActive(true);
        localStorage.setItem('local_is_admin_mode_active', 'true');
      }
      if (!HQ_ADMIN_VIEWS.includes(currentView)) {
        setCurrentView('statistics');
      }
      return;
    }

    if (isAdminModeActive && isAdmin) {
      if (isAirpickHeadquarters(currentCompanyId) && !HQ_ADMIN_VIEWS.includes(currentView)) {
        setCurrentView('statistics');
        return;
      }
      if (DRIVER_ONLY_VIEWS.includes(currentView)) {
        setCurrentView('statistics');
      }
    } else if (isLegacyAdminOnlyView(currentView)) {
      setCurrentView('timeline');
    }
  }, [isLoggedIn, isAdminModeActive, isAdmin, isSuperAdmin, currentView, currentCompanyId]);

  // Filter core reservations — 단독 업체 또는 대표+하위 통합 그룹
  const operatorCompanyIds = useMemo(() => {
    if (isAirpickHeadquarters(currentCompanyId)) return [];
    return resolveOperatorCompanyIds(currentCompanyId, companies);
  }, [currentCompanyId, companies]);

  const operatorGroupLabel = useMemo(
    () => formatOperatorGroupLabel(currentCompanyId, companies),
    [currentCompanyId, companies]
  );

  const showCompanyNameOnCards = operatorCompanyIds.length > 1;

  const persistScopedReservations = (updated: Reservation[], cacheFirestore = true) => {
    persistReservationStores(localStorage, updated, currentCompanyId, {
      cacheFirestore,
      operatorCompanyIds,
    });
  };

  const visibleReservations = useMemo(() => {
    const normalized = normalizeDocsArray(reservations);
    if (isAirpickHeadquarters(currentCompanyId)) return normalized;
    return filterReservationsForOperatorGroup(normalized, operatorCompanyIds);
  }, [reservations, currentCompanyId, operatorCompanyIds]);

  const [selectedDate, setSelectedDate] = useState<string>(() => {
    return getKSTDateOnlyString();
  });

  // Scratch Photo Upload Modal states
  const [scratchModalTargetId, setScratchModalTargetId] = useState<string | null>(null);
  const [selectedParkingSpace, setSelectedParkingSpace] = useState<string>('');

  const reservationsBootstrappedRef = useRef(false);
  const reservationsPrevRef = useRef<Reservation[]>([]);
  const currentCompanyIdRef = useRef(currentCompanyId);
  const operatorCompanyIdsRef = useRef(operatorCompanyIds);
  const companyAlertLabelRef = useRef(
    formatPartnerDisplayName(companyInfo.name, companyInfo.id) || currentCompanyId
  );
  const [incomingReservationToast, setIncomingReservationToast] = useState<{
    id: string;
    carNumber: string;
    userName: string;
  } | null>(null);
  const [showAlertPermissionBanner, setShowAlertPermissionBanner] = useState(false);

  useEffect(() => {
    currentCompanyIdRef.current = currentCompanyId;
    operatorCompanyIdsRef.current = operatorCompanyIds;
    companyAlertLabelRef.current =
      operatorGroupLabel ||
      formatPartnerDisplayName(companyInfo.name, companyInfo.id) ||
      currentCompanyId;
  }, [currentCompanyId, operatorCompanyIds, operatorGroupLabel, companyInfo.name, companyInfo.id]);

  useEffect(() => {
    if (!incomingReservationToast) return;
    const timer = window.setTimeout(() => setIncomingReservationToast(null), 6000);
    return () => window.clearTimeout(timer);
  }, [incomingReservationToast]);

  useEffect(() => {
    if (!isLoggedIn) {
      reservationsBootstrappedRef.current = false;
      reservationsPrevRef.current = [];
      setShowAlertPermissionBanner(false);
      return;
    }
    if (typeof Notification === 'undefined') return;
    if (Notification.permission !== 'default') return;
    if (wasNotificationPermissionAsked()) return;
    setShowAlertPermissionBanner(true);
  }, [isLoggedIn]);

  const superAdminCompanySwitchRef = useRef(currentCompanyId);
  useEffect(() => {
    if (!isSuperAdmin) {
      superAdminCompanySwitchRef.current = currentCompanyId;
      return;
    }
    if (superAdminCompanySwitchRef.current !== currentCompanyId) {
      setScratchModalTargetId(null);
      setSelectedParkingSpace('');
    }
    superAdminCompanySwitchRef.current = currentCompanyId;
  }, [currentCompanyId, isSuperAdmin]);

  // Loading states
  const [loadingReservations, setLoadingReservations] = useState(false);

  // Business configuration — blockedDates는 companies/{id}.blockedDates 단일 소스
  const activeBlockedDates = useMemo(
    () => resolveBlockedDatesForCompany(currentCompanyId, companies, (key) => localStorage.getItem(key)),
    [currentCompanyId, companies]
  );

  const [showBlockoutModal, setShowBlockoutModal] = useState<boolean>(false);

  // Admin Reservation Detail Editing states
  const [adminEditingReservationId, setAdminEditingReservationId] = useState<string | null>(null);
  
  const [receptionSubMode, setReceptionSubMode] = useState<'search' | 'new_contract'>('search');

  // --- Driver Detail Modal State ---
  const [driverDetailRes, setDriverDetailRes] = useState<Reservation | null>(null);

  const handleSaveDriverReservationEdit = async (updateData: Partial<Reservation>) => {
    if (!driverDetailRes || !driverDetailRes.id) return;
    
    const docRef = doc(db, 'reservations', driverDetailRes.id);

    setReservations(prev => {
      const updated = prev.map(r => r.id === driverDetailRes.id ? { ...r, ...updateData } : r);
      persistScopedReservations(updated);
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
    
    if (isPending(driverDetailRes.status)) {
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

  // 레거시 system_settings/config.blockedDates → companies/airpick 1회 이전
  useEffect(() => {
    if (!isLoggedIn) return;

    let cancelled = false;
    (async () => {
      try {
        await ensureFirestoreAuth();
        const legacySnap = await getDoc(doc(db, 'system_settings', 'config'));
        const legacyDates = legacySnap.data()?.blockedDates;
        if (!Array.isArray(legacyDates) || legacyDates.length === 0) return;

        const airpickSnap = await getDoc(doc(db, 'companies', AIRPICK_HQ_ID));
        const current = airpickSnap.data()?.blockedDates;
        if (Array.isArray(current) && current.length > 0) return;

        await setDoc(
          doc(db, 'companies', AIRPICK_HQ_ID),
          {
            id: AIRPICK_HQ_ID,
            name: '에어픽',
            blockedDates: legacyDates,
            updatedAt: new Date().toISOString(),
          },
          { merge: true }
        );

        if (cancelled) return;
        localStorage.setItem(`${AIRPICK_HQ_ID}_blockedDates`, JSON.stringify(legacyDates));
        setCompanies((prev) => {
          const idx = prev.findIndex((c) => c.id === AIRPICK_HQ_ID);
          if (idx >= 0) {
            return prev.map((c) =>
              c.id === AIRPICK_HQ_ID ? { ...c, blockedDates: legacyDates } : c
            );
          }
          return [
            ...prev,
            { id: AIRPICK_HQ_ID, name: '에어픽', blockedDates: legacyDates } as Company,
          ];
        });
      } catch (err) {
        console.warn('blockedDates legacy migration skipped:', err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isLoggedIn]);

  const handleSaveBookingSettings = async (settings: {
    blockedDates: string[];
    cancelCutoffHours: number;
    sameDayBookingBlocked: boolean;
  }) => {
    const targetId = isAirpickHeadquarters(currentCompanyId)
      ? AIRPICK_HQ_ID
      : (currentCompanyId || '').trim();
    if (!targetId) return;

    const { blockedDates: newBlockedDates, cancelCutoffHours, sameDayBookingBlocked } = settings;

    localStorage.setItem(`${targetId}_blockedDates`, JSON.stringify(newBlockedDates));
    setCompanies((prev) => {
      const idx = prev.findIndex((c) => c.id === targetId);
      const patch = {
        blockedDates: newBlockedDates,
        cancelCutoffHours,
        sameDayBookingBlocked,
      };
      if (idx >= 0) {
        return prev.map((c) => (c.id === targetId ? { ...c, ...patch } : c));
      }
      const fallbackName = isAirpickHeadquarters(targetId)
        ? '에어픽'
        : formatPartnerDisplayName(companyInfo?.name, targetId) || targetId;
      return [...prev, { id: targetId, name: fallbackName, ...patch } as Company];
    });

    try {
      if (isAirpickHeadquarters(targetId)) {
        await ensurePlatformAdminAuth();
      } else {
        await ensureFirestoreAuth();
      }
      await setDoc(
        doc(db, 'companies', targetId),
        {
          id: targetId,
          blockedDates: newBlockedDates,
          cancelCutoffHours,
          sameDayBookingBlocked,
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );
    } catch (err: unknown) {
      console.warn(`Firestore booking settings save failed for companies/${targetId}:`, err);
      throw err;
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
      await ensureFirestoreAuth();
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
            await tryPlatformAdminAuthFallback();
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
            outdoorBaseDays: 2,
            outdoorExtraPrice: 5000,
            indoorBasePrice: 40000,
            indoorBaseDays: 2,
            indoorExtraPrice: 10000,
            surchargePrice: 20000,
            surchargeStartTime: '19:00',
            surchargeEndTime: '05:00',
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
    const unsub = onSnapshot(collection(db, 'companies'), (snap) => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() } as Company));

      if (data.length > 0) {
        setCompanies(data);
        localStorage.setItem('companies', JSON.stringify(data));
      } else {
        const saved = localStorage.getItem('companies');
        if (saved) {
          try {
            const parsed = JSON.parse(saved);
            if (parsed && Array.isArray(parsed)) {
              setCompanies(parsed);
              return;
            }
          } catch (_) {}
        }
        setCompanies([]);
      }

      // Firestore companies → super_partners_list (password 덮어쓰기 방지)
      setPartners((prev) => {
        const storedPartners = readPartnersFromStorage((key) => localStorage.getItem(key));
        const mergedList = mergePartnersFromFirestore(data, prev, storedPartners);
        localStorage.setItem('super_partners_list', JSON.stringify(mergedList));
        return mergedList;
      });

    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'companies');
      const saved = localStorage.getItem('companies');
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
            if (parsed && Array.isArray(parsed)) {
              setCompanies(parsed);
              return;
            }
        } catch (_) {}
      }
      setCompanies([]);
    });
    return () => unsub();
  }, []);



  const reservationSyncScopeKey = useMemo(() => {
    if (isAirpickHeadquarters(currentCompanyId)) return 'hq';
    return operatorCompanyIds.slice().sort().join('|') || currentCompanyId;
  }, [currentCompanyId, operatorCompanyIds]);

  // 4. Real-time Reservations Sync — 업체·입고일 범위로 Firestore 쿼리 (전체 컬렉션 로드 방지)
  useEffect(() => {
    if (!isLoggedIn) return;

    let cancelled = false;
    reservationsBootstrappedRef.current = false;
    reservationsPrevRef.current = [];

    const syncScope = {
      isHqScope: isAirpickHeadquarters(currentCompanyId),
      operatorCompanyIds:
        operatorCompanyIds.length > 0 ? operatorCompanyIds : [currentCompanyId],
    };

    const applySnapshot = (rawData: unknown[]) => {
      if (cancelled) return;
      const data = normalizeDocsArray(rawData).sort((a, b) => b.createdAt.localeCompare(a.createdAt));

      if (reservationsBootstrappedRef.current && areReservationAlertsEnabled()) {
        const incoming = findNewIncomingReservations(
          reservationsPrevRef.current,
          data,
          currentCompanyIdRef.current,
          operatorCompanyIdsRef.current
        );
        for (const res of incoming) {
          if (!res.id) continue;
          notifyNewReservation(res, companyAlertLabelRef.current);
          setIncomingReservationToast({
            id: res.id,
            carNumber: res.carNumber || '차량미상',
            userName: res.userName || '',
          });
        }
      } else {
        reservationsBootstrappedRef.current = true;
      }
      reservationsPrevRef.current = data;

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
            await tryPlatformAdminAuthFallback();
          }
        }
      }

      if (cancelled) return;

      try {
        const rows = await fetchScopedReservations(db, syncScope);
        if (!cancelled) {
          applySnapshot(rows);
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.LIST, 'reservations');
        if (!cancelled) setLoadingReservations(false);
      }

      const unsub = subscribeScopedReservations(
        db,
        syncScope,
        (rows) => applySnapshot(rows),
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
  }, [isLoggedIn, reservationSyncScopeKey, currentCompanyId, operatorCompanyIds]);

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

      if (isSubOperatorLoginBlocked(matchedPartner.companyId, companies)) {
        setLoginError('하위 업체는 B2B 로그인할 수 없습니다. 대표 업체 계정을 사용하세요.');
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
      setIsAdminModeActive(true);
      setCurrentView('statistics');
      localStorage.setItem('master_company_info', JSON.stringify(brandInfo));
      localStorage.setItem('current_company_id', matchedPartner.companyId);
      localStorage.setItem('local_is_super_admin', 'false');
      localStorage.setItem('local_is_admin', 'true');
      localStorage.setItem('local_is_master_admin', 'true');
      localStorage.setItem('local_is_admin_mode_active', 'true');
      localStorage.setItem(
        'operator_company_ids',
        JSON.stringify(resolveOperatorCompanyIds(matchedPartner.companyId, companies))
      );
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
      setIsAdminModeActive(true);
      const partnerId = resolveRequiredCompanyId(companyInfo.id, currentCompanyId);
      if (!partnerId) {
        setLoginError('업체 정보가 없습니다. Gate에서 다시 로그인해 주세요.');
        return;
      }
      setCurrentCompanyId(partnerId);
      localStorage.setItem('current_company_id', partnerId);
      localStorage.setItem('local_is_super_admin', 'false');
      localStorage.setItem('local_is_admin', 'true');
      localStorage.setItem('local_is_master_admin', 'true');
      localStorage.setItem('local_is_admin_mode_active', 'true');
      setCurrentView('statistics');
      setShowLoginModal(false);
      alert(`제휴업체 [${companyInfo.name}]의 마스터 관리자 인증이 성공 통과하여 관리자 모드가 활성화되었습니다!`);
    } else if (loginPassword === 'admin1234') {
      setIsSuperAdmin(false);
      setIsLocalAdmin(true);
      setIsMasterAdmin(false);
      setIsAdminModeActive(true);
      localStorage.setItem('local_is_super_admin', 'false');
      localStorage.setItem('local_is_admin', 'true');
      localStorage.setItem('local_is_master_admin', 'false');
      localStorage.setItem('local_is_admin_mode_active', 'true');
      if (isLegacyAdminOnlyView(currentView)) {
        setCurrentView('statistics');
      }
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
    const companyId = normalizePlatformCompanyId(roles.companyId) || roles.companyId;
    const normalizedInfo =
      isAirpickHeadquarters(companyId)
        ? { ...roles.companyInfo, id: AIRPICK_HQ_ID, name: '에어픽', region: '플랫폼 본사' }
        : roles.companyInfo;
    setCurrentCompanyId(companyId);
    setCompanyInfo(normalizedInfo);
    setIsEmployee(roles.isEmployee || false);
    setEmployeeName(roles.employeeName || '');
    setEmployeeRole(roles.employeeRole || 'driver');

    localStorage.setItem('is_logged_in', 'true');
    localStorage.setItem('local_is_super_admin', roles.isSuperAdmin ? 'true' : 'false');
    localStorage.setItem('local_is_admin', roles.isLocalAdmin ? 'true' : 'false');
    localStorage.setItem('local_is_master_admin', roles.isMasterAdmin ? 'true' : 'false');
    localStorage.setItem('local_is_admin_mode_active', roles.isAdminModeActive ? 'true' : 'false');
    localStorage.setItem('current_company_id', companyId);
    localStorage.setItem('master_company_info', JSON.stringify(normalizedInfo));
    localStorage.setItem('local_is_employee', roles.isEmployee ? 'true' : 'false');
    localStorage.setItem('local_employee_name', roles.employeeName || '');
    localStorage.setItem('local_employee_role', roles.employeeRole || 'driver');

    const opIds = resolveOperatorCompanyIds(companyId, companies);
    localStorage.setItem('operator_company_ids', JSON.stringify(opIds));

    const shouldStartInAdmin =
      roles.isAdminModeActive &&
      (roles.isSuperAdmin || roles.isLocalAdmin || roles.isMasterAdmin || roles.employeeRole === 'admin');
    setCurrentView(shouldStartInAdmin ? 'statistics' : 'timeline');

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
      setCurrentCompanyId('');
      setCurrentView('timeline');
      setCompanyInfo({
        id: '',
        name: '',
        region: '',
        phone: '',
        logo: '',
      });
      
      localStorage.removeItem('is_logged_in');
      localStorage.removeItem('local_is_super_admin');
      localStorage.removeItem('local_is_admin');
      localStorage.removeItem('local_is_master_admin');
      localStorage.removeItem('local_is_admin_mode_active');
      localStorage.removeItem('local_is_employee');
      localStorage.removeItem('local_employee_name');
      localStorage.removeItem('local_employee_role');
      localStorage.removeItem('current_company_id');
      localStorage.removeItem('master_company_info');
      localStorage.removeItem('firestore_reservations_cache');
      localStorage.removeItem('operator_company_ids');
      
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
      setIsEmployee(false);
      setEmployeeName('');
      setEmployeeRole('driver');
      setCurrentCompanyId('');
      setCurrentView('timeline');
      setCompanyInfo({
        id: '',
        name: '',
        region: '',
        phone: '',
        logo: '',
      });
      
      localStorage.removeItem('is_logged_in');
      localStorage.removeItem('local_is_super_admin');
      localStorage.removeItem('local_is_admin');
      localStorage.removeItem('local_is_master_admin');
      localStorage.removeItem('local_is_admin_mode_active');
      localStorage.removeItem('local_is_employee');
      localStorage.removeItem('local_employee_name');
      localStorage.removeItem('local_employee_role');
      localStorage.removeItem('current_company_id');
      localStorage.removeItem('master_company_info');
      localStorage.removeItem('firestore_reservations_cache');
      localStorage.removeItem('operator_company_ids');
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
    const retentionPatch =
      nextStatus === 'completed_out'
        ? buildCheckoutRetentionFields(extraFields?.actualExitTime)
        : {};
    const patch = {
      status: nextStatus,
      ...extraFields,
      ...retentionPatch,
      updatedBy: operatorName,
      updatedAt: new Date().toISOString(),
    };
    // Optimistically update React state and localStorage instantly
    setReservations(prev => {
      const updated = prev.map(r => r.id === resId ? {
        ...r,
        ...patch,
      } : r);
      persistScopedReservations(updated);
      return updated;
    });

    try {
      const docRef = doc(db, 'reservations', resId);
      await updateDoc(docRef, patch);
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
        persistScopedReservations(updated);
        return updated;
      });
    } catch (err: any) {
      setReservations(prev => {
        const updated = prev.map(r => r.id === resId ? { ...r, paymentMethod: method, updatedBy: operatorName, updatedAt: new Date().toISOString() } : r);
        persistScopedReservations(updated);
        return updated;
      });
    }
  };

  // 사이드바 「③ 차량 사진 업로드」— images[] 필드, images/ 폴더
  const handleUpdateReservationImages = async (resId: string, imageUrls: string[]) => {
    const operatorName = isEmployee ? employeeName : (isSuperAdmin ? '본사 마스터(최고관리자)' : '업체 마스터');
    await ensureFirestoreAuth();
    try {
      await updateDoc(doc(db, 'reservations', resId), {
        images: imageUrls,
        updatedBy: operatorName,
        updatedAt: new Date().toISOString(),
      });
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code;
      if (code === 'not-found') {
        throw new Error('Firestore에 이 예약 문서가 없습니다. 타임라인에서 입고 처리 후 다시 시도해 주세요.');
      }
      throw err;
    }
    setReservations((prev) => {
      const updated = prev.map((r) =>
        r.id === resId ? { ...r, images: imageUrls, updatedBy: operatorName, updatedAt: new Date().toISOString() } : r
      );
      persistScopedReservations(updated);
      return updated;
    });
  };

  const targetReservationForScratch = useMemo(() => {
    return reservations.find(r => r.id === scratchModalTargetId);
  }, [reservations, scratchModalTargetId]);

  // 4-step counters and counts
  const countPending = useMemo(() => {
    return visibleReservations.filter(r => {
      const rDep = normalizeDateString(r.departureDate);
      const selDate = normalizeDateString(selectedDate);
      if (!isPending(r.status)) return false;
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

  const showPartnerDriverView = isPartnerDriverContext(currentCompanyId, isAdminModeActive);

  const handleNavigate = (view: AppView) => {
    if (isSuperAdmin && isAirpickHeadquarters(currentCompanyId)) {
      if (HQ_ADMIN_VIEWS.includes(view)) {
        setCurrentView(view);
      } else {
        setCurrentView('statistics');
      }
      return;
    }

    if (isAdminModeActive && isAdmin) {
      if (isAirpickHeadquarters(currentCompanyId) && !HQ_ADMIN_VIEWS.includes(view)) {
        setCurrentView('statistics');
        return;
      }
      if (DRIVER_ONLY_VIEWS.includes(view)) {
        setCurrentView('statistics');
        return;
      }
    } else if (isLegacyAdminOnlyView(view)) {
      setCurrentView('timeline');
      return;
    }
    setCurrentView(view);
  };

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

      {showAlertPermissionBanner && (
        <div className="fixed top-0 inset-x-0 z-[100] px-3 pt-3">
          <div className="mx-auto max-w-md rounded-2xl border border-amber-500/30 bg-neutral-900/95 backdrop-blur-md p-3 shadow-xl flex items-start gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-xs font-black text-amber-400">신규 예약 알림</p>
              <p className="text-[11px] text-zinc-400 mt-1 leading-relaxed">
                홈페이지·앱 접수 시 소리와 푸시 알림을 받을 수 있습니다. (앱을 켜 두거나 홈 화면에 추가한 상태)
              </p>
            </div>
            <div className="flex flex-col gap-1 shrink-0">
              <button
                type="button"
                onClick={async () => {
                  await requestReservationNotificationPermission();
                  setShowAlertPermissionBanner(false);
                }}
                className="px-3 py-1.5 rounded-lg bg-amber-500 text-neutral-950 text-[11px] font-black"
              >
                알림 켜기
              </button>
              <button
                type="button"
                onClick={() => {
                  setReservationAlertsEnabled(false);
                  markNotificationPermissionAsked();
                  setShowAlertPermissionBanner(false);
                }}
                className="px-3 py-1.5 rounded-lg text-zinc-500 text-[10px] font-bold"
              >
                나중에
              </button>
            </div>
          </div>
        </div>
      )}

      <AnimatePresence>
        {incomingReservationToast && (
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 40 }}
            className="fixed bottom-24 inset-x-0 z-[100] px-4 pointer-events-none"
          >
            <div className="mx-auto max-w-md rounded-2xl border border-sky-500/40 bg-neutral-900/95 backdrop-blur-md px-4 py-3 shadow-2xl pointer-events-auto">
              <p className="text-xs font-black text-sky-400">📥 신규 입고예정</p>
              <p className="text-sm font-bold text-white mt-1">
                {incomingReservationToast.carNumber}
                {incomingReservationToast.userName ? ` · ${incomingReservationToast.userName}` : ''}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      
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
                  <span className="text-[11px] text-amber-500/95 font-bold bg-amber-500/10 px-1.5 py-0.5 rounded font-sans tracking-wide shrink-0">
                    본사
                  </span>
                </div>
              ) : (
                <div>
                  <h1 className="text-toss-title flex items-center gap-1.5 leading-none" id="partner-header-brand">
                    {formatPartnerDisplayName(companyInfo.name, companyInfo.id)} 
                    <span className="text-toss-caption text-amber-400 font-semibold bg-amber-500/10 px-2 py-0.5 rounded-[6px]">
                      인천
                    </span>
                  </h1>
                  {operatorGroupLabel && (
                    <p className="text-[10px] text-zinc-500 font-bold mt-1 leading-tight max-w-[220px] sm:max-w-none truncate">
                      {operatorGroupLabel}
                    </p>
                  )}
                </div>
              )}
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
                    <span className="text-[11px] sm:text-[11.5px] font-black tracking-tight flex items-center gap-0.5 text-zinc-200">
                      ⚙️ <span className="hidden sm:inline">예약 관리</span><span className="sm:hidden">예약</span>
                      <span className="w-1 h-1 rounded-full inline-block ml-0.5 bg-[#10B981]" />
                    </span>
                  </button>
                )}
                {isAdmin && (!isEmployee || employeeRole === 'admin') && !isAirpickHeadquarters(currentCompanyId) && (
                  <div className="flex bg-[#121214] p-0.5 rounded-xl border border-neutral-800/65 font-black shrink-0" id="admin-mode-toggle">
                    <button
                      type="button"
                      onClick={() => {
                        setIsAdminModeActive(true);
                        localStorage.setItem('local_is_admin_mode_active', 'true');
                        if (DRIVER_ONLY_VIEWS.includes(currentView)) {
                          setCurrentView('statistics');
                        }
                      }}
                      className={cn(
                        "px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-lg text-[11px] sm:text-[12px] font-black transition-all cursor-pointer flex items-center justify-center gap-1",
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
                      onClick={() => {
                        setIsAdminModeActive(false);
                        localStorage.setItem('local_is_admin_mode_active', 'false');
                        if (isLegacyAdminOnlyView(currentView)) {
                          setCurrentView('timeline');
                        }
                      }}
                      className={cn(
                        "px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-lg text-[11px] sm:text-[12px] font-black transition-all cursor-pointer flex items-center justify-center gap-1",
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
                  <div className="px-2 sm:px-3.5 py-1 sm:py-1.5 bg-amber-500/10 text-amber-500 border border-amber-500/25 rounded-[12px] text-[11px] sm:text-[12px] font-black flex items-center gap-0.5 sm:gap-1 select-none shrink-0">
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
                className="px-3 py-1.5 bg-neutral-900 hover:bg-neutral-850 text-neutral-300 text-[12px] font-bold rounded-[16px] border border-neutral-800 transition-colors flex items-center gap-1.5"
                id="login-modal-trigger"
              >
                <Lock size={10} className="text-amber-500" />
                관리자 계정 전환
              </button>
            )}
          </div>
        </header>

        {/* 2. TOP 4-Step Status tab counters integrated directly into header */}
        {currentView === 'timeline' && showPartnerDriverView && (
          <div className="mx-4 mb-3 bg-[#1C1C1E] rounded-[22px] p-1 grid grid-cols-4 gap-1 border border-neutral-900/30">
            {[
              { key: 'pending' as ReservationStatus, label: '입고 예정', count: countPending, color: 'text-amber-400' },
              { key: 'pending_in' as ReservationStatus, label: '입고', count: countPendingIn, color: 'text-sky-450' },
              { key: 'request_out' as ReservationStatus, label: '출고', count: countRequestOut, color: 'text-rose-450' },
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
                  <span className={cn("text-xl font-bold tabular-nums leading-none", isActive ? step.color : "text-[var(--color-toss-fg-subtle)]")}>
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
        onNavigate={handleNavigate}
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
        const isWideView = ['timeline', 'statistics', 'cancelled_list', 'master_settings', 'service_history', 'parking_departure', 'payment_change'].includes(currentView);
        return (
          <main className={cn("mx-auto p-4 mt-2 transition-all duration-200", isWideView ? "max-w-4xl" : "max-w-md")}>
            <AnimatePresence mode="wait">
              
              {/* VIEW A: Main Driver Valet Timeline */}
              {currentView === 'timeline' && showPartnerDriverView && (
                <motion.div
                  key="timeline_view"
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.98 }}
                  transition={{ duration: 0.15 }}
                >
                  <TimelineView
                    isAdminModeActive={isAdminModeActive}
                    reservations={visibleReservations}
                    selectedDate={selectedDate}
                    setDatePickerTarget={setDatePickerTarget}
                    activeCounterTab={activeCounterTab}
                    loadingReservations={loadingReservations}
                    onNavigate={handleNavigate}
                    setReceptionSubMode={setReceptionSubMode}
                    setDriverDetailRes={setDriverDetailRes}
                    setAdminEditingReservationId={setAdminEditingReservationId}
                    handleUpdateValetStatus={handleUpdateValetStatus}
                    getKSTDateTimeString={getKSTDateTimeString}
                    setScratchModalTargetId={setScratchModalTargetId}
                    setSelectedParkingSpace={setSelectedParkingSpace}
                    showCompanyLabel={showCompanyNameOnCards}
                  />
                </motion.div>
              )}

              {/* VIEW B: Vehicle Searching & Reception Desk */}
              {currentView === 'search_reception' && showPartnerDriverView && (
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
                    onNavigate={handleNavigate}
                    reservations={visibleReservations}
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
                    setSelectedParkingSpace={setSelectedParkingSpace}
                    operatorCompanyIds={operatorCompanyIds}
                    showCompanyLabel={showCompanyNameOnCards}
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
                    onEditReservation={(res) => setDriverDetailRes(res)}
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
                    blockedDates={activeBlockedDates}
                    onSaveBlockedDates={(dates) => {
                      const matched = companies.find((c) => c.id === currentCompanyId);
                      return handleSaveBookingSettings({
                        blockedDates: dates,
                        cancelCutoffHours:
                          typeof matched?.cancelCutoffHours === 'number'
                            ? matched.cancelCutoffHours
                            : 3,
                        sameDayBookingBlocked: matched?.sameDayBookingBlocked !== false,
                      });
                    }}
                  />
                </motion.div>
              )}

              {/* VIEW D: Offline-first payment changer */}
              {currentView === 'payment_change' && showPartnerDriverView && (
                <motion.div
                  key="payment_change_view"
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.98 }}
                  transition={{ duration: 0.15 }}
                >
                  <PaymentChangeView 
                    onBack={() => handleNavigate('timeline')}
                    reservations={visibleReservations}
                    onUpdatePayment={handleUpdatePaymentMethod}
                  />
                </motion.div>
              )}

              {/* VIEW E: Vehicle scratch camera reporter */}
              {currentView === 'scratch_images' && showPartnerDriverView && (
                <motion.div
                  key="scratch_images_view"
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.98 }}
                  transition={{ duration: 0.15 }}
                >
                  <VehiclePhotosView
                    onBack={() => handleNavigate('timeline')}
                    reservations={visibleReservations}
                    onUpdateImages={handleUpdateReservationImages}
                  />
                </motion.div>
              )}

              {/* VIEW F: Historic completed log logs */}
              {currentView === 'service_history' && showPartnerDriverView && (
                <motion.div
                  key="service_history_view"
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.98 }}
                  transition={{ duration: 0.15 }}
                >
                  <ServiceHistoryView 
                    onBack={() => handleNavigate('timeline')}
                    reservations={visibleReservations}
                  />
                </motion.div>
              )}

              {/* VIEW G: Calendar timeline query searcher */}
              {currentView === 'parking_departure' && showPartnerDriverView && (
                <motion.div
                  key="parking_departure_view"
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.98 }}
                  transition={{ duration: 0.15 }}
                >
                  <ParkingDepartureView 
                    onBack={() => handleNavigate('timeline')}
                    reservations={visibleReservations}
                    companies={companies}
                    getCalculatePrice={getCalculatePrice}
                    onReservationPatch={(resId, patch) => {
                      setReservations(prev => {
                        const updated = prev.map(r =>
                          r.id === resId ? { ...r, ...patch } : r
                        );
                        persistScopedReservations(updated);
                        return updated;
                      });
                    }}
                  />
                </motion.div>
              )}

              {/* VIEW H: Cancelled reception ledger (moved into driver menu) */}
              {currentView === 'cancelled_list' && showPartnerDriverView && (
                <motion.div
                  key="cancelled_list_view"
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.98 }}
                  transition={{ duration: 0.15 }}
                >
                  <CancelledListView
                    reservations={visibleReservations}
                    onUpdateStatus={handleUpdateValetStatus}
                    onBack={() => handleNavigate('timeline')}
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
                  <span className="text-[13px] font-black font-mono text-slate-800">
                    최고관리자 데이터 보안 모드
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
              <p className="text-[12px] text-zinc-500 leading-relaxed mb-4">제휴 대행사 데이터 및 고유 수수료 기준을 사후 승인 수정하는 최고 권한을 서명합니다.</p>
              
              <form onSubmit={handleCredentialLogin} className="space-y-3.5 text-xs">
                {loginError && (
                  <div className="p-2.5 bg-red-950/20 text-red-400 text-[12px] rounded-lg border border-red-900/30 flex items-center gap-1.5 font-sans">
                    <AlertCircle size={12} className="shrink-0" />
                    {loginError}
                  </div>
                )}
                
                <div className="space-y-1">
                  <label className="text-[11px] font-black text-zinc-500 uppercase">최고승인 ID / 이메일</label>
                  <input 
                    type="text"
                    value={loginEmail}
                    onChange={e => setLoginEmail(e.target.value)}
                    placeholder="마스터 ID ('airpick') 또는 이메일"
                    className="w-full px-3 py-2.5 bg-neutral-950 border border-neutral-850 rounded-xl text-zinc-200 outline-none focus:border-amber-500 font-bold text-xs"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-black text-zinc-500 uppercase">보안 비밀번호</label>
                  <input 
                    type="password"
                    value={loginPassword}
                    onChange={e => setLoginPassword(e.target.value)}
                    placeholder="비밀번호"
                    className="w-full px-3 py-2.5 bg-neutral-950 border border-neutral-850 rounded-xl text-zinc-200 outline-none focus:border-amber-500 text-xs font-mono"
                  />
                  <p className="text-[10.5px] text-zinc-650">등록하신 B2B 최고운영자 2차 보안 비밀번호를 넣으십시오.</p>
                </div>

                <div className="flex gap-2 pt-2">
                  <button 
                    type="button"
                    onClick={() => setShowLoginModal(false)}
                    className="flex-1 py-2 bg-zinc-800 text-zinc-400 rounded-lg text-[12px] font-black transition-colors"
                  >
                    취소
                  </button>
                  <button 
                    type="submit"
                    className="flex-1 py-2 bg-amber-500 text-neutral-950 text-[12px] font-black shadow-md shadow-amber-500/10 transition-colors"
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
        handleUpdateValetStatus={handleUpdateValetStatus}
        getKSTDateTimeString={getKSTDateTimeString}
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
        cancelCutoffHours={(() => {
          const matched = companies.find(c => c.id === currentCompanyId);
          return typeof matched?.cancelCutoffHours === 'number' ? matched.cancelCutoffHours : 3;
        })()}
        sameDayBookingBlocked={(() => {
          const matched = companies.find(c => c.id === currentCompanyId);
          return matched?.sameDayBookingBlocked !== false;
        })()}
        onSave={handleSaveBookingSettings}
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

      {/* 기사 예약 상세/수정 모달 */}
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
