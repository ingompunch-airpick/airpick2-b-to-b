import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, ChevronDown, ChevronUp, ClipboardList } from 'lucide-react';
import {
  PARTNER_ONBOARDING_STEPS,
  PartnerChannel,
  onboardingStorageKey,
} from '../constants/partnerOnboarding';
import { cn } from '../lib/utils';

interface StoredOnboarding {
  checks: Record<string, boolean>;
  channel: PartnerChannel;
}

interface Props {
  companyId?: string;
  companyName?: string;
  /** AdminDashboard(밝음) vs MasterSettings(어두움) */
  variant?: 'light' | 'dark';
  defaultExpanded?: boolean;
  highlight?: boolean;
}

function loadStored(companyId: string): StoredOnboarding {
  try {
    const raw = localStorage.getItem(onboardingStorageKey(companyId));
    if (!raw) return { checks: {}, channel: 'b2c-only' };
    const parsed = JSON.parse(raw) as StoredOnboarding;
    return {
      checks: parsed.checks || {},
      channel: parsed.channel === 'homepage+b2c' ? 'homepage+b2c' : 'b2c-only',
    };
  } catch {
    return { checks: {}, channel: 'b2c-only' };
  }
}

export default function PartnerOnboardingChecklist({
  companyId,
  companyName,
  variant = 'light',
  defaultExpanded = false,
  highlight = false,
}: Props) {
  const [expanded, setExpanded] = useState(defaultExpanded || highlight);
  const [channel, setChannel] = useState<PartnerChannel>('b2c-only');
  const [checks, setChecks] = useState<Record<string, boolean>>({});

  const id = (companyId || '').trim().toLowerCase();
  const isDark = variant === 'dark';

  useEffect(() => {
    if (!id) return;
    const stored = loadStored(id);
    setChecks(stored.checks);
    setChannel(stored.channel);
  }, [id]);

  const visibleSteps = useMemo(
    () =>
      PARTNER_ONBOARDING_STEPS.filter(
        (step) => !step.homepageOnly || channel === 'homepage+b2c'
      ),
    [channel]
  );

  const doneCount = visibleSteps.filter((s) => checks[s.id]).length;
  const allDone = visibleSteps.length > 0 && doneCount === visibleSteps.length;

  const persist = (nextChecks: Record<string, boolean>, nextChannel: PartnerChannel) => {
    if (!id) return;
    localStorage.setItem(
      onboardingStorageKey(id),
      JSON.stringify({ checks: nextChecks, channel: nextChannel })
    );
  };

  const toggleCheck = (stepId: string) => {
    const next = { ...checks, [stepId]: !checks[stepId] };
    setChecks(next);
    persist(next, channel);
  };

  const onChannelChange = (next: PartnerChannel) => {
    setChannel(next);
    persist(checks, next);
  };

  const resetChecks = () => {
    setChecks({});
    persist({}, channel);
  };

  return (
    <div
      className={cn(
        'rounded-2xl border text-left',
        isDark
          ? 'border-neutral-800 bg-neutral-900/50'
          : 'border-slate-200 bg-slate-50',
        highlight && (isDark ? 'ring-1 ring-amber-500/40' : 'ring-1 ring-indigo-300')
      )}
    >
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className={cn(
          'w-full flex items-center gap-2.5 px-4 py-3 text-left',
          isDark ? 'text-white' : 'text-slate-900'
        )}
      >
        <ClipboardList
          size={16}
          className={isDark ? 'text-amber-500 shrink-0' : 'text-indigo-600 shrink-0'}
        />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-black tracking-tight">
            제휴업체 온보딩 체크리스트
            {id ? (
              <span className={cn('font-mono ml-1', isDark ? 'text-amber-400' : 'text-indigo-600')}>
                {id}
              </span>
            ) : null}
          </p>
          <p className={cn('text-[11px] mt-0.5 truncate', isDark ? 'text-zinc-500' : 'text-slate-500')}>
            {companyName
              ? `${companyName} · `
              : id
                ? ''
                : '업체 등록 후 companyId가 표시됩니다 · '}
            {id ? `${doneCount}/${visibleSteps.length} 완료` : '등록 직후 순서대로 확인'}
          </p>
        </div>
        {allDone && (
          <CheckCircle2 size={16} className="text-emerald-500 shrink-0" aria-hidden />
        )}
        {expanded ? (
          <ChevronUp size={16} className="shrink-0 opacity-60" />
        ) : (
          <ChevronDown size={16} className="shrink-0 opacity-60" />
        )}
      </button>

      {expanded && (
        <div
          className={cn(
            'px-4 pb-4 pt-0 space-y-3 border-t',
            isDark ? 'border-neutral-800' : 'border-slate-200'
          )}
        >
          <div className="pt-3">
            <p className={cn('text-[11px] font-bold mb-1.5', isDark ? 'text-zinc-400' : 'text-slate-600')}>
              고객 유입 경로
            </p>
            <div className="grid grid-cols-2 gap-1.5">
              {(
                [
                  ['b2c-only', 'B2C만 (에어픽)'],
                  ['homepage+b2c', '자체 홈 + B2C'],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => onChannelChange(value)}
                  className={cn(
                    'rounded-xl py-2 px-2 text-[11px] font-bold transition-all',
                    channel === value
                      ? isDark
                        ? 'bg-amber-500 text-neutral-950'
                        : 'bg-indigo-600 text-white'
                      : isDark
                        ? 'bg-neutral-950 border border-neutral-800 text-zinc-400'
                        : 'bg-white border border-slate-200 text-slate-500'
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <ul className="space-y-2">
            {visibleSteps.map((step) => {
              const label = step.label.replace('{id}', id || '업체id');
              const checked = !!checks[step.id];
              return (
                <li key={step.id}>
                  <label
                    className={cn(
                      'flex items-start gap-2.5 rounded-xl px-3 py-2 cursor-pointer',
                      isDark ? 'hover:bg-neutral-950/60' : 'hover:bg-white'
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleCheck(step.id)}
                      className="mt-0.5 rounded border-neutral-600"
                    />
                    <span
                      className={cn(
                        'text-[11.5px] leading-snug font-medium',
                        checked
                          ? isDark
                            ? 'text-zinc-500 line-through'
                            : 'text-slate-400 line-through'
                          : isDark
                            ? 'text-zinc-200'
                            : 'text-slate-700'
                      )}
                    >
                      {label}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>

          <div className="flex flex-wrap gap-2 pt-1">
            {id ? (
              <button
                type="button"
                onClick={resetChecks}
                className={cn(
                  'text-[11px] font-bold px-2.5 py-1 rounded-lg',
                  isDark
                    ? 'text-zinc-500 hover:text-zinc-300'
                    : 'text-slate-500 hover:text-slate-700'
                )}
              >
                체크 초기화
              </button>
            ) : null}
            <span className={cn('text-[10px] self-center', isDark ? 'text-zinc-600' : 'text-slate-400')}>
              상세: docs/PARTNER_ONBOARDING.md
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
