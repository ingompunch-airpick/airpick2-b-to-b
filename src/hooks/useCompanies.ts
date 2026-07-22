import { useCallback, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import { collection, doc, getDoc, getDocs, onSnapshot, setDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import type { AppView, Company, CompanyInfo, PartnerCompany } from '../types';
import { formatPartnerDisplayName } from '../utils/companyDisplay';
import {
  mergePartnersFromFirestore,
  readPartnersFromStorage,
  resolveBlockedDatesForCompany,
  sanitizePartnersForStorage,
  writePartnersToStorage,
} from '../utils/partnerSync';
import { airportRegionLabel } from '../utils/airport';
import { AIRPICK_HQ_ID, isAirpickHeadquarters } from '../constants/platform';
import { ensureFirestoreAuth, ensurePlatformAdminAuth } from '../lib/firebaseAuth';

const DEFAULT_PARTNERS: PartnerCompany[] = [];

export interface BookingSettingsInput {
  blockedDates: string[];
  cancelCutoffHours: number;
  sameDayBookingBlocked: boolean;
  hourlyCapEnabled: boolean;
  maxCarsPerHour: number;
}

export interface UseCompaniesParams {
  isLoggedIn: boolean;
  currentCompanyId: string;
  companyInfo: CompanyInfo;
  isSuperAdmin: boolean;
  isAdminModeActive: boolean;
  setCurrentCompanyId: Dispatch<SetStateAction<string>>;
  setCompanyInfo: Dispatch<SetStateAction<CompanyInfo>>;
  setIsAdminModeActive: Dispatch<SetStateAction<boolean>>;
  setCurrentView: Dispatch<SetStateAction<AppView>>;
}

/**
 * companies/partners 구독·블로아웃·예약설정·업체 전환.
 * 세션(currentCompanyId 등)은 useSession, 목록 허브는 이 훅.
 */
export function useCompanies({
  isLoggedIn,
  currentCompanyId,
  companyInfo,
  isSuperAdmin,
  isAdminModeActive,
  setCurrentCompanyId,
  setCompanyInfo,
  setIsAdminModeActive,
  setCurrentView,
}: UseCompaniesParams) {
  const [companies, setCompanies] = useState<Company[]>(() => {
    const saved = localStorage.getItem('companies');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed && Array.isArray(parsed)) return parsed;
      } catch {
        /* ignore */
      }
    }
    return [];
  });

  const [partners, setPartners] = useState<PartnerCompany[]>(() => {
    try {
      sessionStorage.removeItem('b2b_partner_gate_session');
    } catch {
      /* ignore */
    }
    const saved = localStorage.getItem('super_partners_list');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed && Array.isArray(parsed) && parsed.length > 0) {
          const cleaned = sanitizePartnersForStorage(parsed);
          writePartnersToStorage(cleaned);
          return cleaned;
        }
      } catch {
        /* ignore */
      }
    }
    writePartnersToStorage(DEFAULT_PARTNERS);
    return DEFAULT_PARTNERS;
  });

  const activeBlockedDates = useMemo(
    () =>
      resolveBlockedDatesForCompany(currentCompanyId, companies, (key) =>
        localStorage.getItem(key)
      ),
    [currentCompanyId, companies]
  );

  const getDropdownOptions = useCallback(() => {
    const options = [{ id: AIRPICK_HQ_ID, name: '에어픽' }];
    (companies || []).forEach((c) => {
      if (c.id && !isAirpickHeadquarters(c.id)) {
        options.push({
          id: c.id,
          name: formatPartnerDisplayName(c.name, c.id),
        });
      }
    });
    return options;
  }, [companies]);

  const handleCompanySwitch = useCallback(
    (selectedId: string) => {
      let targetCompanyInfo: CompanyInfo = {
        id: selectedId,
        name: '',
        region: airportRegionLabel(),
        phone: '1545-5746',
        logo: '',
        isIndoor: true,
        facilityType: 'mixed',
        ratePolicy: '',
      };

      if (isAirpickHeadquarters(selectedId)) {
        targetCompanyInfo.name = '에어픽';
        setIsAdminModeActive(true);
        localStorage.setItem('local_is_admin_mode_active', 'true');
        setCurrentView('statistics');
      } else {
        const foundComp = (companies || []).find((c) => c.id === selectedId);
        if (foundComp) {
          targetCompanyInfo.name = formatPartnerDisplayName(foundComp.name, foundComp.id);
          targetCompanyInfo.phone = foundComp.phone || '1545-5746';
          targetCompanyInfo.logo = foundComp.image_url || '';
          targetCompanyInfo.region = airportRegionLabel(foundComp.airport);
        } else {
          targetCompanyInfo.name = selectedId;
        }
        if (isSuperAdmin) {
          setCurrentView(isAdminModeActive ? 'statistics' : 'timeline');
        }
      }

      setCurrentCompanyId(selectedId);
      setCompanyInfo(targetCompanyInfo);
      localStorage.setItem('current_company_id', selectedId);
      localStorage.setItem('master_company_info', JSON.stringify(targetCompanyInfo));
    },
    [
      companies,
      isSuperAdmin,
      isAdminModeActive,
      setCurrentCompanyId,
      setCompanyInfo,
      setIsAdminModeActive,
      setCurrentView,
    ]
  );

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

  const handleSaveBookingSettings = useCallback(
    async (settings: BookingSettingsInput) => {
      const targetId = isAirpickHeadquarters(currentCompanyId)
        ? AIRPICK_HQ_ID
        : (currentCompanyId || '').trim();
      if (!targetId) return;

      const {
        blockedDates: newBlockedDates,
        cancelCutoffHours,
        sameDayBookingBlocked,
        hourlyCapEnabled,
        maxCarsPerHour,
      } = settings;

      localStorage.setItem(`${targetId}_blockedDates`, JSON.stringify(newBlockedDates));
      setCompanies((prev) => {
        const idx = prev.findIndex((c) => c.id === targetId);
        const patch = {
          blockedDates: newBlockedDates,
          cancelCutoffHours,
          sameDayBookingBlocked,
          hourlyCapEnabled,
          maxCarsPerHour,
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
            hourlyCapEnabled,
            maxCarsPerHour,
            updatedAt: new Date().toISOString(),
          },
          { merge: true }
        );
      } catch (err: unknown) {
        console.warn(`Firestore booking settings save failed for companies/${targetId}:`, err);
        throw err;
      }
    },
    [currentCompanyId, companyInfo?.name]
  );

  const handleToggleCompanyOpen = useCallback(
    async (companyId: string, isOpen: boolean) => {
      setCompanies((prev) => {
        const idx = prev.findIndex((c) => c.id === companyId);
        if (idx > -1) {
          return prev.map((c) => (c.id === companyId ? { ...c, isOpen } : c));
        }
        const fallBackName =
          companyInfo && companyInfo.id === companyId
            ? companyInfo.name
            : formatPartnerDisplayName(companyInfo?.name, companyId) || companyId;
        return [...prev, { id: companyId, name: fallBackName, isOpen } as Company];
      });

      try {
        await ensureFirestoreAuth();
        await setDoc(doc(db, 'companies', companyId), { isOpen }, { merge: true });
      } catch (err: unknown) {
        console.warn(`Firestore setDoc for companies/${companyId} failed:`, err);
      }
    },
    [companyInfo]
  );

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
        if (!wawaExists) {
          console.warn(
            'companies/wawa 문서가 없습니다. 클라이언트 생성은 Rules에서 차단됩니다. 본사 Callable 또는 Console로 생성하세요.'
          );
        }
      } catch (err) {
        console.warn('Automated master DB validation on load bypassed:', err);
      }
    };
    void triggerDBCleanup();
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'companies'),
      (snap) => {
        const data = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Company));

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
            } catch {
              /* ignore */
            }
          }
          setCompanies([]);
        }

        setPartners((prev) => {
          const storedPartners = readPartnersFromStorage((key) => localStorage.getItem(key));
          const mergedList = mergePartnersFromFirestore(data, prev, storedPartners);
          writePartnersToStorage(mergedList);
          return sanitizePartnersForStorage(mergedList);
        });
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'companies');
        const saved = localStorage.getItem('companies');
        if (saved) {
          try {
            const parsed = JSON.parse(saved);
            if (parsed && Array.isArray(parsed)) {
              setCompanies(parsed);
              return;
            }
          } catch {
            /* ignore */
          }
        }
        setCompanies([]);
      }
    );
    return () => unsub();
  }, []);

  return {
    companies,
    setCompanies,
    partners,
    setPartners,
    activeBlockedDates,
    getDropdownOptions,
    handleCompanySwitch,
    handleSaveBookingSettings,
    handleToggleCompanyOpen,
  };
}
