import { useState } from 'react';
import type { Company, PartnerCompany, Reservation } from '../types';
import AdminDashboard from './AdminDashboard';
import HqPartnerBoardView from './HqPartnerBoardView';
import AcquisitionFunnelView from './AcquisitionFunnelView';
import { writePartnersToStorage } from '../utils/partnerSync';
import { AIRPICK_HQ_ID } from '../constants/platform';

type TabId = 'board' | 'edit' | 'qr';

type Props = {
  reservations: Reservation[];
  companies: Company[];
  partners: PartnerCompany[];
  onUpdateCompanies: (updated: Company[]) => void;
  onUpdatePartners: (updated: PartnerCompany[]) => void;
  onToggleCompanyOpen?: (companyId: string, isOpen: boolean) => Promise<void> | void;
  onRemoteOpenCompany?: (companyId: string) => void;
  onOpenPartnerEditor?: () => void;
  onOpenReviews?: (companyId: string) => void;
  onBack?: () => void;
  initialTab?: TabId;
};

function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ');
}

/**
 * 본사 「② 주차 업체」 — 상태 · 등록·편집 · 명함 QR.
 * 매출·예약 대시보드와 역할을 겹치지 않게 유지.
 */
export default function HqParkingPartnersView({
  reservations,
  companies,
  partners,
  onUpdateCompanies,
  onUpdatePartners,
  onToggleCompanyOpen,
  onRemoteOpenCompany,
  onOpenPartnerEditor,
  onOpenReviews,
  onBack,
  initialTab = 'board',
}: Props) {
  const [tab, setTab] = useState<TabId>(initialTab);

  return (
    <div className="bg-black min-h-screen text-zinc-100">
      <div className="px-4 pt-4 pb-3 space-y-3 border-b border-neutral-900">
        <div>
          <h2 className="text-sm font-black text-white">주차 업체</h2>
          <p className="text-[11px] text-zinc-500 font-semibold mt-0.5">
            운영 상태 · 등록 · 명함 QR. 마케팅 제휴는 ⑤.
          </p>
        </div>

        <div className="flex gap-6">
          {(
            [
              { id: 'board' as const, label: '상태' },
              { id: 'edit' as const, label: '등록·편집' },
              { id: 'qr' as const, label: '명함 QR' },
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={cn(
                'pb-2 text-[12px] font-black border-b-2 -mb-px transition-colors',
                tab === item.id
                  ? 'text-amber-400 border-amber-400'
                  : 'text-zinc-500 border-transparent hover:text-zinc-300'
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {tab === 'board' ? (
        <HqPartnerBoardView
          embedded
          companies={companies}
          onUpdateCompanies={onUpdateCompanies}
          onToggleCompanyOpen={async (companyId, isOpen) => {
            if (onToggleCompanyOpen) await onToggleCompanyOpen(companyId, isOpen);
          }}
          onRemoteOpen={(companyId) => onRemoteOpenCompany?.(companyId)}
          onOpenPartnerEditor={() => {
            setTab('edit');
            onOpenPartnerEditor?.();
          }}
          onOpenReviews={onOpenReviews}
        />
      ) : tab === 'edit' ? (
        <div className="px-4 pt-3 pb-20">
          <AdminDashboard
            onClose={() => onBack?.()}
            companies={companies}
            partners={partners}
            reservations={reservations}
            onUpdatePartners={(updated) => {
              onUpdatePartners(updated);
              writePartnersToStorage(updated);
            }}
            onUpdateCompanies={(updated) => {
              onUpdateCompanies(updated);
              localStorage.setItem('companies', JSON.stringify(updated));
            }}
          />
        </div>
      ) : (
        <AcquisitionFunnelView
          companies={companies}
          currentCompanyId={AIRPICK_HQ_ID}
          isSuperAdmin
        />
      )}
    </div>
  );
}
