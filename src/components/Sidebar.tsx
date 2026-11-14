import React from 'react';
import {
  X,
  Camera,
  History,
  Calendar,
  Settings,
  LogOut,
  ShieldAlert,
  TrendingUp,
  FileX,
  ClipboardList,
  ListFilter,
  Bell,
  BellOff,
  Building2,
  MessageSquareWarning,
  UserRoundSearch,
  UserPlus,
  ChevronRight,
  Inbox,
} from 'lucide-react';
import { AppView } from '../types';
import { isAirpickHeadquarters } from '../constants/platform';
import { airportRegionLabel } from '../utils/airport';
import {
  areReservationAlertsEnabled,
  setRuntimeReservationAlertCopy,
} from '../utils/reservationNotifications';
import ReservationAlertSettingsModal from './ReservationAlertSettingsModal';
import { fetchReservationAlertCopy } from '../lib/reservationAlertCopyFirestore';
import { subscribeNewPartnerApplicationCount } from '../lib/partnerApplicationsFirestore';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  currentView: AppView;
  onNavigate: (view: AppView) => void;
  userEmail: string | null | undefined;
  isAnonymous: boolean | undefined;
  isAdmin: boolean;
  isSuperAdmin?: boolean;
  onOpenAdmin: () => void;
  onLogout: () => void;
  onTriggerLogin: () => void;
  isAdminModeActive: boolean;
  isEmployee?: boolean;
  employeeName?: string;
  employeeRole?: 'admin' | 'driver';
  currentCompanyId?: string;
  operatorCompanyIds?: string[];
  companyInfo?: {
    id?: string;
    name: string;
    region: string;
    phone: string;
    logo: string;
  };
}

export default function Sidebar({
  isOpen,
  onClose,
  currentView,
  onNavigate,
  userEmail,
  isAnonymous,
  isAdmin,
  isSuperAdmin = false,
  onOpenAdmin,
  onLogout,
  onTriggerLogin,
  isAdminModeActive,
  isEmployee = false,
  employeeName = '',
  employeeRole = 'driver',
  currentCompanyId,
  operatorCompanyIds = [],
  companyInfo
}: SidebarProps) {
  const [alertsEnabled, setAlertsEnabled] = React.useState(() => areReservationAlertsEnabled());
  const [alertSettingsOpen, setAlertSettingsOpen] = React.useState(false);

  const isHq = isAirpickHeadquarters(currentCompanyId);
  const [newApplications, setNewApplications] = React.useState(0);
  React.useEffect(() => {
    if (!isOpen || !isHq || !isSuperAdmin) return;
    return subscribeNewPartnerApplicationCount(setNewApplications);
  }, [isOpen, isHq, isSuperAdmin]);

  React.useEffect(() => {
    if (!isOpen) return;
    void fetchReservationAlertCopy()
      .then((copy) => setRuntimeReservationAlertCopy(copy))
      .catch(() => undefined);
  }, [isOpen]);

  if (!isOpen && !alertSettingsOpen) return null;

  const safeCompanyInfo = {
    name: isAirpickHeadquarters(currentCompanyId) ? '에어픽' : (companyInfo?.name || '업체'),
    region: isAirpickHeadquarters(currentCompanyId) ? '플랫폼 본사' : (companyInfo?.region || airportRegionLabel()),
    phone: companyInfo?.phone || '1545-5746',
    logo: isAirpickHeadquarters(currentCompanyId) ? '' : (companyInfo?.logo || '')
  };

  type MenuItem = { id: string; label: string; icon: typeof TrendingUp; view: AppView; badge?: number };
  type MenuGroup = { title: string; items: MenuItem[] };
  // 2026-11-14: 번호(①②) 없이 묶음 + 한 줄 목록. 계획 docs/work/hq-app-refresh-plan.md
  const menuGroups: MenuGroup[] = isHq
    ? [
        {
          title: '운영',
          items: [
            { id: 'admin_statistics', label: '대시보드', icon: TrendingUp, view: 'statistics' },
            { id: 'admin_master_settings', label: '주차 업체', icon: Building2, view: 'master_settings' },
            {
              id: 'admin_partner_applications',
              label: '입점 신청',
              icon: Inbox,
              view: 'hq_partner_applications',
              badge: newApplications,
            },
          ],
        },
        {
          title: '고객',
          items: [
            { id: 'admin_reviews', label: '후기 관리', icon: MessageSquareWarning, view: 'hq_reviews' },
            { id: 'admin_customers', label: '고객 조회', icon: UserRoundSearch, view: 'hq_customers' },
            { id: 'admin_affiliate', label: '마케팅 제휴', icon: UserPlus, view: 'affiliate_admin' },
          ],
        },
      ]
    : isAdminModeActive
    ? [
        {
          title: '관리',
          items: [
            { id: 'admin_statistics', label: '대시보드', icon: TrendingUp, view: 'statistics' },
            { id: 'admin_dispatch_board', label: '입출차 배차표', icon: ClipboardList, view: 'dispatch_board' },
            { id: 'admin_reservation_ledger', label: '예약 목록', icon: ListFilter, view: 'reservation_ledger' },
            { id: 'admin_master_settings', label: '업체 정보 설정', icon: Settings, view: 'master_settings' },
          ],
        },
      ]
    : [
        {
          title: '업무',
          items: [
            { id: 'service_history', label: '나의 서비스 기록', icon: History, view: 'service_history' },
            { id: 'scratch_images', label: '차량 사진', icon: Camera, view: 'scratch_images' },
            { id: 'parking_departure', label: '주차장별 현황', icon: Calendar, view: 'parking_departure' },
            { id: 'cancelled_list', label: '취소·무효 내역', icon: FileX, view: 'cancelled_list' },
          ],
        },
      ];

  return (
    <>
    {isOpen ? (
    <div className="fixed inset-0 z-[100] flex">
      {/* Backdrop */}
      <div 
        onClick={onClose}
        className="absolute inset-0 bg-black/80 backdrop-blur-xs transition-opacity duration-300"
      />

      {/* Drawer content */}
      <div className="relative flex flex-col w-full max-w-xs h-full bg-neutral-900 border-r border-neutral-800 text-white shadow-2xl z-10">
        
        {/* Header section with driver card */}
        <div className="p-6 border-b border-neutral-800 bg-neutral-950/60">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3 min-w-0">
              {!isAirpickHeadquarters(currentCompanyId) ? (
                safeCompanyInfo.logo ? (
                  <div className="w-10 h-10 rounded-2xl overflow-hidden border border-neutral-850 shrink-0">
                    <img src={safeCompanyInfo.logo} alt="로고" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                  </div>
                ) : (
                  <div className="bg-amber-500 text-neutral-950 p-2.5 rounded-2xl font-bold text-sm w-10 h-10 flex items-center justify-center shrink-0 select-none">
                    {safeCompanyInfo.name.substring(0, 2)}
                  </div>
                )
              ) : null}
              <div className="min-w-0">
                <h3 className="font-bold text-sm tracking-tight text-white flex items-center gap-1.5">
                  {isAirpickHeadquarters(currentCompanyId)
                    ? '에어픽 본사'
                    : isSuperAdmin
                      ? `${safeCompanyInfo.name}`
                      : isEmployee
                        ? (employeeRole === 'admin' ? `${employeeName} 부관리자` : `${employeeName} 기사`)
                        : `${safeCompanyInfo.name} 관리자`}
                  <span className="text-[12px] text-amber-500 font-bold bg-amber-500/10 px-1.5 py-0.5 rounded font-sans shrink-0">
                    {isAirpickHeadquarters(currentCompanyId)
                      ? '본사'
                      : isSuperAdmin
                        ? '원격'
                        : isAdminModeActive
                          ? '관리자'
                          : isEmployee
                            ? (employeeRole === 'admin' ? '부관리자' : '직원기사')
                            : '기사'}
                  </span>
                </h3>
                {!isAirpickHeadquarters(currentCompanyId) && (
                  <p className="text-[12px] text-zinc-400 font-mono mt-0.5 truncate max-w-[150px]">
                    {isSuperAdmin
                      ? `본사 원격 · ${currentCompanyId || companyInfo?.id || '—'}`
                      : isAdminModeActive
                        ? isEmployee && employeeRole === 'admin'
                          ? `소속 부관리자: ${employeeName}`
                          : `${safeCompanyInfo.name} 관리자 계정`
                        : isEmployee
                          ? employeeRole === 'admin'
                            ? `소속 부관리자: ${employeeName}`
                            : `소속 직원: ${employeeName}`
                          : isAnonymous
                            ? `익명 ${safeCompanyInfo.name.substring(0, 2)} 기사`
                            : userEmail}
                  </p>
                )}
              </div>
            </div>
            <button 
              onClick={onClose}
              className="p-1.5 hover:bg-neutral-800 rounded-xl text-neutral-400 hover:text-white transition-all"
            >
              <X size={18} />
            </button>
          </div>

          <p className="text-[11px] text-zinc-500 font-semibold">
            단말기 <span className="font-mono font-bold text-zinc-300 uppercase">{currentCompanyId || companyInfo?.id || '—'}</span>
          </p>
        </div>

        {/* 메뉴 — 묶음별 한 줄 목록 */}
        <div className="flex-1 overflow-y-auto px-3 py-4 space-y-5 no-scrollbar">
          {menuGroups.map((group) => (
            <div key={group.title}>
              <p className="px-3 mb-1.5 text-[11px] font-black text-zinc-500">{group.title}</p>
              <div className="space-y-1.5">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const isActive = currentView === item.view;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        onNavigate(item.view);
                        onClose();
                      }}
                      className={`w-full min-h-[56px] flex items-center gap-3.5 px-4 py-3.5 rounded-2xl text-left transition-colors active:scale-[0.99] ${
                        isActive
                          ? 'bg-amber-500 text-neutral-950'
                          : 'text-zinc-200 hover:bg-neutral-800'
                      }`}
                    >
                      <Icon size={21} className={isActive ? 'text-neutral-950' : 'text-zinc-500'} />
                      <span className="flex-1 text-[16px] font-bold tracking-tight">{item.label}</span>
                      {item.badge ? (
                        <span className="min-w-5 px-1.5 py-0.5 rounded-full bg-red-500 text-white text-[11px] font-black text-center">
                          {item.badge}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          {/* Admin portal (Toggled modal) */}
          {!isAirpickHeadquarters(currentCompanyId) && !isSuperAdmin && !isAdmin && !isEmployee && (
            <div className="pt-4 mt-4 border-t border-neutral-800/80 space-y-2">
              <p className="text-[12px] text-zinc-500 font-bold tracking-widest px-2">관리자 로그인</p>
              
              <button
                onClick={() => {
                  onTriggerLogin();
                  onClose();
                }}
                className="w-full text-left p-3.5 rounded-2xl bg-neutral-850 hover:bg-neutral-800 text-neutral-400 border border-neutral-850 flex items-center gap-3 transition-all"
              >
                <ShieldAlert size={18} className="text-neutral-500" />
                <div>
                  <h4 className="text-xs font-bold">관리자 계정 전환</h4>
                  <p className="text-[12px] text-zinc-500 mt-0.5">최고 권한 활성화 자격증 보증</p>
                </div>
              </button>
            </div>
          )}
        </div>

        {/* Footer with logout and navigation */}
        <div className="p-4 bg-neutral-950/80 border-t border-neutral-800">
          <button
            type="button"
            onClick={() => setAlertSettingsOpen(true)}
            className={`w-full mb-3 py-2.5 px-3 rounded-xl border text-left flex items-center gap-2 transition-all ${
              isAirpickHeadquarters(currentCompanyId)
                ? 'bg-neutral-900 border-neutral-800 text-zinc-300'
                : alertsEnabled
                  ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                  : 'bg-neutral-900 border-neutral-800 text-zinc-500'
            }`}
          >
            {isAirpickHeadquarters(currentCompanyId) || alertsEnabled ? (
              <Bell size={16} />
            ) : (
              <BellOff size={16} />
            )}
            <div className="flex-1">
              <span className="text-xs font-black block">
                {isAirpickHeadquarters(currentCompanyId) ? '알림 문구' : '알림'}
              </span>
              <span className="text-[10px] opacity-80">
                {isAirpickHeadquarters(currentCompanyId)
                  ? '예약 · 출고 읽어 주는 말'
                  : alertsEnabled
                    ? '예약 · 출고 · 켜짐'
                    : '예약 · 출고 · 꺼짐'}
              </span>
            </div>
            <ChevronRight size={14} className="opacity-60" />
          </button>

          <div className="flex gap-2">
            {!isHq && !isAdminModeActive ? (
              <button
                type="button"
                onClick={() => {
                  onNavigate('timeline');
                  onClose();
                }}
                className="flex-1 min-h-[52px] py-3 bg-zinc-800 text-white hover:bg-zinc-700/80 text-[14px] font-bold rounded-xl transition-all"
              >
                타임라인으로
              </button>
            ) : null}
            <button
              onClick={() => {
                onLogout();
                onClose();
              }}
              className="flex-1 min-h-[52px] py-3 rounded-xl border border-red-500/60 text-red-300 hover:bg-red-500/10 font-black flex items-center justify-center gap-1.5 transition-all text-[14px] outline-none"
              title="로그아웃"
            >
              <LogOut size={14} className="stroke-[2.5]" />
              <span>로그아웃</span>
            </button>
          </div>

          <p className="text-[11px] text-zinc-650 font-mono text-center mt-3">
            에어픽 1.0.8
          </p>
        </div>

      </div>
    </div>
    ) : null}

    <ReservationAlertSettingsModal
      open={alertSettingsOpen}
      onClose={() => setAlertSettingsOpen(false)}
      currentCompanyId={currentCompanyId || ''}
      operatorCompanyIds={operatorCompanyIds}
      canEdit={isSuperAdmin || isAirpickHeadquarters(currentCompanyId)}
      enabled={alertsEnabled}
      onEnabledChange={setAlertsEnabled}
    />
    </>
  );
}
