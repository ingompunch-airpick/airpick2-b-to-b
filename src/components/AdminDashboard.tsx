import React, { useState } from 'react';
import { 
  Edit, 
  Trash2, 
  PlusCircle, 
  X 
} from 'lucide-react';
import { 
  doc, 
  updateDoc
} from 'firebase/firestore';
import { db } from '../firebase';
import { Company, Reservation, PartnerCompany } from '../types';
import PartnerOnboardingChecklist from './PartnerOnboardingChecklist';
import { ensureFirestoreAuth } from '../lib/firebaseAuth';
import { getKSTDateOnlyString } from '../utils/kstDate';
import {
  appendPartnerToList,
  buildPartnerRecord,
  createPartnerCompanySkeleton,
  createSubOperatorSkeleton,
  deletePartnerFromFirestore,
  initPartnerLocalPartitions,
  mergeCompanyIntoList,
  removePartnerLocalPartitions,
  sanitizePartnerCompanyId,
  writeNewPartnerToFirestore,
  writeSubOperatorToFirestore,
} from '../utils/partnerRegistration';
import {
  getPrimaryOperatorCandidates,
  isSubOperatorCompany,
  isSubOperatorLoginBlocked,
  resolveOperatorCompanyIds,
} from '../utils/operatorHierarchy';
import PartnerProfileFormFields from './PartnerProfileFormFields';
import {
  applyPartnerProfileToCompany,
  DEFAULT_PARTNER_PROFILE,
  profileExtrasForFirestore,
  readPartnerProfileFromCompany,
  validateParkingDistancesForm,
  type PartnerProfileInput,
} from '../utils/companyProfile';

const getKSTMonthOnlyString = () => {
  const kstDate = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return kstDate.toISOString().substring(0, 7);
};

// Safe LocalStorage wrapper for sandboxed environments
const safeStorage = (() => {
  const memStore: Record<string, string> = {};
  let isSupported = false;
  try {
    const testKey = '__sandbox_test__';
    window.localStorage.setItem(testKey, testKey);
    window.localStorage.removeItem(testKey);
    isSupported = true;
  } catch (e) {}

  return {
    getItem: (key: string): string | null => {
      try {
        if (isSupported) return window.localStorage.getItem(key);
      } catch (e) {}
      return memStore[key] !== undefined ? memStore[key] : null;
    },
    setItem: (key: string, value: string): void => {
      try {
        if (isSupported) {
          window.localStorage.setItem(key, value);
          return;
        }
      } catch (e) {}
      memStore[key] = String(value);
    }
  };
})();

export default function AdminDashboard({ 
  onClose, 
  companies, 
  partners,
  onUpdatePartners,
  onUpdateCompanies
}: { 
  onClose: () => void; 
  companies: Company[]; 
  partners: PartnerCompany[];
  onUpdatePartners: (updated: PartnerCompany[]) => void;
  onUpdateCompanies: (updated: Company[]) => void;
}) {
  const [activeTab, setActiveTab] = useState<'create' | 'partners'>('create');
  const [registerKind, setRegisterKind] = useState<'primary' | 'sub'>('primary');

  // State for editing a sub-operator (companies only)
  const [editingSubCompany, setEditingSubCompany] = useState<Company | null>(null);
  const [editSubProfile, setEditSubProfile] = useState<PartnerProfileInput>({ ...DEFAULT_PARTNER_PROFILE });
  
  // State for editing a partner company
  const [editingPartner, setEditingPartner] = useState<PartnerCompany | null>(null);
  const [editName, setEditName] = useState('');
  const [editRep, setEditRep] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editPassword, setEditPassword] = useState('');
  const [editMemo, setEditMemo] = useState('');
  const [editProfile, setEditProfile] = useState<PartnerProfileInput>({ ...DEFAULT_PARTNER_PROFILE });

  const primaryCandidates = getPrimaryOperatorCandidates(companies || []);
  const subCompanies = (companies || []).filter((c) => isSubOperatorCompany(c));

  const handleStartEditSub = (c: Company) => {
    setEditingSubCompany(c);
    setEditSubProfile(readPartnerProfileFromCompany(c));
  };

  const handleSaveSubEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSubCompany) return;

    const parkingErr = validateParkingDistancesForm(editSubProfile.parkingDistances);
    if (parkingErr) {
      alert(parkingErr);
      return;
    }

    const targetId = editingSubCompany.id;
    const updatedCompanies = companies.map((c) => {
      if (c.id === targetId) {
        return applyPartnerProfileToCompany(c, editSubProfile);
      }
      return c;
    });
    onUpdateCompanies(updatedCompanies);
    safeStorage.setItem('companies', JSON.stringify(updatedCompanies));

    try {
      await ensureFirestoreAuth();
      await updateDoc(doc(db, 'companies', targetId), {
        ...profileExtrasForFirestore(editSubProfile),
        parentCompanyId: editingSubCompany.parentCompanyId,
        isOperatorPrimary: false,
        updatedAt: new Date().toISOString(),
      });
    } catch (err) {
      console.warn('Firestore sub-operator update failed:', err);
    }

    alert(`🏢 [${editingSubCompany.name}] 하위 업체 정보가 수정되었습니다.`);
    setEditingSubCompany(null);
  };

  const handleDeleteSub = async (companyId: string, companyName: string) => {
    if (
      !window.confirm(
        `⚠️ [${companyName} (${companyId})] 하위 업체를 삭제하시겠습니까?\nB2C 노출 및 Firestore companies 문서가 삭제됩니다.`
      )
    ) {
      return;
    }

    const nextCompanies = companies.filter((c) => c.id !== companyId);
    onUpdateCompanies(nextCompanies);
    safeStorage.setItem('companies', JSON.stringify(nextCompanies));

    try {
      await deletePartnerFromFirestore(companyId);
    } catch (err) {
      console.warn('Firestore sub delete failed:', err);
      alert('❌ Firebase 하위 업체 삭제에 실패했습니다.');
      return;
    }

    removePartnerLocalPartitions(companyId, safeStorage);
    alert(`🏢 [${companyName}] 하위 업체가 삭제되었습니다.`);
  };

  const handleStartEdit = (p: PartnerCompany) => {
    setEditingPartner(p);
    setEditName(p.name);
    setEditRep(p.representative);
    setEditPhone(p.phone);
    setEditPassword(p.password || '');
    setEditMemo(p.settlementMemo || '');
    const company = companies.find((c) => c.id === p.companyId);
    setEditProfile(readPartnerProfileFromCompany(company));
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPartner) return;
    if (!editName || !editRep || !editPhone) {
      alert('모든 필수 항목을 입력해주십시오.');
      return;
    }

    const parkingErr = validateParkingDistancesForm(editProfile.parkingDistances);
    if (parkingErr) {
      alert(parkingErr);
      return;
    }

    const targetId = editingPartner.companyId;

    // 1. Update in partners array and local storage
    const updatedPartners = partners.map(p => {
      if (p.companyId === targetId) {
        return {
          ...p,
          name: editName.trim(),
          representative: editRep.trim(),
          phone: editPhone.trim(),
          password: editPassword,
          settlementMemo: editMemo.trim()
        };
      }
      return p;
    });
    onUpdatePartners(updatedPartners);
    safeStorage.setItem('super_partners_list', JSON.stringify(updatedPartners));

    // 2. Update in companies array
    const updatedCompanies = companies.map(c => {
      if (c.id === targetId) {
        const withBasics = {
          ...c,
          name: editName.trim(),
          phone: editPhone.trim(),
          representative: editRep.trim(),
        };
        return applyPartnerProfileToCompany(withBasics, editProfile);
      }
      return c;
    });
    onUpdateCompanies(updatedCompanies);
    safeStorage.setItem('companies', JSON.stringify(updatedCompanies));

    // 3. Update in Firestore
    try {
      await ensureFirestoreAuth();
      await updateDoc(doc(db, 'companies', targetId), {
        name: editName.trim(),
        phone: editPhone.trim(),
        representative: editRep.trim(),
        password: editPassword,
        settlementMemo: editMemo.trim(),
        status: editingPartner.status || 'active',
        isOperatorPrimary: true,
        ...profileExtrasForFirestore(editProfile),
        updatedAt: new Date().toISOString()
      });
    } catch (err) {
      console.warn('Firestore updateDoc for partner edit failed:', err);
    }

    alert(`🏢 [${editName}] 업체 정보가 성공적으로 수정되었습니다.`);
    setEditingPartner(null);
  };
  
  // Stats calculation for each partner company
  const computeStats = (compId: string) => {
    if (!compId) return { todayCompleted: 0, monthlyCompleted: 0, monthlyRevenue: 0 };
    const localKey = `${compId}_reservations`;
    const local = safeStorage.getItem(localKey);
    let list: Reservation[] = [];
    if (local) {
      try { 
        const parsed = JSON.parse(local);
        if (Array.isArray(parsed)) {
          list = parsed;
        }
      } catch (_) {}
    }
    
    if (!Array.isArray(list)) {
      list = [];
    }
    
    const todayStr = getKSTDateOnlyString();
    const thisMonthStr = getKSTMonthOnlyString();

    const todayCompleted = list.filter(r => {
      if (!r) return false;
      const isCompleted = r.status === 'completed_out' || r.status === 'completed_in';
      const isToday = r.departureDate === todayStr || r.arrivalDate === todayStr || (r.createdAt && r.createdAt.includes(todayStr));
      return isCompleted && isToday;
    }).length;

    const monthlyCompletedList = list.filter(r => {
      if (!r) return false;
      const isCompleted = r.status === 'completed_out' || r.status === 'completed_in';
      const isThisMonth = (r.departureDate && r.departureDate.startsWith(thisMonthStr)) || 
                          (r.arrivalDate && r.arrivalDate.startsWith(thisMonthStr)) || 
                          (r.createdAt && r.createdAt.includes(thisMonthStr));
      return isCompleted && isThisMonth;
    });

    const monthlyCompleted = monthlyCompletedList.length;
    const monthlyRevenue = monthlyCompletedList.reduce((sum, r) => {
      if (!r) return sum;
      return sum + (r.totalPrice || 0);
    }, 0);

    return {
      todayCompleted,
      monthlyCompleted,
      monthlyRevenue
    };
  };

  // Toggle active/suspended partner status
  const handleToggleStatus = (id: string) => {
    let nextStatus: 'active' | 'suspended' = 'active';
    const updated = partners.map(p => {
      if (p.companyId === id) {
        nextStatus = p.status === 'active' ? 'suspended' : 'active';
        return { ...p, status: nextStatus };
      }
      return p;
    });
    onUpdatePartners(updated);
    safeStorage.setItem('super_partners_list', JSON.stringify(updated));

    // Update in Firestore to persist status change (non-blocking)
    updateDoc(doc(db, 'companies', id), {
      status: nextStatus,
      updatedAt: new Date().toISOString()
    }).catch(err => {
      console.warn("Firestore status toggle failed:", err);
    });
  };

  // Create Partner Form States
  const [newId, setNewId] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newName, setNewName] = useState('');
  const [newRep, setNewRep] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newMemo, setNewMemo] = useState('');
  const [newProfile, setNewProfile] = useState<PartnerProfileInput>({ ...DEFAULT_PARTNER_PROFILE });
  const [newParentId, setNewParentId] = useState('');
  const [recentOnboarding, setRecentOnboarding] = useState<{
    companyId: string;
    companyName: string;
  } | null>(null);

  const handleCreatePartner = async (e: React.FormEvent) => {
    e.preventDefault();
    if (registerKind === 'sub') {
      await handleCreateSubOperator(e);
      return;
    }

    if (!newId || !newPassword || !newName || !newRep || !newPhone) {
      alert('모든 필수 입력 단락 항목을 작성해주십시오.');
      return;
    }

    const cleanId = sanitizePartnerCompanyId(newId);
    if (!cleanId) {
      alert('유효하지 않은 고유 ID 형식입니다. 영문 소문자와 숫자 및 언더바(_)만 허용됩니다.');
      return;
    }

    if (partners.some(p => p.companyId === cleanId)) {
      alert('이미 등록된 동일한 업체 고유 ID 코드가 존재합니다. 다른 아이디로 변경해주십시오.');
      return;
    }

    const parkingErr = validateParkingDistancesForm(newProfile.parkingDistances);
    if (parkingErr) {
      alert(parkingErr);
      return;
    }

    const skeleton = createPartnerCompanySkeleton({
      companyId: cleanId,
      name: newName,
      phone: newPhone,
      representative: newRep,
    });
    const newCompany = applyPartnerProfileToCompany(
      { ...skeleton, isOperatorPrimary: true },
      newProfile
    );

    const newPartner = buildPartnerRecord({
      companyId: cleanId,
      password: newPassword,
      name: newName,
      representative: newRep,
      phone: newPhone,
      settlementMemo: newMemo,
    });

    try {
      await writeNewPartnerToFirestore(newCompany, newPartner);
    } catch (err) {
      console.warn('Firestore setDoc for brand-new tenant registration failed:', err);
      alert('❌ Firebase 업체 등록에 실패했습니다.\n.env에 VITE_FIREBASE_ADMIN_EMAIL/PASSWORD 설정 후, Firebase Console에서 해당 계정이 등록되어 있는지 확인하세요.');
      return;
    }

    const nextList = appendPartnerToList(partners, newPartner);
    onUpdatePartners(nextList);
    safeStorage.setItem('super_partners_list', JSON.stringify(nextList));

    const nextCompanies = mergeCompanyIntoList(companies || [], newCompany);
    onUpdateCompanies(nextCompanies);
    safeStorage.setItem('companies', JSON.stringify(nextCompanies));

    initPartnerLocalPartitions(cleanId, safeStorage);

    setRecentOnboarding({ companyId: cleanId, companyName: newName.trim() });
    alert(
      `[${newName}] 신규 제휴 업체 등록이 완료되었습니다.\n아이디 '${cleanId}' 로 로그인할 수 있습니다.\n\n아래 온보딩 체크리스트를 순서대로 확인해 주세요.`
    );

    // Reset fields
    setNewId('');
    setNewPassword('');
    setNewName('');
    setNewRep('');
    setNewPhone('');
    setNewMemo('');
    setNewProfile({ ...DEFAULT_PARTNER_PROFILE });
    setActiveTab('partners');
  };

  const handleCreateSubOperator = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newId || !newName || !newRep || !newPhone || !newParentId) {
      alert('하위 업체 등록에 필요한 모든 항목(대표 업체 포함)을 작성해주십시오.');
      return;
    }

    const cleanId = sanitizePartnerCompanyId(newId);
    if (!cleanId) {
      alert('유효하지 않은 고유 ID 형식입니다.');
      return;
    }

    if (companies.some((c) => c.id === cleanId) || partners.some((p) => p.companyId === cleanId)) {
      alert('이미 사용 중인 업체 ID입니다.');
      return;
    }

    const parkingErr = validateParkingDistancesForm(newProfile.parkingDistances);
    if (parkingErr) {
      alert(parkingErr);
      return;
    }

    const skeleton = createSubOperatorSkeleton({
      companyId: cleanId,
      name: newName,
      phone: newPhone,
      representative: newRep,
      parentCompanyId: newParentId,
    });
    const newCompany = applyPartnerProfileToCompany(skeleton, newProfile);

    try {
      await writeSubOperatorToFirestore(newCompany);
    } catch (err) {
      console.warn('Firestore sub-operator registration failed:', err);
      alert('❌ Firebase 하위 업체 등록에 실패했습니다.');
      return;
    }

    const nextCompanies = mergeCompanyIntoList(companies || [], newCompany);
    onUpdateCompanies(nextCompanies);
    safeStorage.setItem('companies', JSON.stringify(nextCompanies));

    initPartnerLocalPartitions(cleanId, safeStorage);

    alert(
      `[${newName}] 하위 업체가 등록되었습니다.\nB2C에만 노출되며, B2B는 대표 [${newParentId}] 계정으로 통합 관리합니다.`
    );

    setNewId('');
    setNewName('');
    setNewRep('');
    setNewPhone('');
    setNewProfile({ ...DEFAULT_PARTNER_PROFILE });
    setActiveTab('partners');
  };

  // Deletion logic
  const handleDeletePartner = async (companyId: string, companyName: string) => {
    if (window.confirm(`⚠️ 경고! [${companyName} (${companyId})] 제휴업체를 완전히 삭제하시겠습니까?\n삭제 즉시 해당 제휴업체의 계정 정보 및 Firestore 파티션 설정이 영구 폐기되며 복구할 수 없습니다.`)) {
      // 1. Delete from partners list
      const nextPartners = partners.filter(p => p.companyId !== companyId);
      onUpdatePartners(nextPartners);
      safeStorage.setItem('super_partners_list', JSON.stringify(nextPartners));

      // 2. Delete from companies list
      const nextCompanies = companies.filter(c => c.id !== companyId);
      onUpdateCompanies(nextCompanies);
      safeStorage.setItem('companies', JSON.stringify(nextCompanies));

      // 3. Delete from firestore
      try {
        await deletePartnerFromFirestore(companyId);
      } catch (err: unknown) {
        console.warn('Firestore deleteDoc failed:', err);
        alert('❌ Firebase 업체 삭제에 실패했습니다. 플랫폼 관리자 Firebase 로그인(.env)을 확인하세요.');
        return;
      }

      // 4. Clean up reservations/drivers local storage keys
      removePartnerLocalPartitions(companyId, safeStorage);

      alert(`🏢 [${companyName}] 업체 정보가 성공적으로 영구 삭제되었습니다.`);
    }
  };

  return (
    <div className="space-y-4 text-slate-850">
      {/* Tab select buttons */}
      <div className="flex bg-slate-200/60 p-1.5 rounded-2xl border border-slate-200/30 gap-1 select-none">
        <button
          type="button"
          onClick={() => setActiveTab('create')}
          className={`flex-1 py-2.5 text-xs font-black rounded-xl transition-all ${
            activeTab === 'create' ? 'bg-white text-slate-950 shadow-xs' : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          업체등록
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('partners')}
          className={`flex-1 py-2.5 text-xs font-black rounded-xl transition-all ${
            activeTab === 'partners' ? 'bg-white text-slate-950 shadow-xs' : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          업체수정/삭제
        </button>
      </div>

      {activeTab === 'partners' && (
        <div className="space-y-3">
          {recentOnboarding && (
            <PartnerOnboardingChecklist
              companyId={recentOnboarding.companyId}
              companyName={recentOnboarding.companyName}
              variant="light"
              defaultExpanded
              highlight
            />
          )}
          <div className="bg-white p-3.5 rounded-2xl border border-slate-100 flex items-center justify-between text-left">
            <div>
              <h4 className="text-xs font-black text-slate-900">제휴사 통합 모니터링 및 수정/삭제 관리</h4>
              <p className="text-[12px] text-slate-450 mt-0.5">시스템에 등록된 제휴 대행사들을 검토하고 요율 및 계약 조건을 수정하거나 불필요한 업체를 파기합니다.</p>
            </div>
            <span className="text-[12px] bg-red-50 text-red-700 px-2.5 py-1 rounded-xl font-bold font-mono shrink-0">
              총 {(partners || []).length} 대표 · {subCompanies.length} 하위
            </span>
          </div>

          <div className="border border-slate-200/60 bg-white rounded-2xl overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100 text-[11px] text-slate-400 font-extrabold tracking-wider">
                    <th className="py-2.5 px-3">가맹 대행사 정보</th>
                    <th className="py-2.5 px-2 text-center">상태</th>
                    <th className="py-2.5 px-2 text-center">통계</th>
                    <th className="py-2.5 px-3 text-right">업체 제어</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(partners || []).filter(p => p && p.companyId).map(p => {
                    const stats = computeStats(p.companyId);
                    const isSuspended = p.status === 'suspended';
                    const company = companies.find((c) => c.id === p.companyId);
                    const isPrimary = company?.isOperatorPrimary || !company?.parentCompanyId;
                    return (
                      <tr key={p.companyId} className={`hover:bg-slate-55/60 transition-all text-xs ${isSuspended ? 'bg-slate-55/40 text-slate-400' : 'text-slate-700'}`}>
                        <td className="py-3 px-3 text-left">
                          <div className="font-bold text-slate-900 flex items-center gap-1.5 flex-wrap">
                            <span>{p.name}</span>
                            <span className="text-[10px] font-mono text-indigo-600 bg-indigo-50/80 px-1 py-0.2 rounded font-black uppercase">
                              {p.companyId}
                            </span>
                            {isPrimary && (
                              <span className="text-[10px] bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded font-black">
                                대표
                              </span>
                            )}
                          </div>
                          <div className="text-[12px] text-slate-400 font-medium mt-0.5">
                            대표: {p.representative} • {p.phone}
                          </div>
                          <div className="text-[11px] bg-slate-100/60 border border-slate-200/30 p-1 rounded-lg mt-1 text-slate-500 font-mono inline-block">
                            정산: {p.settlementMemo}
                          </div>
                        </td>
                        <td className="py-3 px-2 align-middle text-center">
                          <button
                            type="button"
                            onClick={() => handleToggleStatus(p.companyId)}
                            className={`px-2.5 py-1.5 text-[12px] font-extrabold rounded-lg inline-flex items-center gap-1 border transition-all ${
                              isSuspended
                                ? 'bg-rose-50 border-rose-200 text-rose-600 hover:bg-rose-100'
                                : 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100'
                            }`}
                          >
                            <span className={`w-1.5 h-1.5 rounded-full ${isSuspended ? 'bg-rose-500' : 'bg-emerald-500'}`} />
                            {isSuspended ? '정지' : '활성'}
                          </button>
                        </td>
                        <td className="py-3 px-2 align-middle text-center font-mono whitespace-nowrap">
                          <div className="text-[12px] text-slate-800 font-black">금일 {stats.todayCompleted}건</div>
                          <div className="text-[11px] text-slate-450 font-bold mt-0.5">월간 {stats.monthlyCompleted}건</div>
                        </td>
                        <td className="py-3 px-3 align-middle text-right whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => handleStartEdit(p)}
                            className="px-2 py-1.5 bg-slate-50 border border-slate-200 text-slate-755 hover:bg-indigo-50 hover:text-indigo-600 hover:border-indigo-200 rounded-lg text-[12px] font-black tracking-tight inline-flex items-center gap-1 transition-all mr-1.5"
                          >
                            <Edit size={11} />
                            수정
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeletePartner(p.companyId, p.name)}
                            className="px-2 py-1.5 bg-rose-50 border border-rose-200 text-rose-600 hover:bg-rose-650 hover:text-white rounded-lg text-[12px] font-black tracking-tight inline-flex items-center gap-1 transition-all"
                          >
                            <Trash2 size={11} />
                            삭제
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {subCompanies.map((c) => {
                    const stats = computeStats(c.id);
                    const parent = companies.find((x) => x.id === c.parentCompanyId);
                    return (
                      <tr key={`sub-${c.id}`} className="hover:bg-slate-55/60 transition-all text-xs text-slate-600 bg-slate-50/30">
                        <td className="py-3 px-3 text-left">
                          <div className="font-bold text-slate-800 flex items-center gap-1.5 flex-wrap">
                            <span>{c.name}</span>
                            <span className="text-[10px] font-mono text-violet-600 bg-violet-50/80 px-1 py-0.2 rounded font-black uppercase">
                              {c.id}
                            </span>
                            <span className="text-[10px] bg-violet-100 text-violet-800 px-1.5 py-0.5 rounded font-black">
                              하위 → {parent?.name || c.parentCompanyId}
                            </span>
                          </div>
                          <div className="text-[12px] text-slate-400 font-medium mt-0.5">
                            대표: {c.representative || '-'} • {c.phone || '-'}
                          </div>
                        </td>
                        <td className="py-3 px-2 align-middle text-center">
                          <span className="text-[11px] text-slate-400 font-bold">B2C만</span>
                        </td>
                        <td className="py-3 px-2 align-middle text-center font-mono whitespace-nowrap">
                          <div className="text-[12px] text-slate-800 font-black">금일 {stats.todayCompleted}건</div>
                          <div className="text-[11px] text-slate-450 font-bold mt-0.5">월간 {stats.monthlyCompleted}건</div>
                        </td>
                        <td className="py-3 px-3 align-middle text-right whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => handleStartEditSub(c)}
                            className="px-2 py-1.5 bg-slate-50 border border-slate-200 text-slate-755 hover:bg-indigo-50 hover:text-indigo-600 hover:border-indigo-200 rounded-lg text-[12px] font-black tracking-tight inline-flex items-center gap-1 transition-all mr-1.5"
                          >
                            <Edit size={11} />
                            수정
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteSub(c.id, c.name)}
                            className="px-2 py-1.5 bg-rose-50 border border-rose-200 text-rose-600 hover:bg-rose-650 hover:text-white rounded-lg text-[12px] font-black tracking-tight inline-flex items-center gap-1 transition-all"
                          >
                            <Trash2 size={11} />
                            삭제
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Edit Partner Overlay Form */}
          {editingPartner && (
            <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs select-none">
              <div className="bg-white w-full max-w-lg max-h-[90vh] rounded-2xl shadow-xl overflow-hidden flex flex-col p-5 text-xs text-left">
                <div className="flex items-center justify-between pb-3 border-b border-slate-150 mb-4">
                  <div>
                    <h4 className="text-sm font-black text-slate-900">🏢 제휴 가맹점 정보 수정</h4>
                    <p className="text-[12px] text-slate-450 mt-0.5">고유 ID: <span className="font-mono font-bold text-indigo-600 bg-indigo-50 px-1 py-0.2 rounded">{editingPartner.companyId}</span></p>
                  </div>
                  <button 
                    type="button" 
                    onClick={() => setEditingPartner(null)} 
                    className="p-1.5 text-slate-400 hover:bg-slate-100 rounded-full"
                  >
                    <X size={16} />
                  </button>
                </div>
                
                <form onSubmit={handleSaveEdit} className="space-y-3 overflow-y-auto flex-1 min-h-0 pr-1">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[12px] text-slate-500 block mb-1 font-bold">가맹사 법인명 (상호명) *</label>
                      <input 
                        type="text" 
                        required
                        value={editName}
                        onChange={e => setEditName(e.target.value)}
                        className="w-full px-3 py-2 border border-slate-200 bg-white text-slate-900 rounded-xl focus:outline-none focus:ring-1 focus:ring-indigo-500 font-bold"
                      />
                    </div>
                    <div>
                      <label className="text-[12px] text-slate-500 block mb-1 font-bold">대표자 성함 *</label>
                      <input 
                        type="text" 
                        required
                        value={editRep}
                        onChange={e => setEditRep(e.target.value)}
                        className="w-full px-3 py-2 border border-slate-200 bg-white text-slate-900 rounded-xl focus:outline-none focus:ring-1 focus:ring-indigo-500 font-semibold"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[12px] text-slate-500 block mb-1 font-bold">업체 대표 연락처 *</label>
                      <input 
                        type="text" 
                        required
                        value={editPhone}
                        onChange={e => setEditPhone(e.target.value)}
                        className="w-full px-3 py-2 border border-slate-200 bg-white text-slate-900 rounded-xl focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono font-semibold"
                      />
                    </div>
                    <div>
                      <label className="text-[12px] text-slate-500 block mb-1 font-bold">로그인 비밀번호</label>
                      <input 
                        type="text" 
                        value={editPassword}
                        onChange={e => setEditPassword(e.target.value)}
                        className="w-full px-3 py-2 border border-slate-200 bg-white text-slate-900 rounded-xl focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono font-semibold"
                        placeholder="로그인 비밀번호 재설정"
                      />
                    </div>
                  </div>

                  <div>
                     <label className="text-[12px] text-slate-500 block mb-1 font-bold">정산 방식 및 계약 조건 메모</label>
                     <textarea
                       value={editMemo}
                       onChange={e => setEditMemo(e.target.value)}
                       className="w-full px-3 py-2 border border-slate-200 bg-white text-slate-900 rounded-xl h-20 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-sans font-medium"
                     />
                  </div>

                  <PartnerProfileFormFields profile={editProfile} onChange={setEditProfile} />

                  <div className="flex gap-2 pt-3 border-t border-slate-100 sticky bottom-0 bg-white">
                    <button 
                      type="button" 
                      onClick={() => setEditingPartner(null)}
                      className="flex-1 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 font-black rounded-xl transition-all"
                    >
                      취소
                    </button>
                    <button 
                      type="submit" 
                      className="flex-1 py-1.5 bg-indigo-600 text-white rounded-xl font-black hover:bg-indigo-700 transition-all flex items-center justify-center gap-1 shadow-xs"
                    >
                      변경 내용 저장
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Sub-operator edit modal */}
          {editingSubCompany && (
            <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs select-none">
              <div className="bg-white w-full max-w-lg max-h-[90vh] rounded-2xl shadow-xl overflow-hidden flex flex-col p-5 text-xs text-left">
                <div className="flex items-center justify-between pb-3 border-b border-slate-150 mb-4">
                  <div>
                    <h4 className="text-sm font-black text-slate-900">하위 업체 정보 수정</h4>
                    <p className="text-[12px] text-slate-450 mt-0.5">
                      ID: <span className="font-mono font-bold text-violet-600">{editingSubCompany.id}</span>
                      {' · '}
                      대표: {editingSubCompany.parentCompanyId}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setEditingSubCompany(null)}
                    className="p-1.5 text-slate-400 hover:bg-slate-100 rounded-full"
                  >
                    <X size={16} />
                  </button>
                </div>
                <form onSubmit={handleSaveSubEdit} className="space-y-3 overflow-y-auto flex-1 min-h-0 pr-1">
                  <PartnerProfileFormFields profile={editSubProfile} onChange={setEditSubProfile} />
                  <div className="flex gap-2 pt-3 border-t border-slate-100 sticky bottom-0 bg-white">
                    <button
                      type="button"
                      onClick={() => setEditingSubCompany(null)}
                      className="flex-1 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 font-black rounded-xl transition-all"
                    >
                      취소
                    </button>
                    <button
                      type="submit"
                      className="flex-1 py-1.5 bg-violet-600 text-white rounded-xl font-black hover:bg-violet-700 transition-all"
                    >
                      저장
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'create' && (
        <form onSubmit={handleCreatePartner} className="space-y-3 bg-white p-4 rounded-2xl border border-slate-100 text-xs text-left">
          <div className="border-b border-slate-100 pb-2 mb-2">
            <h4 className="text-xs font-black text-slate-850">신규 제휴 가맹점 입점 승인</h4>
            <p className="text-[11.5px] text-slate-600">대표 업체는 B2B 로그인·통합 관리, 하위 업체는 B2C 전용입니다.</p>
          </div>

          <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-xl">
            <button
              type="button"
              onClick={() => setRegisterKind('primary')}
              className={`py-2 rounded-lg text-[12px] font-black transition-all ${
                registerKind === 'primary' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500'
              }`}
            >
              대표 업체 (B2B 로그인)
            </button>
            <button
              type="button"
              onClick={() => setRegisterKind('sub')}
              className={`py-2 rounded-lg text-[12px] font-black transition-all ${
                registerKind === 'sub' ? 'bg-white text-violet-900 shadow-xs' : 'text-slate-500'
              }`}
            >
              하위 업체 (B2C만)
            </button>
          </div>

          {registerKind === 'sub' && (
            <div>
              <label className="text-[12px] text-slate-800 block mb-1 font-extrabold">소속 대표 업체 *</label>
              <select
                required
                value={newParentId}
                onChange={(e) => setNewParentId(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-violet-500 font-bold text-slate-900"
              >
                <option value="">대표 업체 선택</option>
                {primaryCandidates.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.id})
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[12px] text-slate-800 block mb-1 font-extrabold">가맹점 고유 식별 코드 (companyId) *</label>
              <input
                type="text"
                required
                value={newId}
                onChange={e => setNewId(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono font-bold text-slate-900 placeholder:text-slate-400"
                placeholder="예: flight24"
              />
            </div>
            {registerKind === 'primary' && (
            <div>
              <label className="text-[12px] text-slate-800 block mb-1 font-extrabold">임시 로그인 비밀번호 *</label>
              <input
                type="password"
                required={registerKind === 'primary'}
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono text-slate-900 placeholder:text-slate-400"
                placeholder="비밀번호 설정"
              />
            </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[12px] text-slate-800 block mb-1 font-extrabold">가맹사 법인명 (상호명) *</label>
              <input
                type="text"
                required
                value={newName}
                onChange={e => setNewName(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-indigo-500 font-bold text-slate-900 placeholder:text-slate-400"
                placeholder="예: 스타 발렛 파킹"
              />
            </div>
            <div>
              <label className="text-[12px] text-slate-800 block mb-1 font-extrabold">대표자 성함 *</label>
              <input
                type="text"
                required
                value={newRep}
                onChange={e => setNewRep(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-indigo-500 text-slate-900 placeholder:text-slate-400"
                placeholder="예: 최규동 대표"
              />
            </div>
          </div>

          <div>
            <label className="text-[12px] text-slate-800 block mb-1 font-extrabold">업체 대표 연락처 *</label>
            <input
              type="text"
              required
              value={newPhone}
              onChange={e => setNewPhone(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono text-slate-900 placeholder:text-slate-400"
              placeholder="예: 010-1234-5678"
            />
          </div>

          <div>
            <label className="text-[12px] text-slate-800 block mb-1 font-extrabold">
              {registerKind === 'primary' ? '정산 방식 및 계약 조건 메모' : '메모 (선택)'}
            </label>
            <textarea
              value={newMemo}
              onChange={e => setNewMemo(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-xl h-16 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-sans text-slate-900 placeholder:text-slate-450"
              placeholder={registerKind === 'primary' ? '예: 대행 수수료율 15%...' : '하위 업체 메모'}
            />
          </div>

          <PartnerProfileFormFields profile={newProfile} onChange={setNewProfile} />

          <button
            type="submit"
            className={`w-full py-2.5 text-white rounded-xl font-black text-xs transition-all flex items-center justify-center gap-1 shadow-xs ${
              registerKind === 'sub'
                ? 'bg-violet-600 hover:bg-violet-700'
                : 'bg-indigo-600 hover:bg-indigo-700'
            }`}
          >
            <PlusCircle size={14} />
            {registerKind === 'sub' ? '하위 업체 등록' : '신규 대표 업체 입점 승인'}
          </button>

          <PartnerOnboardingChecklist
            companyId={newId.trim().toLowerCase()}
            companyName={newName.trim() || undefined}
            variant="light"
          />
        </form>
      )}
    </div>
  );
}
