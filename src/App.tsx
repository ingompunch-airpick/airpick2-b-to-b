import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { 
  Menu,
  ShieldCheck, 
  AlertCircle,
  X,
  Lock,
  CalendarRange
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// --- Modular Typed Constants and Data ---
import { Company, Reservation, ReservationStatus, AppView, PartnerCompany } from './types';
import { formatPartnerDisplayName } from './utils/companyDisplay';
import { airportShortName } from './utils/airport';
import { writePartnersToStorage } from './utils/partnerSync';
import { getCalculatePrice, recalculateReservationPrice } from './utils/pricing';
import { getKSTDateOnlyString, getKSTDateTimeString } from './utils/kstDate';
import { AIRPICK_HQ_ID, isAirpickHeadquarters } from './constants/platform';
import { isPending } from './utils/reservationStatus';
import {
  buildParkingAssignmentFields,
  defaultParkingLotId,
  resolveCompanyLotsForReservation,
} from './utils/parkingLot';
import { cn } from './lib/utils';
import { useReservations } from './hooks/useReservations';
import { useSession } from './hooks/useSession';
import { useCompanies } from './hooks/useCompanies';
import { useAppNavigation } from './hooks/useAppNavigation';

// --- Sub-views Imports ---
import Sidebar from './components/Sidebar';
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

// --- Component: AdminDashboard (Contained in modal) ---
function AdminDashboard({ 
  onClose, 
  companies, 
  partners,
  onUpdatePartners,
  onUpdateCompanies,
  reservations = [],
}: { 
  onClose: () => void; 
  companies: Company[]; 
  partners: PartnerCompany[];
  onUpdatePartners: (updated: PartnerCompany[]) => void;
  onUpdateCompanies: (updated: Company[]) => void;
  reservations?: Reservation[];
}) {
  return (
    <AdminDashboardComponent
      onClose={onClose}
      companies={companies}
      partners={partners}
      onUpdatePartners={onUpdatePartners}
      onUpdateCompanies={onUpdateCompanies}
      reservations={reservations}
    />
  );
}

// --- Main Core App Component ---
export default function App() {
  const companiesRef = useRef<Company[]>([]);
  const setCurrentViewRef = useRef<React.Dispatch<React.SetStateAction<AppView>>>(() => {});
  const setCurrentViewBridge = useCallback<React.Dispatch<React.SetStateAction<AppView>>>(
    (value) => {
      setCurrentViewRef.current(value);
    },
    []
  );

  const {
    user,
    isLoggedIn,
    currentCompanyId,
    setCurrentCompanyId,
    companyInfo,
    setCompanyInfo,
    isAdminModeActive,
    setIsAdminModeActive,
    isSuperAdmin,
    isEmployee,
    employeeName,
    employeeRole,
    isAdmin,
    showLoginModal,
    setShowLoginModal,
    loginEmail,
    setLoginEmail,
    loginPassword,
    setLoginPassword,
    loginError,
    handleCredentialLogin,
    handleGateLoginSuccess,
    handleOperatorLogout,
  } = useSession({ companiesRef, setCurrentView: setCurrentViewBridge });

  const {
    companies,
    setCompanies,
    partners,
    setPartners,
    activeBlockedDates,
    getDropdownOptions,
    handleCompanySwitch,
    handleSaveBookingSettings,
    handleToggleCompanyOpen,
  } = useCompanies({
    isLoggedIn,
    currentCompanyId,
    companyInfo,
    isSuperAdmin,
    isAdminModeActive,
    setCurrentCompanyId,
    setCompanyInfo,
    setIsAdminModeActive,
    setCurrentView: setCurrentViewBridge,
  });
  companiesRef.current = companies;

  const {
    currentView,
    setCurrentView,
    isSidebarOpen,
    setIsSidebarOpen,
    showAdminModal,
    setShowAdminModal,
    handleNavigate,
    enterAdminMode,
    enterDriverMode,
    showPartnerDriverView,
  } = useAppNavigation({
    isLoggedIn,
    currentCompanyId,
    isSuperAdmin,
    isAdmin,
    isAdminModeActive,
    setIsAdminModeActive,
  });
  setCurrentViewRef.current = setCurrentView;

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

  const [selectedDate, setSelectedDate] = useState<string>(() => {
    return getKSTDateOnlyString();
  });

  const {
    reservations,
    setReservations,
    loadingReservations,
    reservationSyncError,
    visibleReservations,
    operatorCompanyIds,
    operatorGroupLabel,
    showCompanyNameOnCards,
    incomingReservationToast,
    showAlertPermissionBanner,
    enableReservationAlerts,
    dismissReservationAlertsBanner,
    handleUpdateValetStatus,
    handleUpdatePaymentMethod,
    handleUpdateReservationImages,
    handlePatchReservationFields,
    countPending,
    countPendingIn,
    countRequestOut,
    countConfirmed,
  } = useReservations({
    isLoggedIn,
    currentCompanyId,
    companies,
    companyInfo,
    selectedDate,
    isEmployee,
    employeeName,
    isSuperAdmin,
  });

  // Scratch Photo Upload Modal states
  const [scratchModalTargetId, setScratchModalTargetId] = useState<string | null>(null);
  const [selectedParkingSpace, setSelectedParkingSpace] = useState<string>('');

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

  const [showBlockoutModal, setShowBlockoutModal] = useState<boolean>(false);

  // Admin Reservation Detail Editing states
  const [adminEditingReservationId, setAdminEditingReservationId] = useState<string | null>(null);
  
  const [receptionSubMode, setReceptionSubMode] = useState<'search' | 'new_contract'>('search');

  // --- Driver Detail Modal State ---
  const [driverDetailRes, setDriverDetailRes] = useState<Reservation | null>(null);

  // 실시간 구독으로 상태가 바뀌면 작업대도 최신 스냅샷 유지
  useEffect(() => {
    if (!driverDetailRes?.id) return;
    const fresh = reservations.find((r) => r.id === driverDetailRes.id);
    if (!fresh) return;
    if (fresh === driverDetailRes) return;
    if (
      fresh.status !== driverDetailRes.status ||
      fresh.paymentMethod !== driverDetailRes.paymentMethod ||
      fresh.updatedAt !== driverDetailRes.updatedAt
    ) {
      setDriverDetailRes(fresh);
    }
  }, [reservations, driverDetailRes]);

  const handleSaveDriverReservationEdit = async (updateData: Partial<Reservation>) => {
    if (!driverDetailRes || !driverDetailRes.id) return;

    const resId = driverDetailRes.id;
    await handlePatchReservationFields(resId, updateData);
    setDriverDetailRes(null);
  };

  const handleDriverStatusAction = async () => {
    if (!driverDetailRes || !driverDetailRes.id) return;

    if (isPending(driverDetailRes.status)) {
      await handleUpdateValetStatus(driverDetailRes.id, 'pending_in');
    } else if (driverDetailRes.status === 'pending_in') {
      // 사진 입고 모달 권장 — 여기서 바로 완료 시 lot 1곳이면 자동 배정
      const lots = resolveCompanyLotsForReservation(companies, driverDetailRes.companyId);
      const company = companies.find((c) => c.id === driverDetailRes.companyId);
      const indoor = driverDetailRes.isIndoor !== false;
      const lotId = defaultParkingLotId(lots, indoor, driverDetailRes.parkingLotId);
      const extra =
        lotId
          ? buildParkingAssignmentFields({
              parkingLotId: lotId,
              parkingSpace: driverDetailRes.parkingSpace,
              lots,
              fallbackIsIndoor: indoor,
            })
          : { isIndoor: indoor };
      const nextIsIndoor =
        typeof (extra as { isIndoor?: boolean }).isIndoor === 'boolean'
          ? (extra as { isIndoor: boolean }).isIndoor
          : indoor;
      await handleUpdateValetStatus(driverDetailRes.id, 'completed_in', {
        ...extra,
        isIndoor: nextIsIndoor,
        totalPrice: recalculateReservationPrice(driverDetailRes, company, {
          isIndoor: nextIsIndoor,
        }),
        actualParkingTime: getKSTDateTimeString(),
      });
    } else if (driverDetailRes.status === 'completed_in') {
      await handleUpdateValetStatus(driverDetailRes.id, 'request_out');
    } else if (driverDetailRes.status === 'request_out') {
      await handleUpdateValetStatus(driverDetailRes.id, 'completed_out', {
        actualExitTime: getKSTDateTimeString()
      });
    }
    
    setDriverDetailRes(null);
  };

  /** 상태 한 칸 되돌리기 — 기사: 입고/출고만, 담당자: 입고완료·출고완료도 */
  const handleDriverRevertStatus = async () => {
    if (!driverDetailRes?.id) return;
    const st = driverDetailRes.status;
    const id = driverDetailRes.id;

    if (st === 'pending_in') {
      if (!window.confirm('「입고」를 취소하고 예약완료로 되돌릴까요?')) return;
      await handleUpdateValetStatus(id, 'pending');
    } else if (st === 'request_out') {
      if (!window.confirm('「출고」를 취소하고 출고예정으로 되돌릴까요?')) return;
      await handleUpdateValetStatus(id, 'completed_in');
    } else if (st === 'completed_in') {
      if (!isAdmin) {
        window.alert('입고완료 되돌리기는 담당자만 할 수 있습니다.');
        return;
      }
      if (!window.confirm('「입고완료」를 취소하고 입고(입고요청)로 되돌릴까요?')) return;
      await handleUpdateValetStatus(id, 'pending_in');
    } else if (st === 'completed_out') {
      if (!isAdmin) {
        window.alert('출고완료 되돌리기는 담당자만 할 수 있습니다.');
        return;
      }
      if (
        !window.confirm(
          '「출고완료(반납)」를 취소하고 다시 출고로 되돌릴까요?\n(잘못 반납완료·테스트 정리용)'
        )
      ) {
        return;
      }
      await handleUpdateValetStatus(id, 'request_out');
    } else {
      return;
    }

    setDriverDetailRes(null);
  };

  const handleDriverCancelReservation = async () => {
    if (!driverDetailRes?.id) return;
    const isTestHint =
      /test|테스트/i.test(driverDetailRes.userName || '') ||
      /test|테스트/i.test(driverDetailRes.carNumber || '');
    const reason = window.prompt(
      '취소·무효 사유를 입력하세요\n(테스트 등록 / 잘못 출고 / 고객 취소 등)',
      isTestHint ? '테스트 예약 무효' : '현장 취소 처리'
    );
    if (reason === null) return;

    await handleUpdateValetStatus(driverDetailRes.id, 'cancelled', {
      cancelReason: reason || '현장 취소 처리',
      cancelledAt: getKSTDateTimeString(),
    });
    setDriverDetailRes(null);
  };

  const targetReservationForScratch = useMemo(() => {
    return reservations.find(r => r.id === scratchModalTargetId);
  }, [reservations, scratchModalTargetId]);

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

      {reservationSyncError && (
        <div className="fixed top-0 inset-x-0 z-[110] px-3 pt-3">
          <div className="mx-auto max-w-md rounded-2xl border border-rose-500/40 bg-neutral-900/95 backdrop-blur-md p-3 shadow-xl flex items-start gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-xs font-black text-rose-400">예약 동기화 실패</p>
              <p className="text-[11px] text-zinc-400 mt-1 leading-relaxed">
                {reservationSyncError}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                void handleOperatorLogout();
              }}
              className="shrink-0 px-3 py-1.5 rounded-lg bg-rose-500 text-white text-[11px] font-black"
            >
              다시 로그인
            </button>
          </div>
        </div>
      )}

      {showAlertPermissionBanner && (
        <div className="fixed top-0 inset-x-0 z-[100] px-3 pt-3">
          <div className="mx-auto max-w-md rounded-2xl border border-amber-500/30 bg-neutral-900/95 backdrop-blur-md p-3 shadow-xl flex items-start gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-xs font-black text-amber-400">신규 예약 알림</p>
              <p className="text-[11px] text-zinc-400 mt-1 leading-relaxed">
                홈페이지·앱 접수 시 소리와 알림을 받습니다. 안드로이드 앱에서는 앱을 꺼도 푸시가 갑니다.
              </p>
            </div>
            <div className="flex flex-col gap-1 shrink-0">
              <button
                type="button"
                onClick={() => { void enableReservationAlerts(); }}
                className="px-3 py-1.5 rounded-lg bg-amber-500 text-neutral-950 text-[11px] font-black"
              >
                알림 켜기
              </button>
              <button
                type="button"
                onClick={dismissReservationAlertsBanner}
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
              <p className="text-xs font-black text-sky-400">신규 입고예정</p>
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
                      {airportShortName(
                        companies.find((c) => c.id === companyInfo.id)?.airport
                      ).replace(/공항$/, '') || '인천'}
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
                    <CalendarRange size={11} className="text-zinc-400" />
                    <span className="text-[11px] sm:text-[11.5px] font-semibold tracking-tight text-zinc-300">
                      <span className="hidden sm:inline">예약 관리</span><span className="sm:hidden">예약</span>
                    </span>
                  </button>
                )}
                {isAdmin && (!isEmployee || employeeRole === 'admin') && !isAirpickHeadquarters(currentCompanyId) && (
                  <div className="flex bg-[#121214] p-0.5 rounded-xl border border-neutral-800/65 font-semibold shrink-0" id="admin-mode-toggle">
                    <button
                      type="button"
                      onClick={enterAdminMode}
                      className={cn(
                        "px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-lg text-[11px] sm:text-[12px] font-semibold transition-all cursor-pointer",
                        isAdminModeActive 
                          ? "bg-amber-500 text-neutral-950" 
                          : "text-zinc-500 hover:text-zinc-300"
                      )}
                    >
                      관리자
                    </button>
                    <button
                      type="button"
                      onClick={enterDriverMode}
                      className={cn(
                        "px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-lg text-[11px] sm:text-[12px] font-semibold transition-all cursor-pointer",
                        !isAdminModeActive 
                          ? "bg-amber-500 text-neutral-950" 
                          : "text-zinc-500 hover:text-zinc-300"
                      )}
                    >
                      기사
                    </button>
                  </div>
                )}
                
                {isEmployee && (
                  <div className="px-2 sm:px-3.5 py-1 sm:py-1.5 bg-zinc-800/80 text-zinc-300 border border-zinc-700/50 rounded-[12px] text-[11px] sm:text-[12px] font-semibold select-none shrink-0">
                    <span>{employeeRole === 'admin' ? `부관리자 (${employeeName})` : `기사 (${employeeName})`}</span>
                  </div>
                )}
              </div>
            ) : (
              <button
                onClick={() => {
                  setLoginEmail('');
                  setLoginPassword('');
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
              { key: 'pending' as ReservationStatus, label: '예약완료', count: countPending, color: 'text-amber-400' },
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
          setLoginEmail('');
          setLoginPassword('');
          setShowLoginModal(true);
        }}
        isAdminModeActive={isAdminModeActive}
        isEmployee={isEmployee}
        employeeName={employeeName}
        employeeRole={employeeRole}
        currentCompanyId={currentCompanyId}
        operatorCompanyIds={operatorCompanyIds}
        companyInfo={companyInfo}
      />

      {/* 3. Core Workspace Content Switcher - Dynamically widened for Timeline & Dashboards */}
      {(() => {
        const isWideView = ['timeline', 'statistics', 'cancelled_list', 'master_settings', 'dispatch_board', 'service_history', 'parking_departure', 'payment_change'].includes(currentView);
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
                    setSelectedDate={setSelectedDate}
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
                    primaryCompanyId={currentCompanyId}
                    companies={companies}
                    onUpdatePayment={handleUpdatePaymentMethod}
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
                    onOpenWorkbench={setDriverDetailRes}
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
                      writePartnersToStorage(updatedPartners);
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
                        sameDayBookingBlocked: matched?.sameDayBookingBlocked === true,
                        hourlyCapEnabled: matched?.hourlyCapEnabled === true,
                        maxCarsPerHour:
                          typeof matched?.maxCarsPerHour === 'number' ? matched.maxCarsPerHour : 0,
                        parkingCapEnabled: matched?.parkingCapEnabled === true,
                        maxParkedCars:
                          typeof matched?.maxParkedCars === 'number' ? matched.maxParkedCars : 0,
                      });
                    }}
                    onToggleCompanyOpen={handleToggleCompanyOpen}
                    onRemoteOpenCompany={(companyId) => handleCompanySwitch(companyId)}
                    onOpenPartnerEditor={() => setShowAdminModal(true)}
                  />
                </motion.div>
              )}

              {/* 결제 변경 탭 제거 → 검색/타임라인 상세에서 처리. 예전 링크 대비 리다이렉트 */}
              {currentView === 'payment_change' && showPartnerDriverView && (
                <motion.div
                  key="payment_change_redirect"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="py-16 text-center space-y-3"
                >
                  <p className="text-sm font-bold text-zinc-300">
                    결제는 차량 검색·타임라인에서 해당 차를 열어 수정하세요.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setReceptionSubMode('search');
                      handleNavigate('search_reception');
                    }}
                    className="px-4 py-2 rounded-xl bg-amber-500 text-neutral-950 text-xs font-black"
                  >
                    차량 검색으로 이동
                  </button>
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
                    onOpenWorkbench={setDriverDetailRes}
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
                    onOpenWorkbench={setDriverDetailRes}
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
              className="relative bg-[#141416] w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] border border-neutral-800"
            >
              <div className="p-4 border-b border-neutral-800 flex items-center justify-between bg-[#1A1A1D]">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="text-amber-500" size={18} />
                  <span className="text-[13px] font-black font-mono text-zinc-100">
                    최고관리자 설정
                  </span>
                </div>
                <button 
                  type="button" 
                  onClick={() => setShowAdminModal(false)} 
                  className="p-1 text-zinc-500 hover:bg-neutral-800 hover:text-zinc-200 rounded-full"
                >
                  <X size={16} />
                </button>
              </div>
              
              <div className="overflow-y-auto p-5 flex-1 select-none bg-[#141416]">
                <AdminDashboard 
                  onClose={() => setShowAdminModal(false)} 
                  companies={companies} 
                  partners={partners}
                  reservations={reservations}
                  onUpdatePartners={(updatedPartners) => {
                    setPartners(updatedPartners);
                    writePartnersToStorage(updatedPartners);
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
                    placeholder="아이디 또는 이메일"
                    className="w-full px-3 py-2.5 bg-neutral-950 border border-neutral-850 rounded-xl text-zinc-200 outline-none focus:border-amber-500 font-bold text-xs"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-black text-zinc-500 uppercase">보안 비밀번호</label>
                  <input 
                    type="password"
                    value={loginPassword}
                    onChange={e => setLoginPassword(e.target.value)}
                    placeholder="Firebase Auth 비밀번호"
                    className="w-full px-3 py-2.5 bg-neutral-950 border border-neutral-850 rounded-xl text-zinc-200 outline-none focus:border-amber-500 text-xs font-mono"
                  />
                  <p className="text-[10.5px] text-zinc-650">본사는 Firebase Console Authentication 비밀번호를 사용합니다.</p>
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
        companies={companies}
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
          return matched?.sameDayBookingBlocked === true;
        })()}
        hourlyCapEnabled={(() => {
          const matched = companies.find(c => c.id === currentCompanyId);
          return matched?.hourlyCapEnabled === true;
        })()}
        maxCarsPerHour={(() => {
          const matched = companies.find(c => c.id === currentCompanyId);
          const n = matched?.maxCarsPerHour;
          return typeof n === 'number' && n > 0 ? n : 5;
        })()}
        parkingCapEnabled={(() => {
          const matched = companies.find(c => c.id === currentCompanyId);
          return matched?.parkingCapEnabled === true;
        })()}
        maxParkedCars={(() => {
          const matched = companies.find(c => c.id === currentCompanyId);
          const n = matched?.maxParkedCars;
          return typeof n === 'number' && n > 0 ? n : 50;
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
            canManageDeepRevert={isAdmin}
            onSave={handleSaveDriverReservationEdit}
            onStatusAction={handleDriverStatusAction}
            onRevertStatus={handleDriverRevertStatus}
            onCancelReservation={handleDriverCancelReservation}
            companies={companies}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
