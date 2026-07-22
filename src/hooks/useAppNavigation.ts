import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import type { AppView } from '../types';
import { isAirpickHeadquarters } from '../constants/platform';

/** 관리자 모드 전용 화면 — 기사 모드에서 진입 시 timeline으로 보냄 */
export const ADMIN_ONLY_VIEWS: AppView[] = ['statistics', 'master_settings'];
/** 기사 모드 전용 화면 — 관리자 모드에서 진입 시 statistics로 보냄 */
export const DRIVER_ONLY_VIEWS: AppView[] = [
  'timeline',
  'search_reception',
  'payment_change',
  'scratch_images',
  'service_history',
  'parking_departure',
  'cancelled_list',
];
export const HQ_ADMIN_VIEWS: AppView[] = ['statistics', 'master_settings'];

/** dead code 정리 전 localStorage·history에 남을 수 있는 레거시 화면 */
export function resolveLegacyAppView(view: AppView | string): AppView {
  if (view === 'parkingRegister') return 'statistics';
  return view as AppView;
}

export function isLegacyAdminOnlyView(view: AppView | string): boolean {
  return ADMIN_ONLY_VIEWS.includes(resolveLegacyAppView(view));
}

export function isPartnerDriverContext(companyId: string, adminModeActive: boolean): boolean {
  return !adminModeActive && !isAirpickHeadquarters(companyId);
}

export interface UseAppNavigationParams {
  isLoggedIn: boolean;
  currentCompanyId: string;
  isSuperAdmin: boolean;
  isAdmin: boolean;
  isAdminModeActive: boolean;
  setIsAdminModeActive: Dispatch<SetStateAction<boolean>>;
}

/**
 * currentView·사이드바·히스토리·모드별 화면 가드.
 * 세션/업체 훅보다 setCurrentView를 먼저 확보하려면 App에서 ref 브리지로 연결한다.
 */
export function useAppNavigation({
  isLoggedIn,
  currentCompanyId,
  isSuperAdmin,
  isAdmin,
  isAdminModeActive,
  setIsAdminModeActive,
}: UseAppNavigationParams) {
  const [currentView, setCurrentView] = useState<AppView>('timeline');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [showAdminModal, setShowAdminModal] = useState(false);

  useEffect(() => {
    if (!isSuperAdmin) {
      setShowAdminModal(false);
    }
  }, [isSuperAdmin]);

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
        if (currentView !== 'statistics') {
          setCurrentView('statistics');
          window.history.pushState({ view: 'statistics', controlled: true }, '');
        } else {
          setCurrentView('timeline');
          window.history.pushState({ view: 'timeline', controlled: true }, '');
        }
      } else if (currentView !== 'timeline') {
        setCurrentView('timeline');
        window.history.pushState({ view: 'timeline', controlled: true }, '');
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [currentView, isAdminModeActive, isAdmin, isSuperAdmin, currentCompanyId]);

  useEffect(() => {
    if (window.history.state && window.history.state.view !== currentView) {
      window.history.pushState({ view: currentView, controlled: true }, '');
    }
  }, [currentView]);

  useEffect(() => {
    if (!isLoggedIn) return;

    if ((currentView as string) === 'parkingRegister') {
      setCurrentView(isAdminModeActive && isAdmin ? 'statistics' : 'timeline');
      return;
    }

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
  }, [
    isLoggedIn,
    isAdminModeActive,
    isAdmin,
    isSuperAdmin,
    currentView,
    currentCompanyId,
    setIsAdminModeActive,
  ]);

  const handleNavigate = useCallback(
    (view: AppView) => {
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
    },
    [isSuperAdmin, currentCompanyId, isAdminModeActive, isAdmin]
  );

  const enterAdminMode = useCallback(() => {
    setIsAdminModeActive(true);
    localStorage.setItem('local_is_admin_mode_active', 'true');
    if (DRIVER_ONLY_VIEWS.includes(currentView)) {
      setCurrentView('statistics');
    }
  }, [currentView, setIsAdminModeActive]);

  const enterDriverMode = useCallback(() => {
    setIsAdminModeActive(false);
    localStorage.setItem('local_is_admin_mode_active', 'false');
    if (isLegacyAdminOnlyView(currentView)) {
      setCurrentView('timeline');
    }
  }, [currentView, setIsAdminModeActive]);

  const showPartnerDriverView = isPartnerDriverContext(currentCompanyId, isAdminModeActive);

  return {
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
  };
}
