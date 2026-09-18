import React, { useCallback, useState } from 'react';
import { Reservation, AppView, CompanyInfo, Company, PartnerCompany } from '../types';
import StatisticsView from './StatisticsView';
import CancelledListView from './CancelledListView';
import MasterSettingsView from './MasterSettingsView';
import DispatchBoardView from './DispatchBoardView';
import HqParkingPartnersView from './HqParkingPartnersView';
import HqReviewsView from './HqReviewsView';
import HqCustomersView from './HqCustomersView';
import AcquisitionFunnelView from './AcquisitionFunnelView';
import AffiliateAdminView from './AffiliateAdminView';

interface AdminModeProps {
  currentView: AppView;
  setCurrentView: (view: AppView) => void;
  reservations: Reservation[];
  allReservations?: Reservation[];
  onUpdateValetStatus: (resId: string, nextStatus: any) => void;
  onEditReservation?: (res: Reservation) => void;
  companyInfo: CompanyInfo;
  onUpdateCompany: (info: CompanyInfo) => void;
  companies: Company[];
  onUpdateCompanies: (updated: Company[]) => void;
  partners: PartnerCompany[];
  onUpdatePartners: (updated: PartnerCompany[]) => void;
  isSuperAdmin?: boolean;
  isEmployee?: boolean;
  employeeRole?: 'admin' | 'driver';
  currentCompanyId?: string;
  blockedDates?: string[];
  onSaveBlockedDates?: (dates: string[]) => void;
  onToggleCompanyOpen?: (companyId: string, isOpen: boolean) => Promise<void> | void;
  onRemoteOpenCompany?: (companyId: string) => void;
  onOpenPartnerEditor?: () => void;
}

function resolveAdminView(view: AppView | string): AppView {
  if (view === 'parkingRegister') return 'statistics';
  // 예전 「업체 상태판」 → 「주차 업체」로 통합
  if (view === 'hq_partner_board') return 'master_settings';
  return view as AppView;
}

export default function AdminMode({
  currentView,
  setCurrentView,
  reservations,
  allReservations = [],
  onUpdateValetStatus,
  onEditReservation,
  companyInfo,
  onUpdateCompany,
  companies,
  onUpdateCompanies,
  partners,
  onUpdatePartners,
  isSuperAdmin = false,
  isEmployee = false,
  employeeRole = 'driver',
  currentCompanyId = 'airpick',
  blockedDates = [],
  onSaveBlockedDates,
  onToggleCompanyOpen,
  onRemoteOpenCompany,
  onOpenPartnerEditor,
}: AdminModeProps) {
  const adminView = resolveAdminView(currentView);
  const [reviewFocusCompanyId, setReviewFocusCompanyId] = useState<string | null>(null);
  const clearReviewFocus = useCallback(() => setReviewFocusCompanyId(null), []);

  const openCompanyReviews = useCallback(
    (companyId: string) => {
      const id = String(companyId || '').trim();
      if (!id) return;
      setReviewFocusCompanyId(id);
      setCurrentView('hq_reviews');
    },
    [setCurrentView]
  );

  const statisticsPanel = (
    <StatisticsView
      reservations={reservations}
      allReservations={allReservations}
      companies={companies}
      companyName={companyInfo.name}
      isSuperAdmin={isSuperAdmin}
      currentCompanyId={currentCompanyId}
      blockedDates={blockedDates}
      onSaveBlockedDates={onSaveBlockedDates}
      onEditReservation={onEditReservation}
    />
  );

  switch (adminView) {
    case 'statistics':
      return statisticsPanel;

    case 'cancelled_list':
      return (
        <CancelledListView
          reservations={reservations}
          onUpdateStatus={onUpdateValetStatus}
          onBack={() => setCurrentView('statistics')}
        />
      );

    case 'master_settings':
      if (isSuperAdmin) {
        return (
          <HqParkingPartnersView
            reservations={reservations}
            companies={companies}
            partners={partners}
            onUpdateCompanies={onUpdateCompanies}
            onUpdatePartners={onUpdatePartners}
            onToggleCompanyOpen={onToggleCompanyOpen}
            onRemoteOpenCompany={onRemoteOpenCompany}
            onOpenPartnerEditor={onOpenPartnerEditor}
            onOpenReviews={openCompanyReviews}
            onBack={() => setCurrentView('statistics')}
            initialTab="board"
          />
        );
      }
      return (
        <MasterSettingsView
          companyInfo={companyInfo}
          onUpdateCompany={onUpdateCompany}
          reservations={reservations}
          companies={companies}
          onUpdateCompanies={onUpdateCompanies}
          partners={partners}
          onUpdatePartners={onUpdatePartners}
          isSuperAdmin={isSuperAdmin}
          onBack={() => setCurrentView('statistics')}
          isEmployee={isEmployee}
          employeeRole={employeeRole}
        />
      );

    case 'dispatch_board':
      return (
        <DispatchBoardView
          reservations={reservations}
          companyName={companyInfo.name}
          companies={companies}
        />
      );

    case 'hq_reviews':
      return (
        <HqReviewsView
          companies={companies}
          initialCompanyId={reviewFocusCompanyId}
          onInitialCompanyConsumed={clearReviewFocus}
        />
      );

    case 'hq_customers':
      return (
        <HqCustomersView
          companies={companies}
          onOpenReservation={onEditReservation}
        />
      );

    case 'acquisition_funnel':
      if (!isSuperAdmin) return statisticsPanel;
      return (
        <AcquisitionFunnelView
          companies={companies}
          currentCompanyId={currentCompanyId}
          isSuperAdmin
        />
      );

    case 'affiliate_admin':
      if (!isSuperAdmin) return statisticsPanel;
      return (
        <AffiliateAdminView
          reservations={allReservations.length > 0 ? allReservations : reservations}
        />
      );

    default:
      return statisticsPanel;
  }
}
