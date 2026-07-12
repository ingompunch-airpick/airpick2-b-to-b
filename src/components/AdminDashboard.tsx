import React, { useState } from 'react';
import { createPortal } from 'react-dom';
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
import { ensurePlatformAdminAuth, getPlatformAdminCredentials } from '../lib/firebaseAuth';
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
  validateLotParkingDistancesForm,
  type PartnerProfileInput,
} from '../utils/companyProfile';
import { uploadCompanyParkingImages } from '../lib/companyPhotos';

const getKSTMonthOnlyString = () => {
  const kstDate = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return kstDate.toISOString().substring(0, 7);
};

async function resolveProfileParkingPhotos(
  companyId: string,
  profile: PartnerProfileInput
): Promise<PartnerProfileInput> {
  const sources =
    profile.imageUrls.length > 0
      ? profile.imageUrls
      : profile.imageUrl.trim()
        ? [profile.imageUrl.trim()]
        : [];
  if (!sources.length) {
    return { ...profile, imageUrl: '', imageUrls: [] };
  }
  const urls = await uploadCompanyParkingImages(companyId, sources);
  return {
    ...profile,
    imageUrls: urls,
    imageUrl: urls[0] || '',
  };
}

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
  const [savingEdit, setSavingEdit] = useState(false);
  const [saveEditError, setSaveEditError] = useState('');
  const savingEditRef = React.useRef(false);

  const primaryPartners = (partners || []).filter((p) => {
    if (!p?.companyId) return false;
    const company = companies.find((c) => c.id === p.companyId);
    return !isSubOperatorCompany(company);
  });
  const primaryCandidates = getPrimaryOperatorCandidates(companies || [], primaryPartners);
  const subCompanies = (companies || []).filter((c) => isSubOperatorCompany(c));
  const canRegisterSub = primaryCandidates.length > 0;

  const handleStartEditSub = (c: Company) => {
    setEditingSubCompany(c);
    setEditSubProfile(readPartnerProfileFromCompany(c));
  };

  const handleSaveSubEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSubCompany) return;

    const parkingErr = validateLotParkingDistancesForm(editSubProfile.parkingDistancesByLot);
    if (parkingErr) {
      alert(parkingErr);
      return;
    }

    const targetId = editingSubCompany.id;
    let profileToSave = editSubProfile;
    try {
      profileToSave = await resolveProfileParkingPhotos(targetId, editSubProfile);
      setEditSubProfile(profileToSave);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '주차장 사진 업로드 실패';
      alert(msg);
      return;
    }

    const updatedCompanies = companies.map((c) => {
      if (c.id === targetId) {
        return applyPartnerProfileToCompany(c, profileToSave);
      }
      return c;
    });
    onUpdateCompanies(updatedCompanies);
    safeStorage.setItem('companies', JSON.stringify(updatedCompanies));

    try {
      await ensurePlatformAdminAuth();
      await updateDoc(doc(db, 'companies', targetId), {
        ...profileExtrasForFirestore(profileToSave),
        parentCompanyId: editingSubCompany.parentCompanyId,
        isOperatorPrimary: false,
        updatedAt: new Date().toISOString(),
      });
    } catch (err) {
      console.warn('Firestore sub-operator update failed:', err);
      alert(
        '❌ 하위 업체 위치·프로필 저장에 실패했습니다.\n최고관리자 Firebase 로그인(.env)을 확인하세요.'
      );
      return;
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
      await deletePartnerFromFirestore(companyId, { isSubOperator: true });
    } catch (err) {
      console.warn('Firestore sub delete failed:', err);
      alert('❌ Firebase 하위 업체 삭제에 실패했습니다.');
      return;
    }

    removePartnerLocalPartitions(companyId, safeStorage);
    alert(`🏢 [${companyName}] 하위 업체가 삭제되었습니다.`);
  };

  const handleStartEdit = (p: PartnerCompany) => {
    savingEditRef.current = false;
    setSavingEdit(false);
    setSaveEditError('');
    setEditingPartner(p);
    setEditName(p.name);
    setEditRep(p.representative);
    setEditPhone(p.phone);
    setEditPassword(p.password || '');
    setEditMemo(p.settlementMemo || '');
    const company = companies.find((c) => c.id === p.companyId);
    setEditProfile(readPartnerProfileFromCompany(company));
  };

  const handleSaveEdit = async (e?: React.FormEvent | React.MouseEvent) => {
    e?.preventDefault?.();
    e?.stopPropagation?.();
    setSaveEditError('');

    try {
      if (savingEditRef.current && !savingEdit) {
        savingEditRef.current = false;
      }

      if (!editingPartner) {
        setSaveEditError('수정 대상이 없습니다. 창을 닫고 다시 열어 주세요.');
        return;
      }
      if (savingEditRef.current) {
        setSaveEditError('이미 저장 중입니다. 잠시만 기다려 주세요.');
        return;
      }
      if (!editName.trim() || !editRep.trim() || !editPhone.trim()) {
        setSaveEditError('모든 필수 항목을 입력해주십시오.');
        return;
      }

      const parkingErr = validateLotParkingDistancesForm(editProfile.parkingDistancesByLot);
      if (parkingErr) {
        setSaveEditError(parkingErr);
        return;
      }

      const adminCreds = getPlatformAdminCredentials();
      if (!adminCreds) {
        setSaveEditError(
          '.env의 VITE_FIREBASE_ADMIN_PASSWORD 가 비어 있습니다. 비밀번호를 넣은 뒤 npm run dev 를 재시작하세요.'
        );
        return;
      }

      savingEditRef.current = true;
      setSavingEdit(true);
      const targetId = editingPartner.companyId;

      let profileToSave = editProfile;
      try {
        profileToSave = await resolveProfileParkingPhotos(targetId, editProfile);
        setEditProfile(profileToSave);
      } catch (err) {
        const msg = err instanceof Error ? err.message : '주차장 사진 업로드 실패';
        setSaveEditError(msg);
        savingEditRef.current = false;
        setSavingEdit(false);
        return;
      }

      const updatedPartners = partners.map((p) => {
        if (p.companyId === targetId) {
          return {
            ...p,
            name: editName.trim(),
            representative: editRep.trim(),
            phone: editPhone.trim(),
            password: editPassword,
            settlementMemo: editMemo.trim(),
          };
        }
        return p;
      });
      onUpdatePartners(updatedPartners);
      safeStorage.setItem('super_partners_list', JSON.stringify(updatedPartners));

      const updatedCompanies = companies.map((c) => {
        if (c.id === targetId) {
          const withBasics = {
            ...c,
            name: editName.trim(),
            phone: editPhone.trim(),
            representative: editRep.trim(),
          };
          return applyPartnerProfileToCompany(withBasics, profileToSave);
        }
        return c;
      });
      onUpdateCompanies(updatedCompanies);
      safeStorage.setItem('companies', JSON.stringify(updatedCompanies));

      try {
        await ensurePlatformAdminAuth();
        await updateDoc(doc(db, 'companies', targetId), {
          name: editName.trim(),
          phone: editPhone.trim(),
          representative: editRep.trim(),
          password: editPassword,
          settlementMemo: editMemo.trim(),
          status: editingPartner.status || 'active',
          isOperatorPrimary: true,
          ...profileExtrasForFirestore(profileToSave),
          updatedAt: new Date().toISOString(),
        });
      } catch (err) {
        console.warn('Firestore updateDoc for partner edit failed:', err);
        const detail = err instanceof Error ? err.message : String(err);
        setSaveEditError(`Firestore 저장 실패: ${detail}`);
        savingEditRef.current = false;
        setSavingEdit(false);
        return;
      }

      savingEditRef.current = false;
      setSavingEdit(false);
      setEditingPartner(null);
      alert(`🏢 [${editName}] 업체 정보가 성공적으로 수정되었습니다.`);
    } catch (err) {
      console.error('handleSaveEdit unexpected error:', err);
      const detail = err instanceof Error ? err.message : String(err);
      setSaveEditError(`저장 중 오류: ${detail}`);
      savingEditRef.current = false;
      setSavingEdit(false);
    }
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

    const parkingErr = validateLotParkingDistancesForm(newProfile.parkingDistancesByLot);
    if (parkingErr) {
      alert(parkingErr);
      return;
    }

    let profileToSave = newProfile;
    try {
      profileToSave = await resolveProfileParkingPhotos(cleanId, newProfile);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '주차장 사진 업로드 실패';
      alert(msg);
      return;
    }

    const skeleton = createPartnerCompanySkeleton({
      companyId: cleanId,
      name: newName,
      phone: newPhone,
      representative: newRep,
    });
    const newCompanyRaw = applyPartnerProfileToCompany(
      { ...skeleton, isOperatorPrimary: true },
      profileToSave
    );
    const newCompany =
      profileToSave.imageUrls.length > 0 || profileToSave.imageUrl.trim()
        ? newCompanyRaw
        : { ...newCompanyRaw, image_url: skeleton.image_url };

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

    const parkingErr = validateLotParkingDistancesForm(newProfile.parkingDistancesByLot);
    if (parkingErr) {
      alert(parkingErr);
      return;
    }

    let profileToSave = newProfile;
    try {
      profileToSave = await resolveProfileParkingPhotos(cleanId, newProfile);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '주차장 사진 업로드 실패';
      alert(msg);
      return;
    }

    const skeleton = createSubOperatorSkeleton({
      companyId: cleanId,
      name: newName,
      phone: newPhone,
      representative: newRep,
      parentCompanyId: newParentId,
    });
    const newCompanyRaw = applyPartnerProfileToCompany(skeleton, profileToSave);
    const newCompany =
      profileToSave.imageUrls.length > 0 || profileToSave.imageUrl.trim()
        ? newCompanyRaw
        : { ...newCompanyRaw, image_url: skeleton.image_url };

    try {
      await writeSubOperatorToFirestore(newCompany);
    } catch (err) {
      console.warn('Firestore sub-operator registration failed:', err);
      const detail = err instanceof Error ? err.message : String(err);
      alert(
        `❌ Firebase 하위 업체 등록에 실패했습니다.\n\n${detail}\n\n대표 업체가 Firestore companies에 등록되어 있는지, Firebase Console → Authentication → Anonymous 사용 설정이 켜져 있는지 확인하세요.`
      );
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
    <div className="space-y-4 text-zinc-100">
      {/* Tab select buttons */}
      <div className="flex bg-neutral-900/80 p-1.5 rounded-2xl border border-neutral-800 gap-1 select-none">
        <button
          type="button"
          onClick={() => setActiveTab('create')}
          className={`flex-1 py-2.5 text-xs font-black rounded-xl transition-all ${
            activeTab === 'create' ? 'bg-[#1C1C1E] text-zinc-50 shadow-xs border border-neutral-700' : 'text-zinc-500 hover:text-zinc-200'
          }`}
        >
          업체등록
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('partners')}
          className={`flex-1 py-2.5 text-xs font-black rounded-xl transition-all ${
            activeTab === 'partners' ? 'bg-[#1C1C1E] text-zinc-50 shadow-xs border border-neutral-700' : 'text-zinc-500 hover:text-zinc-200'
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
              variant="dark"
              defaultExpanded
              highlight
            />
          )}
          <div className="bg-[#1C1C1E] p-3.5 rounded-2xl border border-neutral-800 flex items-center justify-between text-left">
            <div>
              <h4 className="text-xs font-black text-zinc-100">제휴사 통합 모니터링 및 수정/삭제 관리</h4>
              <p className="text-[12px] text-zinc-500 mt-0.5">시스템에 등록된 제휴 대행사들을 검토하고 요율 및 계약 조건을 수정하거나 불필요한 업체를 파기합니다.</p>
            </div>
            <span className="text-[12px] bg-rose-500/15 text-rose-300 px-2.5 py-1 rounded-xl font-bold font-mono shrink-0 border border-rose-500/20">
              총 {primaryPartners.length} 대표 · {subCompanies.length} 하위
            </span>
          </div>

          <div className="border border-neutral-800 bg-[#1C1C1E] rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-neutral-900/80 border-b border-neutral-800 text-[11px] text-zinc-500 font-extrabold tracking-wider">
                    <th className="py-2.5 px-3">가맹 대행사 정보</th>
                    <th className="py-2.5 px-2 text-center">상태</th>
                    <th className="py-2.5 px-2 text-center">통계</th>
                    <th className="py-2.5 px-3 text-right">업체 제어</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-800">
                  {primaryPartners.map((p) => {
                    const stats = computeStats(p.companyId);
                    const isSuspended = p.status === 'suspended';
                    const company = companies.find((c) => c.id === p.companyId);
                    const isPrimary = company?.isOperatorPrimary || !company?.parentCompanyId;
                    return (
                      <tr key={p.companyId} className={`hover:bg-neutral-900/70 transition-all text-xs ${isSuspended ? 'bg-neutral-950/50 text-zinc-500' : 'text-zinc-300'}`}>
                        <td className="py-3 px-3 text-left">
                          <div className="font-bold text-zinc-100 flex items-center gap-1.5 flex-wrap">
                            <span>{p.name}</span>
                            <span className="text-[10px] font-mono text-amber-400 bg-amber-500/10 px-1 py-0.2 rounded font-black uppercase">
                              {p.companyId}
                            </span>
                            {isPrimary && (
                              <span className="text-[10px] bg-amber-500/20 text-amber-300 px-1.5 py-0.5 rounded font-black">
                                대표
                              </span>
                            )}
                          </div>
                          <div className="text-[12px] text-zinc-500 font-medium mt-0.5">
                            대표: {p.representative} • {p.phone}
                          </div>
                          <div className="text-[11px] bg-neutral-900 border border-neutral-800 p-1 rounded-lg mt-1 text-zinc-500 font-mono inline-block">
                            정산: {p.settlementMemo}
                          </div>
                        </td>
                        <td className="py-3 px-2 align-middle text-center">
                          <button
                            type="button"
                            onClick={() => handleToggleStatus(p.companyId)}
                            className={`px-2.5 py-1.5 text-[12px] font-extrabold rounded-lg inline-flex items-center gap-1 border transition-all ${
                              isSuspended
                                ? 'bg-rose-500/15 border-rose-500/30 text-rose-300 hover:bg-rose-500/25'
                                : 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/25'
                            }`}
                          >
                            <span className={`w-1.5 h-1.5 rounded-full ${isSuspended ? 'bg-rose-500' : 'bg-emerald-500'}`} />
                            {isSuspended ? '정지' : '활성'}
                          </button>
                        </td>
                        <td className="py-3 px-2 align-middle text-center font-mono whitespace-nowrap">
                          <div className="text-[12px] text-zinc-200 font-black">금일 {stats.todayCompleted}건</div>
                          <div className="text-[11px] text-zinc-500 font-bold mt-0.5">월간 {stats.monthlyCompleted}건</div>
                        </td>
                        <td className="py-3 px-3 align-middle text-right whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => handleStartEdit(p)}
                            className="px-2 py-1.5 bg-neutral-900 border border-neutral-700 text-zinc-300 hover:bg-amber-500/10 hover:text-amber-300 hover:border-amber-500/40 rounded-lg text-[12px] font-black tracking-tight inline-flex items-center gap-1 transition-all mr-1.5"
                          >
                            <Edit size={11} />
                            수정
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeletePartner(p.companyId, p.name)}
                            className="px-2 py-1.5 bg-rose-500/10 border border-rose-500/30 text-rose-300 hover:bg-rose-500 hover:text-white rounded-lg text-[12px] font-black tracking-tight inline-flex items-center gap-1 transition-all"
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
                      <tr key={`sub-${c.id}`} className="hover:bg-neutral-900/70 transition-all text-xs text-zinc-400 bg-neutral-950/40">
                        <td className="py-3 px-3 text-left">
                          <div className="font-bold text-zinc-200 flex items-center gap-1.5 flex-wrap">
                            <span>{c.name}</span>
                            <span className="text-[10px] font-mono text-violet-300 bg-violet-500/15 px-1 py-0.2 rounded font-black uppercase">
                              {c.id}
                            </span>
                            <span className="text-[10px] bg-violet-500/20 text-violet-300 px-1.5 py-0.5 rounded font-black">
                              하위 → {parent?.name || c.parentCompanyId}
                            </span>
                          </div>
                          <div className="text-[12px] text-zinc-500 font-medium mt-0.5">
                            대표: {c.representative || '-'} • {c.phone || '-'}
                          </div>
                        </td>
                        <td className="py-3 px-2 align-middle text-center">
                          <span className="text-[11px] text-zinc-500 font-bold">B2C만</span>
                        </td>
                        <td className="py-3 px-2 align-middle text-center font-mono whitespace-nowrap">
                          <div className="text-[12px] text-zinc-200 font-black">금일 {stats.todayCompleted}건</div>
                          <div className="text-[11px] text-zinc-500 font-bold mt-0.5">월간 {stats.monthlyCompleted}건</div>
                        </td>
                        <td className="py-3 px-3 align-middle text-right whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => handleStartEditSub(c)}
                            className="px-2 py-1.5 bg-neutral-900 border border-neutral-700 text-zinc-300 hover:bg-amber-500/10 hover:text-amber-300 hover:border-amber-500/40 rounded-lg text-[12px] font-black tracking-tight inline-flex items-center gap-1 transition-all mr-1.5"
                          >
                            <Edit size={11} />
                            수정
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteSub(c.id, c.name)}
                            className="px-2 py-1.5 bg-rose-500/10 border border-rose-500/30 text-rose-300 hover:bg-rose-500 hover:text-white rounded-lg text-[12px] font-black tracking-tight inline-flex items-center gap-1 transition-all"
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

          {/* Edit Partner — body portal + 높은 z-index (네이버지도/부모 transform 클릭 가로채기 방지) */}
          {editingPartner &&
            createPortal(
              <div className="fixed inset-0 z-[99999]" role="dialog" aria-modal="true">
                <div
                  className="absolute inset-0 bg-slate-950/70 backdrop-blur-xs"
                  onClick={() => {
                    if (!savingEdit) setEditingPartner(null);
                  }}
                />
                <div className="absolute inset-0 flex items-center justify-center p-4 pointer-events-none">
                  <div
                    className="pointer-events-auto bg-[#17171A] w-full max-w-lg rounded-2xl shadow-xl border border-neutral-800 flex flex-col text-xs text-left overflow-hidden"
                    style={{ height: 'min(90dvh, 900px)', maxHeight: '90vh' }}
                  >
                    <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-neutral-800 shrink-0 bg-[#1C1C1E]">
                      <div>
                        <h4 className="text-sm font-black text-zinc-100">🏢 제휴 가맹점 정보 수정</h4>
                        <p className="text-[12px] text-zinc-500 mt-0.5">
                          고유 ID:{' '}
                          <span className="font-mono font-bold text-amber-400 bg-amber-500/10 px-1 py-0.2 rounded">
                            {editingPartner.companyId}
                          </span>
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setEditingPartner(null)}
                        className="p-1.5 text-zinc-500 hover:bg-neutral-800 hover:text-zinc-200 rounded-full"
                      >
                        <X size={16} />
                      </button>
                    </div>

                    <div className="px-5 py-3 space-y-3 overflow-y-auto flex-1 min-h-0 overscroll-contain">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-[12px] text-zinc-400 block mb-1 font-bold">가맹사 법인명 (상호명) *</label>
                          <input
                            type="text"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            className="w-full px-3 py-2 border border-neutral-700 bg-[#1C1C1E] text-zinc-100 rounded-xl focus:outline-none focus:ring-1 focus:ring-amber-500/40 font-bold"
                          />
                        </div>
                        <div>
                          <label className="text-[12px] text-zinc-400 block mb-1 font-bold">대표자 성함 *</label>
                          <input
                            type="text"
                            value={editRep}
                            onChange={(e) => setEditRep(e.target.value)}
                            className="w-full px-3 py-2 border border-neutral-700 bg-[#1C1C1E] text-zinc-100 rounded-xl focus:outline-none focus:ring-1 focus:ring-amber-500/40 font-semibold"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-[12px] text-zinc-400 block mb-1 font-bold">업체 대표 연락처 *</label>
                          <input
                            type="text"
                            value={editPhone}
                            onChange={(e) => setEditPhone(e.target.value)}
                            className="w-full px-3 py-2 border border-neutral-700 bg-[#1C1C1E] text-zinc-100 rounded-xl focus:outline-none focus:ring-1 focus:ring-amber-500/40 font-mono font-semibold"
                          />
                        </div>
                        <div>
                          <label className="text-[12px] text-zinc-400 block mb-1 font-bold">로그인 비밀번호</label>
                          <input
                            type="text"
                            value={editPassword}
                            onChange={(e) => setEditPassword(e.target.value)}
                            className="w-full px-3 py-2 border border-neutral-700 bg-[#1C1C1E] text-zinc-100 rounded-xl focus:outline-none focus:ring-1 focus:ring-amber-500/40 font-mono font-semibold"
                            placeholder="로그인 비밀번호 재설정"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="text-[12px] text-zinc-400 block mb-1 font-bold">정산 방식 및 계약 조건 메모</label>
                        <textarea
                          value={editMemo}
                          onChange={(e) => setEditMemo(e.target.value)}
                          className="w-full px-3 py-2 border border-neutral-700 bg-[#1C1C1E] text-zinc-100 rounded-xl h-20 focus:outline-none focus:ring-1 focus:ring-amber-500/40 font-sans font-medium"
                        />
                      </div>

                      <PartnerProfileFormFields
                        profile={editProfile}
                        onChange={setEditProfile}
                        companyId={editingPartner.companyId}
                        variant="dark"
                      />
                      <p className="text-[11px] text-amber-300/90 font-bold bg-amber-500/10 border border-amber-500/20 rounded-lg px-2.5 py-1.5">
                        보험·주소·핀·T1/T2 거리·사진은 companies에 저장되며 B2C MY가 읽습니다. 가맹점은 확인만 가능합니다.
                      </p>
                    </div>

                    <div className="shrink-0 flex flex-col gap-2 px-5 py-3 border-t border-neutral-800 bg-[#1C1C1E]">
                      {saveEditError ? (
                        <p className="text-[11px] font-bold text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-xl px-3 py-2 whitespace-pre-wrap">
                          {saveEditError}
                        </p>
                      ) : null}
                      <button
                        type="button"
                        disabled={savingEdit}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          void handleSaveEdit(e);
                        }}
                        className="w-full py-3.5 bg-amber-500 text-black rounded-xl font-black hover:bg-amber-400 transition-all disabled:opacity-50 text-sm"
                      >
                        {savingEdit ? '저장 중…' : '변경 내용 저장'}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          savingEditRef.current = false;
                          setSavingEdit(false);
                          setEditingPartner(null);
                        }}
                        disabled={savingEdit}
                        className="w-full py-2.5 bg-neutral-800 hover:bg-neutral-700 text-zinc-300 font-black rounded-xl transition-all disabled:opacity-50"
                      >
                        취소
                      </button>
                    </div>
                  </div>
                </div>
              </div>,
              document.body
            )}

          {/* Sub-operator edit modal */}
          {editingSubCompany &&
            createPortal(
              <div className="fixed inset-0 z-[99999]" role="dialog" aria-modal="true">
                <div
                  className="absolute inset-0 bg-slate-950/70 backdrop-blur-xs"
                  onClick={() => setEditingSubCompany(null)}
                />
                <div className="absolute inset-0 flex items-center justify-center p-4 pointer-events-none">
                  <div
                    className="pointer-events-auto bg-[#17171A] w-full max-w-lg rounded-2xl shadow-xl border border-neutral-800 flex flex-col text-xs text-left overflow-hidden"
                    style={{ height: 'min(90dvh, 900px)', maxHeight: '90vh' }}
                  >
                    <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-neutral-800 shrink-0 bg-[#1C1C1E]">
                      <div>
                        <h4 className="text-sm font-black text-zinc-100">하위 업체 정보 수정</h4>
                        <p className="text-[12px] text-zinc-500 mt-0.5">
                          ID: <span className="font-mono font-bold text-violet-300">{editingSubCompany.id}</span>
                          {' · '}
                          대표: {editingSubCompany.parentCompanyId}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setEditingSubCompany(null)}
                        className="p-1.5 text-zinc-500 hover:bg-neutral-800 hover:text-zinc-200 rounded-full"
                      >
                        <X size={16} />
                      </button>
                    </div>
                    <div className="px-5 py-3 space-y-3 overflow-y-auto flex-1 min-h-0">
                      <PartnerProfileFormFields
                        profile={editSubProfile}
                        onChange={setEditSubProfile}
                        companyId={editingSubCompany.id}
                        variant="dark"
                      />
                    </div>
                    <div className="shrink-0 flex gap-2 px-5 py-3 border-t border-neutral-800 bg-[#1C1C1E]">
                      <button
                        type="button"
                        onClick={() => setEditingSubCompany(null)}
                        className="flex-1 py-3 bg-neutral-800 hover:bg-neutral-700 text-zinc-300 font-black rounded-xl"
                      >
                        취소
                      </button>
                      <button
                        type="button"
                        onClick={(e) => void handleSaveSubEdit(e as unknown as React.FormEvent)}
                        className="flex-1 py-3 bg-violet-600 text-white rounded-xl font-black hover:bg-violet-700"
                      >
                        저장
                      </button>
                    </div>
                  </div>
                </div>
              </div>,
              document.body
            )}
        </div>
      )}

      {activeTab === 'create' && (
        <form onSubmit={handleCreatePartner} className="space-y-3 bg-[#1C1C1E] p-4 rounded-2xl border border-neutral-800 text-xs text-left">
          <div className="border-b border-neutral-800 pb-2 mb-2">
            <h4 className="text-xs font-black text-zinc-100">신규 제휴 가맹점 입점 승인</h4>
            <p className="text-[11.5px] text-zinc-500">대표 업체는 B2B 로그인·통합 관리, 하위 업체는 B2C 전용입니다.</p>
          </div>

          <div className="grid grid-cols-2 gap-2 p-1 bg-neutral-900 rounded-xl border border-neutral-800">
            <button
              type="button"
              onClick={() => setRegisterKind('primary')}
              className={`py-2 rounded-lg text-[12px] font-black transition-all ${
                registerKind === 'primary' ? 'bg-[#141416] text-zinc-50 shadow-xs border border-neutral-700' : 'text-zinc-500'
              }`}
            >
              대표 업체 (B2B 로그인)
            </button>
            <button
              type="button"
              onClick={() => {
                if (!canRegisterSub) {
                  alert('하위 업체를 등록하려면 먼저 「대표 업체」를 등록해 주세요.');
                  return;
                }
                setRegisterKind('sub');
              }}
              disabled={!canRegisterSub}
              className={`py-2 rounded-lg text-[12px] font-black transition-all ${
                registerKind === 'sub'
                  ? 'bg-[#141416] text-violet-200 shadow-xs border border-violet-500/30'
                  : canRegisterSub
                    ? 'text-zinc-500'
                    : 'text-zinc-600 cursor-not-allowed'
              }`}
            >
              하위 업체 (B2C만)
            </button>
          </div>

          {registerKind === 'sub' && (
            <div>
              <label className="text-[12px] text-zinc-300 block mb-1 font-extrabold">소속 대표 업체 *</label>
              {!canRegisterSub ? (
                <p className="text-[12px] text-rose-400 font-bold py-2">
                  등록된 대표 업체가 없습니다. 먼저 「대표 업체 (B2B 로그인)」 탭에서 대표를 등록하세요.
                </p>
              ) : (
                <select
                  required
                  value={newParentId}
                  onChange={(e) => setNewParentId(e.target.value)}
                  className="w-full px-3 py-2 border border-neutral-700 bg-[#141416] rounded-xl focus:outline-none focus:ring-1 focus:ring-violet-500/50 font-bold text-zinc-100"
                >
                  <option value="">대표 업체 선택</option>
                  {primaryCandidates.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.id})
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[12px] text-zinc-300 block mb-1 font-extrabold">
                {registerKind === 'sub' ? 'B2C 노출용 ID (로그인 없음) *' : '가맹점 고유 식별 코드 (companyId) *'}
              </label>
              <input
                type="text"
                required
                value={newId}
                onChange={e => setNewId(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                className="w-full px-3 py-2 border border-neutral-700 bg-[#141416] rounded-xl focus:outline-none focus:ring-1 focus:ring-amber-500/40 font-mono font-bold text-zinc-100 placeholder:text-zinc-600"
                placeholder="예: flight24"
              />
            </div>
            {registerKind === 'primary' && (
            <div>
              <label className="text-[12px] text-zinc-300 block mb-1 font-extrabold">임시 로그인 비밀번호 *</label>
              <input
                type="password"
                required={registerKind === 'primary'}
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                className="w-full px-3 py-2 border border-neutral-700 bg-[#141416] rounded-xl focus:outline-none focus:ring-1 focus:ring-amber-500/40 font-mono text-zinc-100 placeholder:text-zinc-600"
                placeholder="비밀번호 설정"
              />
            </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[12px] text-zinc-300 block mb-1 font-extrabold">가맹사 법인명 (상호명) *</label>
              <input
                type="text"
                required
                value={newName}
                onChange={e => setNewName(e.target.value)}
                className="w-full px-3 py-2 border border-neutral-700 bg-[#141416] rounded-xl focus:outline-none focus:ring-1 focus:ring-amber-500/40 font-bold text-zinc-100 placeholder:text-zinc-600"
                placeholder="예: 스타 발렛 파킹"
              />
            </div>
            <div>
              <label className="text-[12px] text-zinc-300 block mb-1 font-extrabold">대표자 성함 *</label>
              <input
                type="text"
                required
                value={newRep}
                onChange={e => setNewRep(e.target.value)}
                className="w-full px-3 py-2 border border-neutral-700 bg-[#141416] rounded-xl focus:outline-none focus:ring-1 focus:ring-amber-500/40 text-zinc-100 placeholder:text-zinc-600"
                placeholder="예: 최규동 대표"
              />
            </div>
          </div>

          <div>
            <label className="text-[12px] text-zinc-300 block mb-1 font-extrabold">업체 대표 연락처 *</label>
            <input
              type="text"
              required
              value={newPhone}
              onChange={e => setNewPhone(e.target.value)}
              className="w-full px-3 py-2 border border-neutral-700 bg-[#141416] rounded-xl focus:outline-none focus:ring-1 focus:ring-amber-500/40 font-mono text-zinc-100 placeholder:text-zinc-600"
              placeholder="예: 010-1234-5678"
            />
          </div>

          <div>
            <label className="text-[12px] text-zinc-300 block mb-1 font-extrabold">
              {registerKind === 'primary' ? '정산 방식 및 계약 조건 메모' : '메모 (선택)'}
            </label>
            <textarea
              value={newMemo}
              onChange={e => setNewMemo(e.target.value)}
              className="w-full px-3 py-2 border border-neutral-700 bg-[#141416] rounded-xl h-16 focus:outline-none focus:ring-1 focus:ring-amber-500/40 font-sans text-zinc-100 placeholder:text-zinc-600"
              placeholder={registerKind === 'primary' ? '예: 대행 수수료율 15%...' : '하위 업체 메모'}
            />
          </div>

          <PartnerProfileFormFields
            profile={newProfile}
            onChange={setNewProfile}
            companyId={newId}
            variant="dark"
          />

          <button
            type="submit"
            disabled={registerKind === 'sub' && !canRegisterSub}
            className={`w-full py-2.5 rounded-xl font-black text-xs transition-all flex items-center justify-center gap-1 shadow-xs disabled:opacity-40 disabled:cursor-not-allowed ${
              registerKind === 'sub'
                ? 'bg-violet-600 hover:bg-violet-500 text-white'
                : 'bg-amber-500 hover:bg-amber-400 text-black'
            }`}
          >
            <PlusCircle size={14} />
            {registerKind === 'sub' ? '하위 업체 등록' : '신규 대표 업체 입점 승인'}
          </button>

          {registerKind === 'primary' && (
            <PartnerOnboardingChecklist
              companyId={newId.trim().toLowerCase()}
              companyName={newName.trim() || undefined}
              variant="dark"
            />
          )}
          {registerKind === 'primary' && (
            <p className="text-[11px] text-zinc-500 text-center">
              온보딩 체크리스트는 등록 필수가 아닙니다. (운영 메모용)
            </p>
          )}
        </form>
      )}
    </div>
  );
}
