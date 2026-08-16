import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ExternalLink,
  Eye,
  Globe,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  X,
} from 'lucide-react';
import { auth } from '../firebase';
import { adminUpsertCompany } from '../lib/adminCompanyApi';
import type { Company, PartnerCompany } from '../types';
import {
  buildPartnerHomepageConfig,
  partnerHomepageBookingUrl,
  partnerMarketingHomeUrl,
  type PartnerHomepageConfig,
  type PartnerHomepageDoc,
} from '../utils/partnerHomepageDefaults';
import HomepagePreview from './HomepagePreview';

type PairItem = { title: string; body: string };
type FaqItem = { question: string; answer: string };
type TrustItem = { value: string; label: string };
type TabId = 'basic' | 'copy' | 'guide' | 'fees';

type FormState = {
  enabled: boolean;
  name: string;
  phone: string;
  tagline: string;
  headline: string;
  address: string;
  region: string;
  serviceAreaLabel: string;
  insuranceLabel: string;
  customerCountLabel: string;
  representative: string;
  whyUsTitle: string;
  whyUsSub: string;
  whyUsItems: PairItem[];
  highlights: PairItem[];
  steps: PairItem[];
  faqs: FaqItem[];
  trustItems: TrustItem[];
};

function insuranceLabelFromCompany(company: Company | undefined): string {
  if (!company) return '현대해상 책임보험 가입';
  const ins = company.insurance;
  if (ins?.enrolled && (ins.provider || company.insuranceProvider)) {
    const provider = (ins.provider || company.insuranceProvider || '').trim();
    return provider ? `${provider} 책임보험 가입` : '책임보험 가입';
  }
  if (company.hasInsurance && company.insuranceProvider) {
    return `${company.insuranceProvider} 책임보험 가입`;
  }
  return '현대해상 책임보험 가입';
}

function addressFromCompany(company: Company | undefined): string {
  if (!company) return '';
  const lots = company.parkingLots || [];
  const first = lots.find((l) => l.parkingAddress?.trim())?.parkingAddress?.trim();
  if (first) return first;
  return company.indoorParkingAddress?.trim() || company.outdoorParkingAddress?.trim() || '';
}

function photoUrlsFromCompany(company: Company | undefined): string[] {
  if (!company) return [];
  if (Array.isArray(company.image_urls) && company.image_urls.length) {
    return company.image_urls.map((u) => String(u || '').trim()).filter(Boolean);
  }
  const one = company.image_url?.trim();
  return one ? [one] : [];
}

function pricingFromCompany(company: Company | undefined) {
  if (!company) return undefined;
  const baseFee = Number(company.indoorBasePrice ?? company.base_price) || undefined;
  const baseDays = Number(company.indoorBaseDays ?? company.base_days) || undefined;
  const dailyAfter = Number(company.indoorExtraPrice ?? company.extra_day_price) || undefined;
  const nightFee = Number(company.surchargePrice) || undefined;
  const parseH = (t?: string) => {
    if (!t) return undefined;
    const m = t.match(/^(\d{1,2})/);
    if (!m) return undefined;
    const h = Number(m[1]);
    return Number.isFinite(h) ? h : undefined;
  };
  return {
    ...(baseFee != null ? { baseFee } : {}),
    ...(baseDays != null ? { baseDays } : {}),
    ...(dailyAfter != null ? { dailyAfter } : {}),
    ...(nightFee != null ? { nightFee } : {}),
    ...(parseH(company.surchargeStartTime) != null
      ? { nightFromHour: parseH(company.surchargeStartTime) }
      : {}),
    ...(parseH(company.surchargeEndTime) != null
      ? { nightUntilHour: parseH(company.surchargeEndTime) }
      : {}),
  };
}

function pairList(v: unknown): PairItem[] | null {
  if (!Array.isArray(v)) return null;
  const out = v
    .map((it) => {
      if (!it || typeof it !== 'object') return null;
      const o = it as Record<string, unknown>;
      return { title: String(o.title ?? '').trim(), body: String(o.body ?? '').trim() };
    })
    .filter((x): x is PairItem => !!x && (x.title !== '' || x.body !== ''));
  return out.length ? out : null;
}

function faqList(v: unknown): FaqItem[] | null {
  if (!Array.isArray(v)) return null;
  const out = v
    .map((it) => {
      if (!it || typeof it !== 'object') return null;
      const o = it as Record<string, unknown>;
      return {
        question: String(o.question ?? '').trim(),
        answer: String(o.answer ?? '').trim(),
      };
    })
    .filter((x): x is FaqItem => !!x && (x.question !== '' || x.answer !== ''));
  return out.length ? out : null;
}

function trustList(v: unknown): TrustItem[] | null {
  if (!Array.isArray(v)) return null;
  const out = v
    .map((it) => {
      if (!it || typeof it !== 'object') return null;
      const o = it as Record<string, unknown>;
      return { value: String(o.value ?? '').trim(), label: String(o.label ?? '').trim() };
    })
    .filter((x): x is TrustItem => !!x && (x.value !== '' || x.label !== ''));
  return out.length ? out : null;
}

function seedForm(partner: PartnerCompany, company: Company | undefined): FormState {
  const existing = company?.partnerHomepage?.config as
    | Partial<PartnerHomepageConfig>
    | undefined;

  const name =
    (existing?.name as string) || partner.name || company?.name || '';
  const phone =
    (existing?.phones as { booking?: string } | undefined)?.booking ||
    partner.phone ||
    company?.phone ||
    '';
  const tagline = (existing?.tagline as string) || '인천공항 주차대행';
  const headline =
    (existing?.headline as string) || '설레는 여행의 시작, 주차 걱정까지 맡기세요';
  const address =
    (existing?.geo as { address?: string } | undefined)?.address ||
    addressFromCompany(company);
  const region = (existing?.geo as { region?: string } | undefined)?.region || '';
  const serviceAreaLabel =
    (existing?.geo as { serviceAreaLabel?: string } | undefined)?.serviceAreaLabel ||
    '인천공항 주차대행';
  const insuranceLabel =
    (existing?.insuranceLabel as string) || insuranceLabelFromCompany(company);
  const customerCountLabel = (existing?.customerCountLabel as string) || '20,000+';
  const representative = partner.representative || company?.representative || '';

  // 문구 기본값: 저장본이 있으면 그대로, 없으면 현재 기본 정보로 생성
  const gen = buildPartnerHomepageConfig({
    companyId: partner.companyId,
    name: name || partner.companyId,
    phone,
    representative: representative || undefined,
    address: address || undefined,
    region: region || undefined,
    serviceAreaLabel,
    insuranceLabel: insuranceLabel || undefined,
    customerCountLabel: customerCountLabel || undefined,
    tagline: tagline || undefined,
    headline: headline || undefined,
    pricing: pricingFromCompany(company),
  });

  const exWhyUs = existing?.whyUs as PartnerHomepageConfig['whyUs'] | undefined;

  return {
    enabled: company?.partnerHomepage?.enabled !== false,
    name,
    phone,
    tagline,
    headline,
    address,
    region,
    serviceAreaLabel,
    insuranceLabel,
    customerCountLabel,
    representative,
    whyUsTitle: exWhyUs?.title || gen.whyUs.title,
    whyUsSub: exWhyUs?.sub || gen.whyUs.sub,
    whyUsItems: pairList(exWhyUs?.items) || gen.whyUs.items,
    highlights: pairList(existing?.highlights) || gen.highlights,
    steps: pairList(existing?.steps) || gen.steps,
    faqs: faqList(existing?.faqs) || gen.faqs,
    trustItems: trustList(existing?.trustItems) || gen.trustItems,
  };
}

const inputCls =
  'w-full px-3 py-2 border border-neutral-700 bg-[#1C1C1E] text-zinc-100 rounded-xl focus:outline-none focus:ring-1 focus:ring-sky-500/40 font-semibold';
const labelCls = 'text-[12px] text-zinc-400 block mb-1 font-bold';

export default function HomepageCreateModal({
  partner,
  company,
  onClose,
  onSaved,
}: {
  partner: PartnerCompany;
  company: Company | undefined;
  onClose: () => void;
  onSaved: (next: Company) => void;
}) {
  const [form, setForm] = useState<FormState>(() => seedForm(partner, company));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<TabId>('basic');
  const [mobileView, setMobileView] = useState<'form' | 'preview'>('form');

  const photos = useMemo(() => photoUrlsFromCompany(company), [company]);
  const seedPricing = useMemo(() => pricingFromCompany(company), [company]);
  const hasExisting = Boolean(company?.partnerHomepage?.config);
  const bookingUrl = partnerHomepageBookingUrl(partner.companyId);
  const homeUrl = partnerMarketingHomeUrl(partner.companyId);

  const previewConfig = useMemo(
    () =>
      buildPartnerHomepageConfig({
        companyId: partner.companyId,
        name: form.name.trim() || partner.name || partner.companyId,
        phone: form.phone.trim(),
        representative: form.representative.trim() || undefined,
        address: form.address.trim() || undefined,
        region: form.region.trim() || undefined,
        serviceAreaLabel: form.serviceAreaLabel.trim() || undefined,
        insuranceLabel: form.insuranceLabel.trim() || undefined,
        customerCountLabel: form.customerCountLabel.trim() || undefined,
        tagline: form.tagline.trim() || undefined,
        headline: form.headline.trim() || undefined,
        photoUrls: photos,
        pricing: seedPricing,
        overrides: {
          whyUs: {
            title: form.whyUsTitle.trim(),
            sub: form.whyUsSub.trim(),
            items: form.whyUsItems
              .map((i) => ({ title: i.title.trim(), body: i.body.trim() }))
              .filter((i) => i.title || i.body),
          },
          highlights: form.highlights
            .map((i) => ({ title: i.title.trim(), body: i.body.trim() }))
            .filter((i) => i.title || i.body),
          steps: form.steps
            .map((i) => ({ title: i.title.trim(), body: i.body.trim() }))
            .filter((i) => i.title || i.body),
          faqs: form.faqs
            .map((f) => ({ question: f.question.trim(), answer: f.answer.trim() }))
            .filter((f) => f.question || f.answer),
          trustItems: form.trustItems
            .map((t) => ({ value: t.value.trim(), label: t.label.trim() }))
            .filter((t) => t.value || t.label),
        },
      }),
    [form, photos, seedPricing, partner.companyId, partner.name],
  );

  const setField =
    (key: keyof FormState) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const value =
        e.target.type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.value;
      setForm((prev) => ({ ...prev, [key]: value }));
    };

  const regenerateCopy = () => {
    const gen = buildPartnerHomepageConfig({
      companyId: partner.companyId,
      name: form.name.trim() || partner.companyId,
      phone: form.phone.trim(),
      representative: form.representative.trim() || undefined,
      address: form.address.trim() || undefined,
      region: form.region.trim() || undefined,
      serviceAreaLabel: form.serviceAreaLabel.trim() || undefined,
      insuranceLabel: form.insuranceLabel.trim() || undefined,
      customerCountLabel: form.customerCountLabel.trim() || undefined,
      tagline: form.tagline.trim() || undefined,
      headline: form.headline.trim() || undefined,
      pricing: seedPricing,
    });
    setForm((prev) => ({
      ...prev,
      whyUsTitle: gen.whyUs.title,
      whyUsSub: gen.whyUs.sub,
      whyUsItems: gen.whyUs.items,
      highlights: gen.highlights,
      steps: gen.steps,
      faqs: gen.faqs,
      trustItems: gen.trustItems,
    }));
  };

  const handleSave = async () => {
    setError('');
    if (!form.name.trim()) {
      setError('상호명을 입력해 주세요.');
      setTab('basic');
      return;
    }
    if (!form.phone.trim()) {
      setError('예약 전화를 입력해 주세요.');
      setTab('basic');
      return;
    }

    const config = previewConfig;
    const partnerHomepage: PartnerHomepageDoc = {
      enabled: form.enabled,
      updatedAt: new Date().toISOString(),
      updatedBy: auth.currentUser?.email || undefined,
      config,
    };

    setSaving(true);
    try {
      await adminUpsertCompany({
        companyId: partner.companyId,
        patch: { partnerHomepage },
      });

      const baseCompany =
        company ||
        ({
          id: partner.companyId,
          name: form.name.trim(),
          is_indoor: true,
          supports_indoor: true,
          supports_outdoor: false,
          base_price: config.pricing.baseFee,
          extra_day_price: config.pricing.dailyAfter,
          base_days: config.pricing.baseDays,
          rating: 0,
          reviews_count: 0,
          features: [],
          image_url: photos[0] || '',
          image_urls: photos,
          terminals: ['T1', 'T2'],
          phone: form.phone.trim(),
          representative: form.representative.trim() || undefined,
        } as Company);

      const nextCompany: Company = {
        ...baseCompany,
        name: form.name.trim(),
        phone: form.phone.trim(),
        representative: form.representative.trim() || baseCompany.representative,
        partnerHomepage: {
          enabled: partnerHomepage.enabled,
          updatedAt: partnerHomepage.updatedAt,
          updatedBy: partnerHomepage.updatedBy,
          config: config as unknown as Record<string, unknown>,
        },
      };
      onSaved(nextCompany);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const updatePair = (
    key: 'whyUsItems' | 'highlights' | 'steps',
    idx: number,
    field: 'title' | 'body',
    value: string,
  ) => {
    setForm((prev) => {
      const next = prev[key].map((it, i) => (i === idx ? { ...it, [field]: value } : it));
      return { ...prev, [key]: next };
    });
  };
  const addPair = (key: 'whyUsItems' | 'highlights' | 'steps') =>
    setForm((prev) => ({ ...prev, [key]: [...prev[key], { title: '', body: '' }] }));
  const removePair = (key: 'whyUsItems' | 'highlights' | 'steps', idx: number) =>
    setForm((prev) => ({ ...prev, [key]: prev[key].filter((_, i) => i !== idx) }));

  const updateFaq = (idx: number, field: 'question' | 'answer', value: string) =>
    setForm((prev) => ({
      ...prev,
      faqs: prev.faqs.map((f, i) => (i === idx ? { ...f, [field]: value } : f)),
    }));
  const addFaq = () =>
    setForm((prev) => ({ ...prev, faqs: [...prev.faqs, { question: '', answer: '' }] }));
  const removeFaq = (idx: number) =>
    setForm((prev) => ({ ...prev, faqs: prev.faqs.filter((_, i) => i !== idx) }));

  const updateTrust = (idx: number, field: 'value' | 'label', value: string) =>
    setForm((prev) => ({
      ...prev,
      trustItems: prev.trustItems.map((t, i) => (i === idx ? { ...t, [field]: value } : t)),
    }));
  const addTrust = () =>
    setForm((prev) => ({ ...prev, trustItems: [...prev.trustItems, { value: '', label: '' }] }));
  const removeTrust = (idx: number) =>
    setForm((prev) => ({ ...prev, trustItems: prev.trustItems.filter((_, i) => i !== idx) }));

  const tabs: Array<{ id: TabId; label: string }> = [
    { id: 'basic', label: '기본 정보' },
    { id: 'copy', label: '홈 문구' },
    { id: 'guide', label: '이용·FAQ' },
    { id: 'fees', label: '요금' },
  ];

  return createPortal(
    <div className="fixed inset-0 z-[99999]" role="dialog" aria-modal="true">
      <div
        className="absolute inset-0 bg-slate-950/70 backdrop-blur-xs"
        onClick={() => {
          if (!saving) onClose();
        }}
      />
      <div className="absolute inset-0 flex items-center justify-center p-4 pointer-events-none">
        <div
          className="pointer-events-auto bg-[#17171A] w-full max-w-5xl rounded-2xl shadow-xl border border-neutral-800 flex flex-col text-xs text-left overflow-hidden"
          style={{ height: 'min(92dvh, 940px)', maxHeight: '92vh' }}
        >
          {/* header */}
          <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-neutral-800 shrink-0 bg-[#1C1C1E]">
            <div>
              <h4 className="text-sm font-black text-zinc-100 flex items-center gap-1.5">
                <Globe size={14} className="text-sky-400" />
                홈페이지 관리
              </h4>
              <p className="text-[12px] text-zinc-500 mt-0.5">
                ID{' '}
                <span className="font-mono font-bold text-sky-400 bg-sky-500/10 px-1 rounded">
                  {partner.companyId}
                </span>
                · 요금은 업체 마스터가 정본 · 지도 URL 제외
              </p>
            </div>
            <div className="flex items-center gap-2">
              <label className="hidden sm:flex items-center gap-1.5 text-[12px] font-bold text-zinc-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.enabled}
                  onChange={setField('enabled')}
                  className="rounded border-neutral-600"
                />
                홈 공개
              </label>
              <button
                type="button"
                onClick={onClose}
                disabled={saving}
                className="p-1.5 text-zinc-500 hover:bg-neutral-800 hover:text-zinc-200 rounded-full disabled:opacity-40"
              >
                <X size={16} />
              </button>
            </div>
          </div>

          {/* mobile form/preview switch */}
          <div className="flex shrink-0 gap-1 border-b border-neutral-800 bg-[#1C1C1E] px-3 py-2 lg:hidden">
            <button
              type="button"
              onClick={() => setMobileView('form')}
              className={`flex-1 inline-flex items-center justify-center gap-1 rounded-lg px-3 py-1.5 text-[12px] font-bold ${
                mobileView === 'form'
                  ? 'bg-sky-500/15 text-sky-300 border border-sky-500/30'
                  : 'text-zinc-500 border border-transparent'
              }`}
            >
              <Pencil size={12} /> 입력
            </button>
            <button
              type="button"
              onClick={() => setMobileView('preview')}
              className={`flex-1 inline-flex items-center justify-center gap-1 rounded-lg px-3 py-1.5 text-[12px] font-bold ${
                mobileView === 'preview'
                  ? 'bg-sky-500/15 text-sky-300 border border-sky-500/30'
                  : 'text-zinc-500 border border-transparent'
              }`}
            >
              <Eye size={12} /> 미리보기
            </button>
          </div>

          <div className="flex flex-1 min-h-0">
            {/* left: form */}
            <div
              className={`flex flex-col min-h-0 lg:w-[30rem] lg:border-r lg:border-neutral-800 ${
                mobileView === 'form' ? 'flex-1' : 'hidden lg:flex'
              }`}
            >
              {/* tabs */}
              <div className="flex shrink-0 gap-1 border-b border-neutral-800 bg-neutral-950/60 px-3 py-2 overflow-x-auto">
                {tabs.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTab(t.id)}
                    className={`shrink-0 rounded-lg px-3 py-1.5 text-[12px] font-bold transition-all ${
                      tab === t.id
                        ? 'bg-sky-500/15 text-sky-300 border border-sky-500/30'
                        : 'text-zinc-500 border border-transparent hover:text-zinc-300'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              <div className="px-5 py-4 space-y-3 overflow-y-auto flex-1 min-h-0 overscroll-contain">
                {tab === 'basic' && (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className={labelCls}>상호명 *</label>
                        <input type="text" value={form.name} onChange={setField('name')} className={inputCls} />
                      </div>
                      <div>
                        <label className={labelCls}>예약 전화 *</label>
                        <input
                          type="text"
                          value={form.phone}
                          onChange={setField('phone')}
                          className={`${inputCls} font-mono`}
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className={labelCls}>대표자</label>
                        <input type="text" value={form.representative} onChange={setField('representative')} className={inputCls} />
                      </div>
                      <div>
                        <label className={labelCls}>서비스 지역 라벨</label>
                        <input type="text" value={form.serviceAreaLabel} onChange={setField('serviceAreaLabel')} className={inputCls} placeholder="인천공항 주차대행" />
                      </div>
                    </div>
                    <div>
                      <label className={labelCls}>태그라인</label>
                      <input type="text" value={form.tagline} onChange={setField('tagline')} className={inputCls} />
                    </div>
                    <div>
                      <label className={labelCls}>헤드라인</label>
                      <textarea value={form.headline} onChange={setField('headline')} rows={2} className={`${inputCls} resize-none`} />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className={labelCls}>주소</label>
                        <input type="text" value={form.address} onChange={setField('address')} className={inputCls} placeholder="주차장 도로명 주소" />
                      </div>
                      <div>
                        <label className={labelCls}>지역 라벨</label>
                        <input type="text" value={form.region} onChange={setField('region')} className={inputCls} placeholder="예: 인천 중구" />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className={labelCls}>보험 문구</label>
                        <input type="text" value={form.insuranceLabel} onChange={setField('insuranceLabel')} className={inputCls} />
                      </div>
                      <div>
                        <label className={labelCls}>이용 고객 수 라벨</label>
                        <input type="text" value={form.customerCountLabel} onChange={setField('customerCountLabel')} className={inputCls} placeholder="20,000+" />
                      </div>
                    </div>
                    <label className="flex items-center gap-2 text-[12px] font-bold text-zinc-200 cursor-pointer sm:hidden">
                      <input type="checkbox" checked={form.enabled} onChange={setField('enabled')} className="rounded border-neutral-600" />
                      홈 공개 (enabled)
                    </label>
                    <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-3 space-y-1 text-[11px] text-zinc-400">
                      <p className="font-bold text-zinc-300">자동 반영</p>
                      <p>사진 {photos.length}장 (업체 마스터 image_urls)</p>
                      <div className="flex flex-wrap gap-2 pt-1">
                        <a href={bookingUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sky-400 hover:text-sky-300 font-bold">
                          예약 /h/ <ExternalLink size={10} />
                        </a>
                        <a href={homeUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sky-400 hover:text-sky-300 font-bold">
                          마케팅 홈 <ExternalLink size={10} />
                        </a>
                      </div>
                    </div>
                  </>
                )}

                {tab === 'copy' && (
                  <>
                    <div className="flex items-center justify-between">
                      <p className="text-[12px] font-black text-zinc-200">신뢰 배지</p>
                      <button type="button" onClick={addTrust} className="inline-flex items-center gap-1 text-[11px] font-bold text-sky-400 hover:text-sky-300">
                        <Plus size={12} /> 추가
                      </button>
                    </div>
                    {form.trustItems.map((t, i) => (
                      <div key={i} className="flex gap-2">
                        <input type="text" value={t.value} onChange={(e) => updateTrust(i, 'value', e.target.value)} className={`${inputCls} w-24`} placeholder="100%" />
                        <input type="text" value={t.label} onChange={(e) => updateTrust(i, 'label', e.target.value)} className={inputCls} placeholder="책임보험 가입" />
                        <button type="button" onClick={() => removeTrust(i)} className="shrink-0 p-2 text-zinc-500 hover:text-rose-400"><Trash2 size={13} /></button>
                      </div>
                    ))}

                    <div className="pt-2 border-t border-neutral-800">
                      <label className={labelCls}>왜 우리인가 — 제목</label>
                      <input type="text" value={form.whyUsTitle} onChange={setField('whyUsTitle')} className={inputCls} />
                      <label className={`${labelCls} mt-2`}>왜 우리인가 — 소제목</label>
                      <input type="text" value={form.whyUsSub} onChange={setField('whyUsSub')} className={inputCls} />
                    </div>
                    <div className="flex items-center justify-between">
                      <p className="text-[12px] font-black text-zinc-200">이유 항목</p>
                      <button type="button" onClick={() => addPair('whyUsItems')} className="inline-flex items-center gap-1 text-[11px] font-bold text-sky-400 hover:text-sky-300">
                        <Plus size={12} /> 추가
                      </button>
                    </div>
                    {form.whyUsItems.map((it, i) => (
                      <div key={i} className="rounded-lg border border-neutral-800 p-2 space-y-1.5">
                        <div className="flex gap-2">
                          <input type="text" value={it.title} onChange={(e) => updatePair('whyUsItems', i, 'title', e.target.value)} className={inputCls} placeholder="제목" />
                          <button type="button" onClick={() => removePair('whyUsItems', i)} className="shrink-0 p-2 text-zinc-500 hover:text-rose-400"><Trash2 size={13} /></button>
                        </div>
                        <textarea value={it.body} onChange={(e) => updatePair('whyUsItems', i, 'body', e.target.value)} rows={2} className={`${inputCls} resize-none`} placeholder="설명" />
                      </div>
                    ))}

                    <div className="flex items-center justify-between pt-2 border-t border-neutral-800">
                      <p className="text-[12px] font-black text-zinc-200">소개 하이라이트</p>
                      <button type="button" onClick={() => addPair('highlights')} className="inline-flex items-center gap-1 text-[11px] font-bold text-sky-400 hover:text-sky-300">
                        <Plus size={12} /> 추가
                      </button>
                    </div>
                    {form.highlights.map((it, i) => (
                      <div key={i} className="rounded-lg border border-neutral-800 p-2 space-y-1.5">
                        <div className="flex gap-2">
                          <input type="text" value={it.title} onChange={(e) => updatePair('highlights', i, 'title', e.target.value)} className={inputCls} placeholder="제목" />
                          <button type="button" onClick={() => removePair('highlights', i)} className="shrink-0 p-2 text-zinc-500 hover:text-rose-400"><Trash2 size={13} /></button>
                        </div>
                        <textarea value={it.body} onChange={(e) => updatePair('highlights', i, 'body', e.target.value)} rows={2} className={`${inputCls} resize-none`} placeholder="설명" />
                      </div>
                    ))}
                  </>
                )}

                {tab === 'guide' && (
                  <>
                    <div className="flex items-center justify-between">
                      <p className="text-[12px] font-black text-zinc-200">이용 방법 (단계)</p>
                      <button type="button" onClick={() => addPair('steps')} className="inline-flex items-center gap-1 text-[11px] font-bold text-sky-400 hover:text-sky-300">
                        <Plus size={12} /> 추가
                      </button>
                    </div>
                    {form.steps.map((it, i) => (
                      <div key={i} className="rounded-lg border border-neutral-800 p-2 space-y-1.5">
                        <div className="flex items-center gap-2">
                          <span className="grid size-5 place-items-center rounded-full bg-sky-500/15 text-[10px] font-black text-sky-300">{i + 1}</span>
                          <input type="text" value={it.title} onChange={(e) => updatePair('steps', i, 'title', e.target.value)} className={inputCls} placeholder="단계 제목" />
                          <button type="button" onClick={() => removePair('steps', i)} className="shrink-0 p-2 text-zinc-500 hover:text-rose-400"><Trash2 size={13} /></button>
                        </div>
                        <textarea value={it.body} onChange={(e) => updatePair('steps', i, 'body', e.target.value)} rows={2} className={`${inputCls} resize-none`} placeholder="설명" />
                      </div>
                    ))}

                    <div className="flex items-center justify-between pt-2 border-t border-neutral-800">
                      <p className="text-[12px] font-black text-zinc-200">자주하는질문</p>
                      <button type="button" onClick={addFaq} className="inline-flex items-center gap-1 text-[11px] font-bold text-sky-400 hover:text-sky-300">
                        <Plus size={12} /> 추가
                      </button>
                    </div>
                    {form.faqs.map((f, i) => (
                      <div key={i} className="rounded-lg border border-neutral-800 p-2 space-y-1.5">
                        <div className="flex gap-2">
                          <input type="text" value={f.question} onChange={(e) => updateFaq(i, 'question', e.target.value)} className={inputCls} placeholder="질문" />
                          <button type="button" onClick={() => removeFaq(i)} className="shrink-0 p-2 text-zinc-500 hover:text-rose-400"><Trash2 size={13} /></button>
                        </div>
                        <textarea value={f.answer} onChange={(e) => updateFaq(i, 'answer', e.target.value)} rows={2} className={`${inputCls} resize-none`} placeholder="답변" />
                      </div>
                    ))}
                  </>
                )}

                {tab === 'fees' && (
                  <div className="space-y-3">
                    <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-[11px] text-amber-200/80">
                      요금·야간할증·예약 마감은 <span className="font-black">업체 마스터(요금 설정)</span>가 정본입니다. 여기서는 확인만 하고, 변경은 <span className="font-black">업체 수정</span>에서 하세요. 홈 계산기·/h/ 예약은 항상 그 값을 실시간으로 따릅니다.
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-3">
                        <p className="text-[11px] text-zinc-500 font-bold">기본료</p>
                        <p className="text-sm font-black text-zinc-100">{previewConfig.pricePreview.headline}</p>
                      </div>
                      <div className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-3">
                        <p className="text-[11px] text-zinc-500 font-bold">추가요금</p>
                        <p className="text-sm font-black text-zinc-100">{previewConfig.pricePreview.perDayAfter}</p>
                      </div>
                    </div>
                    <ul className="space-y-1">
                      {previewConfig.pricePreview.notes.map((n, i) => (
                        <li key={i} className="text-[12px] text-zinc-400">· {n}</li>
                      ))}
                    </ul>
                    <p className="text-[11px] text-zinc-500">
                      {seedPricing ? '업체 마스터 요금을 불러왔습니다.' : '업체 요금이 없어 기본값을 표시합니다. 업체 수정에서 요금을 설정하세요.'}
                    </p>
                  </div>
                )}

                {error && (
                  <p className="text-[12px] text-rose-300 bg-rose-500/10 border border-rose-500/20 rounded-xl px-3 py-2 font-semibold">
                    {error}
                  </p>
                )}
              </div>
            </div>

            {/* right: preview */}
            <div
              className={`flex-1 min-h-0 bg-neutral-950 p-3 ${
                mobileView === 'preview' ? '' : 'hidden lg:block'
              }`}
            >
              <div className="h-full overflow-hidden rounded-xl border border-neutral-800 shadow-inner">
                <HomepagePreview config={previewConfig} bookingUrl={bookingUrl} />
              </div>
            </div>
          </div>

          {/* footer */}
          <div className="px-5 py-3 border-t border-neutral-800 flex items-center justify-between gap-2 shrink-0 bg-[#1C1C1E]">
            <button
              type="button"
              onClick={regenerateCopy}
              disabled={saving}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-neutral-700 text-zinc-300 font-bold hover:bg-neutral-800 disabled:opacity-40 text-[12px]"
              title="상호·전화 기준으로 문구를 다시 만듭니다"
            >
              <RefreshCw size={13} /> 문구 기본값 재생성
            </button>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={saving}
                className="px-3 py-2 rounded-xl border border-neutral-700 text-zinc-300 font-bold hover:bg-neutral-800 disabled:opacity-40"
              >
                취소
              </button>
              <button
                type="button"
                onClick={() => void handleSave()}
                disabled={saving}
                className="px-3 py-2 rounded-xl bg-sky-500/90 hover:bg-sky-500 text-white font-black inline-flex items-center gap-1.5 disabled:opacity-50"
              >
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Globe size={14} />}
                {hasExisting ? '저장' : '홈페이지 생성·저장'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
