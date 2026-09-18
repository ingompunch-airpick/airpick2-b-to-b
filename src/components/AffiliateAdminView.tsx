import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Copy, KeyRound, Link2, Plus, RefreshCw, UserPlus } from 'lucide-react';
import type { Reservation } from '../types';
import {
  DEFAULT_AFFILIATE_CUSTOMER_DISCOUNT_WON,
  DEFAULT_AFFILIATE_MARKETING_BUDGET_WON,
  DEFAULT_AFFILIATE_REFERRER_CREDIT_WON,
  affiliateHqRemainderWon,
  buildAffiliatePortalUrl,
  buildB2cAffiliateUrl,
  formatAffiliateRewardWon,
  generateAffiliatePortalPassword,
} from '../utils/affiliate';
import {
  affiliatePortalPasswordSet,
  computeAffiliateStats,
  createAffiliate,
  listAffiliates,
  setAffiliatePortalPassword,
  updateAffiliate,
  type AffiliateRow,
} from '../lib/affiliateRepos';

type Props = {
  reservations: Reservation[];
};

function Metric({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl border border-neutral-800 bg-[#141416] px-3 py-3">
      <p className="text-[10px] font-black uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="mt-1 text-xl font-black text-zinc-100 tabular-nums">{value}</p>
      {sub ? <p className="mt-0.5 text-[10px] font-semibold text-zinc-500">{sub}</p> : null}
    </div>
  );
}

function formatWon(n: number): string {
  return `${n.toLocaleString('ko-KR')}원`;
}

function parseWonInput(raw: string): number {
  const n = Number(String(raw).replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : 0;
}

function BudgetBreakdown({
  budget,
  customer,
  referrer,
}: {
  budget: number;
  customer: number;
  referrer: number;
}) {
  const remainder = affiliateHqRemainderWon({
    marketingBudgetWon: budget,
    customerDiscountWon: customer,
    referrerCreditWon: referrer,
  });
  const over = remainder < 0;
  return (
    <div
      className={`rounded-xl border px-3 py-2 text-[11px] font-semibold ${
        over
          ? 'border-rose-500/40 bg-rose-500/10 text-rose-300'
          : 'border-neutral-800 bg-neutral-950 text-zinc-400'
      }`}
    >
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        <span>버짓 {formatAffiliateRewardWon(budget)}</span>
        <span>− 고객 {formatAffiliateRewardWon(customer)}</span>
        <span>− 제휴 {formatAffiliateRewardWon(referrer)}</span>
        <span className={over ? 'text-rose-300 font-black' : 'text-amber-400 font-black'}>
          = 본사 잔여 {formatAffiliateRewardWon(remainder)}
          {remainder === 0 && !over ? ' · 0원 마케팅' : ''}
          {over ? ' · 초과' : ''}
        </span>
      </div>
    </div>
  );
}

export default function AffiliateAdminView({ reservations }: Props) {
  const [rows, setRows] = useState<AffiliateRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState(30);
  const [selectedCode, setSelectedCode] = useState<string>('');
  const [copied, setCopied] = useState(false);
  const [copiedPortal, setCopiedPortal] = useState(false);
  const [copiedPassword, setCopiedPassword] = useState(false);
  /** 방금 등록·재발급 시 한 번만 보여 주는 비밀번호 */
  const [revealedPassword, setRevealedPassword] = useState<string | null>(null);
  const [passwordHasSet, setPasswordHasSet] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [justCreatedCode, setJustCreatedCode] = useState<string | null>(null);

  const [draftCode, setDraftCode] = useState('');
  const [draftName, setDraftName] = useState('');
  const [draftPhone, setDraftPhone] = useState('');
  const [draftMemo, setDraftMemo] = useState('');
  const [draftBudget, setDraftBudget] = useState(String(DEFAULT_AFFILIATE_MARKETING_BUDGET_WON));
  const [draftCustomerDiscount, setDraftCustomerDiscount] = useState(
    String(DEFAULT_AFFILIATE_CUSTOMER_DISCOUNT_WON)
  );
  const [draftReferrerCredit, setDraftReferrerCredit] = useState(
    String(DEFAULT_AFFILIATE_REFERRER_CREDIT_WON)
  );
  const [saving, setSaving] = useState(false);

  const [editBudget, setEditBudget] = useState('');
  const [editCustomerDiscount, setEditCustomerDiscount] = useState('');
  const [editReferrerCredit, setEditReferrerCredit] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await listAffiliates();
      setRows(list);
      setSelectedCode((prev) => {
        if (prev && list.some((r) => r.code === prev)) return prev;
        return list[0]?.code || '';
      });
    } catch (err) {
      setRows([]);
      setError(err instanceof Error ? err.message : '목록을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const sinceIso = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - days);
    return d.toISOString();
  }, [days]);

  const selected = rows.find((r) => r.code === selectedCode) || null;
  const link = selected ? buildB2cAffiliateUrl(selected.code) : '';
  const portalUrl = selected ? buildAffiliatePortalUrl(selected.code) : buildAffiliatePortalUrl();
  const stats = selected
    ? computeAffiliateStats(reservations, selected.code, { sinceIso })
    : null;

  useEffect(() => {
    if (!selected) {
      setEditBudget('');
      setEditCustomerDiscount('');
      setEditReferrerCredit('');
      setPasswordHasSet(false);
      setNewPassword('');
      if (justCreatedCode == null) setRevealedPassword(null);
      return;
    }
    setEditBudget(String(selected.marketingBudgetWon ?? 0));
    setEditCustomerDiscount(String(selected.customerDiscountWon ?? 0));
    setEditReferrerCredit(String(selected.referrerCreditWon ?? 0));
    setNewPassword('');
    if (justCreatedCode !== selected.code) setRevealedPassword(null);
    let cancelled = false;
    void (async () => {
      try {
        const has = await affiliatePortalPasswordSet(selected.code);
        if (!cancelled) setPasswordHasSet(has);
      } catch {
        if (!cancelled) setPasswordHasSet(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selected, justCreatedCode]);

  const draftOver =
    affiliateHqRemainderWon({
      marketingBudgetWon: parseWonInput(draftBudget),
      customerDiscountWon: parseWonInput(draftCustomerDiscount),
      referrerCreditWon: parseWonInput(draftReferrerCredit),
    }) < 0;

  const editOver =
    affiliateHqRemainderWon({
      marketingBudgetWon: parseWonInput(editBudget),
      customerDiscountWon: parseWonInput(editCustomerDiscount),
      referrerCreditWon: parseWonInput(editReferrerCredit),
    }) < 0;

  const copyText = async (text: string, kind: 'booking' | 'portal' | 'password') => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      if (kind === 'booking') {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1500);
      } else if (kind === 'portal') {
        setCopiedPortal(true);
        window.setTimeout(() => setCopiedPortal(false), 1500);
      } else {
        setCopiedPassword(true);
        window.setTimeout(() => setCopiedPassword(false), 1500);
      }
    } catch {
      window.prompt('복사', text);
    }
  };

  const copyLink = async () => {
    await copyText(link, 'booking');
  };

  const copyPortal = async () => {
    await copyText(portalUrl, 'portal');
  };

  const savePassword = async (password: string) => {
    if (!selected) return;
    const pw = password.trim();
    if (pw.length < 4) {
      setError('비밀번호는 4자 이상이어야 합니다.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await setAffiliatePortalPassword(selected.code, pw);
      setRevealedPassword(pw);
      setPasswordHasSet(true);
      setNewPassword('');
    } catch (err) {
      setError(err instanceof Error ? err.message : '비밀번호 저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const resetPassword = async () => {
    const pw = generateAffiliatePortalPassword();
    await savePassword(pw);
  };

  const handleCreate = async () => {
    setSaving(true);
    setError(null);
    try {
      const created = await createAffiliate({
        code: draftCode,
        name: draftName,
        phone: draftPhone,
        memo: draftMemo,
        marketingBudgetWon: parseWonInput(draftBudget),
        customerDiscountWon: parseWonInput(draftCustomerDiscount),
        referrerCreditWon: parseWonInput(draftReferrerCredit),
      });
      setDraftCode('');
      setDraftName('');
      setDraftPhone('');
      setDraftMemo('');
      setDraftBudget(String(DEFAULT_AFFILIATE_MARKETING_BUDGET_WON));
      setDraftCustomerDiscount(String(DEFAULT_AFFILIATE_CUSTOMER_DISCOUNT_WON));
      setDraftReferrerCredit(String(DEFAULT_AFFILIATE_REFERRER_CREDIT_WON));
      await load();
      setSelectedCode(created.code);
      setJustCreatedCode(created.code);
      setRevealedPassword(created.initialPassword);
      setPasswordHasSet(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : '등록에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const toggleStatus = async () => {
    if (!selected) return;
    const next = selected.status === 'active' ? 'suspended' : 'active';
    setSaving(true);
    setError(null);
    try {
      await updateAffiliate(selected.code, { status: next });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : '상태 변경에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const saveRewards = async () => {
    if (!selected) return;
    setSaving(true);
    setError(null);
    try {
      await updateAffiliate(selected.code, {
        marketingBudgetWon: parseWonInput(editBudget),
        customerDiscountWon: parseWonInput(editCustomerDiscount),
        referrerCreditWon: parseWonInput(editReferrerCredit),
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : '금액 저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4 p-4 max-w-3xl mx-auto">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-2xl bg-amber-500/15 border border-amber-500/25 flex items-center justify-center text-amber-400 shrink-0">
          <UserPlus size={18} />
        </div>
        <div className="min-w-0">
          <h2 className="text-base font-black text-white">제휴사 · 실적</h2>
          <p className="text-[11px] text-zinc-500 font-semibold mt-0.5 leading-relaxed">
            마케팅 제휴사만 등록합니다. 주차 업체 Gate와 분리 · 실적은 /a 포털 로그인.
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-neutral-800 bg-neutral-950/80 px-3 py-2.5 text-[11px] text-zinc-500 font-semibold leading-relaxed">
        <span className="text-zinc-300 font-black">주차 업체</span> → ② 주차 업체 관리 ·{' '}
        <span className="text-zinc-300 font-black">제휴사</span> → 여기서 코드·할인·고객 링크·포털
        비밀번호
      </div>

      <div className="rounded-2xl border border-neutral-800 bg-[#1C1C1E] p-4 space-y-3">
        <p className="text-[11px] font-black text-zinc-300 flex items-center gap-1.5">
          <Plus size={12} /> 제휴사 등록
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <label className="space-y-1">
            <span className="text-[10px] font-black text-zinc-500 uppercase">코드</span>
            <input
              value={draftCode}
              onChange={(e) => setDraftCode(e.target.value)}
              placeholder="kim01"
              className="w-full px-3 py-2 rounded-xl bg-neutral-950 border border-neutral-800 text-sm text-zinc-100 font-mono"
            />
          </label>
          <label className="space-y-1">
            <span className="text-[10px] font-black text-zinc-500 uppercase">이름</span>
            <input
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              placeholder="김대리 / ○○여행사"
              className="w-full px-3 py-2 rounded-xl bg-neutral-950 border border-neutral-800 text-sm text-zinc-100 font-bold"
            />
          </label>
          <label className="space-y-1 sm:col-span-2">
            <span className="text-[10px] font-black text-zinc-500 uppercase">
              마케팅 버짓 (원)
            </span>
            <input
              type="number"
              min={0}
              step={1000}
              value={draftBudget}
              onChange={(e) => setDraftBudget(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-neutral-950 border border-neutral-800 text-sm text-zinc-100 tabular-nums"
            />
          </label>
          <label className="space-y-1">
            <span className="text-[10px] font-black text-zinc-500 uppercase">고객 할인 (원)</span>
            <input
              type="number"
              min={0}
              step={1000}
              value={draftCustomerDiscount}
              onChange={(e) => setDraftCustomerDiscount(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-neutral-950 border border-neutral-800 text-sm text-zinc-100 tabular-nums"
            />
          </label>
          <label className="space-y-1">
            <span className="text-[10px] font-black text-zinc-500 uppercase">제휴 페이백 (원)</span>
            <input
              type="number"
              min={0}
              step={1000}
              value={draftReferrerCredit}
              onChange={(e) => setDraftReferrerCredit(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-neutral-950 border border-neutral-800 text-sm text-zinc-100 tabular-nums"
            />
          </label>
          <label className="space-y-1">
            <span className="text-[10px] font-black text-zinc-500 uppercase">연락처</span>
            <input
              value={draftPhone}
              onChange={(e) => setDraftPhone(e.target.value)}
              placeholder="선택"
              className="w-full px-3 py-2 rounded-xl bg-neutral-950 border border-neutral-800 text-sm text-zinc-100"
            />
          </label>
          <label className="space-y-1">
            <span className="text-[10px] font-black text-zinc-500 uppercase">메모</span>
            <input
              value={draftMemo}
              onChange={(e) => setDraftMemo(e.target.value)}
              placeholder="선택"
              className="w-full px-3 py-2 rounded-xl bg-neutral-950 border border-neutral-800 text-sm text-zinc-100"
            />
          </label>
        </div>
        <BudgetBreakdown
          budget={parseWonInput(draftBudget)}
          customer={parseWonInput(draftCustomerDiscount)}
          referrer={parseWonInput(draftReferrerCredit)}
        />
        <p className="text-[10px] text-zinc-600 font-semibold">
          코드: 영문 소문자·숫자·밑줄 3~16자 · 고객+제휴 ≤ 버짓 · Firestore companies 미생성
        </p>
        <button
          type="button"
          disabled={saving || !draftCode.trim() || !draftName.trim() || draftOver}
          onClick={() => void handleCreate()}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-amber-500 text-neutral-950 text-[11px] font-black disabled:opacity-40"
        >
          제휴사 등록
        </button>
      </div>

      <div className="flex flex-wrap gap-2 items-end">
        <label className="space-y-1">
          <span className="text-[10px] font-black text-zinc-500 uppercase">제휴사</span>
          <select
            value={selectedCode}
            onChange={(e) => setSelectedCode(e.target.value)}
            className="block w-full min-w-[12rem] px-3 py-2 rounded-xl bg-neutral-950 border border-neutral-800 text-sm text-zinc-100 font-bold"
          >
            {rows.length === 0 ? <option value="">등록된 제휴 없음</option> : null}
            {rows.map((r) => (
              <option key={r.code} value={r.code}>
                {r.name} ({r.code}){r.status === 'suspended' ? ' · 정지' : ''}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1">
          <span className="text-[10px] font-black text-zinc-500 uppercase">기간</span>
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="block px-3 py-2 rounded-xl bg-neutral-950 border border-neutral-800 text-sm text-zinc-100 font-bold"
          >
            <option value={7}>최근 7일</option>
            <option value={30}>최근 30일</option>
            <option value={90}>최근 90일</option>
          </select>
        </label>
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-neutral-700 text-[11px] font-black text-zinc-300 hover:text-white"
        >
          <RefreshCw size={12} className={loading ? 'animate-spin' : undefined} />
          새로고침
        </button>
        {selected ? (
          <button
            type="button"
            disabled={saving}
            onClick={() => void toggleStatus()}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-neutral-700 text-[11px] font-black text-zinc-300 hover:text-white disabled:opacity-40"
          >
            {selected.status === 'active' ? '정지' : '재활성'}
          </button>
        ) : null}
      </div>

      {error ? <p className="text-sm font-semibold text-red-400">{error}</p> : null}

      {justCreatedCode && selected?.code === justCreatedCode ? (
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 space-y-1">
          <p className="text-[12px] font-black text-emerald-300">
            [{selected.name}] 제휴사 등록 완료
          </p>
          <p className="text-[11px] text-emerald-200/80 font-semibold leading-relaxed">
            아래 고객 예약 링크와 포털 비밀번호를 제휴사에 전달하세요. 주차 업체 계정은 만들지
            않았습니다.
          </p>
          <button
            type="button"
            onClick={() => setJustCreatedCode(null)}
            className="text-[10px] font-black text-emerald-400/80 hover:text-emerald-300 pt-1"
          >
            안내 닫기
          </button>
        </div>
      ) : null}

      {selected ? (
        <>
          <div className="rounded-2xl border border-neutral-800 bg-[#1C1C1E] p-4 space-y-3">
            <p className="text-[11px] font-black text-zinc-300">이 링크 버짓 배분</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <label className="space-y-1">
                <span className="text-[10px] font-black text-zinc-500 uppercase">
                  마케팅 버짓 (원)
                </span>
                <input
                  type="number"
                  min={0}
                  step={1000}
                  value={editBudget}
                  onChange={(e) => setEditBudget(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-neutral-950 border border-neutral-800 text-sm text-zinc-100 tabular-nums"
                />
              </label>
              <label className="space-y-1">
                <span className="text-[10px] font-black text-zinc-500 uppercase">
                  고객 할인 (원)
                </span>
                <input
                  type="number"
                  min={0}
                  step={1000}
                  value={editCustomerDiscount}
                  onChange={(e) => setEditCustomerDiscount(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-neutral-950 border border-neutral-800 text-sm text-zinc-100 tabular-nums"
                />
              </label>
              <label className="space-y-1">
                <span className="text-[10px] font-black text-zinc-500 uppercase">
                  제휴 페이백 (원)
                </span>
                <input
                  type="number"
                  min={0}
                  step={1000}
                  value={editReferrerCredit}
                  onChange={(e) => setEditReferrerCredit(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-neutral-950 border border-neutral-800 text-sm text-zinc-100 tabular-nums"
                />
              </label>
            </div>
            <BudgetBreakdown
              budget={parseWonInput(editBudget)}
              customer={parseWonInput(editCustomerDiscount)}
              referrer={parseWonInput(editReferrerCredit)}
            />
            <button
              type="button"
              disabled={saving || editOver}
              onClick={() => void saveRewards()}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-amber-500 text-neutral-950 text-[11px] font-black disabled:opacity-40"
            >
              금액 저장
            </button>
          </div>

          <div
            className={`rounded-2xl border bg-[#1C1C1E] p-4 space-y-2 ${
              justCreatedCode === selected.code
                ? 'border-emerald-500/40 ring-1 ring-emerald-500/20'
                : 'border-neutral-800'
            }`}
          >
            <p className="text-[11px] font-black text-zinc-300 flex items-center gap-1.5">
              <Link2 size={12} /> 고객 예약 링크 (B2C 유입)
            </p>
            <p className="text-[10px] text-zinc-500 font-semibold break-all font-mono">{link}</p>
            <p className="text-[10px] text-zinc-600 font-semibold">
              손님에게 공유 · 버짓 {formatAffiliateRewardWon(selected.marketingBudgetWon)} · 고객{' '}
              {formatAffiliateRewardWon(selected.customerDiscountWon)} · 제휴{' '}
              {formatAffiliateRewardWon(selected.referrerCreditWon)} · 본사{' '}
              {formatAffiliateRewardWon(
                affiliateHqRemainderWon({
                  marketingBudgetWon: selected.marketingBudgetWon,
                  customerDiscountWon: selected.customerDiscountWon,
                  referrerCreditWon: selected.referrerCreditWon,
                })
              )}{' '}
              · <span className="font-mono text-zinc-400">?ref={selected.code}</span>
            </p>
            <button
              type="button"
              onClick={() => void copyLink()}
              className="inline-flex items-center gap-1.5 mt-1 px-3 py-1.5 rounded-xl bg-amber-500 text-neutral-950 text-[11px] font-black"
            >
              <Copy size={12} />
              {copied ? '복사됨' : '고객 링크 복사'}
            </button>
            {selected.phone || selected.memo ? (
              <p className="text-[10px] text-zinc-500 font-semibold pt-1">
                {[selected.phone, selected.memo].filter(Boolean).join(' · ')}
              </p>
            ) : null}
          </div>

          <div
            className={`rounded-2xl border bg-[#1C1C1E] p-4 space-y-2 ${
              justCreatedCode === selected.code
                ? 'border-emerald-500/40 ring-1 ring-emerald-500/20'
                : 'border-neutral-800'
            }`}
          >
            <p className="text-[11px] font-black text-zinc-300 flex items-center gap-1.5">
              <KeyRound size={12} /> 실적 포털 로그인
            </p>
            <p className="text-[10px] text-zinc-500 font-semibold break-all font-mono">
              {portalUrl}
            </p>
            <p className="text-[10px] text-zinc-600 font-semibold leading-relaxed">
              아이디 = 제휴 코드 ({selected.code})
              {passwordHasSet ? ' · 비밀번호 설정됨' : ' · 비밀번호 미설정'}
            </p>
            {revealedPassword ? (
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 space-y-1">
                <p className="text-[10px] font-black text-amber-300">지금만 보이는 비밀번호</p>
                <p className="text-sm font-mono font-black text-amber-100 tracking-wide">
                  {revealedPassword}
                </p>
                <button
                  type="button"
                  onClick={() => void copyText(revealedPassword, 'password')}
                  className="inline-flex items-center gap-1.5 text-[11px] font-black text-amber-300 hover:text-amber-200"
                >
                  <Copy size={12} />
                  {copiedPassword ? '복사됨' : '비밀번호 복사'}
                </button>
              </div>
            ) : null}
            <div className="flex flex-wrap gap-2 mt-1">
              <button
                type="button"
                onClick={() => void copyPortal()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500 text-neutral-950 text-[11px] font-black"
              >
                <Copy size={12} />
                {copiedPortal ? '복사됨' : '포털 주소 복사'}
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => void resetPassword()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-neutral-700 text-[11px] font-black text-zinc-300 hover:text-white disabled:opacity-40"
              >
                {passwordHasSet ? '비밀번호 재발급' : '비밀번호 발급'}
              </button>
            </div>
            <div className="flex flex-wrap gap-2 items-end pt-1">
              <label className="space-y-1 flex-1 min-w-[8rem]">
                <span className="text-[10px] font-black text-zinc-500 uppercase">
                  직접 지정
                </span>
                <input
                  type="text"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="4자 이상"
                  className="w-full px-3 py-2 rounded-xl bg-neutral-950 border border-neutral-800 text-sm text-zinc-100 font-mono"
                />
              </label>
              <button
                type="button"
                disabled={saving || newPassword.trim().length < 4}
                onClick={() => void savePassword(newPassword)}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-neutral-700 text-[11px] font-black text-zinc-300 hover:text-white disabled:opacity-40"
              >
                저장
              </button>
            </div>
          </div>
        </>
      ) : null}

      {stats ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Metric label="유입 예약" value={`${stats.bookings}`} />
          <Metric label="출고 완료" value={`${stats.completedOut}`} />
          <Metric label="취소" value={`${stats.cancelled}`} />
          <Metric
            label="출고 매출"
            value={formatWon(stats.revenue)}
            sub="할인 반영 전 표시"
          />
        </div>
      ) : loading ? (
        <p className="text-[12px] text-zinc-500 font-semibold">불러오는 중…</p>
      ) : (
        <p className="text-[12px] text-zinc-500 font-semibold">
          제휴를 등록하면 고객 링크·포털 비밀번호·실적을 볼 수 있습니다.
        </p>
      )}

      {rows.length > 0 ? (
        <div className="rounded-2xl border border-neutral-800 overflow-hidden overflow-x-auto">
          <table className="w-full text-left text-[12px] min-w-[36rem]">
            <thead className="bg-[#1C1C1E] text-[10px] text-zinc-500 font-black uppercase">
              <tr>
                <th className="px-3 py-2">코드</th>
                <th className="px-3 py-2">이름</th>
                <th className="px-3 py-2">버짓</th>
                <th className="px-3 py-2">고객</th>
                <th className="px-3 py-2">제휴</th>
                <th className="px-3 py-2">본사</th>
                <th className="px-3 py-2">예약</th>
                <th className="px-3 py-2">출고</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const s = computeAffiliateStats(reservations, r.code, { sinceIso });
                const hq = affiliateHqRemainderWon({
                  marketingBudgetWon: r.marketingBudgetWon,
                  customerDiscountWon: r.customerDiscountWon,
                  referrerCreditWon: r.referrerCreditWon,
                });
                return (
                  <tr
                    key={r.code}
                    className={`border-t border-neutral-800/80 text-zinc-300 cursor-pointer ${
                      r.code === selectedCode ? 'bg-amber-500/10' : ''
                    }`}
                    onClick={() => setSelectedCode(r.code)}
                  >
                    <td className="px-3 py-2 font-mono font-bold">{r.code}</td>
                    <td className="px-3 py-2 font-bold">
                      {r.name}
                      {r.status === 'suspended' ? (
                        <span className="text-zinc-500 font-semibold"> · 정지</span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 tabular-nums">
                      {formatAffiliateRewardWon(r.marketingBudgetWon)}
                    </td>
                    <td className="px-3 py-2 tabular-nums">
                      {formatAffiliateRewardWon(r.customerDiscountWon)}
                    </td>
                    <td className="px-3 py-2 tabular-nums">
                      {formatAffiliateRewardWon(r.referrerCreditWon)}
                    </td>
                    <td className="px-3 py-2 tabular-nums text-amber-400/90">
                      {formatAffiliateRewardWon(hq)}
                    </td>
                    <td className="px-3 py-2 tabular-nums">{s.bookings}</td>
                    <td className="px-3 py-2 tabular-nums">{s.completedOut}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
