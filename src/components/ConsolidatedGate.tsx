import React, { useState, useEffect } from 'react';
import { Lock, Shuffle, AlertCircle, Sparkles, Building2, Eye, EyeOff } from 'lucide-react';
import { PartnerCompany, Company, CompanyInfo } from '../types';
import { AIRPICK_HQ_ID } from '../constants/platform';

interface ConsolidatedGateProps {
  onLoginSuccess: (roles: {
    isSuperAdmin: boolean;
    isLocalAdmin: boolean;
    isMasterAdmin: boolean;
    isAdminModeActive: boolean;
    companyId: string;
    companyInfo: CompanyInfo;
    isEmployee?: boolean;
    employeeName?: string;
    employeeRole?: 'admin' | 'driver';
  }) => void;
  partners: PartnerCompany[];
  companies: Company[];
}

export default function ConsolidatedGate({ onLoginSuccess, partners, companies }: ConsolidatedGateProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [rememberId, setRememberId] = useState(false);

  useEffect(() => {
    const savedId = localStorage.getItem('saved_id');
    if (savedId) {
      setUsername(savedId);
      setRememberId(true);
    }
  }, []);

  const handleLoginSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const cleanUsername = username.trim().toLowerCase();
    const cleanPassword = password.trim();

    if (!cleanUsername) {
      setError('아이디를 입력해주세요.');
      return;
    }
    if (!cleanPassword) {
      setError('비밀번호를 입력해주세요.');
      return;
    }

    if (rememberId) {
      localStorage.setItem('saved_id', cleanUsername);
    } else {
      localStorage.removeItem('saved_id');
    }

    // 0. 하드코딩 예외 처리 100% 강제 적용 ('wawa' / 'wawa')
    if (cleanUsername === 'wawa' && cleanPassword === 'wawa') {
      const wawaCompany: CompanyInfo = {
        id: 'wawa',
        name: '와와',
        region: '인천공항 전역',
        phone: '1545-5746',
        logo: 'https://images.unsplash.com/photo-1545179605-1296651e9d43?q=80&w=200&auto=format&fit=crop',
        isIndoor: true,
        facilityType: 'mixed',
        ratePolicy: ''
      };

      onLoginSuccess({
        isSuperAdmin: false,
        isLocalAdmin: true,
        isMasterAdmin: true,
        isAdminModeActive: false,
        companyId: 'wawa',
        companyInfo: wawaCompany
      });
      alert("🎉 [와와] 로그인 성공! 전용 주차/기사 관리 터미널이 열립니다.");
      return;
    }

    // 1. 최고 관리자 계정 로그인 확인
    if (cleanUsername === 'airpick' && cleanPassword === '9980') {
      const superAdminCompany: CompanyInfo = {
        id: AIRPICK_HQ_ID,
        name: '에어픽',
        region: '플랫폼 본사',
        phone: '1545-5746',
        logo: '',
        isIndoor: true,
        facilityType: 'mixed',
        ratePolicy: ''
      };
      
      onLoginSuccess({
        isSuperAdmin: true,
        isLocalAdmin: true,
        isMasterAdmin: false,
        isAdminModeActive: true,
        companyId: AIRPICK_HQ_ID,
        companyInfo: superAdminCompany
      });
      alert("🎉 최고관리자 'airpick' 님 통합 마스터 채널 로그인이 완료되었습니다!");
      return;
    }

    // 2. 제휴 업체 계정 로그인 확인 (super_partners_list 대조 - 실시간 반영력 극대화를 위해 localStorage 직접 참조)
    let dynamicPartners = [...partners];
    const savedPartnersStr = localStorage.getItem('super_partners_list');
    if (savedPartnersStr) {
      try {
        const parsed = JSON.parse(savedPartnersStr);
        if (parsed && Array.isArray(parsed) && parsed.length > 0) {
          dynamicPartners = parsed;
        }
      } catch (_) {}
    }

    // 2-1. 소속 직원(Employee) 로그인 검사
    let matchedEmployee: any = null;
    let employeeParentPartner: any = null;

    for (const p of dynamicPartners) {
      if (p.employees && Array.isArray(p.employees)) {
        const foundEmp = p.employees.find(emp => emp.loginId.toLowerCase() === cleanUsername);
        if (foundEmp) {
          matchedEmployee = foundEmp;
          employeeParentPartner = p;
          break;
        }
      }
    }

    if (matchedEmployee && employeeParentPartner) {
      if (cleanPassword !== matchedEmployee.password) {
        setError('보안 비밀번호가 일치하지 않습니다.');
        return;
      }

      if (employeeParentPartner.status === 'suspended') {
        setError('본사 사정에 의해 소속 제휴사의 서비스가 일시 정지(suspended)된 상태입니다.');
        return;
      }

      // Load companies directly from localStorage to guarantee real-time updates
      let dbCompanies = [...companies];
      const savedCompaniesStr = localStorage.getItem('companies');
      if (savedCompaniesStr) {
        try {
          const parsed = JSON.parse(savedCompaniesStr);
          if (parsed && Array.isArray(parsed) && parsed.length > 0) {
            dbCompanies = parsed;
          }
        } catch (_) {}
      }

      const matchingCompany = dbCompanies.find(c => c.id === employeeParentPartner!.companyId);
      const isIndoor = matchingCompany ? matchingCompany.is_indoor : true;

      const brandInfo: CompanyInfo = {
        id: employeeParentPartner.companyId,
        name: employeeParentPartner.name,
        region: matchingCompany ? (matchingCompany.supports_indoor && matchingCompany.supports_outdoor ? '실내+실외 혼합' : matchingCompany.supports_indoor ? '실내' : '실외') : '실내',
        phone: employeeParentPartner.phone || '010-0000-0000',
        logo: matchingCompany?.image_url || '',
        isIndoor: isIndoor,
        facilityType: isIndoor ? 'indoor' : 'outdoor',
        ratePolicy: ''
      };

      const isEmpAdmin = matchedEmployee.role === 'admin';

      onLoginSuccess({
        isSuperAdmin: false,
        isLocalAdmin: isEmpAdmin,       // 부관리자 직원(admin)이면 true
        isMasterAdmin: isEmpAdmin,      // 부관리자 직원(admin)이면 true
        isAdminModeActive: isEmpAdmin,   // 부관리자 직원(admin)이면 관리자 대시보드로 초기 진입
        companyId: employeeParentPartner.companyId,
        companyInfo: brandInfo,
        isEmployee: true,
        employeeName: matchedEmployee.name,
        employeeRole: matchedEmployee.role || 'driver'
      });

      alert(isEmpAdmin 
        ? `🎉 소속 관리자 [${matchedEmployee.name}] 님 로그인 성공! [${employeeParentPartner.name}] 대시보드 관리자 모드로 진입합니다.`
        : `🎉 소속 직원 [${matchedEmployee.name}] 기사님 로그인 성공! [${employeeParentPartner.name}] 대시보드 기사 모드 전용으로 진입합니다.`);
      return;
    }

    const matchedPartner = dynamicPartners.find(
      p => p.companyId.toLowerCase() === cleanUsername || p.name.toLowerCase() === username.trim().toLowerCase()
    );

    if (matchedPartner) {
      if (cleanPassword !== matchedPartner.password) {
        setError('보안 비밀번호가 일치하지 않습니다.');
        return;
      }

      if (matchedPartner.status === 'suspended') {
        setError('해당 제휴업체 계정은 최고관리자에 의해 [정지] 처리되었습니다.');
        return;
      }

      // Load companies directly from localStorage to guarantee real-time updates
      let dbCompanies = [...companies];
      const savedCompaniesStr = localStorage.getItem('companies');
      if (savedCompaniesStr) {
        try {
          const parsed = JSON.parse(savedCompaniesStr);
          if (parsed && Array.isArray(parsed) && parsed.length > 0) {
            dbCompanies = parsed;
          }
        } catch (_) {}
      }

      const matchingCompany = dbCompanies.find(c => c.id === matchedPartner.companyId);
      const isIndoor = matchingCompany ? matchingCompany.is_indoor : true;

      const brandInfo: CompanyInfo = {
        id: matchedPartner.companyId,
        name: matchedPartner.name,
        region: matchingCompany ? (matchingCompany.supports_indoor && matchingCompany.supports_outdoor ? '실내+실외 혼합' : matchingCompany.supports_indoor ? '실내' : '실외') : '실내',
        phone: matchedPartner.phone || '010-0000-0000',
        logo: matchingCompany?.image_url || '',
        isIndoor: isIndoor,
        facilityType: isIndoor ? 'indoor' : 'outdoor',
        ratePolicy: ''
      };

      onLoginSuccess({
        isSuperAdmin: false,
        isLocalAdmin: true,
        isMasterAdmin: true,
        isAdminModeActive: true,
        companyId: matchedPartner.companyId,
        companyInfo: brandInfo
      });
      alert(`🎉 B2B 제휴업체 [${matchedPartner.name}] 로그인 성공! 전용 주차/기사 관리 터미널이 열립니다.`);
      return;
    }

    // 3. Fallback: Companies 배열 매칭 (예: ID "a123" 대조)
    let dbCompaniesFallback = [...companies];
    const savedCompStr = localStorage.getItem('companies');
    if (savedCompStr) {
      try {
        const parsed = JSON.parse(savedCompStr);
        if (parsed && Array.isArray(parsed) && parsed.length > 0) {
          dbCompaniesFallback = parsed;
        }
      } catch (_) {}
    }

    // Ensure essential companies are always in the fallback login lists for direct testability
    const essentialCompanySeeds = [
      { id: 'wawa', name: '와와', supports_indoor: true, supports_outdoor: true, is_indoor: true, phone: '1545-5746', image_url: '' }
    ];

    essentialCompanySeeds.forEach(seed => {
      if (!dbCompaniesFallback.some(c => c.id.toLowerCase() === seed.id.toLowerCase())) {
        dbCompaniesFallback.push(seed as any);
      }
    });

    const matchedCompanyInList = dbCompaniesFallback.find(
      c => c.id.toLowerCase() === cleanUsername || c.name.toLowerCase() === username.trim().toLowerCase()
    );

    if (matchedCompanyInList) {
      // For fallback user accounts, require a default password (the id itself) or standard testing master password
      const expectedPassword = matchedCompanyInList.id.toLowerCase(); // e.g. kakao, care, gayu
      if (cleanPassword === expectedPassword || cleanPassword === 'admin1234' || cleanPassword === 'master1234') {
        const brandInfo: CompanyInfo = {
          id: matchedCompanyInList.id,
          name: matchedCompanyInList.name,
          region: matchedCompanyInList.supports_indoor && matchedCompanyInList.supports_outdoor ? '실내+실외' : matchedCompanyInList.supports_indoor ? '실내' : '실외',
          phone: matchedCompanyInList.phone || '1545-5746',
          logo: matchedCompanyInList.image_url || '',
          isIndoor: matchedCompanyInList.is_indoor ?? true,
          facilityType: matchedCompanyInList.is_indoor ? 'indoor' : 'outdoor',
          ratePolicy: ''
        };

        onLoginSuccess({
          isSuperAdmin: false,
          isLocalAdmin: true,
          isMasterAdmin: true,
          isAdminModeActive: true,
          companyId: matchedCompanyInList.id,
          companyInfo: brandInfo
        });
        alert(`🎉 제휴업체 [${matchedCompanyInList.name}]의 B2B 파트너 채널 로그인이 완료되었습니다.`);
        return;
      }
    }

    setError('일치하는 통합 B2B 계정이 없거나 비밀번호가 다릅니다.');
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-[#09090B] p-4 text-neutral-100 select-none overflow-y-auto">
      {/* Aesthetic ambient lighting bubbles */}
      <div className="absolute top-20 left-10 w-72 h-72 bg-amber-500/5 rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute bottom-20 right-10 w-72 h-72 bg-emerald-500/5 rounded-full blur-[100px] pointer-events-none" />

      <div className="w-full max-w-sm font-sans">
        {/* Top visual brand header */}
        <div className="text-center mb-8">
          <h2 className="text-toss-display flex items-center justify-center gap-2">
            airpick Check-in <span className="text-toss-caption text-amber-400 font-semibold bg-amber-500/15 border border-amber-500/20 px-2 py-0.5 rounded-lg">Gate</span>
          </h2>
        </div>

        {/* Central Credential Card Container */}
        <div className="bg-[#121214] border border-[#1C1C1F]/90 rounded-[28px] shadow-2xl p-6.5 relative overflow-hidden">
          <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-amber-500/40 via-amber-500 to-amber-500/40" />

          <form onSubmit={handleLoginSubmit} className="space-y-4 pt-4">
            {error && (
              <div className="p-3 bg-red-950/20 text-red-400 text-[10px] rounded-xl border border-red-900/35 flex items-center gap-2 font-sans animate-shake">
                <AlertCircle size={13} className="shrink-0 text-red-500" />
                <span className="font-medium leading-normal">{error}</span>
              </div>
            )}

            {/* ID Input */}
            <div className="space-y-1.5">
              <label htmlFor="gate-username" className="text-toss-caption block">
                아이디 (ID / 브랜드아이디)
              </label>
              <div className="relative">
                <input
                  id="gate-username"
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="아이디를 기입해주세요."
                  className="w-full bg-[#1C1C1E] border border-neutral-800 rounded-xl pl-3.5 pr-10 py-3 text-toss-body text-white placeholder:text-[var(--color-toss-fg-subtle)] outline-none focus:border-amber-500/90 transition-all font-medium"
                />
              </div>
            </div>

            {/* Password Input */}
            <div className="space-y-1.5">
              <label htmlFor="gate-password" className="text-toss-caption block">
                보안 비밀번호 (Password)
              </label>
              <div className="relative">
                <input
                  id="gate-password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="보안 암호를 바르게 기입해 주십시오"
                  className="w-full bg-[#1C1C1E] border border-neutral-800 rounded-xl pl-3.5 pr-10 py-3 text-toss-body text-white placeholder:text-[var(--color-toss-fg-subtle)] outline-none focus:border-amber-500/90 transition-all tabular-nums"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white transition-all focus:outline-none"
                >
                  {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>

            {/* Remember ID Checkbox */}
            <div className="flex items-center justify-between pb-1 pt-0.5">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={rememberId}
                  onChange={(e) => setRememberId(e.target.checked)}
                  className="sr-only"
                />
                <div className={`w-4 h-4 rounded border flex items-center justify-center transition-all ${
                  rememberId 
                    ? 'border-amber-500 bg-amber-500/10 text-amber-500' 
                    : 'border-neutral-700 bg-[#1C1C1E] text-transparent hover:border-neutral-600'
                }`}>
                  <svg className="w-2.5 h-2.5 stroke-[3] fill-none stroke-current" viewBox="0 0 24 24">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </div>
                <span className="text-[11px] font-medium text-zinc-400 hover:text-zinc-300 transition-colors">
                  아이디 저장
                </span>
              </label>
            </div>

            {/* Action Trigger Amber Button */}
            <div className="pt-3">
              <button
                type="submit"
                className="w-full py-3.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 active:scale-[0.98] text-neutral-950 font-black rounded-xl text-xs transition-all shadow-lg shadow-amber-500/10 hover:shadow-amber-500/20 uppercase tracking-wider block"
              >
                로그인하기
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
