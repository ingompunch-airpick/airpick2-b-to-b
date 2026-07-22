import { useCallback, useEffect, useMemo, useState, type Dispatch, type FormEvent, type MutableRefObject, type SetStateAction } from 'react';
import { onAuthStateChanged, signInAnonymously, signOut, type User } from 'firebase/auth';
import { auth } from '../firebase';
import type { AppView, Company, CompanyInfo } from '../types';
import { airportRegionLabel } from '../utils/airport';
import { formatPartnerDisplayName } from '../utils/companyDisplay';
import { resolveOperatorCompanyIds } from '../utils/operatorHierarchy';
import { AIRPICK_HQ_ID, isAirpickHeadquarters, normalizePlatformCompanyId } from '../constants/platform';
import {
  ensureFirestoreAuth,
  formatPlatformAdminAuthError,
  isPlatformAdminEmail,
  signInPlatformAdminWithPassword,
} from '../lib/firebaseAuth';
import { verifyPartnerLogin } from '../lib/partnerLoginApi';

const EMPTY_COMPANY_INFO: CompanyInfo = {
  id: '',
  name: '',
  region: '',
  phone: '',
  logo: '',
};

function readLoggedInFlag(): boolean {
  return localStorage.getItem('is_logged_in') === 'true';
}

function readRoleFlag(key: string): boolean {
  return readLoggedInFlag() && localStorage.getItem(key) === 'true';
}

export interface GateLoginRoles {
  isSuperAdmin: boolean;
  isLocalAdmin: boolean;
  isMasterAdmin: boolean;
  isAdminModeActive: boolean;
  companyId: string;
  companyInfo: CompanyInfo;
  isEmployee?: boolean;
  employeeName?: string;
  employeeRole?: 'admin' | 'driver';
}

export interface UseSessionParams {
  /** useCompanies가 채우는 목록 — 로그인 시점에 최신값 읽기 */
  companiesRef: MutableRefObject<Company[]>;
  setCurrentView: Dispatch<SetStateAction<AppView>>;
}

/**
 * 로그인·역할·현재 업체 컨텍스트·Auth.
 * App은 화면 조립을 담당하고, 세션 허브는 이 훅으로 둔다.
 */
export function useSession({ companiesRef, setCurrentView }: UseSessionParams) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(readLoggedInFlag);

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
      } catch {
        /* ignore */
      }
    }
    return { ...EMPTY_COMPANY_INFO };
  });

  const [isAdminModeActive, setIsAdminModeActive] = useState<boolean>(() =>
    readRoleFlag('local_is_admin_mode_active')
  );
  const [isLocalAdmin, setIsLocalAdmin] = useState<boolean>(() => readRoleFlag('local_is_admin'));
  const [isMasterAdmin, setIsMasterAdmin] = useState<boolean>(() =>
    readRoleFlag('local_is_master_admin')
  );
  const [isSuperAdmin, setIsSuperAdmin] = useState<boolean>(() =>
    readRoleFlag('local_is_super_admin')
  );
  const [isEmployee, setIsEmployee] = useState<boolean>(() => readRoleFlag('local_is_employee'));
  const [employeeName, setEmployeeName] = useState<string>(() =>
    readLoggedInFlag() ? localStorage.getItem('local_employee_name') || '' : ''
  );
  const [employeeRole, setEmployeeRole] = useState<'admin' | 'driver'>(() =>
    readLoggedInFlag()
      ? (localStorage.getItem('local_employee_role') as 'admin' | 'driver') || 'driver'
      : 'driver'
  );

  const [showLoginModal, setShowLoginModal] = useState(false);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');

  const isAdmin = useMemo(
    () =>
      isLocalAdmin ||
      isSuperAdmin ||
      isMasterAdmin ||
      user?.email === 'drive5746@gmail.com' ||
      user?.email === 'ingompunch@gmail.com' ||
      (isEmployee && employeeRole === 'admin'),
    [isLocalAdmin, isSuperAdmin, isMasterAdmin, user?.email, isEmployee, employeeRole]
  );

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const checkAndAuth = async () => {
      if (!auth.currentUser) {
        try {
          await signInAnonymously(auth);
        } catch (e: unknown) {
          console.warn('Anonymous auth restricted or disabled (safe to ignore offline):', e);
        }
      }
    };
    void checkAndAuth();
  }, []);

  useEffect(() => {
    if (!isAdmin) {
      setIsAdminModeActive(false);
    }
  }, [isAdmin]);

  const clearSessionLocalStorage = useCallback(() => {
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
  }, []);

  const resetSessionState = useCallback(() => {
    setIsLoggedIn(false);
    setIsSuperAdmin(false);
    setIsLocalAdmin(false);
    setIsMasterAdmin(false);
    setIsAdminModeActive(false);
    setIsEmployee(false);
    setEmployeeName('');
    setEmployeeRole('driver');
    setCurrentCompanyId('');
    setCompanyInfo({ ...EMPTY_COMPANY_INFO });
    setCurrentView('timeline');
  }, [setCurrentView]);

  const handleCredentialLogin = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      setLoginError('');

      const inputEmailClean = loginEmail.trim().toLowerCase();

      if (isPlatformAdminEmail(inputEmailClean)) {
        try {
          const signedIn = await signInPlatformAdminWithPassword(inputEmailClean, loginPassword);
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
          alert(`최고관리자 ${signedIn.email} 님 마스터 자격 인증이 완료되었습니다!`);
        } catch (err) {
          setLoginError(formatPlatformAdminAuthError(err));
        }
        return;
      }

      if (loginEmail.trim().toLowerCase() === 'airpick') {
        setLoginError(
          '본사는 등록된 관리자 이메일로 로그인하세요. (업체 ID `airpick` 은 더 이상 사용하지 않습니다.)'
        );
        return;
      }

      try {
        const verified = await verifyPartnerLogin({
          loginId: inputEmailClean,
          password: loginPassword,
        });
        setIsSuperAdmin(false);
        setIsLocalAdmin(true);
        setIsMasterAdmin(true);
        setCurrentCompanyId(verified.companyId);

        const foundComp = companiesRef.current.find((c) => c.id === verified.companyId);
        const brandInfo: CompanyInfo = {
          id: verified.companyId,
          name: verified.name,
          region: airportRegionLabel(foundComp?.airport),
          phone: verified.phone,
          logo: '',
        };
        setCompanyInfo(brandInfo);
        setIsAdminModeActive(true);
        setCurrentView('statistics');
        localStorage.setItem('master_company_info', JSON.stringify(brandInfo));
        localStorage.setItem('current_company_id', verified.companyId);
        localStorage.setItem('local_is_super_admin', 'false');
        localStorage.setItem('local_is_admin', 'true');
        localStorage.setItem('local_is_master_admin', 'true');
        localStorage.setItem('local_is_admin_mode_active', 'true');
        localStorage.setItem(
          'operator_company_ids',
          JSON.stringify(resolveOperatorCompanyIds(verified.companyId, companiesRef.current))
        );
        setShowLoginModal(false);
        alert(
          `제휴업체 [${verified.name}]의 마스터 관리자 인증이 성공 통과하여 관리자 모드가 활성화되었습니다!`
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setLoginError(msg || '인증이 기각되었습니다. 아이디와 보안 비밀번호를 재확인 바랍니다.');
      }
    },
    [companiesRef, loginEmail, loginPassword, setCurrentView]
  );

  const handleGateLoginSuccess = useCallback(
    (roles: GateLoginRoles) => {
      setIsLoggedIn(true);
      setIsSuperAdmin(roles.isSuperAdmin);
      setIsLocalAdmin(roles.isLocalAdmin);
      setIsMasterAdmin(roles.isMasterAdmin);
      setIsAdminModeActive(roles.isAdminModeActive);
      const companyId = normalizePlatformCompanyId(roles.companyId) || roles.companyId;
      const normalizedInfo = isAirpickHeadquarters(companyId)
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

      const opIds = resolveOperatorCompanyIds(companyId, companiesRef.current);
      localStorage.setItem('operator_company_ids', JSON.stringify(opIds));

      const shouldStartInAdmin =
        roles.isAdminModeActive &&
        (roles.isSuperAdmin ||
          roles.isLocalAdmin ||
          roles.isMasterAdmin ||
          roles.employeeRole === 'admin');
      setCurrentView(shouldStartInAdmin ? 'statistics' : 'timeline');

      ensureFirestoreAuth().catch((err) => {
        console.warn('Firebase auth after gate login:', err);
      });
    },
    [companiesRef, setCurrentView]
  );

  const handleOperatorLogout = useCallback(async () => {
    try {
      resetSessionState();
      clearSessionLocalStorage();
      await signOut(auth);
      try {
        await signInAnonymously(auth);
      } catch (anonErr) {
        console.warn('Silent ignore: signInAnonymously restricted during logout', anonErr);
      }
      alert('안전하게 로그아웃되었습니다. 통합 로그인 화면(Gate)으로 이동합니다.');
    } catch (err) {
      resetSessionState();
      clearSessionLocalStorage();
      console.error(err);
    }
  }, [clearSessionLocalStorage, resetSessionState]);

  return {
    user,
    isLoggedIn,
    currentCompanyId,
    setCurrentCompanyId,
    companyInfo,
    setCompanyInfo,
    isAdminModeActive,
    setIsAdminModeActive,
    isLocalAdmin,
    isMasterAdmin,
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
    setLoginError,
    handleCredentialLogin,
    handleGateLoginSuccess,
    handleOperatorLogout,
  };
}
