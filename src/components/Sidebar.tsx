import React from 'react';
import { 
  X, 
  BarChart2, 
  CreditCard, 
  Camera, 
  History, 
  Calendar, 
  User, 
  Settings, 
  LogOut, 
  ShieldAlert,
  Moon,
  Coffee,
  CheckCircle,
  Play,
  TrendingUp,
  ClipboardList,
  FileX,
  Bell,
  BellOff,
} from 'lucide-react';
import { AppView } from '../types';
import { isAirpickHeadquarters } from '../constants/platform';
import {
  areReservationAlertsEnabled,
  requestReservationNotificationPermission,
  setReservationAlertsEnabled,
} from '../utils/reservationNotifications';

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
  companyInfo
}: SidebarProps) {
  const [alertsEnabled, setAlertsEnabled] = React.useState(() => areReservationAlertsEnabled());

  const toggleAlerts = async () => {
    const next = !alertsEnabled;
    if (next && typeof Notification !== 'undefined' && Notification.permission === 'default') {
      await requestReservationNotificationPermission();
    }
    setReservationAlertsEnabled(next);
    setAlertsEnabled(next);
  };

  if (!isOpen) return null;

  const safeCompanyInfo = {
    name: isAirpickHeadquarters(currentCompanyId) ? '에어픽' : (companyInfo?.name || '와와'),
    region: isAirpickHeadquarters(currentCompanyId) ? '플랫폼 본사' : (companyInfo?.region || '인천공항 1터미널'),
    phone: companyInfo?.phone || '1545-5746',
    logo: isAirpickHeadquarters(currentCompanyId) ? '' : (companyInfo?.logo || '')
  };

  const menuItems = isAirpickHeadquarters(currentCompanyId)
    ? [
        { id: 'admin_statistics', label: '① 대시보드 (통계)', icon: TrendingUp, view: 'statistics' as AppView },
        { id: 'admin_master_settings', label: '② 제휴업체 관리', icon: Settings, view: 'master_settings' as AppView }
      ]
    : isAdminModeActive
    ? [
        { id: 'admin_statistics', label: '① 대시보드', icon: TrendingUp, view: 'statistics' as AppView },
        { id: 'admin_master_settings', label: '② 업체 정보 설정', icon: Settings, view: 'master_settings' as AppView }
      ]
    : [
        { id: 'service_history', label: '① 나의 서비스 기록', icon: History, view: 'service_history' as AppView },
        { id: 'payment_change', label: '② 결제 변경', icon: CreditCard, view: 'payment_change' as AppView },
        { id: 'scratch_images', label: '③ 차량 사진', icon: Camera, view: 'scratch_images' as AppView },
        { id: 'parking_departure', label: '④ 주차장별 현황', icon: Calendar, view: 'parking_departure' as AppView },
        { id: 'cancelled_list', label: '⑤ 접수취소 내역', icon: FileX, view: 'cancelled_list' as AppView },
      ];

  return (
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
            <div className="flex items-center gap-3">
              {safeCompanyInfo.logo ? (
                <div className="w-10 h-10 rounded-2xl overflow-hidden border border-neutral-850 shrink-0">
                  <img src={safeCompanyInfo.logo} alt="로고" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                </div>
              ) : (
                <div className="bg-amber-500 text-neutral-950 p-2.5 rounded-2xl font-bold text-sm w-10 h-10 flex items-center justify-center shrink-0 select-none">
                  {safeCompanyInfo.name.substring(0, 2)}
                </div>
              )}
              <div>
                <h3 className="font-bold text-sm tracking-tight text-white flex items-center gap-1.5">
                  {isAirpickHeadquarters(currentCompanyId) ? '에어픽 본사' : (isSuperAdmin ? '김인원' : (isEmployee ? (employeeRole === 'admin' ? `${employeeName} 부관리자` : `${employeeName} 기사`) : `${safeCompanyInfo.name} 관리자`))} 
                  <span className="text-[12px] text-amber-500 font-bold bg-amber-500/10 px-1.5 py-0.5 rounded font-sans shrink-0">
                    {isAirpickHeadquarters(currentCompanyId) ? '본사' : (isAdminModeActive ? '관리자' : (isEmployee ? (employeeRole === 'admin' ? '부관리자' : '직원기사') : '기사'))}
                  </span>
                </h3>
                {!isAirpickHeadquarters(currentCompanyId) && (
                  <p className="text-[12px] text-zinc-400 font-mono mt-0.5 truncate max-w-[150px]">
                    {isAdminModeActive ? (isSuperAdmin ? '최고 관리자 계정' : (isEmployee && employeeRole === 'admin' ? `소속 부관리자: ${employeeName}` : `${safeCompanyInfo.name} 관리자 계정`)) : (isEmployee ? (employeeRole === 'admin' ? `소속 부관리자: ${employeeName}` : `소속 직원: ${employeeName}`) : (isAnonymous ? `익명 ${safeCompanyInfo.name.substring(0, 2)} 기사` : userEmail))}
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

          <div className="flex items-center justify-between p-2.5 bg-neutral-900 rounded-xl border border-neutral-800 text-xs">
            <span className="text-zinc-400 font-medium">단말기 ID</span>
            <span className="font-mono font-bold text-white uppercase text-[13px] tracking-wider">
              {isSuperAdmin ? 'airpick' : (currentCompanyId || companyInfo?.id || 'wawa')}
            </span>
          </div>
        </div>

        {/* Navigation Grid of Buttons */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 no-scrollbar">
          <p className="text-[12px] text-zinc-500 font-bold tracking-widest uppercase px-2 mb-2">
            {isAdminModeActive ? `${safeCompanyInfo.name} 관리자 메뉴` : `${safeCompanyInfo.name} 업무 메뉴`}
          </p>
          
          <div className="grid grid-cols-1 gap-2.5">
            {menuItems.map((item) => {
              const Icon = item.icon;
              const isActive = currentView === item.view;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    if (item.id === 'admin_master_settings' && isAirpickHeadquarters(currentCompanyId)) {
                      if (onOpenAdmin) onOpenAdmin();
                    } else {
                      onNavigate(item.view);
                    }
                    onClose();
                  }}
                  className={`w-full text-left p-3.5 rounded-2xl flex items-center justify-between transition-all group ${
                    isActive 
                      ? 'bg-amber-500 text-neutral-950 shadow-md shadow-amber-500/10' 
                      : 'bg-neutral-800 hover:bg-neutral-800/80 text-zinc-300 hover:text-white border border-neutral-800'
                  }`}
                >
                  <div className="flex items-center gap-3.5">
                    <div className={`p-2.5 rounded-xl transition-colors ${
                      isActive ? 'bg-neutral-950 text-amber-500' : 'bg-neutral-900 text-zinc-400 group-hover:text-amber-500'
                    }`}>
                      <Icon size={18} />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold tracking-tight">{item.label}</h4>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Admin portal (Toggled modal) */}
          {!isAirpickHeadquarters(currentCompanyId) && !isSuperAdmin && !isAdmin && !isEmployee && (
            <div className="pt-4 mt-4 border-t border-neutral-800/80 space-y-2">
              <p className="text-[12px] text-zinc-500 font-bold tracking-widest uppercase px-2">시스템 권한 관리</p>
              
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
            onClick={toggleAlerts}
            className={`w-full mb-3 py-2.5 px-3 rounded-xl border text-left flex items-center gap-2 transition-all ${
              alertsEnabled
                ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                : 'bg-neutral-900 border-neutral-800 text-zinc-500'
            }`}
          >
            {alertsEnabled ? <Bell size={16} /> : <BellOff size={16} />}
            <div>
              <span className="text-xs font-black block">신규 예약 알림</span>
              <span className="text-[10px] opacity-80">{alertsEnabled ? '켜짐 · 소리+푸시' : '꺼짐'}</span>
            </div>
          </button>

          <div className="flex gap-2">
            <button
              onClick={() => {
                onNavigate(isAirpickHeadquarters(currentCompanyId) ? 'statistics' : (isAdminModeActive ? 'statistics' : 'timeline'));
                onClose();
              }}
              className="flex-1 py-2.5 bg-zinc-800 text-white hover:bg-zinc-700/80 text-[13px] font-bold rounded-lg transition-all"
            >
              메인화면 이동
            </button>
            
            <button
              onClick={() => {
                onLogout();
                onClose();
              }}
              className="px-5.5 py-3.5 bg-red-650 hover:bg-red-650 text-white font-black rounded-lg border border-red-500 shadow-md shadow-red-900/10 flex items-center justify-center gap-1.5 transition-all text-xs outline-none hover:scale-[1.02]"
              title="로그아웃"
            >
              <LogOut size={14} className="stroke-[2.5]" />
              <span>로그아웃</span>
            </button>
          </div>

          <p className="text-[11px] text-zinc-650 font-mono text-center mt-3">
            에어픽 v2.2.0
          </p>
        </div>

      </div>
    </div>
  );
}
