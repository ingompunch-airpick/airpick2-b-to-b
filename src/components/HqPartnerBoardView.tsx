import { useMemo, useState } from 'react';
import { Check, X } from 'lucide-react';
import type { Company } from '../types';
import {
  buildHqPartnerBoardRows,
  filterHqPartnerBoardRows,
  summarizeHqPartnerBoard,
  type HqPartnerBoardFilter,
  type HqPartnerBoardRow,
} from '../utils/hqPartnerBoard';

function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ');
}

interface HqPartnerBoardViewProps {
  companies: Company[];
  onUpdateCompanies: (updated: Company[]) => void;
  onToggleCompanyOpen: (companyId: string, isOpen: boolean) => Promise<void> | void;
  onSetListingApproved?: (companyId: string, approved: boolean) => Promise<void> | void;
  onRemoteOpen: (companyId: string) => void;
  onOpenPartnerEditor?: () => void;
  onOpenReviews?: (companyId: string) => void;
  /** 상위 「주차 업체」에 끼워 넣을 때 — 중복 헤더 숨김 */
  embedded?: boolean;
}

/** 스위치를 누르면 먼저 묻는다 — 한 번 잘못 눌러 손님 앱에서 사라지는 일 방지 (2026-11-14) */
type PendingChange =
  | { kind: 'open'; row: HqPartnerBoardRow; next: boolean }
  | { kind: 'listing'; row: HqPartnerBoardRow; next: boolean };

/** 받침 유무로 조사 고르기 (을/를, 이/가) */
function withParticle(word: string, withBatchim: string, without: string): string {
  const code = word.trim().slice(-1).charCodeAt(0) - 0xac00;
  if (code < 0 || code > 11171) return `${word}${withBatchim}(${without})`;
  return `${word}${code % 28 === 0 ? without : withBatchim}`;
}
const withObjectParticle = (w: string) => withParticle(w, '을', '를');

function confirmCopy(p: PendingChange): { title: string; body: string; cta: string; danger: boolean } {
  const name = withObjectParticle(p.row.name);
  if (p.kind === 'open') {
    return p.next
      ? {
          title: `${name} 영업중으로 바꿀까요?`,
          body: '바로 새 예약을 받을 수 있어요.',
          cta: '영업 시작',
          danger: false,
        }
      : {
          title: `${name} 휴업으로 바꿀까요?`,
          body: '휴업 중에는 새 예약을 받지 않아요. 이미 받은 예약은 그대로예요.',
          cta: '휴업으로',
          danger: true,
        };
  }
  return p.next
    ? {
        title: `${name} 손님 앱에 보일까요?`,
        body: '에어픽 비교 목록에 바로 나타나요.',
        cta: '보이기',
        danger: false,
      }
    : {
        title: `${name} 손님 앱에서 숨길까요?`,
        body: '숨기면 에어픽 비교 목록에서 바로 사라지고, 새 예약을 받을 수 없어요. 이미 받은 예약은 그대로예요.',
        cta: '숨기기',
        danger: true,
      };
}

function Switch({
  on,
  label,
  tone,
  disabled,
  onClick,
}: {
  on: boolean;
  label: string;
  tone: 'emerald' | 'sky';
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={disabled}
      onClick={onClick}
      className="inline-flex items-center gap-2 whitespace-nowrap text-[12px] font-bold text-zinc-300 disabled:opacity-40"
    >
      <span
        className={cn(
          'relative h-5 w-9 shrink-0 rounded-full transition-colors',
          on ? (tone === 'emerald' ? 'bg-emerald-500' : 'bg-sky-500') : 'bg-neutral-700'
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 size-4 rounded-full bg-white transition-all',
            on ? 'left-[18px]' : 'left-0.5'
          )}
        />
      </span>
      {label}
    </button>
  );
}

function ProfileState({ row }: { row: HqPartnerBoardRow }) {
  if (!row.incomplete) {
    return (
      <span className="inline-flex px-2 py-0.5 rounded-full text-[11px] font-black bg-emerald-500/15 text-emerald-300">
        완료
      </span>
    );
  }
  const missing = [
    !row.profile.insurance && '보험',
    !row.profile.address && '주소',
    !row.profile.photos && '사진',
  ].filter(Boolean);
  return (
    <span className="inline-flex whitespace-nowrap px-2 py-0.5 rounded-full text-[11px] font-black bg-amber-500/15 text-amber-300">
      {missing.join('·')} 없음
    </span>
  );
}

function ProfileChips({ row }: { row: HqPartnerBoardRow }) {
  const items = [
    { ok: row.profile.insurance, label: '보험' },
    { ok: row.profile.address, label: '주소' },
    { ok: row.profile.photos, label: '사진' },
  ];
  return (
    <span className="inline-flex gap-2">
      {items.map((i) => (
        <span
          key={i.label}
          className={cn(
            'inline-flex items-center gap-0.5 text-[11px] font-black',
            i.ok ? 'text-zinc-400' : 'text-zinc-600 line-through'
          )}
        >
          {i.ok ? <Check size={10} /> : <X size={10} />}
          {i.label}
        </span>
      ))}
    </span>
  );
}

function subLine(row: HqPartnerBoardRow): string {
  const parts = [row.id, row.airportLabel];
  if (row.parentCompanyName) parts.push(`${withParticle(row.parentCompanyName, '이', '가')} 운영`);
  return parts.join(' · ');
}

function capLine(row: HqPartnerBoardRow): string {
  const hourly = row.hourlyCapLabel === 'OFF' ? '' : `시간당 ${row.hourlyCapLabel.replace('대/시', '대')}`;
  const parking = row.parkingCapLabel === 'OFF' ? '' : `주차 ${row.parkingCapLabel}`;
  const caps = [hourly, parking].filter(Boolean).join(' · ') || '마감 없음';
  return row.blockedCount > 0 ? `${caps} · 블락 ${row.blockedCount}일` : caps;
}

const FILTERS: Array<{ id: HqPartnerBoardFilter; label: string; key: 'total' | 'open' | 'closed' | 'incomplete' }> = [
  { id: 'all', label: '전체', key: 'total' },
  { id: 'open', label: '영업중', key: 'open' },
  { id: 'closed', label: '휴업', key: 'closed' },
  { id: 'incomplete', label: '프로필 미완', key: 'incomplete' },
];

export default function HqPartnerBoardView({
  companies,
  onToggleCompanyOpen,
  onSetListingApproved,
  onRemoteOpen,
  onOpenPartnerEditor,
  onOpenReviews,
  embedded = false,
}: HqPartnerBoardViewProps) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [filter, setFilter] = useState<HqPartnerBoardFilter>('all');
  const [pending, setPending] = useState<PendingChange | null>(null);
  const allRows = useMemo(() => buildHqPartnerBoardRows(companies), [companies]);
  const summary = useMemo(() => summarizeHqPartnerBoard(allRows), [allRows]);
  const rows = useMemo(() => filterHqPartnerBoardRows(allRows, filter, ''), [allRows, filter]);

  const applyPending = async () => {
    if (!pending) return;
    const { row, next, kind } = pending;
    setPending(null);
    setBusyId(row.id);
    try {
      if (kind === 'open') await onToggleCompanyOpen(row.id, next);
      else if (onSetListingApproved) await onSetListingApproved(row.id, next);
    } finally {
      setBusyId(null);
    }
  };

  const rating = (row: HqPartnerBoardRow) => {
    const label = (
      <>
        ★ {row.rating ? row.rating.toFixed(1) : '—'}{' '}
        <span className="text-zinc-500">({row.reviewsCount})</span>
      </>
    );
    return onOpenReviews ? (
      <button
        type="button"
        onClick={() => onOpenReviews(row.id)}
        className="font-bold text-zinc-200 hover:text-amber-400"
      >
        {label}
      </button>
    ) : (
      <span className="font-bold text-zinc-200">{label}</span>
    );
  };

  const switches = (row: HqPartnerBoardRow) => {
    const busy = busyId === row.id;
    return {
      open: (
        <Switch
          on={row.isOpen}
          label={row.isOpen ? '영업중' : '휴업'}
          tone="emerald"
          disabled={busy}
          onClick={() => setPending({ kind: 'open', row, next: !row.isOpen })}
        />
      ),
      listing: (
        <Switch
          on={row.listingApproved}
          label={row.listingApproved ? '노출' : '숨김'}
          tone="sky"
          disabled={busy || !onSetListingApproved}
          onClick={() => setPending({ kind: 'listing', row, next: !row.listingApproved })}
        />
      ),
    };
  };

  const remoteButton = (row: HqPartnerBoardRow, compact = false) => (
    <button
      type="button"
      disabled={busyId === row.id}
      onClick={() => onRemoteOpen(row.id)}
      className={cn(
        'shrink-0 whitespace-nowrap rounded-xl text-[12px] font-black disabled:opacity-50',
        compact ? 'px-3 py-1.5' : 'px-3.5 py-2',
        row.isDemo
          ? 'border border-neutral-700 bg-neutral-900 text-zinc-300'
          : 'bg-amber-500 text-neutral-950'
      )}
    >
      {compact ? '원격' : '원격 접속'}
    </button>
  );

  const nameCell = (row: HqPartnerBoardRow) => (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[14px] font-black text-white">{row.name}</span>
        {row.isDemo ? (
          <span className="px-1.5 py-0.5 rounded-md bg-neutral-800 text-[10px] font-black text-zinc-400">
            심사용
          </span>
        ) : null}
      </div>
      <p className="text-[12px] text-zinc-500 mt-0.5">{subLine(row)}</p>
    </>
  );

  const copy = pending ? confirmCopy(pending) : null;

  return (
    <div
      className={cn(
        'text-zinc-100 font-sans',
        embedded ? 'px-4 pb-24' : 'min-h-screen bg-black p-4 pb-24'
      )}
    >
      {!embedded ? <h2 className="text-base font-black text-white mb-3">주차 업체 · 상태</h2> : null}

      <div className="flex flex-wrap gap-2 pt-3 mb-3">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            className={cn(
              'px-3 py-1.5 rounded-full text-[12px] font-bold border',
              filter === f.id
                ? 'bg-zinc-100 text-neutral-950 border-zinc-100'
                : 'bg-neutral-900 text-zinc-400 border-neutral-800'
            )}
          >
            {f.label} {summary[f.key]}
          </button>
        ))}
      </div>

      {rows.length === 0 ? (
        <p className="py-12 text-center text-sm text-zinc-500 font-semibold">해당하는 업체가 없어요.</p>
      ) : (
        <>
          {/* PC: 표 한 장으로 비교 */}
          <table className="hidden md:table w-full text-[13px]">
            <thead>
              <tr className="text-left text-[12px] text-zinc-500 border-b border-neutral-800">
                <th className="py-2.5 pr-3 font-bold">업체</th>
                <th className="py-2.5 pr-3 font-bold">영업</th>
                <th className="py-2.5 pr-3 font-bold">손님앱</th>
                <th className="py-2.5 pr-3 font-bold">별점</th>
                <th className="py-2.5 pr-3 font-bold">마감 · 블락</th>
                <th className="py-2.5 pr-3 font-bold">알림톡</th>
                <th className="py-2.5 pr-3 font-bold">프로필</th>
                <th className="py-2.5" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const sw = switches(row);
                return (
                  <tr
                    key={row.id}
                    className={cn('border-b border-neutral-900 align-middle', row.isDemo && 'opacity-55')}
                  >
                    <td className="py-3.5 pr-3">{nameCell(row)}</td>
                    <td className="py-3.5 pr-3">{sw.open}</td>
                    <td className="py-3.5 pr-3">{sw.listing}</td>
                    <td className="py-3.5 pr-3 whitespace-nowrap">{rating(row)}</td>
                    <td className="py-3.5 pr-3 text-zinc-300">{capLine(row)}</td>
                    <td className="py-3.5 pr-3 text-zinc-400 whitespace-nowrap" title={row.alimtalk.detail}>
                      {row.alimtalk.label}
                    </td>
                    <td className="py-3.5 pr-3">
                      {row.incomplete && onOpenPartnerEditor ? (
                        <button type="button" onClick={onOpenPartnerEditor} title="등록·편집에서 보완">
                          <ProfileState row={row} />
                        </button>
                      ) : (
                        <ProfileState row={row} />
                      )}
                    </td>
                    <td className="py-3.5 text-right">{remoteButton(row)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* 폰: 업체마다 카드 */}
          <ul className="md:hidden space-y-2.5">
            {rows.map((row) => {
              const sw = switches(row);
              return (
                <li
                  key={row.id}
                  className={cn(
                    'rounded-2xl border border-neutral-800 bg-neutral-950 p-4',
                    row.isDemo && 'opacity-60'
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">{nameCell(row)}</div>
                    {remoteButton(row, true)}
                  </div>
                  <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-zinc-400">
                    {rating(row)}
                    <span>{capLine(row)}</span>
                    <span>알림톡 {row.alimtalk.label}</span>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <ProfileChips row={row} />
                    {row.incomplete && onOpenPartnerEditor ? (
                      <button
                        type="button"
                        onClick={onOpenPartnerEditor}
                        className="ml-auto text-[12px] font-black text-amber-400"
                      >
                        보완하기 →
                      </button>
                    ) : null}
                  </div>
                  <div className="mt-3 flex items-center gap-5 border-t border-neutral-900 pt-3">
                    {sw.open}
                    {sw.listing}
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {pending && copy ? (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 p-4">
          <div
            role="alertdialog"
            aria-modal="true"
            className="w-full max-w-sm rounded-3xl border border-neutral-800 bg-neutral-900 p-5"
          >
            <h3 className="text-[16px] font-black text-white">{copy.title}</h3>
            <p className="mt-2 text-[13px] leading-relaxed text-zinc-400">{copy.body}</p>
            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={() => setPending(null)}
                className="flex-1 rounded-xl border border-neutral-700 bg-neutral-950 py-3 text-[13px] font-black text-zinc-200"
              >
                취소
              </button>
              <button
                type="button"
                onClick={() => void applyPending()}
                className={cn(
                  'flex-1 rounded-xl py-3 text-[13px] font-black',
                  copy.danger ? 'bg-red-500 text-white' : 'bg-amber-500 text-neutral-950'
                )}
              >
                {copy.cta}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
