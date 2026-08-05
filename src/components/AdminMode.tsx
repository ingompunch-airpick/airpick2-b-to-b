import React from 'react';
import { Reservation, AppView, CompanyInfo, Company, PartnerCompany } from '../types';
import StatisticsView from './StatisticsView';
import CancelledListView from './CancelledListView';
import MasterSettingsView from './MasterSettingsView';
import DispatchBoardView from './DispatchBoardView';
import HqPartnerBoardView from './HqPartnerBoardView';
import HqReviewsView from './HqReviewsView';

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

  const statisticsPanel = (
    <StatisticsView
      reservations={reservations}
      allReservations={allReservations}
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

    case 'hq_partner_board':
      return (
        <HqPartnerBoardView
          companies={companies}
          onUpdateCompanies={onUpdateCompanies}
          onToggleCompanyOpen={async (companyId, isOpen) => {
            if (onToggleCompanyOpen) await onToggleCompanyOpen(companyId, isOpen);
          }}
          onRemoteOpen={(companyId) => onRemoteOpenCompany?.(companyId)}
          onOpenPartnerEditor={onOpenPartnerEditor}
        />
      );

    case 'hq_reviews':
      return <HqReviewsView companies={companies} />;

    default:
      return statisticsPanel;
  }
}
