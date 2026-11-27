/**
 * 본사 대시보드 · 정산 탭
 * B2C 출고완료만 · 업체별 요율 · 청구(업체→에어픽) 모드 미리보기
 */
import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Download } from 'lucide-react';
import type { Company, Reservation } from '../types';
import { getKSTDateOnlyString } from '../utils/kstDate';
import { monthLabelFromPrefix, shiftMonthPrefix } from '../utils/hqAnalytics';
import {
  B2C_COMMISSION_START_YMD,
  buildB2cCommissionRows,
  buildCommissionCsv,
  downloadCommissionCsv,
  listB2cCommissionBookings,
  rateLabelPercent,
  sumAffiliateCustomerDiscountInMonth,
  sumB2cCommissionRows,
} from '../utils/b2cCommission';

type Props = {
  reservations: Reservation[];
  companies: Company[];
  monthPrefix: string;
  onMonthPrefixChange: (next: string) => void;
};

export default function HqCommissionSettlementView({
  reservations,
  companies,
  monthPrefix,
  onMonthPrefixChange,
}: Props) {
  const todayYmd = getKSTDateOnlyString();
  const monthMax = todayYmd.slice(0, 7);
  const canGoNext = monthPrefix < monthMax;
  const [focusId, setFocusId] = useState<string | null>(null);

  const started = monthPrefix >= B2C_COMMISSION_START_YMD.slice(0, 7);
  const rows = useMemo(
    () => (started ? buildB2cCommissionRows(reservations, monthPrefix, companies) : []),
    [started, reservations, monthPrefix, companies]
  );
  const sum = useMemo(() => sumB2cCommissionRows(rows), [rows]);
  const affiliateSum = useMemo(
    () => sumAffiliateCustomerDiscountInMonth(reservations, monthPrefix),
    [reservations, monthPrefix]
  );
  const bookings = useMemo(
    () =>
      focusId
        ? listB2cCommissionBookings(reservations, monthPrefix, focusId, companies)
        : [],
    [focusId, reservations, monthPrefix, companies]
  );

  const exportCsv = (companyId?: string) => {
    const list = listB2cCommissionBookings(
      reservations,
      monthPrefix,
      companyId,
      companies
    );
    if (list.length === 0) return;
    const suffix = companyId || 'all';
    downloadCommissionCsv(
      `airpick-commission-${monthPrefix}-${suffix}.csv`,
      buildCommissionCsv(list, monthPrefix)
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[15px] font-black text-fuchsia-300 tracking-wider">B2C 수수료 정산</p>
          <p className="text-[14px] text-zinc-400 font-bold mt-1.5 leading-relaxed max-w-xl">
            에어픽 앱 예약만 · 출고 완료일 기준 · 홈·현장 수수료 없음 · 부가세 별도 · 지금은 업체가
            손님에게 받은 뒤 에어픽에 송금(청구)
          </p>
        </div>
        <div className="flex items-center gap-1 bg-neutral-900/80 border border-neutral-800 rounded-xl px-1.5 py-1">
          <button
            type="button"
            onClick={() => onMonthPrefixChange(shiftMonthPrefix(monthPrefix, -1))}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-neutral-800"
            aria-label="이전 달"
          >
            <ChevronLeft size={16} />
          </button>
          <span className="text-[15px] font-black text-white font-mono px-2 min-w-[5.5rem] text-center">
            {monthLabelFromPrefix(monthPrefix)}
          </span>
          <button
            type="button"
            disabled={!canGoNext}
            onClick={() =>
              canGoNext && onMonthPrefixChange(shiftMonthPrefix(monthPrefix, 1))
            }
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-neutral-800 disabled:opacity-30"
            aria-label="다음 달"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {!started ? (
        <p className="text-[14px] text-zinc-500 font-bold py-6 text-center">
          {B2C_COMMISSION_START_YMD.slice(0, 7)}부터 집계합니다.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <Kpi
              label="에어픽 받을 돈"
              value={`${sum.commissionWon.toLocaleString()}원`}
              sub={`${sum.count}건`}
              tone="fuchsia"
            />
            <Kpi
              label="정가 합"
              value={`${sum.listRevenue.toLocaleString()}원`}
              sub="수수료 기준"
            />
            <Kpi
              label="가입할인 차감"
              value={`${sum.couponWon.toLocaleString()}원`}
              sub="수수료에서 차감"
            />
            <Kpi
              label="업체 몫(참고)"
              value={`${sum.partnerPayoutWon.toLocaleString()}원`}
              sub="정가−수수료−쿠폰"
            />
          </div>

          {affiliateSum > 0 ? (
            <p className="text-[13px] text-zinc-500 font-bold">
              제휴 링크 고객할인 합 {affiliateSum.toLocaleString()}원 · 상세는 마케팅 제휴
            </p>
          ) : null}

          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[13px] text-zinc-500 font-bold">
              업체 {rows.length}곳 · 실시간 미리보기 (월 확정·입금확인은 다음 단계)
            </p>
            <button
              type="button"
              disabled={sum.count === 0}
              onClick={() => exportCsv()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[12px] font-black border border-neutral-700 text-zinc-200 hover:bg-neutral-800 disabled:opacity-40"
            >
              <Download size={14} />
              전체 CSV
            </button>
          </div>

          {rows.length === 0 ? (
            <p className="text-[14px] text-zinc-500 font-bold py-8 text-center">
              이달 출고 완료된 에어픽(B2C) 예약이 없습니다.
            </p>
          ) : (
            <div className="space-y-2">
              {rows.map((row) => {
                const open = focusId === row.id;
                return (
                  <div
                    key={row.id}
                    className={`rounded-2xl border px-3.5 py-3 ${
                      open
                        ? 'border-fuchsia-500/40 bg-fuchsia-500/5'
                        : 'border-neutral-800 bg-[#121214]'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => setFocusId((p) => (p === row.id ? null : row.id))}
                      className="w-full text-left flex flex-wrap items-center justify-between gap-2"
                    >
                      <div className="min-w-0">
                        <span className="text-[15px] font-black text-white truncate block">
                          {row.name}
                        </span>
                        <span className="text-[13px] text-zinc-500 font-bold font-mono">
                          {rateLabelPercent(row.rate)}% · {row.count}건
                        </span>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="text-[15px] font-black text-fuchsia-300 font-mono block">
                          {row.commissionWon.toLocaleString()}원
                        </span>
                        <span className="text-[13px] text-zinc-500 font-bold">
                          {open ? '접기' : '건별 · CSV'}
                        </span>
                      </div>
                    </button>

                    <div className="grid grid-cols-3 gap-2 mt-2.5">
                      <Mini label="정가" value={row.listRevenue} />
                      <Mini label="수수료" value={row.commissionWon} accent />
                      <Mini label="업체몫" value={row.partnerPayoutWon} green />
                    </div>

                    {open ? (
                      <div className="mt-3 space-y-2 border-t border-neutral-800 pt-3">
                        <div className="flex justify-end">
                          <button
                            type="button"
                            onClick={() => exportCsv(row.id)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[12px] font-black border border-neutral-700 text-zinc-300 hover:bg-neutral-800"
                          >
                            <Download size={12} />
                            이 업체 CSV
                          </button>
                        </div>
                        {bookings.map((b) => (
                          <div
                            key={b.id}
                            className="rounded-xl bg-neutral-950/80 border border-neutral-800 px-2.5 py-2"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-[13px] font-black text-white truncate">
                                {b.carNumber}
                              </span>
                              <span className="text-[13px] text-zinc-500 font-mono shrink-0">
                                출고 {b.exitYmd.slice(5)}
                              </span>
                            </div>
                            <div className="grid grid-cols-3 gap-1 mt-1.5 text-[13px] font-mono">
                              <span className="text-zinc-400">
                                정가 {b.listPrice.toLocaleString()}
                              </span>
                              <span className="text-fuchsia-300">
                                수수료 {b.commissionWon.toLocaleString()}
                              </span>
                              <span className="text-zinc-500 text-right">
                                쿠폰{' '}
                                {b.couponWon > 0 ? `−${b.couponWon.toLocaleString()}` : '0'}
                              </span>
                            </div>
                            {b.estimatedPricing ? (
                              <p className="text-[13px] text-amber-500/80 font-bold mt-1">
                                정가·쿠폰 필드 없음 · totalPrice로 추정
                              </p>
                            ) : null}
                            {b.adjusted ? (
                              <p className="text-[13px] text-zinc-500 font-bold mt-1">
                                기본 요금 기준 · 서버 계산으로 정산
                              </p>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Kpi({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: 'fuchsia';
}) {
  return (
    <div
      className={`rounded-2xl border px-3 py-3 ${
        tone === 'fuchsia'
          ? 'bg-fuchsia-500/10 border-fuchsia-500/25'
          : 'bg-[#121214] border-neutral-800'
      }`}
    >
      <span
        className={`text-[13px] font-bold block ${
          tone === 'fuchsia' ? 'text-fuchsia-300' : 'text-zinc-400'
        }`}
      >
        {label}
      </span>
      <span
        className={`text-lg sm:text-xl font-black font-mono tracking-tight ${
          tone === 'fuchsia' ? 'text-fuchsia-200' : 'text-white'
        }`}
      >
        {value}
      </span>
      {sub ? (
        <span className="text-[13px] text-zinc-500 font-bold font-mono block mt-0.5">{sub}</span>
      ) : null}
    </div>
  );
}

function Mini({
  label,
  value,
  accent,
  green,
}: {
  label: string;
  value: number;
  accent?: boolean;
  green?: boolean;
}) {
  return (
    <div>
      <span className="text-[13px] text-zinc-500 font-bold block">{label}</span>
      <span
        className={`text-[15px] font-black font-mono ${
          accent ? 'text-fuchsia-300' : green ? 'text-emerald-300' : 'text-zinc-200'
        }`}
      >
        {value.toLocaleString()}
      </span>
    </div>
  );
}
