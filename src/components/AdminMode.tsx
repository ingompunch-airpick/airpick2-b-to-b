import React from 'react';
import { Reservation, AppView, CompanyInfo, Company, PartnerCompany } from '../types';
import { Lock } from 'lucide-react';
import StatisticsView from './StatisticsView';
import ParkingRegisterView from './ParkingRegisterView';
import CancelledListView from './CancelledListView';
import MasterSettingsView from './MasterSettingsView';

interface AdminModeProps {
  currentView: AppView;
  setCurrentView: (view: AppView) => void;
  reservations: Reservation[];
  allReservations?: Reservation[];
  onUpdateValetStatus: (resId: string, nextStatus: any) => void;
  companyInfo: CompanyInfo;
  onUpdateCompany: (info: CompanyInfo) => void;
  companies: Company[];
  onUpdateCompanies: (updated: Company[]) => void;
  partners: PartnerCompany[];
  onUpdatePartners: (updated: PartnerCompany[]) => void;
  isSuperAdmin?: boolean;
  isEmployee?: boolean;
  employeeRole?: 'admin' | 'driver';
  
  // Real-time globally synced states & controls for the HQ dashboard
  currentCompanyId?: string;
  onCompanySwitch?: (id: string) => void;
  blockedDates?: string[];
  onSaveBlockedDates?: (dates: string[]) => void;
}

export default function AdminMode({
  currentView,
  setCurrentView,
  reservations,
  allReservations = [],
  onUpdateValetStatus,
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
  onCompanySwitch,
  blockedDates = [],
  onSaveBlockedDates
}: AdminModeProps) {
  // Render sub-views dynamically based on the current active admin view
  switch (currentView) {
    case 'statistics':
    case 'parkingRegister':
      return (
        <StatisticsView 
          reservations={reservations} 
          allReservations={allReservations}
          companyName={companyInfo.name} 
          isSuperAdmin={isSuperAdmin}
          companies={companies}
          partners={partners}
          onCompanySwitch={onCompanySwitch}
          currentCompanyId={currentCompanyId}
          blockedDates={blockedDates}
          onSaveBlockedDates={onSaveBlockedDates}
          setCurrentView={setCurrentView}
          onUpdateValetStatus={onUpdateValetStatus}
        />
      );

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
      return <StatisticsView reservations={reservations} companyName={companyInfo.name} onUpdateValetStatus={onUpdateValetStatus} />;
  }
}
