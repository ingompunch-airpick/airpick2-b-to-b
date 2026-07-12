import React from 'react';
import { Reservation, AppView, CompanyInfo, Company, PartnerCompany } from '../types';
import StatisticsView from './StatisticsView';
import CancelledListView from './CancelledListView';
import MasterSettingsView from './MasterSettingsView';

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
  onSaveBlockedDates
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
      onUpdateValetStatus={onUpdateValetStatus}
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

    default:
      return statisticsPanel;
  }
}
