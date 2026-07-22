import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { signInAnonymously } from 'firebase/auth';
import { auth, db, handleFirestoreError, OperationType } from '../firebase';
import type { Company, CompanyInfo, PaymentMethod, Reservation, ReservationStatus } from '../types';
import {
  filterReservationsForOperatorGroup,
  formatOperatorGroupLabel,
  resolveOperatorCompanyIds,
} from '../utils/operatorHierarchy';
import { formatPartnerDisplayName } from '../utils/companyDisplay';
import { clearLegacyReservationLocalCaches } from '../utils/reservationScope';
import { normalizeDateString, normalizeDocsArray } from '../utils/reservationNormalize';
import {
  fetchScopedReservations,
  subscribeScopedReservations,
} from '../utils/reservationQuery';
import { buildCheckoutRetentionFields } from '../lib/reservationRetention';
import { mergeReservationImageUrls } from '../lib/reservationPhotos';
import { buildScratchPhotoSet } from '../lib/scratchPhotos';
import { isAirpickHeadquarters } from '../constants/platform';
import { ensureFirestoreAuth } from '../lib/firebaseAuth';
import { patchReservation } from '../lib/reservationFirestore';
import { isPending } from '../utils/reservationStatus';
import {
  areReservationAlertsEnabled,
  findNewIncomingReservations,
  markNotificationPermissionAsked,
  notifyNewReservation,
  requestReservationNotificationPermission,
  setReservationAlertsEnabled,
  wasNotificationPermissionAsked,
} from '../utils/reservationNotifications';

export interface UseReservationsParams {
  isLoggedIn: boolean;
  currentCompanyId: string;
  companies: Company[];
  companyInfo: CompanyInfo;
  selectedDate: string;
  isEmployee: boolean;
  employeeName: string;
  isSuperAdmin: boolean;
}

function resolveOperatorLabel(params: {
  isEmployee: boolean;
  employeeName: string;
  isSuperAdmin: boolean;
}): string {
  if (params.isEmployee) return params.employeeName;
  if (params.isSuperAdmin) return '본사 마스터(최고관리자)';
  return '업체 마스터';
}

/**
 * 예약 Firestore 구독·카운터·상태/결제/사진 변경.
 * App은 세션·화면 조립만 담당하고 예약 데이터 허브는 이 훅으로 둔다.
 */
export function useReservations({
  isLoggedIn,
  currentCompanyId,
  companies,
  companyInfo,
  selectedDate,
  isEmployee,
  employeeName,
  isSuperAdmin,
}: UseReservationsParams) {
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [loadingReservations, setLoadingReservations] = useState(false);
  const [incomingReservationToast, setIncomingReservationToast] = useState<{
    id: string;
    carNumber: string;
    userName: string;
  } | null>(null);
  const [showAlertPermissionBanner, setShowAlertPermissionBanner] = useState(false);

  const reservationsBootstrappedRef = useRef(false);
  const reservationsPrevRef = useRef<Reservation[]>([]);
  const currentCompanyIdRef = useRef(currentCompanyId);
  const operatorCompanyIdsRef = useRef<string[]>([]);
  const companyAlertLabelRef = useRef(
    formatPartnerDisplayName(companyInfo.name, companyInfo.id) || currentCompanyId
  );

  useEffect(() => {
    clearLegacyReservationLocalCaches();
  }, []);

  const operatorCompanyIds = useMemo(() => {
    if (isAirpickHeadquarters(currentCompanyId)) return [];
    return resolveOperatorCompanyIds(currentCompanyId, companies);
  }, [currentCompanyId, companies]);

  const operatorGroupLabel = useMemo(
    () => formatOperatorGroupLabel(currentCompanyId, companies),
    [currentCompanyId, companies]
  );

  const showCompanyNameOnCards = operatorCompanyIds.length > 1;

  const visibleReservations = useMemo(() => {
    const normalized = normalizeDocsArray(reservations);
    if (isAirpickHeadquarters(currentCompanyId)) return normalized;
    return filterReservationsForOperatorGroup(normalized, operatorCompanyIds);
  }, [reservations, currentCompanyId, operatorCompanyIds]);

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
      setReservations([]);
      setShowAlertPermissionBanner(false);
      setLoadingReservations(false);
      return;
    }
    if (typeof Notification === 'undefined') return;
    if (Notification.permission !== 'default') return;
    if (wasNotificationPermissionAsked()) return;
    setShowAlertPermissionBanner(true);
  }, [isLoggedIn]);

  const reservationSyncScopeKey = useMemo(() => {
    if (isAirpickHeadquarters(currentCompanyId)) return 'hq';
    return operatorCompanyIds.slice().sort().join('|') || currentCompanyId;
  }, [currentCompanyId, operatorCompanyIds]);

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
      const data = normalizeDocsArray(rawData).sort((a, b) =>
        b.createdAt.localeCompare(a.createdAt)
      );

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
      setLoadingReservations(false);
    };

    const bootstrapAuthAndListen = async () => {
      setLoadingReservations(true);
      if (!auth.currentUser) {
        try {
          await signInAnonymously(auth);
        } catch (e: unknown) {
          console.warn('Anonymous auth before reservations sync:', e);
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

      return subscribeScopedReservations(
        db,
        syncScope,
        (rows) => applySnapshot(rows),
        (err) => {
          console.warn('reservations onSnapshot error:', err);
          handleFirestoreError(err, OperationType.LIST, 'reservations');
          if (!cancelled) setLoadingReservations(false);
        }
      );
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

  const handleUpdateValetStatus = useCallback(
    async (
      resId: string,
      nextStatus: ReservationStatus,
      extraFields?: Partial<Reservation>
    ) => {
      const operatorName = resolveOperatorLabel({ isEmployee, employeeName, isSuperAdmin });
      const retentionPatch =
        nextStatus === 'completed_out'
          ? buildCheckoutRetentionFields(extraFields?.actualExitTime)
          : {};

      let patch: Record<string, unknown> = {
        status: nextStatus,
        ...extraFields,
        ...retentionPatch,
        updatedBy: operatorName,
        updatedAt: new Date().toISOString(),
      };

      setReservations((prev) => {
        const current = prev.find((r) => r.id === resId);
        if (extraFields?.images) {
          const merged = mergeReservationImageUrls(current?.images, extraFields.images);
          patch = {
            ...patch,
            images: merged,
            scratchPhotos: buildScratchPhotoSet(merged, true),
          };
        }
        return prev.map((r) => (r.id === resId ? { ...r, ...patch } : r));
      });

      try {
        await updateDoc(doc(db, 'reservations', resId), patch);
      } catch (err: unknown) {
        console.warn(
          'Firestore status update run locally or failed, state already migrated:',
          err
        );
      }
    },
    [isEmployee, employeeName, isSuperAdmin]
  );

  const handleUpdatePaymentMethod = useCallback(
    async (resId: string, method: PaymentMethod) => {
      const operatorName = resolveOperatorLabel({ isEmployee, employeeName, isSuperAdmin });
      const stamp = {
        paymentMethod: method,
        updatedBy: operatorName,
        updatedAt: new Date().toISOString(),
      };
      const applyLocal = () => {
        setReservations((prev) =>
          prev.map((r) => (r.id === resId ? { ...r, ...stamp } : r))
        );
      };
      try {
        await updateDoc(doc(db, 'reservations', resId), stamp);
        applyLocal();
      } catch {
        applyLocal();
      }
    },
    [isEmployee, employeeName, isSuperAdmin]
  );

  const handleUpdateReservationImages = useCallback(
    async (resId: string, imageUrls: string[]) => {
      const operatorName = resolveOperatorLabel({ isEmployee, employeeName, isSuperAdmin });
      await ensureFirestoreAuth();

      let merged = imageUrls;
      setReservations((prev) => {
        const current = prev.find((r) => r.id === resId);
        merged = mergeReservationImageUrls(current?.images, imageUrls);
        return prev;
      });

      try {
        await updateDoc(doc(db, 'reservations', resId), {
          images: merged,
          updatedBy: operatorName,
          updatedAt: new Date().toISOString(),
        });
      } catch (err: unknown) {
        const code = (err as { code?: string })?.code;
        if (code === 'not-found') {
          throw new Error(
            'Firestore에 이 예약 문서가 없습니다. 타임라인에서 입고 처리 후 다시 시도해 주세요.'
          );
        }
        throw err;
      }
      setReservations((prev) =>
        prev.map((r) =>
          r.id === resId
            ? { ...r, images: merged, updatedBy: operatorName, updatedAt: new Date().toISOString() }
            : r
        )
      );
    },
    [isEmployee, employeeName, isSuperAdmin]
  );

  const handlePatchReservationFields = useCallback(
    async (resId: string, updateData: Partial<Reservation>) => {
      setReservations((prev) =>
        prev.map((r) => (r.id === resId ? { ...r, ...updateData } : r))
      );
      try {
        await patchReservation(resId, updateData);
      } catch (err) {
        console.warn('Reservation patch failed/offline:', err);
      }
    },
    []
  );

  const enableReservationAlerts = useCallback(async () => {
    await requestReservationNotificationPermission();
    setShowAlertPermissionBanner(false);
  }, []);

  const dismissReservationAlertsBanner = useCallback(() => {
    setReservationAlertsEnabled(false);
    markNotificationPermissionAsked();
    setShowAlertPermissionBanner(false);
  }, []);

  const countPending = useMemo(() => {
    return visibleReservations.filter((r) => {
      const rDep = normalizeDateString(r.departureDate);
      const selDate = normalizeDateString(selectedDate);
      if (!isPending(r.status)) return false;
      if (selDate && rDep !== selDate) return false;
      return true;
    }).length;
  }, [visibleReservations, selectedDate]);

  const countPendingIn = useMemo(() => {
    return visibleReservations.filter((r) => {
      const rDep = normalizeDateString(r.departureDate);
      const selDate = normalizeDateString(selectedDate);
      if (r.status !== 'pending_in') return false;
      if (selDate && rDep !== selDate) return false;
      return true;
    }).length;
  }, [visibleReservations, selectedDate]);

  const countRequestOut = useMemo(() => {
    return visibleReservations.filter((r) => {
      const rArr = normalizeDateString(r.arrivalDate);
      const selDate = normalizeDateString(selectedDate);
      if (r.status !== 'request_out') return false;
      if (selDate && rArr !== selDate) return false;
      return true;
    }).length;
  }, [visibleReservations, selectedDate]);

  const countConfirmed = useMemo(() => {
    return visibleReservations.filter((r) => {
      const rArr = normalizeDateString(r.arrivalDate);
      const selDate = normalizeDateString(selectedDate);
      if (
        r.status !== 'completed_in' &&
        r.status !== 'pending' &&
        r.status !== 'pending_in'
      ) {
        return false;
      }
      if (selDate && rArr !== selDate) return false;
      return true;
    }).length;
  }, [visibleReservations, selectedDate]);

  return {
    reservations,
    setReservations,
    loadingReservations,
    visibleReservations,
    operatorCompanyIds,
    operatorGroupLabel,
    showCompanyNameOnCards,
    incomingReservationToast,
    showAlertPermissionBanner,
    setShowAlertPermissionBanner,
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
  };
}
