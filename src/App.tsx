import React, { useState, useEffect } from 'react';
import { 
  Search, 
  MapPin, 
  Calendar, 
  Clock, 
  Car, 
  ChevronRight, 
  ShieldCheck, 
  Settings, 
  LogOut, 
  User as UserIcon,
  Plus,
  Edit2,
  Trash2,
  Save,
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
  X,
  Phone,
  Info,
  RefreshCw,
  Bell,
  Check,
  Filter,
  Users,
  Building2,
  Lock,
  PlusCircle,
  TrendingUp,
  ArrowRightLeft
} from 'lucide-react';
import { 
  collection, 
  onSnapshot, 
  doc, 
  setDoc, 
  getDocs, 
  deleteDoc,
  updateDoc,
  query,
  where,
  orderBy
} from 'firebase/firestore';
import { 
  onAuthStateChanged, 
  signOut, 
  signInAnonymously,
  signInWithEmailAndPassword,
  User
} from 'firebase/auth';
import { db, auth, handleFirestoreError, OperationType } from './firebase';
import { motion, AnimatePresence } from 'motion/react';

// --- Utility: cn ---
function cn(...classes: (string | boolean | undefined)[]) {
  return classes.filter(Boolean).join(' ');
}

// --- Types ---
interface Company {
  id: string;
  name: string;
  is_indoor: boolean;
  supports_indoor: boolean;
  supports_outdoor: boolean;
  base_price: number;
  extra_day_price: number;
  base_days: number;
  rating: number;
  reviews_count: number;
  features: string[];
  image_url: string;
  terminals: string[];
  booking_url?: string;
  distance_score?: number;
  is_recommended?: boolean;
}

interface Reservation {
  id?: string;
  userId: string;
  companyId: string;
  companyName: string;
  userName: string;
  carModel: string;
  carNumber: string;
  phone: string;
  departureDate: string;
  departureTime: string;
  departureTerminal: 'T1' | 'T2';
  arrivalDate: string;
  arrivalTime: string;
  arrivalTerminal: 'T1' | 'T2';
  totalPrice: number;
  status: 'pending' | 'confirmed' | 'completed' | 'cancelled';
  createdAt: string;
}

// --- Initial Partners Data ---
const INITIAL_COMPANIES: Partial<Company>[] = [
  {
    name: "세일 주차대행",
    booking_url: "http://세일주차대행.com/",
    is_indoor: true,
    supports_indoor: true,
    supports_outdoor: false,
    base_price: 50000,
    extra_day_price: 10000,
    base_days: 3,
    rating: 4.8,
    reviews_count: 1250,
    features: ["100% 실내주차", "CCTV 완비", "종합보험 가입"],
    image_url: "https://images.unsplash.com/photo-1545179605-1296651e9d43?q=80&w=800&auto=format&fit=crop",
    terminals: ["T1", "T2"]
  },
  {
    name: "쿠파킹",
    booking_url: "https://www.쿠파킹.com/",
    is_indoor: true,
    supports_indoor: true,
    supports_outdoor: false,
    base_price: 50000,
    extra_day_price: 10000,
    base_days: 3,
    rating: 4.9,
    reviews_count: 980,
    features: ["실내 광폭 주차", "발렛 보험", "신속 배차"],
    image_url: "https://images.unsplash.com/photo-1621929747188-0b4dc284980c?q=80&w=800&auto=format&fit=crop",
    terminals: ["T1", "T2"]
  },
  {
    name: "에어25시",
    booking_url: "http://www.에어25시.com/",
    is_indoor: true,
    supports_indoor: true,
    supports_outdoor: false,
    base_price: 50000,
    extra_day_price: 10000,
    base_days: 3,
    rating: 4.7,
    reviews_count: 3800,
    features: ["24시간 보안", "실내 전용", "정식 업체"],
    image_url: "https://images.unsplash.com/photo-1545179605-1296651e9d43?q=80&w=800&auto=format&fit=crop",
    terminals: ["T1", "T2"]
  },
  {
    name: "세븐발렛",
    booking_url: "https://www.7park.co.kr/",
    is_indoor: true,
    supports_indoor: true,
    supports_outdoor: false,
    base_price: 50000,
    extra_day_price: 10000,
    base_days: 3,
    rating: 4.9,
    reviews_count: 2150,
    features: ["프리미엄 실내", "최고급 서비스", "보안 철저"],
    image_url: "https://images.unsplash.com/photo-1621929747188-0b4dc284980c?q=80&w=800&auto=format&fit=crop",
    terminals: ["T1", "T2"]
  },
  {
    name: "카카오T (노벨)",
    booking_url: "http://www.nobelparking.com",
    is_indoor: true,
    supports_indoor: true,
    supports_outdoor: false,
    base_price: 10000,
    extra_day_price: 12000,
    base_days: 1,
    rating: 4.8,
    reviews_count: 5200,
    features: ["카카오T 제휴", "스마트 주차", "간편 결제"],
    image_url: "https://images.unsplash.com/photo-1470224114660-3f6686c562eb?q=80&w=800&auto=format&fit=crop",
    terminals: ["T1", "T2"]
  },
  {
    name: "블루파킹",
    booking_url: "https://www.blueparking.co.kr",
    is_indoor: true,
    supports_indoor: true,
    supports_outdoor: false,
    base_price: 50000,
    extra_day_price: 10000,
    base_days: 3,
    rating: 4.8,
    reviews_count: 1450,
    features: ["블루 프리미엄", "발렛 무료", "실내 안심"],
    image_url: "https://images.unsplash.com/photo-1545179605-1296651e9d43?q=80&w=800&auto=format&fit=crop",
    terminals: ["T1", "T2"]
  },
  {
    name: "한결 주차대행",
    booking_url: "http://www.hgparking.com",
    is_indoor: true,
    supports_indoor: true,
    supports_outdoor: false,
    base_price: 50000,
    extra_day_price: 10000,
    base_days: 3,
    rating: 4.9,
    reviews_count: 890,
    features: ["한결같은 서비스", "실내 전용", "친절 상담"],
    image_url: "https://images.unsplash.com/photo-1621929747188-0b4dc284980c?q=80&w=800&auto=format&fit=crop",
    terminals: ["T1", "T2"]
  },
  {
    name: "청호 주차대행",
    booking_url: "https://www.chunghoparking.com/",
    is_indoor: true,
    supports_indoor: true,
    supports_outdoor: false,
    base_price: 50000,
    extra_day_price: 10000,
    base_days: 3,
    rating: 4.7,
    reviews_count: 650,
    features: ["안전 실내 주차", "CCTV 주시", "배상 책임"],
    image_url: "https://images.unsplash.com/photo-1545179605-1296651e9d43?q=80&w=800&auto=format&fit=crop",
    terminals: ["T1", "T2"]
  },
  {
    name: "에어로드",
    booking_url: "http://www.airroad.co.kr",
    is_indoor: true,
    supports_indoor: true,
    supports_outdoor: false,
    base_price: 50000,
    extra_day_price: 10000,
    base_days: 3,
    rating: 4.8,
    reviews_count: 1100,
    features: ["에어로드 실내", "정식 허가", "발렛 보험"],
    image_url: "https://images.unsplash.com/photo-1621929747188-0b4dc284980c?q=80&w=800&auto=format&fit=crop",
    terminals: ["T1", "T2"]
  },
  {
    name: "코코발렛",
    booking_url: "http://www.cocovalet.com",
    is_indoor: false,
    supports_indoor: false,
    supports_outdoor: true,
    base_price: 30000,
    extra_day_price: 10000,
    base_days: 4,
    rating: 4.9,
    reviews_count: 1450,
    features: ["안전 실외 주차", "CCTV 감시", "종합보험"],
    image_url: "https://images.unsplash.com/photo-1506521781263-d8422e82f27a?q=80&w=800&auto=format&fit=crop",
    terminals: ["T1", "T2"]
  }
];

const FALLBACK_COMPANIES: Company[] = INITIAL_COMPANIES.map((c, idx) => ({
  id: c.name?.replace(/\s+/g, '_') || `company_${idx}`,
  name: c.name || '',
  is_indoor: c.is_indoor ?? true,
  supports_indoor: c.supports_indoor ?? true,
  supports_outdoor: c.supports_outdoor ?? false,
  base_price: c.base_price ?? 50000,
  extra_day_price: c.extra_day_price ?? 10000,
  base_days: c.base_days ?? 3,
  rating: c.rating ?? 4.8,
  reviews_count: c.reviews_count ?? 100,
  features: c.features ?? [],
  image_url: c.image_url ?? '',
  terminals: c.terminals ?? ['T1', 'T2'],
  booking_url: c.booking_url ?? ''
}));

// --- Sub-components ---

function AdminDashboard({ 
  onClose, 
  companies, 
  onSync 
}: { 
  onClose: () => void; 
  companies: Company[]; 
  onSync: () => Promise<void> 
}) {
  const [editingCompany, setEditingCompany] = useState<Partial<Company> | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCompany?.name) return;

    const id = editingCompany.id || editingCompany.name.replace(/\s+/g, '_');
    try {
      const docRef = doc(db, 'companies', id);
      const cleanedData = {
        ...editingCompany,
        updatedAt: new Date().toISOString(),
        id: id
      };

      await setDoc(docRef, cleanedData, { merge: true });
      alert("성공적으로 저장되었습니다.");
      setEditingCompany(null);
    } catch (err: any) {
      handleFirestoreError(err, OperationType.WRITE, `companies/${id}`);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("정말 이 업체를 파트너 목록에서 삭제하시겠습니까?")) return;
    try {
      await deleteDoc(doc(db, 'companies', id));
      alert("삭제되었습니다.");
    } catch (err: any) {
      handleFirestoreError(err, OperationType.DELETE, `companies/${id}`);
    }
  };

  const filtered = companies.filter(c => c.name.toLowerCase().includes(searchQuery.toLowerCase()));

  return (
    <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-100 pb-4">
        <div>
          <h2 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <ShieldCheck className="text-blue-600" size={24} />
            파트너 업체 마스터 권한
          </h2>
          <p className="text-xs text-slate-500 mt-1">인천공항 제인 주차대행 제휴 업체의 요금 구조 및 기본 메타데이터 정보 관리</p>
        </div>
        <div className="flex gap-2">
          <button 
            type="button"
            onClick={async () => {
              if (window.confirm("기존 업체를 데이터베이스에서 초기 모형으로 리셋 복원하시겠습니까?")) {
                setIsSyncing(true);
                await onSync();
                setIsSyncing(false);
              }
            }}
            disabled={isSyncing}
            className="flex items-center gap-1.5 px-3 py-2 bg-slate-50 text-slate-600 border border-slate-300 rounded-xl hover:bg-slate-100 text-xs font-bold transition-all"
            title="기본값 동기화"
          >
            <RefreshCw size={14} className={cn(isSyncing && "animate-spin")} />
            기본 파트너 리셋
          </button>
          <button 
            type="button"
            onClick={() => setEditingCompany({
              name: '',
              is_indoor: true,
              supports_indoor: true,
              supports_outdoor: false,
              base_price: 30000,
              extra_day_price: 10000,
              base_days: 3,
              rating: 5.0,
              reviews_count: 0,
              features: ['종합보험 가입', 'CCTV 완비'],
              image_url: 'https://images.unsplash.com/photo-1545179605-1296651e9d43?q=80&w=800&auto=format&fit=crop',
              terminals: ['T1', 'T2'],
              booking_url: ''
            })}
            className="flex items-center gap-1.5 px-4 py-2.5 bg-blue-600 text-white rounded-xl text-xs font-bold hover:bg-blue-700 transition-all shadow-md shadow-blue-600/10"
          >
            <Plus size={16} />
            제휴업체 등록
          </button>
        </div>
      </div>

      {/* Query Search Bar */}
      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
        <input 
          type="text" 
          placeholder="수정하려는 제휴사 이름 검색..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-600/10 focus:bg-white transition-all outline-none"
        />
      </div>

      {/* List Table */}
      <div className="border border-slate-200 rounded-2xl overflow-hidden bg-white shadow-inner">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs sm:text-sm">
            <thead className="bg-slate-50 border-b border-slate-200 font-bold text-slate-500">
              <tr>
                <th className="px-5 py-3.5">업체명 (ID)</th>
                <th className="px-5 py-3.5">주차 방식</th>
                <th className="px-5 py-3.5">지원 터미널</th>
                <th className="px-5 py-3.5">3일 기본요금</th>
                <th className="px-5 py-3.5">일일 가산금</th>
                <th className="px-5 py-3.5 text-center">동작</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {filtered.map(company => (
                <tr key={company.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <img src={company.image_url} alt="" className="w-9 h-9 rounded-lg object-cover bg-slate-100 flex-shrink-0" />
                      <div>
                        <p className="font-bold text-slate-900">{company.name}</p>
                        <p className="text-[10px] text-slate-400 truncate max-w-[130px] font-mono mt-0.5">{company.id}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex gap-1.5 flex-wrap">
                      {company.supports_indoor && <span className="text-[10px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded-md font-bold">실내</span>}
                      {company.supports_outdoor && <span className="text-[10px] bg-emerald-50 text-emerald-600 px-1.5 py-0.5 rounded-md font-bold">실외</span>}
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <span className="font-mono text-xs bg-slate-100 px-2 py-0.5 rounded text-slate-600 font-bold">
                      {company.terminals?.join(' & ') || '없음'}
                    </span>
                  </td>
                  <td className="px-5 py-4 font-mono font-bold text-slate-900">
                    {company.base_price?.toLocaleString()}원
                  </td>
                  <td className="px-5 py-4 font-mono text-slate-600">
                    +{company.extra_day_price?.toLocaleString()}원
                  </td>
                  <td className="px-5 py-4 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <button 
                        type="button"
                        onClick={() => setEditingCompany(company)}
                        className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-slate-50 rounded"
                        title="기사요금 변경"
                      >
                        <Edit2 size={15} />
                      </button>
                      <button 
                        type="button"
                        onClick={() => handleDelete(company.id)}
                        className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-slate-50 rounded"
                        title="제휴 중단"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <div className="text-center py-12 text-slate-400 text-sm">
              일치하는 주차 대행 제휴사가 존재하지 않습니다.
            </div>
          )}
        </div>
      </div>

      {/* Insert Modal */}
      <AnimatePresence>
        {editingCompany && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setEditingCompany(null)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-xs"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="relative bg-white w-full max-w-lg rounded-[24px] shadow-2xl overflow-hidden flex flex-col"
            >
              <div className="p-5 border-b border-slate-100 flex items-center justify-between">
                <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                  <Building2 className="text-blue-600" size={18} />
                  {editingCompany.id ? '제휴 업체 정보 갱신' : '신규 제휴사 등록 수립'}
                </h3>
                <button type="button" onClick={() => setEditingCompany(null)} className="p-1.5 hover:bg-slate-100 rounded-full text-slate-400">
                  <X size={18} />
                </button>
              </div>
              
              <form onSubmit={handleSave} className="p-5 space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <label className="text-[11px] font-bold text-slate-400 block mb-1">제휴사 사명 *</label>
                    <input 
                      required
                      type="text" 
                      value={editingCompany.name} 
                      onChange={e => setEditingCompany({...editingCompany, name: e.target.value})}
                      placeholder="예시: 인천발렛 파크"
                      className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-600/10 focus:bg-white"
                    />
                  </div>

                  <div className="col-span-2">
                    <label className="text-[11px] font-bold text-slate-400 block mb-1">공식 웹 계약 URL</label>
                    <input 
                      type="url" 
                      value={editingCompany.booking_url || ''} 
                      onChange={e => setEditingCompany({...editingCompany, booking_url: e.target.value})}
                      placeholder="http://..."
                      className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-600/10"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-slate-400 block mb-1">3일 기본 요금 (원) *</label>
                    <input 
                      required
                      type="number" 
                      value={editingCompany.base_price || 0} 
                      onChange={e => setEditingCompany({...editingCompany, base_price: Number(e.target.value)})}
                      className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-slate-400 block mb-1">일별 가산 과금 (원) *</label>
                    <input 
                      required
                      type="number" 
                      value={editingCompany.extra_day_price || 0} 
                      onChange={e => setEditingCompany({...editingCompany, extra_day_price: Number(e.target.value)})}
                      className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl outline-none"
                    />
                  </div>

                  <div className="col-span-2 bg-slate-50 p-3 rounded-xl border border-slate-100 space-y-2.5">
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">업무 공정 범위 지정</p>
                    <div className="flex gap-4">
                      <label className="flex items-center gap-1.5 cursor-pointer text-xs font-medium text-slate-700">
                        <input 
                          type="checkbox" 
                          checked={editingCompany.terminals?.includes('T1')} 
                          onChange={e => {
                            const terms = editingCompany.terminals || [];
                            const newTerms = e.target.checked ? [...terms, 'T1'] : terms.filter(t => t !== 'T1');
                            setEditingCompany({...editingCompany, terminals: newTerms});
                          }}
                        />
                        <span>인천공항 T1</span>
                      </label>
                      <label className="flex items-center gap-1.5 cursor-pointer text-xs font-medium text-slate-700">
                        <input 
                          type="checkbox" 
                          checked={editingCompany.terminals?.includes('T2')} 
                          onChange={e => {
                            const terms = editingCompany.terminals || [];
                            const newTerms = e.target.checked ? [...terms, 'T2'] : terms.filter(t => t !== 'T2');
                            setEditingCompany({...editingCompany, terminals: newTerms});
                          }}
                        />
                        <span>인천공항 T2</span>
                      </label>
                    </div>
                    <div className="flex gap-4 pt-2 border-t border-slate-200/60">
                      <label className="flex items-center gap-1.5 cursor-pointer text-xs font-bold text-blue-600">
                        <input 
                          type="checkbox" 
                          checked={editingCompany.supports_indoor} 
                          onChange={e => setEditingCompany({...editingCompany, supports_indoor: e.target.checked})}
                        />
                        <span>실내 보관 지원</span>
                      </label>
                      <label className="flex items-center gap-1.5 cursor-pointer text-xs font-bold text-emerald-600">
                        <input 
                          type="checkbox" 
                          checked={editingCompany.supports_outdoor} 
                          onChange={e => setEditingCompany({...editingCompany, supports_outdoor: e.target.checked})}
                        />
                        <span>야외 차고 지원</span>
                      </label>
                    </div>
                  </div>

                  <div className="col-span-2">
                    <label className="text-[11px] font-bold text-slate-400 block mb-1">서비스 대표 이미지 주소</label>
                    <input 
                      type="text" 
                      value={editingCompany.image_url || ''} 
                      onChange={e => setEditingCompany({...editingCompany, image_url: e.target.value})}
                      className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl"
                    />
                  </div>

                  <div className="col-span-2">
                    <label className="text-[11px] font-bold text-slate-400 block mb-1">인프라 특징 (콤마로 구분)</label>
                    <input 
                      type="text" 
                      value={editingCompany.features?.join(', ') || ''} 
                      onChange={e => setEditingCompany({...editingCompany, features: e.target.value.split(',').map(s => s.trim())})}
                      placeholder="CCTV 상시녹화, 기사 책임보험, 세차서비스 연계"
                      className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl"
                    />
                  </div>
                </div>

                <div className="flex gap-2 pt-3">
                  <button 
                    type="button"
                    onClick={() => setEditingCompany(null)}
                    className="flex-1 py-2.5 bg-slate-100 text-slate-600 rounded-xl text-xs font-bold"
                  >
                    이전
                  </button>
                  <button 
                    type="submit"
                    className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl text-xs font-bold hover:bg-blue-700 transition-colors flex items-center justify-center gap-1"
                  >
                    <Save size={14} />
                    저장하기
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

// --- Main App Component ---

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [companies, setCompanies] = useState<Company[]>(FALLBACK_COMPANIES);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  
  // Active Navigation Tab for Admin/Worker Workspace
  // Requirement: Default tab is Worker ("밝은 톤의 작업자 화면이 기본 홈 화면으로 바로 뜨도록")
  const [activeTab, setActiveTab] = useState<'worker' | 'search' | 'admin'>('worker');
  
  // Loading indicators
  const [loadingCompanies, setLoadingCompanies] = useState(true);
  const [loadingReservations, setLoadingReservations] = useState(false);
  
  // Filtering Criteria (Search & Worker tab)
  const [searchQuery, setSearchQuery] = useState('');
  const [terminalFilter, setTerminalFilter] = useState<'ALL' | 'T1' | 'T2'>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'pending' | 'confirmed' | 'completed' | 'cancelled'>('ALL');
  const [parkingFilter, setParkingFilter] = useState<'ALL' | 'indoor' | 'outdoor'>('ALL');

  // Input states for Manual Booking Form
  const [showManualForm, setShowManualForm] = useState(false);
  const [selectedCompanyId, setSelectedCompanyId] = useState('');
  const [userName, setUserName] = useState('');
  const [carModel, setCarModel] = useState('');
  const [carNumber, setCarNumber] = useState('');
  const [phone, setPhone] = useState('');
  const [departureDate, setDepartureDate] = useState(new Date().toISOString().split('T')[0]);
  const [departureTime, setDepartureTime] = useState('09:00');
  const [departureTerminal, setDepartureTerminal] = useState<'T1' | 'T2'>('T1');
  const [arrivalDate, setArrivalDate] = useState(new Date(Date.now() + 86400000 * 3).toISOString().split('T')[0]);
  const [arrivalTime, setArrivalTime] = useState('18:00');
  const [arrivalTerminal, setArrivalTerminal] = useState<'T1' | 'T2'>('T2');
  const [isSubmittingBooking, setIsSubmittingBooking] = useState(false);

  // Administrative credentials login form (for B2B role testing)
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [loginEmail, setLoginEmail] = useState('ingompunch@gmail.com');
  const [loginPassword, setLoginPassword] = useState('admin1234');
  const [loginError, setLoginError] = useState('');

  // 1. Listen for Authentication Shifts
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
    });
    return () => unsub();
  }, []);

  // 2. Perform Automatic Anonymous Login on boot if not already authenticated,
  // to ensure Firestore queries do not invoke "PERMISSION_DENIED" errors per security rules!
  useEffect(() => {
    const checkAndAuth = async () => {
      if (!auth.currentUser) {
        try {
          await signInAnonymously(auth);
        } catch (e: any) {
          if (e && (e.code === 'auth/admin-restricted-operation' || e.message?.includes('admin-restricted-operation'))) {
            console.log("Anonymous Auth is restricted/disabled. Attempting auto-login with default test credentials...");
            try {
              await signInWithEmailAndPassword(auth, 'ingompunch@gmail.com', 'admin1234');
              console.log("Auto-login as ingress admin ingompunch@gmail.com succeeded.");
            } catch (autoErr) {
              console.warn("Auto-credential admin login failed (credentials might need registration):", autoErr);
            }
          } else {
            console.error("Auto sign-in anonymously failed:", e);
          }
        }
      }
    };
    checkAndAuth();
  }, []);

  // 3. Companies Listener
  useEffect(() => {
    setLoadingCompanies(true);
    const unsub = onSnapshot(collection(db, 'companies'), (snap) => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() } as Company));
      if (data.length > 0) {
        setCompanies(data);
      } else {
        setCompanies(FALLBACK_COMPANIES);
      }
      setLoadingCompanies(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'companies');
      setCompanies(FALLBACK_COMPANIES);
      setLoadingCompanies(false);
    });
    return () => unsub();
  }, []);

  // Pre-select the first company as default for booking when companies list updates
  useEffect(() => {
    if (companies.length > 0 && !selectedCompanyId) {
      setSelectedCompanyId(companies[0].id);
    }
  }, [companies, selectedCompanyId]);

  // 4. Reservations Listener (Dynamically scopes database pulls of valet schedule based on authorization level)
  useEffect(() => {
    if (!user) {
      const local = localStorage.getItem('local_reservations');
      if (local) {
        try {
          setReservations(JSON.parse(local));
        } catch (_) {
          setReservations([]);
        }
      } else {
        setReservations([]);
      }
      return;
    }
    setLoadingReservations(true);

    const isAdminUser = user.email === 'drive5746@gmail.com' || user.email === 'ingompunch@gmail.com';
    let q;
    
    // Admins pull entire schedules; generic anonymous logins default to owner-scope per firestore.rules
    if (isAdminUser) {
      q = query(collection(db, 'reservations'), orderBy('createdAt', 'desc'));
    } else {
      q = query(collection(db, 'reservations'), where('userId', '==', user.uid));
    }

    const unsub = onSnapshot(q, (snap) => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() } as Reservation));
      if (data.length > 0) {
        setReservations(data);
        localStorage.setItem('local_reservations', JSON.stringify(data));
      } else {
        const local = localStorage.getItem('local_reservations');
        if (local) {
          try {
            setReservations(JSON.parse(local));
          } catch (_) {
            setReservations([]);
          }
        } else {
          setReservations([]);
        }
      }
      setLoadingReservations(false);
    }, (err) => {
      console.warn("Retrying query with user filter due to permissions check...");
      const fallbackQuery = query(collection(db, 'reservations'), where('userId', '==', user.uid));
      onSnapshot(fallbackQuery, (fallbackSnap) => {
        const data = fallbackSnap.docs.map(docu => ({ id: docu.id, ...docu.data() } as Reservation));
        if (data.length > 0) {
          setReservations(data);
          localStorage.setItem('local_reservations', JSON.stringify(data));
        } else {
          const local = localStorage.getItem('local_reservations');
          if (local) {
            try {
              setReservations(JSON.parse(local));
            } catch (_) {
              setReservations([]);
            }
          }
        }
        setLoadingReservations(false);
      }, (failError) => {
        console.error("Standard user query failed, loading from local cache: ", failError);
        const local = localStorage.getItem('local_reservations');
        if (local) {
          try {
            setReservations(JSON.parse(local));
          } catch (_) {
            setReservations([]);
          }
        }
        setLoadingReservations(false);
      });
    });

    return () => unsub();
  }, [user]);

  // Sync / Reset default parking partners database
  const seedData = async () => {
    try {
      const snap = await getDocs(collection(db, 'companies'));
      for (const d of snap.docs) {
        await deleteDoc(doc(db, 'companies', d.id));
      }
      for (const c of INITIAL_COMPANIES) {
        const id = c.name?.replace(/\s+/g, '_') || 'unknown';
        await setDoc(doc(db, 'companies', id), { 
          ...c, 
          base_days: c.base_days || 3,
          updatedAt: new Date().toISOString() 
        });
      }
    } catch (e: any) {
      handleFirestoreError(e, OperationType.WRITE, 'companies');
    }
  };

  // Pricing formula logic based on days duration
  const getCalculatePrice = (company: Company, start: string, end: string) => {
    const sDate = new Date(start);
    const eDate = new Date(end);
    const diffTime = Math.abs(eDate.getTime() - sDate.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) || 1;
    const baseDays = company.base_days || 3;
    if (diffDays <= baseDays) return company.base_price;
    return company.base_price + (diffDays - baseDays) * company.extra_day_price;
  };

  // Status badge style parser
  const getStatusBadge = (status: Reservation['status']) => {
    switch (status) {
      case 'pending':
        return { text: '대기 (출국수거 필요)', bg: 'bg-amber-100 text-amber-700 font-bold border border-amber-200' };
      case 'confirmed':
        return { text: '입고 (차고지 보관)', bg: 'bg-blue-100 text-blue-700 font-bold border border-blue-200' };
      case 'completed':
        return { text: '인도완료 (입국차 전달)', bg: 'bg-emerald-100 text-emerald-700 font-bold border border-emerald-200' };
      case 'cancelled':
        return { text: '취소 수립', bg: 'bg-slate-100 text-slate-500 line-through border border-slate-200' };
      default:
        return { text: '대기 중', bg: 'bg-slate-100 text-slate-700' };
    }
  };

  // Authenticate custom emails (eg, 'ingompunch@gmail.com' for checking admin mechanics)
  const handleCredentialLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    try {
      await signInWithEmailAndPassword(auth, loginEmail, loginPassword);
      setShowLoginModal(false);
      alert(`${loginEmail} 계정으로 관리 자격 증명서가 로드되었습니다!`);
    } catch (err: any) {
      setLoginError(err.message || '인증 오류가 발생했습니다. 비밀번호를 다시 확인바랍니다.');
    }
  };

  // Log out current session and fall back to clean anonymous
  const handleOperatorLogout = async () => {
    try {
      await signOut(auth);
      try {
        await signInAnonymously(auth);
        alert("로그아웃되었습니다. 체험용 익명 모드로 즉시 재인증되었습니다.");
      } catch (anonErr: any) {
        if (anonErr && (anonErr.code === 'auth/admin-restricted-operation' || anonErr.message?.includes('admin-restricted-operation'))) {
          alert("로그아웃되었습니다. (익명 로그인은 비활성화되어 있으므로 관리자 자격 증명으로 로그인해 주십시오.)");
        } else {
          alert("로그아웃되었습니다.");
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Create a simulated client booking
  const handleCreateSimulationBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCompanyId) {
      alert("요금을 매길 전담 주차 대행사를 지정해주십시오.");
      return;
    }
    
    setIsSubmittingBooking(true);
    const partner = companies.find(c => c.id === selectedCompanyId);
    if (!partner) return;

    const totalPrice = getCalculatePrice(partner, departureDate, arrivalDate);
    const id = `res_${Date.now()}`;
    const targetUserId = user ? user.uid : 'anonymous_guest';

    const bookingPayload = {
      userId: targetUserId,
      companyId: partner.id,
      companyName: partner.name,
      userName: userName.trim() || '테스트고객',
      carModel: carModel.trim() || '제네시스 GV80',
      carNumber: carNumber.trim() || '12가 3456',
      phone: phone.trim() || '010-1234-5678',
      departureDate,
      departureTime,
      departureTerminal,
      arrivalDate,
      arrivalTime,
      arrivalTerminal,
      totalPrice,
      status: 'pending' as const,
      createdAt: new Date().toISOString()
    };

    try {
      if (user) {
        await setDoc(doc(db, 'reservations', id), bookingPayload);
        alert("신규 위탁예약 스케줄이 실시간 대시보드 검증 시스템에 추가 발부되었습니다!");
      } else {
        throw new Error("No active firebase user session.");
      }
    } catch (err: any) {
      console.warn("Firestore save failed, falling back to local storage path:", err);
      // Append to local reservations cache
      setReservations(prev => {
        const updated = [{ id, ...bookingPayload }, ...prev];
        localStorage.setItem('local_reservations', JSON.stringify(updated));
        return updated;
      });
      alert("신규 위탁예약 스케줄이 (로컬 백업 메모리)에 성공적으로 수립되었습니다!");
    } finally {
      setShowManualForm(false);
      // clean form values
      setUserName('');
      setCarModel('');
      setCarNumber('');
      setPhone('');
      setIsSubmittingBooking(false);
    }
  };

  // Mutate valet booking status (worker flow transitions)
  const handleUpdateValetStatus = async (resId: string, nextStatus: Reservation['status']) => {
    try {
      const docRef = doc(db, 'reservations', resId);
      await updateDoc(docRef, { 
        status: nextStatus,
        updatedAt: new Date().toISOString()
      });
    } catch (err: any) {
      console.warn("Firestore update state failed, migrating locally...", err);
      setReservations(prev => {
        const updated = prev.map(r => r.id === resId ? { ...r, status: nextStatus, updatedAt: new Date().toISOString() } : r);
        localStorage.setItem('local_reservations', JSON.stringify(updated));
        return updated;
      });
      alert(`배차 현황이 성공적으로 변경되었습니다! (로컬 백업 반영)`);
    }
  };

  // Filter reservations based on current operator UI query
  const filteredReservations = reservations.filter(res => {
    const termStr = `${res.userName} ${res.carNumber} ${res.carModel} ${res.phone} ${res.companyName}`.toLowerCase();
    const queryMatch = termStr.includes(searchQuery.toLowerCase());
    
    const termMatch = terminalFilter === 'ALL' || 
                      res.departureTerminal === terminalFilter || 
                      res.arrivalTerminal === terminalFilter;
    
    const statusMatch = statusFilter === 'ALL' || res.status === statusFilter;
    
    return queryMatch && termMatch && statusMatch;
  });

  // KPI Count Calculations
  const kpiTotal = reservations.length;
  const kpiPending = reservations.filter(r => r.status === 'pending').length;
  const kpiConfirmed = reservations.filter(r => r.status === 'confirmed').length;
  const kpiCompleted = reservations.filter(r => r.status === 'completed').length;
  const kpiCancelled = reservations.filter(r => r.status === 'cancelled').length;

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 selection:bg-blue-600 selection:text-white pb-16">
      
      {/* Real-time Operator Status Header Banner */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-50 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex flex-col md:flex-row justify-between items-center gap-4">
          
          {/* Logo Brand / Workspace designation */}
          <div className="flex items-center gap-3 w-full md:w-auto justify-between md:justify-start">
            <div className="flex items-center gap-2">
              <div className="bg-blue-600 p-2 rounded-xl text-white shadow-md shadow-blue-600/10">
                <Car size={20} className="animate-pulse" />
              </div>
              <div>
                <h1 className="text-base font-black tracking-tight flex items-center gap-1.5 font-paperlogy text-slate-800">
                  AirPick2 <span className="text-[10px] font-sans font-extrabold px-1.5 py-0.5 bg-blue-100 text-blue-800 rounded-md">B2B</span>
                </h1>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tight">Airport Valet Operator Core</p>
              </div>
            </div>
            
            {/* Terminal active clock for physical valet updates */}
            <div className="bg-slate-100 hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-xl border border-slate-200">
              <Clock size={13} className="text-slate-500" />
              <span className="text-xs font-mono text-slate-600 font-bold">
                인천공항 UTC+9: {new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
          </div>

          {/* Quick Controls & Admin Credentials Check */}
          <div className="flex items-center gap-3 w-full md:w-auto justify-end">
            
            <div className="hidden lg:flex flex-col text-right">
              <span className="text-[10px] font-bold text-slate-400 uppercase">Operator ID</span>
              <span className="text-xs font-bold text-slate-700 font-mono truncate max-w-[150px]">
                {user?.isAnonymous ? '익명 마스터 세션' : user?.email}
              </span>
            </div>

            {/* Quick Demo Credentials Prefill Toggle */}
            <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl border border-slate-200">
              {!(user?.email === 'ingompunch@gmail.com' || user?.email === 'drive5746@gmail.com') ? (
                <button 
                  type="button"
                  onClick={() => {
                    setLoginEmail('ingompunch@gmail.com');
                    setShowLoginModal(true);
                  }}
                  className="px-2.5 py-1.5 text-[11px] bg-white border border-slate-300 rounded-lg text-slate-700 font-bold hover:bg-slate-50 hover:border-slate-400 transition-all flex items-center gap-1"
                >
                  <Lock size={12} className="text-blue-600" />
                  관리자 계정 전환
                </button>
              ) : (
                <div className="flex items-center gap-2 px-2.5 py-1">
                  <span className="text-[10.5px] font-black text-emerald-600 flex items-center gap-1">
                    <ShieldCheck size={13} />
                    최고관리자 권한
                  </span>
                  <button 
                    type="button"
                    onClick={handleOperatorLogout}
                    className="p-1 hover:bg-slate-200 text-slate-500 rounded-md"
                    title="로그아웃"
                  >
                    <LogOut size={13} />
                  </button>
                </div>
              )}
            </div>

            <button 
              type="button"
              onClick={() => setShowManualForm(true)}
              className="px-3.5 py-2 bg-blue-600 text-white rounded-xl text-xs font-black hover:bg-blue-700 transition-all shadow-md shadow-blue-500/15 flex items-center gap-1.5"
            >
              <PlusCircle size={14} />
              수동 위탁수립
            </button>
          </div>
        </div>
      </header>

      {/* Main Container Core */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-6">
        
        {/* Workspace Quick KPI Counters */}
        <section className="grid grid-cols-2 md:grid-cols-5 gap-3.5 mb-6">
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-3.5">
            <div className="bg-slate-100 p-2.5 rounded-xl text-slate-600">
              <Users size={20} />
            </div>
            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-tight">종합 위탁 계약</p>
              <p className="text-xl font-black font-mono mt-0.5 text-slate-800">{kpiTotal}건</p>
            </div>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-3.5">
            <div className="bg-amber-50 p-2.5 rounded-xl text-amber-600">
              <Clock size={20} />
            </div>
            <div>
              <p className="text-[10px] font-black text-amber-500 uppercase tracking-tight">출국 인계대기</p>
              <p className="text-xl font-black font-mono mt-0.5 text-amber-700">{kpiPending}건</p>
            </div>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-3.5">
            <div className="bg-blue-50 p-2.5 rounded-xl text-blue-600">
              <TrendingUp size={20} />
            </div>
            <div>
              <p className="text-[10px] font-black text-blue-500 uppercase tracking-tight">실시간 입고보관</p>
              <p className="text-xl font-black font-mono mt-0.5 text-blue-700">{kpiConfirmed}건</p>
            </div>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-3.5">
            <div className="bg-emerald-50 p-2.5 rounded-xl text-emerald-600">
              <CheckCircle2 size={20} />
            </div>
            <div>
              <p className="text-[10px] font-black text-emerald-500 uppercase tracking-tight">출고 인도완료</p>
              <p className="text-xl font-black font-mono mt-0.5 text-emerald-700">{kpiCompleted}건</p>
            </div>
          </div>

          <div className="col-span-2 md:col-span-1 bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-3.5">
            <div className="bg-slate-100 p-2.5 rounded-xl text-slate-500">
              <X size={20} />
            </div>
            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-tight">취소 요청건</p>
              <p className="text-xl font-black font-mono mt-0.5 text-slate-600">{kpiCancelled}건</p>
            </div>
          </div>
        </section>

        {/* Primary Functional Tabs Header (Bright design) */}
        <section className="bg-white border border-slate-200 rounded-2xl p-1.5 flex flex-wrap gap-1 mb-6">
          <button 
            type="button"
            onClick={() => setActiveTab('worker')}
            className={cn(
              "flex-1 min-w-[120px] py-3 px-4 rounded-xl text-xs sm:text-sm font-black tracking-tight transition-all flex items-center justify-center gap-2",
              activeTab === 'worker' ? "bg-blue-600 text-white shadow-lg shadow-blue-600/10" : "text-slate-600 hover:bg-slate-50"
            )}
          >
            <Users size={16} />
            배차 입출고 상황판 (WORKER)
          </button>
          
          <button 
            type="button"
            onClick={() => setActiveTab('search')}
            className={cn(
              "flex-1 min-w-[120px] py-3 px-4 rounded-xl text-xs sm:text-sm font-black tracking-tight transition-all flex items-center justify-center gap-2",
              activeTab === 'search' ? "bg-blue-600 text-white shadow-lg shadow-blue-600/10" : "text-slate-600 hover:bg-slate-50"
            )}
          >
            <Search size={16} />
            제휴업체 요금조회 (SEARCH)
          </button>

          <button 
            type="button"
            onClick={() => setActiveTab('admin')}
            className={cn(
              "flex-1 min-w-[120px] py-3 px-4 rounded-xl text-xs sm:text-sm font-black tracking-tight transition-all flex items-center justify-center gap-2",
              activeTab === 'admin' ? "bg-blue-600 text-white shadow-lg shadow-blue-600/10" : "text-slate-600 hover:bg-slate-50"
            )}
          >
            <Settings size={16} />
            제휴업체 고유데이터 관리 (ADMIN)
          </button>
        </section>

        {/* Dynamic Display Rendering */}
        <AnimatePresence mode="wait">
          
          {/* TAB 1: Worker Core Dashboard */}
          {activeTab === 'worker' && (
            <motion.div
              key="worker_tab"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              transition={{ duration: 0.15 }}
              className="space-y-6"
            >
              
              {/* Query filter suite for operators */}
              <div className="bg-white border border-slate-200 rounded-3xl p-5 space-y-4 shadow-xs">
                <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                  
                  {/* Search text query */}
                  <div className="md:col-span-5 relative">
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                    <input 
                      type="text" 
                      placeholder="고객명, 차종, 차량번호, 발레제휴사로 검색..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full pl-10 pr-3.5 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm focus:ring-2 focus:ring-blue-600/10 focus:bg-white border-slate-200 transition-all outline-none"
                    />
                  </div>

                  {/* Terminal filter */}
                  <div className="md:col-span-3 flex bg-slate-100 p-1 rounded-xl">
                    <button 
                      type="button"
                      onClick={() => setTerminalFilter('ALL')}
                      className={cn("flex-1 py-2 rounded-lg text-xs font-bold transition-all", terminalFilter === 'ALL' ? "bg-white text-slate-800 shadow-sm" : "text-slate-500")}
                    >전체 터미널</button>
                    <button 
                      type="button"
                      onClick={() => setTerminalFilter('T1')}
                      className={cn("flex-1 py-2 rounded-lg text-xs font-bold transition-all", terminalFilter === 'T1' ? "bg-white text-slate-800 shadow-sm" : "text-slate-500")}
                    >인천공항 T1</button>
                    <button 
                      type="button"
                      onClick={() => setTerminalFilter('T2')}
                      className={cn("flex-1 py-2 rounded-lg text-xs font-bold transition-all", terminalFilter === 'T2' ? "bg-white text-slate-800 shadow-sm" : "text-slate-500")}
                    >인천공항 T2</button>
                  </div>

                  {/* Status filter selection tabs */}
                  <div className="md:col-span-4 flex bg-slate-100 p-1 rounded-xl">
                    <select
                      value={statusFilter}
                      onChange={(e) => setStatusFilter(e.target.value as any)}
                      className="w-full bg-transparent text-xs text-slate-700 font-bold border-none outline-none focus:ring-0 px-2 py-2 cursor-pointer"
                    >
                      <option value="ALL">🔍 모든 보관 상태 검색</option>
                      <option value="pending">대기 (수거 대상 고지)</option>
                      <option value="confirmed">confirmed (입고완료 보관중)</option>
                      <option value="completed">completed (출고완료 인도함)</option>
                      <option value="cancelled">cancelled (차량 취소/미인계)</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Real-time Reservation Valet list */}
              {loadingReservations ? (
                <div className="py-24 text-center space-y-3">
                  <RefreshCw className="animate-spin text-blue-600 mx-auto" size={30} />
                  <p className="text-sm font-medium text-slate-500">실시간 데이터베이스 스케줄 갱신 중...</p>
                </div>
              ) : filteredReservations.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {filteredReservations.map((res) => {
                    const badge = getStatusBadge(res.status);
                    return (
                      <div 
                        key={res.id} 
                        className="bg-white rounded-3xl p-5 border border-slate-200/80 shadow-xs hover:border-blue-600/30 transition-all flex flex-col justify-between gap-4"
                      >
                        
                        {/* Upper Header info of the booking */}
                        <div className="space-y-3">
                          <div className="flex justify-between items-start gap-2">
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-black text-slate-900">{res.userName} 고객님</span>
                                <span className="text-[10px] bg-slate-100 text-slate-600 border border-slate-200 px-2 py-0.5 rounded-md font-bold font-mono">
                                  {res.phone}
                                </span>
                              </div>
                              <p className="text-[10px] text-slate-400 mt-1 uppercase font-bold tracking-tight">
                                위탁 가맹사: <span className="text-slate-600 font-extrabold">{res.companyName}</span>
                              </p>
                            </div>
                            <span className={cn("text-[10px] px-2.5 py-1 rounded-lg uppercase tracking-wider", badge.bg)}>
                              {badge.text}
                            </span>
                          </div>

                          {/* Car model details & registration plate (CRITICAL FOR WORKER) */}
                          <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100 flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2.5">
                              <div className="bg-white p-2 rounded-xl border border-slate-200 text-blue-600 flex-shrink-0">
                                <Car size={16} />
                              </div>
                              <div>
                                <p className="text-xs text-slate-400 font-bold">차량모델 및 플레이트 넘버</p>
                                <p className="text-sm font-black text-slate-800">{res.carModel}</p>
                              </div>
                            </div>
                            <div className="bg-white text-slate-800 px-3 py-1.5 rounded-xl border-2 border-slate-700 font-black font-mono text-xs sm:text-sm tracking-wide shadow-xs shrink-0 select-all">
                              {res.carNumber}
                            </div>
                          </div>

                          {/* Date details for valets */}
                          <div className="grid grid-cols-2 gap-2 text-xs">
                            <div className="border border-slate-100 p-2.5 rounded-xl space-y-1">
                              <span className="text-[9.5px] font-black text-amber-600 uppercase flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                                출국수거 ({res.departureTerminal})
                              </span>
                              <p className="font-bold text-slate-700">{res.departureDate}</p>
                              <p className="text-[10px] font-mono text-slate-400 mt-0.5">{res.departureTime} 인천공항 입구</p>
                            </div>

                            <div className="border border-slate-100 p-2.5 rounded-xl space-y-1">
                              <span className="text-[9.5px] font-black text-emerald-600 uppercase flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                입국반납 ({res.arrivalTerminal})
                              </span>
                              <p className="font-bold text-slate-700">{res.arrivalDate}</p>
                              <p className="text-[10px] font-mono text-slate-400 mt-0.5">{res.arrivalTime} 터미널 전달</p>
                            </div>
                          </div>
                        </div>

                        {/* Valuation fee info and work actions */}
                        <div className="border-t border-slate-100 pt-3.5 flex items-center justify-between gap-3 flex-wrap sm:flex-nowrap">
                          <div>
                            <span className="text-[9.5px] font-bold text-slate-400 block uppercase">위탁 예상 총 과금</span>
                            <span className="text-base font-black text-blue-600 font-mono">{res.totalPrice?.toLocaleString()}원</span>
                          </div>

                          {/* Work assignment actions */}
                          <div className="flex gap-1.5 w-full sm:w-auto justify-end">
                            {res.status === 'pending' && (
                              <button
                                type="button"
                                onClick={() => handleUpdateValetStatus(res.id || '', 'confirmed')}
                                className="flex-1 sm:flex-none px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-[11px] font-black transition-all flex items-center justify-center gap-1 shadow-sm shadow-blue-600/10"
                              >
                                <Check size={12} />
                                차량수거 입고화
                              </button>
                            )}

                            {res.status === 'confirmed' && (
                              <button
                                type="button"
                                onClick={() => handleUpdateValetStatus(res.id || '', 'completed')}
                                className="flex-1 sm:flex-none px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-[11px] font-black transition-all flex items-center justify-center gap-1 shadow-sm shadow-emerald-600/10"
                              >
                                <CheckCircle2 size={12} />
                                차량출고 반납완료
                              </button>
                            )}

                            {res.status !== 'cancelled' && res.status !== 'completed' && (
                              <button
                                type="button"
                                onClick={() => {
                                  if (window.confirm("이 고객님의 예약을 수동 철회/취소 처리합니까?")) {
                                    handleUpdateValetStatus(res.id || '', 'cancelled');
                                  }
                                }}
                                className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-400 hover:text-red-500 rounded-xl transition-all"
                                title="예약 취소"
                              >
                                <X size={13} />
                              </button>
                            )}
                          </div>
                        </div>

                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="bg-white border border-slate-200 rounded-3xl p-16 text-center space-y-4">
                  <div className="bg-slate-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto text-slate-300">
                    <Car size={32} />
                  </div>
                  <div className="space-y-1 max-w-sm mx-auto">
                    <p className="text-sm font-black text-slate-800">일치하는 실시간 입출고 위탁 일정이 없습니다</p>
                    <p className="text-xs text-slate-400">우측 상단 [수동 위탁수립]을 눌러 테스트용 고객 예약 스케줄을 실시간 생성해보세요.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowManualForm(true)}
                    className="px-4 py-2 bg-slate-100 font-bold hover:bg-slate-200/80 rounded-xl text-xs text-slate-600 inline-flex items-center gap-1"
                  >
                    지금 모의 발렛 생성해보기
                  </button>
                </div>
              )}
            </motion.div>
          )}

          {/* TAB 2: Partner search list (B2B searchable list) */}
          {activeTab === 'search' && (
            <motion.div
              key="search_tab"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              transition={{ duration: 0.15 }}
              className="space-y-6"
            >
              <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs space-y-6">
                <div>
                  <h2 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-2">
                    <Building2 className="text-blue-600" size={24} />
                    제휴 주차사 계약 조건 비교 상황판
                  </h2>
                  <p className="text-xs text-slate-500 mt-1">현장 출장기사 및 수거요원의 요금 대조 수동 계산을 지원합니다.</p>
                </div>

                {/* Filters */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 bg-slate-50 p-4 rounded-2xl border border-slate-200/80">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-bold text-slate-400 uppercase">가목 사명 검색</label>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                      <input 
                        type="text" 
                        placeholder="사명 검색..." 
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        className="w-full text-xs pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-xl outline-none"
                      />
                    </div>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-bold text-slate-400 uppercase">지원 터미널</label>
                    <div className="flex bg-white p-0.5 rounded-xl border border-slate-200">
                      <button 
                        type="button"
                        onClick={() => setTerminalFilter('ALL')}
                        className={cn("flex-1 py-1.5 rounded-lg text-xs font-bold", terminalFilter === 'ALL' ? "bg-slate-800 text-white" : "text-slate-500")}
                      >전체</button>
                      <button 
                        type="button"
                        onClick={() => setTerminalFilter('T1')}
                        className={cn("flex-1 py-1.5 rounded-lg text-xs font-bold", terminalFilter === 'T1' ? "bg-slate-800 text-white" : "text-slate-500")}
                      >T1</button>
                      <button 
                        type="button"
                        onClick={() => setTerminalFilter('T2')}
                        className={cn("flex-1 py-1.5 rounded-lg text-xs font-bold", terminalFilter === 'T2' ? "bg-slate-800 text-white" : "text-slate-500")}
                      >T2</button>
                    </div>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-bold text-slate-400 uppercase">보관 장소 구분</label>
                    <div className="flex bg-white p-0.5 rounded-xl border border-slate-200">
                      <button 
                        type="button"
                        onClick={() => setParkingFilter('ALL')}
                        className={cn("flex-1 py-1.5 rounded-lg text-xs font-bold", parkingFilter === 'ALL' ? "bg-slate-800 text-white" : "text-slate-500")}
                      >전체</button>
                      <button 
                        type="button"
                        onClick={() => setParkingFilter('indoor')}
                        className={cn("flex-1 py-1.5 rounded-lg text-xs font-bold", parkingFilter === 'indoor' ? "bg-blue-600 text-white" : "text-slate-500")}
                      >실내전용</button>
                      <button 
                        type="button"
                        onClick={() => setParkingFilter('outdoor')}
                        className={cn("flex-1 py-1.5 rounded-lg text-xs font-bold", parkingFilter === 'outdoor' ? "bg-emerald-600 text-white" : "text-slate-500")}
                      >실외전용</button>
                    </div>
                  </div>
                </div>

                {/* Grid Lists of Partner Companies info */}
                {loadingCompanies ? (
                  <div className="text-center py-12">
                    <RefreshCw className="animate-spin text-blue-600 mx-auto mb-3" />
                    <span>파트너 계약 정보를 로딩하는 중...</span>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {companies.filter(c => {
                      // Text Query Match
                      const textMat = c.name.toLowerCase().includes(searchQuery.toLowerCase());
                      
                      // Terminal Filter Match
                      const termMat = terminalFilter === 'ALL' || c.terminals.includes(terminalFilter);
                      
                      // Parking Type Filter Match
                      const parkMat = parkingFilter === 'ALL' || 
                                     (parkingFilter === 'indoor' && c.supports_indoor) ||
                                     (parkingFilter === 'outdoor' && c.supports_outdoor);

                      return textMat && termMat && parkMat;
                    }).map(c => (
                      <div key={c.id} className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3 flex flex-col justify-between hover:bg-slate-100/50 transition-colors">
                        <div className="flex justify-between items-start gap-4">
                          <div className="flex gap-3">
                            <img src={c.image_url} alt="" className="w-12 h-12 rounded-xl object-cover bg-slate-200 flex-shrink-0" />
                            <div>
                              <h4 className="font-bold text-slate-900 text-sm">{c.name}</h4>
                              <div className="flex items-center gap-1.5 mt-1">
                                {c.supports_indoor && <span className="text-[9px] font-bold bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded">실내 공인차고</span>}
                                {c.supports_outdoor && <span className="text-[9px] font-bold bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded">실외 감시차고</span>}
                              </div>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-[10px] text-slate-400 uppercase font-bold">기본 요율 (3일구간)</p>
                            <p className="text-sm font-black text-blue-600 font-mono">{c.base_price?.toLocaleString()}원</p>
                          </div>
                        </div>

                        <div className="flex justify-between items-center bg-white p-2 rounded-xl border border-slate-200 text-xs">
                          <span className="text-slate-400 font-bold">추가 초과일당 가산액</span>
                          <span className="font-mono text-slate-700 font-black">+{c.extra_day_price?.toLocaleString()}원 / 일</span>
                        </div>

                        <div className="flex flex-wrap gap-1">
                          {c.features.map(feat => (
                            <span key={feat} className="text-[10px] text-slate-500 bg-white border border-slate-200.5 rounded-md px-1.5 py-0.5 font-medium">#{feat}</span>
                          ))}
                        </div>

                        {c.booking_url && (
                          <div className="pt-2 text-right">
                            <a 
                              href={c.booking_url} 
                              target="_blank" 
                              rel="noreferrer" 
                              className="text-[10.5px] text-blue-600 font-extrabold hover:underline inline-flex items-center gap-1"
                            >
                              제휴사 스마트 예약페이지 열기
                              <ChevronRight size={12} />
                            </a>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {/* TAB 3: Administrative Control Dashboard Panel */}
          {activeTab === 'admin' && (
            <motion.div
              key="admin_tab"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              transition={{ duration: 0.15 }}
            >
              <AdminDashboard 
                onClose={() => setActiveTab('worker')} 
                companies={companies} 
                onSync={seedData} 
              />
            </motion.div>
          )}

        </AnimatePresence>
      </main>

      {/* Manual Booking Form Modal Component */}
      <AnimatePresence>
        {showManualForm && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowManualForm(false)}
              className="absolute inset-x-0 inset-y-0 bg-slate-900/40 backdrop-blur-xs"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="relative bg-white w-full max-w-xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
            >
              <div className="p-5 border-b border-slate-100 flex items-center justify-between">
                <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
                  <PlusCircle className="text-blue-600" size={18} />
                  수동 위탁수립 계약서 발행 (상황판 모의테스트용)
                </h3>
                <button type="button" onClick={() => setShowManualForm(false)} className="p-1.5 hover:bg-slate-100 rounded-full text-slate-400">
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleCreateSimulationBooking} className="p-5 overflow-y-auto space-y-4">
                
                <div className="grid grid-cols-2 gap-3">
                  
                  {/* Select Partner company */}
                  <div className="col-span-2">
                    <label className="text-[11px] font-bold text-slate-400 block mb-1">담당 위임 주차대행사 지정 *</label>
                    <select 
                      required
                      value={selectedCompanyId}
                      onChange={e => setSelectedCompanyId(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm"
                    >
                      <option value="">-- 주차 계약사를 선택하세요 --</option>
                      {companies.map(c => (
                        <option key={c.id} value={c.id}>
                          {c.name} (3일기준 기본: {c.base_price?.toLocaleString()}원, 일일가산 {c.extra_day_price?.toLocaleString()}원)
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Customer Information */}
                  <div>
                    <label className="text-[11px] font-bold text-slate-400 block mb-1">위탁고객 실명 *</label>
                    <input 
                      required
                      type="text" 
                      value={userName}
                      onChange={e => setUserName(e.target.value)}
                      placeholder="김철수"
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-slate-400 block mb-1">연락처 핸드폰번호 *</label>
                    <input 
                      required
                      type="text" 
                      value={phone}
                      onChange={e => setPhone(e.target.value)}
                      placeholder="010-1234-5678"
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm"
                    />
                  </div>

                  {/* Car specifications */}
                  <div>
                    <label className="text-[11px] font-bold text-slate-400 block mb-1">차종 브랜드 모델 *</label>
                    <input 
                      required
                      type="text" 
                      value={carModel}
                      onChange={e => setCarModel(e.target.value)}
                      placeholder="제네시스 GV80 / 아반떼"
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-slate-400 block mb-1">차량 번호 플레이트 *</label>
                    <input 
                      required
                      type="text" 
                      value={carNumber}
                      onChange={e => setCarNumber(e.target.value)}
                      placeholder="350오 1234"
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 font-bold"
                    />
                  </div>

                  {/* Flight Outgoing Pick Details */}
                  <div className="col-span-2 border-t border-slate-100 pt-3">
                    <p className="text-[10px] font-black text-amber-500 uppercase tracking-wider mb-2">출국수거 (차량 보관 입고 정보)</p>
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-slate-400 block mb-1">출국 일자 *</label>
                    <input 
                      required
                      type="date" 
                      value={departureDate}
                      onChange={e => setDepartureDate(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-slate-400 block mb-1">출국 수거 예정시각 *</label>
                    <input 
                      required
                      type="time" 
                      value={departureTime}
                      onChange={e => setDepartureTime(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-slate-400 block mb-1">출국터미널 선택 *</label>
                    <div className="flex bg-slate-100 p-1 rounded-xl">
                      <button 
                        type="button"
                        onClick={() => setDepartureTerminal('T1')}
                        className={cn("flex-1 py-1 text-xs font-bold rounded-lg", departureTerminal === 'T1' ? "bg-white text-slate-900 shadow-xs" : "text-slate-500")}
                      >인천공항 제1터미널</button>
                      <button 
                        type="button"
                        onClick={() => setDepartureTerminal('T2')}
                        className={cn("flex-1 py-1 text-xs font-bold rounded-lg", departureTerminal === 'T2' ? "bg-white text-slate-900 shadow-xs" : "text-slate-500")}
                      >인천공항 제2터미널</button>
                    </div>
                  </div>

                  <div className="col-span-2 border-t border-slate-100 pt-3">
                    <p className="text-[10px] font-black text-emerald-500 uppercase tracking-wider mb-2">입국인도 (차량 출고 반납 정보)</p>
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-slate-400 block mb-1">입국 일자 *</label>
                    <input 
                      required
                      type="date" 
                      value={arrivalDate}
                      onChange={e => setArrivalDate(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-slate-400 block mb-1">입국 인도 예정시각 *</label>
                    <input 
                      required
                      type="time" 
                      value={arrivalTime}
                      onChange={e => setArrivalTime(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-slate-400 block mb-1">입국터미널 지정 *</label>
                    <div className="flex bg-slate-100 p-1 rounded-xl">
                      <button 
                        type="button"
                        onClick={() => setArrivalTerminal('T1')}
                        className={cn("flex-1 py-1 text-xs font-bold rounded-lg", arrivalTerminal === 'T1' ? "bg-white text-slate-900 shadow-xs" : "text-slate-500")}
                      >인천공항 제1터미널</button>
                      <button 
                        type="button"
                        onClick={() => setArrivalTerminal('T2')}
                        className={cn("flex-1 py-1 text-xs font-bold rounded-lg", arrivalTerminal === 'T2' ? "bg-white text-slate-900 shadow-xs" : "text-slate-500")}
                      >인천공항 제2터미널</button>
                    </div>
                  </div>

                </div>

                <div className="flex gap-2 pt-4 border-t border-slate-100">
                  <button 
                    type="button"
                    onClick={() => setShowManualForm(false)}
                    className="flex-1 py-3 bg-slate-100 text-slate-600 rounded-xl text-xs font-bold"
                  >
                    이전
                  </button>
                  <button 
                    type="submit"
                    disabled={isSubmittingBooking}
                    className="flex-1 py-3 bg-blue-600 text-white rounded-xl text-xs font-black shadow-lg shadow-blue-500/10 flex items-center justify-center gap-1.5"
                  >
                    {isSubmittingBooking ? <RefreshCw className="animate-spin" size={14} /> : <Save size={14} />}
                    스케줄 수립 및 등록
                  </button>
                </div>

              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Auth credentials panel for evaluating Admin Roles */}
      <AnimatePresence>
        {showLoginModal && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowLoginModal(false)}
              className="absolute inset-0 bg-slate-900/45 backdrop-blur-xs"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative bg-white w-full max-w-sm rounded-2xl shadow-xl p-6"
            >
              <h3 className="text-base font-black text-slate-900 mb-2 flex items-center gap-2">
                <Lock className="text-blue-600" size={18} />
                최고 관리자 자격 서명서
              </h3>
              <p className="text-xs text-slate-400 mb-4">시작 시 지정한 Firestore 보안 규칙을 준수하여 예약 삭제 및 제휴 조건 변경을 수행하기 위해 서명합니다.</p>
              
              <form onSubmit={handleCredentialLogin} className="space-y-4">
                {loginError && (
                  <div className="p-3 bg-red-50 text-red-600 text-[11px] font-bold rounded-lg flex items-center gap-1">
                    <AlertCircle size={14} />
                    {loginError}
                  </div>
                )}
                
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase">이메일 계정 주소</label>
                  <select 
                    value={loginEmail}
                    onChange={e => setLoginEmail(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800"
                  >
                    <option value="ingompunch@gmail.com">ingompunch@gmail.com (운영진)</option>
                    <option value="drive5746@gmail.com">drive5746@gmail.com (개발사)</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase">보안 비밀번호</label>
                  <input 
                    type="password"
                    value={loginPassword}
                    onChange={e => setLoginPassword(e.target.value)}
                    placeholder="비밀번호"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs"
                  />
                  <p className="text-[9px] text-slate-400">Firebase 콘솔에서 사전에 등록하신 승인 자격 비밀번호를 사용하십시오.</p>
                </div>

                <div className="flex gap-2 pt-2">
                  <button 
                    type="button"
                    onClick={() => setShowLoginModal(false)}
                    className="flex-1 py-2 bg-slate-100 text-slate-600 rounded-lg text-xs font-bold"
                  >
                    닫기
                  </button>
                  <button 
                    type="submit"
                    className="flex-1 py-2 bg-blue-600 text-white rounded-lg text-xs font-black shadow-md shadow-blue-500/10"
                  >
                    승인 서명
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
