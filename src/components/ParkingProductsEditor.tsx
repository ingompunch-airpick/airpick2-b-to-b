import React from 'react';
import { EyeOff, Plus, Trash2 } from 'lucide-react';
import type { HandoffType, ParkingProduct } from '../types';
import {
  HANDOFF_TYPE_LABELS,
  newParkingProductId,
  PARKING_PRODUCT_LIMIT,
  PARKING_PRODUCT_TYPES,
  productsOfferHandoff,
} from '../utils/parkingProducts';

export interface HandoffFees {
  valetFeeT1: number;
  valetFeeT2: number;
  dropFeeT1: number;
  dropFeeT2: number;
  meetGreetFeeT1: number;
  meetGreetFeeT2: number;
}

interface Props {
  products: ParkingProduct[];
  onChange: (next: ParkingProduct[]) => void;
  fees: HandoffFees;
  onFeesChange: (next: HandoffFees) => void;
  t1Label: string;
  t2Label: string;
  /** 요금 탭 기본요금 요약 — 상품은 여기 연결된다 */
  basePriceLabel: { indoor: string; outdoor: string };
}

const chipBase = 'px-2.5 py-1.5 rounded-lg text-[11px] font-black border transition-all';
const chipOn = 'bg-amber-500 border-amber-500 text-neutral-950';
const chipOff = 'bg-neutral-900 border-neutral-800 text-zinc-400 hover:text-zinc-200';
const inputCls =
  'w-full bg-[#1C1C1E] border border-neutral-800 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-amber-500 font-bold';
const labelCls = 'text-[11px] text-white/80 font-bold block mb-1';

const HANDOFF_OPTIONS: { key: HandoffType; field: 'curb' | 'meetGreet' | 'drop'; hint: string }[] = [
  { key: 'curb', field: 'curb', hint: '출국장 대면' },
  { key: 'meet_greet', field: 'meetGreet', hint: '지정 픽업지' },
  { key: 'drop', field: 'drop', hint: '단기주차장' },
];

function Chips<T extends string>({
  value,
  options,
  onSelect,
}: {
  value: T | undefined;
  options: { id: T; label: string }[];
  onSelect: (id: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => onSelect(o.id)}
          className={`${chipBase} ${value === o.id ? chipOn : chipOff}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function FeeInput({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div>
      <label className={labelCls}>{label}</label>
      <input
        type="text"
        inputMode="numeric"
        value={value === 0 ? '0' : value ? value.toLocaleString() : ''}
        onChange={(e) => {
          const n = Number(e.target.value.replace(/[^\d]/g, ''));
          onChange(Number.isFinite(n) ? n : 0);
        }}
        placeholder="무료면 0"
        className={`${inputCls} font-mono`}
      />
    </div>
  );
}

type HoursMode = 'none' | 'allDay' | 'range';

function hoursMode(p: ParkingProduct): HoursMode {
  if (!p.hours) return 'none';
  return 'allDay' in p.hours ? 'allDay' : 'range';
}

type CurbHoursMode = 'allDay' | 'range';

function curbHoursMode(p: ParkingProduct): CurbHoursMode {
  if (p.curbHours && !('allDay' in p.curbHours)) return 'range';
  return 'allDay';
}

export default function ParkingProductsEditor({
  products,
  onChange,
  fees,
  onFeesChange,
  t1Label,
  t2Label,
  basePriceLabel,
}: Props) {
  const update = (id: string, patch: Partial<ParkingProduct>) => {
    onChange(
      products.map((p) => {
        if (p.id !== id) return p;
        const next = { ...p, ...patch } as ParkingProduct & Record<string, unknown>;
        for (const key of Object.keys(patch)) {
          if (next[key] === undefined) delete next[key];
        }
        return next;
      })
    );
  };

  const add = () => {
    if (products.length >= PARKING_PRODUCT_LIMIT) return;
    onChange([
      ...products,
      {
        id: newParkingProductId(),
        type: 'valet',
        lot: 'outdoor',
        terminal: 'both',
        curb: false,
        meetGreet: false,
        drop: true,
      },
    ]);
  };

  const remove = (id: string) => {
    if (!window.confirm('이 상품을 삭제할까요? 손님 앱에서도 빠집니다.')) return;
    onChange(products.filter((p) => p.id !== id));
  };

  const curbT1 = productsOfferHandoff(products, 'curb', 'T1');
  const curbT2 = productsOfferHandoff(products, 'curb', 'T2');
  const greetT1 = productsOfferHandoff(products, 'meet_greet', 'T1');
  const greetT2 = productsOfferHandoff(products, 'meet_greet', 'T2');
  const dropT1 = productsOfferHandoff(products, 'drop', 'T1');
  const dropT2 = productsOfferHandoff(products, 'drop', 'T2');
  const anyFee = curbT1 || curbT2 || greetT1 || greetT2 || dropT1 || dropT2;

  return (
    <div className="space-y-4">
      <div className="bg-neutral-900/40 p-5 rounded-3xl border border-neutral-850 space-y-2">
        <p className="text-xs font-black text-amber-500 tracking-wider">주차 상품</p>
        <p className="text-[12px] text-white/70 leading-relaxed">
          손님 앱은 상품 단위로 비교합니다. 빈칸은 손님 앱에 나가지 않습니다. 기본요금은 「요금」 탭 값을
          그대로 씁니다 (실내 {basePriceLabel.indoor} · 야외 {basePriceLabel.outdoor}).
        </p>
      </div>

      {products.length === 0 ? (
        <p className="text-center py-6 bg-neutral-950/20 border border-neutral-850/50 rounded-2xl text-white/50 text-[12.5px]">
          상품이 없으면 손님 앱 목록에 나오지 않습니다.
        </p>
      ) : null}

      {products.map((p, index) => {
        const mode = hoursMode(p);
        const range = p.hours && !('allDay' in p.hours) ? p.hours : { open: '', close: '' };
        const curbMode = curbHoursMode(p);
        const curbRange =
          p.curbHours && !('allDay' in p.curbHours) ? p.curbHours : { open: '', close: '' };
        return (
          <div
            key={p.id}
            className={`bg-neutral-900/40 p-4 rounded-3xl border space-y-3.5 ${
              p.hidden ? 'border-neutral-800 opacity-60' : 'border-neutral-850'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-[12.5px] font-black text-white">
                상품 {index + 1}
                {p.hidden ? <span className="ml-2 text-[11px] text-zinc-500">비노출</span> : null}
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => update(p.id, { hidden: p.hidden ? undefined : true })}
                  className={`${chipBase} ${p.hidden ? chipOn : chipOff} inline-flex items-center gap-1`}
                >
                  <EyeOff size={12} />
                  {p.hidden ? '비노출 중' : '비노출'}
                </button>
                <button
                  type="button"
                  onClick={() => remove(p.id)}
                  className="p-1.5 rounded-lg border border-red-900/25 bg-red-950/40 text-red-500"
                  aria-label="상품 삭제"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </div>

            <div>
              <label className={labelCls}>유형</label>
              <Chips
                value={p.type}
                options={PARKING_PRODUCT_TYPES}
                onSelect={(type) => update(p.id, { type })}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>주차장</label>
                <Chips
                  value={p.lot}
                  options={[
                    { id: 'indoor', label: '실내' },
                    { id: 'outdoor', label: '야외' },
                  ]}
                  onSelect={(lot) => update(p.id, { lot })}
                />
              </div>
              <div>
                <label className={labelCls}>터미널</label>
                <Chips
                  value={p.terminal}
                  options={[
                    { id: 'T1', label: 'T1' },
                    { id: 'T2', label: 'T2' },
                    { id: 'both', label: '둘 다' },
                  ]}
                  onSelect={(terminal) => update(p.id, { terminal })}
                />
              </div>
            </div>

            <div>
              <label className={labelCls}>입고 방식 (받는 것만 체크)</label>
              <div className="flex flex-col gap-2">
                {HANDOFF_OPTIONS.map((h) => (
                  <label key={h.key} className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={p[h.field]}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        if (h.field === 'curb') {
                          update(p.id, {
                            curb: checked,
                            curbHours: checked ? p.curbHours : undefined,
                          });
                        } else if (h.field === 'meetGreet') {
                          update(p.id, { meetGreet: checked });
                        } else {
                          update(p.id, { drop: checked });
                        }
                      }}
                      className="w-4 h-4 rounded border-neutral-800 text-amber-500 focus:ring-amber-500 bg-[#1C1C1E]"
                    />
                    <span className="text-[12px] text-white font-bold">
                      {HANDOFF_TYPE_LABELS[h.key]}
                      <span className="ml-1.5 text-[11px] text-zinc-500 font-semibold">{h.hint}</span>
                    </span>
                  </label>
                ))}
              </div>
            </div>

            {p.curb ? (
              <div>
                <label className={labelCls}>커브사이드 시간</label>
                <Chips
                  value={curbMode}
                  options={[
                    { id: 'allDay', label: '24시간' },
                    { id: 'range', label: '시간 지정' },
                  ]}
                  onSelect={(next) =>
                    update(p.id, {
                      curbHours:
                        next === 'allDay'
                          ? { allDay: true }
                          : { open: curbRange.open, close: curbRange.close },
                    })
                  }
                />
                {curbMode === 'range' ? (
                  <div className="grid grid-cols-2 gap-3 mt-2">
                    <input
                      type="time"
                      value={curbRange.open}
                      onChange={(e) =>
                        update(p.id, { curbHours: { open: e.target.value, close: curbRange.close } })
                      }
                      className={`${inputCls} font-mono`}
                      aria-label="커브사이드 시작"
                    />
                    <input
                      type="time"
                      value={curbRange.close}
                      onChange={(e) =>
                        update(p.id, { curbHours: { open: curbRange.open, close: e.target.value } })
                      }
                      className={`${inputCls} font-mono`}
                      aria-label="커브사이드 종료"
                    />
                  </div>
                ) : null}
              </div>
            ) : null}

            <div className="grid grid-cols-[1fr_88px] gap-3">
              <div>
                <label className={labelCls}>이동 안내</label>
                <input
                  type="text"
                  value={p.transferNote ?? ''}
                  maxLength={120}
                  onChange={(e) => update(p.id, { transferNote: e.target.value || undefined })}
                  placeholder="예: 기사가 출국장으로 차를 가져옵니다"
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>이동 (분)</label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={p.transferMinutes ?? ''}
                  onChange={(e) => {
                    const n = Number(e.target.value.replace(/[^\d]/g, ''));
                    update(p.id, { transferMinutes: n > 0 ? n : undefined });
                  }}
                  placeholder="모름"
                  className={`${inputCls} font-mono`}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>키</label>
                <Chips
                  value={p.keyHandover ?? 'unknown'}
                  options={[
                    { id: 'unknown', label: '모름' },
                    { id: 'leave', label: '키 맡김' },
                    { id: 'keep', label: '키 보관' },
                  ]}
                  onSelect={(v) => update(p.id, { keyHandover: v === 'unknown' ? undefined : v })}
                />
              </div>
              <div>
                <label className={labelCls}>전기차 충전</label>
                <Chips
                  value={p.evCharging ?? 'unknown'}
                  options={[
                    { id: 'unknown', label: '모름' },
                    { id: 'yes', label: '가능' },
                    { id: 'no', label: '없음' },
                  ]}
                  onSelect={(v) => update(p.id, { evCharging: v === 'unknown' ? undefined : v })}
                />
              </div>
            </div>

            <div>
              <label className={labelCls}>영업</label>
              <Chips
                value={mode}
                options={[
                  { id: 'none', label: '미입력' },
                  { id: 'allDay', label: '연중무휴' },
                  { id: 'range', label: '시간 지정' },
                ]}
                onSelect={(next) =>
                  update(p.id, {
                    hours:
                      next === 'none'
                        ? undefined
                        : next === 'allDay'
                          ? { allDay: true }
                          : { open: range.open, close: range.close },
                  })
                }
              />
              {mode === 'range' ? (
                <div className="grid grid-cols-2 gap-3 mt-2">
                  <input
                    type="time"
                    value={range.open}
                    onChange={(e) => update(p.id, { hours: { open: e.target.value, close: range.close } })}
                    className={`${inputCls} font-mono`}
                    aria-label="영업 시작"
                  />
                  <input
                    type="time"
                    value={range.close}
                    onChange={(e) => update(p.id, { hours: { open: range.open, close: e.target.value } })}
                    className={`${inputCls} font-mono`}
                    aria-label="영업 종료"
                  />
                </div>
              ) : null}
            </div>
          </div>
        );
      })}

      {products.length < PARKING_PRODUCT_LIMIT ? (
        <button
          type="button"
          onClick={add}
          className="w-full py-3 rounded-2xl border border-dashed border-neutral-700 text-[12px] font-black text-zinc-300 hover:text-white hover:border-amber-500 inline-flex items-center justify-center gap-1.5"
        >
          <Plus size={14} />
          상품 추가
        </button>
      ) : null}

      {anyFee ? (
        <div className="bg-neutral-900/40 p-5 rounded-3xl border border-neutral-850 space-y-3">
          <p className="text-xs font-black text-amber-500 tracking-wider">추가요금</p>
          <p className="text-[12px] text-white/70 leading-relaxed">
            기본요금에 더해지는 금액만 적습니다. 무료면 0원. 같은 방식의 상품에 모두 적용됩니다.
          </p>
          {curbT1 || curbT2 ? (
            <div className="grid grid-cols-2 gap-3">
              {curbT1 ? (
                <FeeInput
                  label={`${t1Label} 커브사이드`}
                  value={fees.valetFeeT1}
                  onChange={(v) => onFeesChange({ ...fees, valetFeeT1: v })}
                />
              ) : null}
              {curbT2 ? (
                <FeeInput
                  label={`${t2Label} 커브사이드`}
                  value={fees.valetFeeT2}
                  onChange={(v) => onFeesChange({ ...fees, valetFeeT2: v })}
                />
              ) : null}
            </div>
          ) : null}
          {greetT1 || greetT2 ? (
            <div className="grid grid-cols-2 gap-3">
              {greetT1 ? (
                <FeeInput
                  label={`${t1Label} 밋앤그릿`}
                  value={fees.meetGreetFeeT1}
                  onChange={(v) => onFeesChange({ ...fees, meetGreetFeeT1: v })}
                />
              ) : null}
              {greetT2 ? (
                <FeeInput
                  label={`${t2Label} 밋앤그릿`}
                  value={fees.meetGreetFeeT2}
                  onChange={(v) => onFeesChange({ ...fees, meetGreetFeeT2: v })}
                />
              ) : null}
            </div>
          ) : null}
          {dropT1 || dropT2 ? (
            <div className="grid grid-cols-2 gap-3">
              {dropT1 ? (
                <FeeInput
                  label={`${t1Label} 드랍오프`}
                  value={fees.dropFeeT1}
                  onChange={(v) => onFeesChange({ ...fees, dropFeeT1: v })}
                />
              ) : null}
              {dropT2 ? (
                <FeeInput
                  label={`${t2Label} 드랍오프`}
                  value={fees.dropFeeT2}
                  onChange={(v) => onFeesChange({ ...fees, dropFeeT2: v })}
                />
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
