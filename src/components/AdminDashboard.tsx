import React, { useState } from 'react';
import { 
  Edit, 
  Trash2, 
  PlusCircle, 
  X 
} from 'lucide-react';
import { 
  doc, 
  updateDoc, 
  setDoc, 
  deleteDoc 
} from 'firebase/firestore';
import { db } from '../firebase';
import { Company, Reservation, PartnerCompany } from '../types';

// --- KST Date Utility Helpers ---
const getKSTDateOnlyString = () => {
  const kstDate = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return kstDate.toISOString().split('T')[0];
};

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
  onSync,
  partners,
  onUpdatePartners,
  onUpdateCompanies
}: { 
  onClose: () => void; 
  companies: Company[]; 
  onSync: () => Promise<void>;
  partners: PartnerCompany[];
  onUpdatePartners: (updated: PartnerCompany[]) => void;
  onUpdateCompanies: (updated: Company[]) => void;
}) {
  const [activeTab, setActiveTab] = useState<'create' | 'partners'>('create');
  
  // State for editing a partner company
  const [editingPartner, setEditingPartner] = useState<PartnerCompany | null>(null);
  const [editName, setEditName] = useState('');
  const [editRep, setEditRep] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editPassword, setEditPassword] = useState('');
  const [editMemo, setEditMemo] = useState('');

  const handleStartEdit = (p: PartnerCompany) => {
    setEditingPartner(p);
    setEditName(p.name);
    setEditRep(p.representative);
    setEditPhone(p.phone);
    setEditPassword(p.password || '');
    setEditMemo(p.settlementMemo || '');
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPartner) return;
    if (!editName || !editRep || !editPhone) {
      alert('모든 필수 항목을 입력해주십시오.');
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
        return {
          ...c,
          name: editName.trim(),
          phone: editPhone.trim(),
          representative: editRep.trim()
        };
      }
      return c;
    });
    onUpdateCompanies(updatedCompanies);
    safeStorage.setItem('companies', JSON.stringify(updatedCompanies));

    // 3. Update in Firestore (non-blocking background task to prevent sandboxed iframe hangs)
    updateDoc(doc(db, 'companies', targetId), {
      name: editName.trim(),
      phone: editPhone.trim(),
      representative: editRep.trim(),
      password: editPassword,
      settlementMemo: editMemo.trim(),
      status: editingPartner.status || 'active',
      updatedAt: new Date().toISOString()
    }).catch(err => {
      console.warn("Firestore updateDoc for partner edit failed:", err);
    });

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

  const handleCreatePartner = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newId || !newPassword || !newName || !newRep || !newPhone) {
      alert('모든 필수 입력 단락 항목을 작성해주십시오.');
      return;
    }

    const cleanId = newId.trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
    if (!cleanId) {
      alert('유효하지 않은 고유 ID 형식입니다. 영문 소문자와 숫자 및 언더바(_)만 허용됩니다.');
      return;
    }

    if (partners.some(p => p.companyId === cleanId)) {
      alert('이미 등록된 동일한 업체 고유 ID 코드가 존재합니다. 다른 아이디로 변경해주십시오.');
      return;
    }

    // Direct Firestore company skeleton generation
    const newCompany: Company = {
      id: cleanId,
      name: newName.trim(),
      phone: newPhone.trim(),
      representative: newRep.trim(),
      is_indoor: true,
      supports_indoor: true,
      supports_outdoor: true,
      base_price: 15000,
      extra_day_price: 5000,
      base_days: 1,
      rating: 4.8,
      reviews_count: 12,
      features: ['기본 자율 요금 설정 상태'],
      image_url: 'https://images.unsplash.com/photo-1542282088-fe8426682b8f?auto=format&fit=crop&q=80',
      terminals: ['T1', 'T2'],
      isOpen: true,
      outdoorBasePrice: 15000,
      outdoorBaseDays: 1,
      outdoorExtraPrice: 5000,
      indoorBasePrice: 30000,
      indoorBaseDays: 1,
      indoorExtraPrice: 10000,
      surchargeStartTime: '20:00',
      surchargeEndTime: '05:00',
      surchargePrice: 10000,
      t2Surcharge: 0,
      peakStartTime: '',
      peakEndTime: '',
      peakSurcharge: 0
    };

    // Save full credentials to Firestore in background (non-blocking to prevent iframe hangs)
    setDoc(doc(db, 'companies', cleanId), {
      ...newCompany,
      password: newPassword,
      settlementMemo: newMemo.trim() || '지급 기본 정산 기준 보류',
      status: 'active',
      representative: newRep.trim(),
      phone: newPhone.trim(),
      updatedAt: new Date().toISOString()
    }).catch(err => {
      console.warn("Firestore setDoc for automatic brand-new tenant registration failed:", err);
    });

    const newPartner: PartnerCompany = {
      companyId: cleanId,
      password: newPassword,
      name: newName.trim(),
      representative: newRep.trim(),
      phone: newPhone.trim(),
      settlementMemo: newMemo.trim() || '지급 기본 정산 기준 보류',
      status: 'active'
    };

    const nextList = [...partners, newPartner];
    onUpdatePartners(nextList);
    safeStorage.setItem('super_partners_list', JSON.stringify(nextList));

    // Instant local companies sync for global dropdown synchronization
    const nextCompanies = [...(companies || []).filter(c => c.id !== cleanId), newCompany];
    onUpdateCompanies(nextCompanies);
    safeStorage.setItem('companies', JSON.stringify(nextCompanies));

    // Dynamic clean isolation key initialization
    const localKey = `${cleanId}_reservations`;
    if (!safeStorage.getItem(localKey)) {
      safeStorage.setItem(localKey, JSON.stringify([]));
    }

    alert(`[${newName}] 신규 제휴 업체 계정 및 파이어베이스 자율 요금 템플릿 개설이 완벽히 완료되었습니다!\n이제 아이디 '${cleanId}' 로 로그인이 가능합니다.`);
    
    // Reset fields
    setNewId('');
    setNewPassword('');
    setNewName('');
    setNewRep('');
    setNewPhone('');
    setNewMemo('');
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
        await deleteDoc(doc(db, 'companies', companyId));
      } catch (err: any) {
        console.warn("Firestore deleteDoc failed:", err);
      }

      // 4. Clean up reservations/drivers local storage keys
      try {
        window.localStorage.removeItem(`${companyId}_reservations`);
        window.localStorage.removeItem(`${companyId}_drivers`);
      } catch (_) {}

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
          <div className="bg-white p-3.5 rounded-2xl border border-slate-100 flex items-center justify-between text-left">
            <div>
              <h4 className="text-xs font-black text-slate-900">제휴사 통합 모니터링 및 수정/삭제 관리</h4>
              <p className="text-[10px] text-slate-450 mt-0.5">시스템에 등록된 제휴 대행사들을 검토하고 요율 및 계약 조건을 수정하거나 불필요한 업체를 파기합니다.</p>
            </div>
            <span className="text-[10px] bg-red-50 text-red-700 px-2.5 py-1 rounded-xl font-bold font-mono shrink-0">
              총 {(partners || []).length}개 지사
            </span>
          </div>

          <div className="border border-slate-200/60 bg-white rounded-2xl overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100 text-[9px] text-slate-400 font-extrabold tracking-wider">
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
                    return (
                      <tr key={p.companyId} className={`hover:bg-slate-55/60 transition-all text-xs ${isSuspended ? 'bg-slate-55/40 text-slate-400' : 'text-slate-700'}`}>
                        <td className="py-3 px-3 text-left">
                          <div className="font-bold text-slate-900 flex items-center gap-1.5 flex-wrap">
                            <span>{p.name}</span>
                            <span className="text-[9px] font-mono text-indigo-600 bg-indigo-50/80 px-1 py-0.2 rounded font-black uppercase">
                              {p.companyId}
                            </span>
                          </div>
                          <div className="text-[10px] text-slate-400 font-medium mt-0.5">
                            대표: {p.representative} • {p.phone}
                          </div>
                          <div className="text-[9px] bg-slate-100/60 border border-slate-200/30 p-1 rounded-lg mt-1 text-slate-500 font-mono inline-block">
                            정산: {p.settlementMemo}
                          </div>
                        </td>
                        <td className="py-3 px-2 align-middle text-center">
                          <button
                            type="button"
                            onClick={() => handleToggleStatus(p.companyId)}
                            className={`px-2.5 py-1.5 text-[10px] font-extrabold rounded-lg inline-flex items-center gap-1 border transition-all ${
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
                          <div className="text-[10px] text-slate-800 font-black">금일 {stats.todayCompleted}건</div>
                          <div className="text-[9px] text-slate-450 font-bold mt-0.5">월간 {stats.monthlyCompleted}건</div>
                        </td>
                        <td className="py-3 px-3 align-middle text-right whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => handleStartEdit(p)}
                            className="px-2 py-1.5 bg-slate-50 border border-slate-200 text-slate-755 hover:bg-indigo-50 hover:text-indigo-600 hover:border-indigo-200 rounded-lg text-[10px] font-black tracking-tight inline-flex items-center gap-1 transition-all mr-1.5"
                          >
                            <Edit size={11} />
                            수정
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeletePartner(p.companyId, p.name)}
                            className="px-2 py-1.5 bg-rose-50 border border-rose-200 text-rose-600 hover:bg-rose-650 hover:text-white rounded-lg text-[10px] font-black tracking-tight inline-flex items-center gap-1 transition-all"
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
              <div className="bg-white w-full max-w-md rounded-2xl shadow-xl overflow-hidden flex flex-col p-5 text-xs text-left">
                <div className="flex items-center justify-between pb-3 border-b border-slate-150 mb-4">
                  <div>
                    <h4 className="text-sm font-black text-slate-900">🏢 제휴 가맹점 정보 수정</h4>
                    <p className="text-[10px] text-slate-450 mt-0.5">고유 ID: <span className="font-mono font-bold text-indigo-600 bg-indigo-50 px-1 py-0.2 rounded">{editingPartner.companyId}</span></p>
                  </div>
                  <button 
                    type="button" 
                    onClick={() => setEditingPartner(null)} 
                    className="p-1.5 text-slate-400 hover:bg-slate-100 rounded-full"
                  >
                    <X size={16} />
                  </button>
                </div>
                
                <form onSubmit={handleSaveEdit} className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] text-slate-500 block mb-1 font-bold">가맹사 법인명 (상호명) *</label>
                      <input 
                        type="text" 
                        required
                        value={editName}
                        onChange={e => setEditName(e.target.value)}
                        className="w-full px-3 py-2 border border-slate-200 bg-white text-slate-900 rounded-xl focus:outline-none focus:ring-1 focus:ring-indigo-500 font-bold"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-slate-500 block mb-1 font-bold">대표자 성함 *</label>
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
                      <label className="text-[10px] text-slate-500 block mb-1 font-bold">업체 대표 연락처 *</label>
                      <input 
                        type="text" 
                        required
                        value={editPhone}
                        onChange={e => setEditPhone(e.target.value)}
                        className="w-full px-3 py-2 border border-slate-200 bg-white text-slate-900 rounded-xl focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono font-semibold"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-slate-500 block mb-1 font-bold">로그인 비밀번호</label>
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
                     <label className="text-[10px] text-slate-500 block mb-1 font-bold">정산 방식 및 계약 조건 메모</label>
                     <textarea
                       value={editMemo}
                       onChange={e => setEditMemo(e.target.value)}
                       className="w-full px-3 py-2 border border-slate-200 bg-white text-slate-900 rounded-xl h-20 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-sans font-medium"
                     />
                  </div>

                  <div className="flex gap-2 pt-3 border-t border-slate-100">
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
        </div>
      )}

      {activeTab === 'create' && (
        <form onSubmit={handleCreatePartner} className="space-y-3 bg-white p-4 rounded-2xl border border-slate-100 text-xs text-left">
          <div className="border-b border-slate-100 pb-2 mb-2">
            <h4 className="text-xs font-black text-slate-850">신규 제휴 가맹점 입점 승인</h4>
            <p className="text-[9.5px] text-slate-600">새 업체 계정을 발급하면 해당 ID 전용 사물함 및 파티션이 자동 할당됩니다.</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] text-slate-800 block mb-1 font-extrabold">가맹점 고유 식별 코드 (companyId) *</label>
              <input
                type="text"
                required
                value={newId}
                onChange={e => setNewId(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono font-bold text-slate-900 placeholder:text-slate-400"
                placeholder="예: flight24"
              />
            </div>
            <div>
              <label className="text-[10px] text-slate-800 block mb-1 font-extrabold">임시 로그인 비밀번호 *</label>
              <input
                type="password"
                required
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono text-slate-900 placeholder:text-slate-400"
                placeholder="비밀번호 설정"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] text-slate-800 block mb-1 font-extrabold">가맹사 법인명 (상호명) *</label>
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
              <label className="text-[10px] text-slate-800 block mb-1 font-extrabold">대표자 성함 *</label>
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
            <label className="text-[10px] text-slate-800 block mb-1 font-extrabold">업체 대표 연락처 *</label>
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
            <label className="text-[10px] text-slate-800 block mb-1 font-extrabold">정산 방식 및 계약 조건 메모</label>
            <textarea
              value={newMemo}
              onChange={e => setNewMemo(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-xl h-16 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-sans text-slate-900 placeholder:text-slate-450"
              placeholder="예: 대행 수수료율 15% 고정, 익월 10일 정기 정산지급 구조..."
            />
          </div>

          <button
            type="submit"
            className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-black text-xs transition-all flex items-center justify-center gap-1 shadow-xs"
          >
            <PlusCircle size={14} />
            신규 제휴 가맹점 입점 승인
          </button>
        </form>
      )}
    </div>
  );
}
