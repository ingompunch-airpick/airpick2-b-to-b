import { useState } from 'react';
import { ExternalLink, Loader2, X } from 'lucide-react';
import { deleteField, doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { ensureFirestoreAuth } from '../lib/firebaseAuth';
import type { Company, CompanyVerification } from '../types';
import {
  buildVerificationCheck,
  formatCheckDate,
  VERIFICATION_KEYS,
  VERIFICATION_LABEL,
  verificationItemStatus,
  type VerificationItemStatus,
  type VerificationKey,
} from '../utils/verification';
import { listCompanyParkingLots } from '../utils/companyProfile';

function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ');
}

function stateChip(item: VerificationItemStatus): { text: string; cls: string } {
  const date = formatCheckDate(item.verifiedAt);
  switch (item.state) {
    case 'verified':
      return { text: `확인 완료 · ${date}`, cls: 'bg-emerald-500/15 text-emerald-300' };
    case 'expiring':
      return {
        text: `확인 완료 · 만기 D-${item.daysLeft}`,
        cls: 'bg-amber-500/15 text-amber-300',
      };
    case 'expired':
      return { text: '보험 만기 지남', cls: 'bg-red-500/15 text-red-300' };
    case 'changed':
      return { text: '확인 뒤 내용 바뀜 · 다시 확인', cls: 'bg-amber-500/15 text-amber-300' };
    case 'stale':
      return { text: `확인 1년 지남 (${date})`, cls: 'bg-amber-500/15 text-amber-300' };
    case 'pending':
      return { text: '확인 전', cls: 'bg-neutral-800 text-zinc-300' };
    default:
      return { text: '서류·정보 없음', cls: 'bg-neutral-800 text-zinc-500' };
  }
}

function DocLink({ url, label }: { url?: string; label: string }) {
  const href = String(url || '').trim();
  if (!/^https?:\/\//.test(href)) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1 text-[15px] font-bold text-sky-300 underline underline-offset-2"
    >
      {label}
      <ExternalLink size={14} aria-hidden />
    </a>
  );
}

function ItemDetail({ company, item }: { company: Company; item: VerificationItemStatus }) {
  const muted = 'text-[15px] text-zinc-400 font-semibold leading-relaxed';
  if (item.key === 'business') {
    return (
      <div className="space-y-1">
        <p className={muted}>사업자등록증의 상호·대표·주소가 업체 정보와 맞는지 봐 주세요.</p>
        <DocLink url={company.verificationDocuments?.businessRegistrationUrl} label="사업자등록증 보기" />
      </div>
    );
  }
  if (item.key === 'insurance') {
    const ins = company.insurance;
    const line = [ins?.provider, ins?.productName].filter(Boolean).join(' · ');
    const period =
      item.periodStart || item.periodEnd
        ? `${formatCheckDate(item.periodStart) || '?'} ~ ${formatCheckDate(item.periodEnd) || '?'}`
        : '';
    return (
      <div className="space-y-1">
        {line ? <p className="text-[15px] font-bold text-zinc-200">{line}</p> : null}
        {ins?.coverageLimitText ? <p className={muted}>보상 한도 {ins.coverageLimitText}</p> : null}
        <p className={cn(muted, !period && 'text-amber-300')}>
          {period ? `보험기간 ${period}` : '보험기간이 비어 있어요. 업체 정보에서 시작일·만기일을 넣어 주세요.'}
        </p>
        <DocLink url={ins?.certificateUrl} label="보험증권 보기" />
      </div>
    );
  }
  if (item.key === 'parking') {
    const lots = listCompanyParkingLots(company).filter((l) => l.parkingAddress.trim());
    return (
      <div className="space-y-1">
        {lots.length ? (
          <ul className="space-y-0.5">
            {lots.map((l) => (
              <li key={l.id} className="text-[15px] font-semibold text-zinc-200">
                <span className="text-zinc-500">{l.type === 'indoor' ? '실내' : '야외'} {l.name}</span>{' '}
                {l.parkingAddress}
              </li>
            ))}
          </ul>
        ) : null}
        <p className={muted}>주소의 주차장이 실제로 있는지(현장·사진) 확인했을 때만 눌러 주세요.</p>
      </div>
    );
  }
  return (
    <p className={muted}>
      현장이나 영상으로 CCTV가 돌아가는 걸 봤을 때만 눌러 주세요. 손님에게는 「확인함」만 보이고, 설치
      위치는 공개되지 않아요.
    </p>
  );
}

export default function HqVerificationModal({
  company,
  onClose,
  onSaved,
}: {
  company: Company;
  onClose: () => void;
  onSaved?: (company: Company) => void;
}) {
  const [busyKey, setBusyKey] = useState<VerificationKey | null>(null);
  const [error, setError] = useState('');
  const items = VERIFICATION_KEYS.map((key) => verificationItemStatus(company, key));

  const save = async (key: VerificationKey, mark: boolean) => {
    setError('');
    const check = mark ? buildVerificationCheck(company, key) : null;
    if (mark && !check) {
      setError(`${VERIFICATION_LABEL[key]} 서류·정보가 없어서 확인할 수 없어요.`);
      return;
    }
    setBusyKey(key);
    try {
      await ensureFirestoreAuth();
      await updateDoc(doc(db, 'companies', company.id), {
        [`verification.${key}`]: mark ? check : deleteField(),
      });
      const nextVerification: CompanyVerification = { ...(company.verification || {}) };
      if (mark && check) (nextVerification as Record<string, unknown>)[key] = check;
      else delete nextVerification[key];
      onSaved?.({ ...company, verification: nextVerification });
    } catch (err) {
      console.warn('verification save failed', err);
      setError('저장하지 못했어요. 본사 계정으로 로그인했는지 확인해 주세요.');
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center bg-black/70 p-0 sm:p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="hq-verification-title"
        className="w-full sm:max-w-lg max-h-[92vh] overflow-y-auto overscroll-contain rounded-t-3xl sm:rounded-3xl border border-neutral-800 bg-neutral-900 p-5"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 id="hq-verification-title" className="text-[18px] font-black text-white leading-snug">
              {company.name} · 에어픽 확인
            </h3>
            <p className="mt-1.5 text-[15px] leading-relaxed text-zinc-400 font-semibold">
              직접 본 항목만 눌러 주세요. 손님 앱에 「에어픽 확인 · 날짜」로 나가요. 업체가 서류나 주소를 바꾸면
              확인 표시는 자동으로 내려가요.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="shrink-0 rounded-full p-2 text-zinc-400 hover:bg-neutral-800"
          >
            <X size={20} />
          </button>
        </div>

        <ul className="mt-4 space-y-3">
          {items.map((item) => {
            const chip = stateChip(item);
            const hasCheck = !!company.verification?.[item.key]?.verifiedAt;
            const busy = busyKey === item.key;
            const canMark = item.state !== 'missing';
            const needsMark = ['pending', 'changed', 'stale', 'expired'].includes(item.state);
            return (
              <li key={item.key} className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[16px] font-black text-white">{VERIFICATION_LABEL[item.key]}</span>
                  <span className={cn('px-2.5 py-1 rounded-full text-[13px] font-black', chip.cls)}>
                    {chip.text}
                  </span>
                </div>
                <div className="mt-2">
                  <ItemDetail company={company} item={item} />
                </div>
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    disabled={!canMark || busy}
                    onClick={() => void save(item.key, true)}
                    className={cn(
                      'flex-1 rounded-xl py-3 text-[15px] font-black disabled:opacity-40',
                      needsMark ? 'bg-amber-500 text-neutral-950' : 'border border-neutral-700 text-zinc-200'
                    )}
                  >
                    {busy ? (
                      <Loader2 size={16} className="mx-auto animate-spin" aria-label="저장 중" />
                    ) : hasCheck ? (
                      '오늘 다시 확인함'
                    ) : (
                      '확인 완료'
                    )}
                  </button>
                  {hasCheck ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void save(item.key, false)}
                      className="rounded-xl border border-neutral-700 px-4 py-3 text-[15px] font-black text-zinc-400 disabled:opacity-40"
                    >
                      확인 취소
                    </button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>

        {error ? (
          <p role="alert" className="mt-3 text-[15px] font-bold text-red-300">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}
