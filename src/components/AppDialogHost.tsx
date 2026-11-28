import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { CancelledBy } from '../types';
import { STAFF_CANCEL_CHOICES } from '../utils/cancelledBy';

/**
 * 브라우저 기본 흰 창(window.confirm/prompt/alert) 대신 앱 디자인 확인 창.
 * 사용: `if (!(await appConfirm('…'))) return;` · `const v = await appPrompt('…', '기본값')`
 */

type DialogRequest =
  | { kind: 'confirm'; message: string; okLabel?: string; danger?: boolean; resolve: (v: boolean) => void }
  | { kind: 'prompt'; message: string; defaultValue: string; resolve: (v: string | null) => void }
  | { kind: 'alert'; message: string; resolve: () => void }
  | {
      kind: 'cancel';
      message: string;
      defaultBy?: StaffCancelBy;
      resolve: (v: { by: StaffCancelBy; reason: string } | null) => void;
    };

export type StaffCancelBy = Extract<CancelledBy, 'customer_request' | 'partner' | 'void'>;

let push: ((req: DialogRequest) => void) | null = null;

export function appConfirm(
  message: string,
  opts: { okLabel?: string; danger?: boolean } = {}
): Promise<boolean> {
  if (!push) return Promise.resolve(window.confirm(message));
  return new Promise((resolve) => push!({ kind: 'confirm', message, ...opts, resolve }));
}

export function appPrompt(message: string, defaultValue = ''): Promise<string | null> {
  if (!push) return Promise.resolve(window.prompt(message, defaultValue));
  return new Promise((resolve) => push!({ kind: 'prompt', message, defaultValue, resolve }));
}

export function appAlert(message: string): Promise<void> {
  if (!push) {
    window.alert(message);
    return Promise.resolve();
  }
  return new Promise((resolve) => push!({ kind: 'alert', message, resolve }));
}

/**
 * 예약 취소 — 누가 취소했는지(손님 요청 · 업체 사정 · 테스트) 꼭 고르고, 메모는 선택.
 * 「업체 사정 취소」는 운영 점수에 들어가서, 고르지 않으면 취소할 수 없다.
 */
export function appCancelReason(
  message: string,
  opts: { defaultBy?: StaffCancelBy } = {}
): Promise<{ by: StaffCancelBy; reason: string } | null> {
  if (!push) {
    const reason = window.prompt(`${message}\n(손님 요청 / 업체 사정 / 테스트)`, '');
    if (reason === null) return Promise.resolve(null);
    return Promise.resolve({ by: opts.defaultBy ?? 'customer_request', reason });
  }
  return new Promise((resolve) => push!({ kind: 'cancel', message, defaultBy: opts.defaultBy, resolve }));
}

export default function AppDialogHost() {
  const [queue, setQueue] = useState<DialogRequest[]>([]);
  const [text, setText] = useState('');
  const [pickedBy, setPickedBy] = useState<StaffCancelBy | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const current = queue[0];

  useEffect(() => {
    push = (req) => setQueue((q) => [...q, req]);
    return () => {
      push = null;
    };
  }, []);

  useEffect(() => {
    if (current?.kind === 'prompt') {
      setText(current.defaultValue);
      setTimeout(() => inputRef.current?.select(), 0);
    }
    if (current?.kind === 'cancel') {
      setText('');
      setPickedBy(current.defaultBy ?? null);
    }
  }, [current]);

  if (!current) return null;

  const close = (ok: boolean) => {
    if (current.kind === 'confirm') current.resolve(ok);
    else if (current.kind === 'prompt') current.resolve(ok ? text : null);
    else if (current.kind === 'cancel') {
      if (ok && !pickedBy) return; // 고르기 전엔 확인 안 됨
      current.resolve(ok && pickedBy ? { by: pickedBy, reason: text.trim() } : null);
    } else current.resolve();
    setQueue((q) => q.slice(1));
  };

  const danger = (current.kind === 'confirm' && current.danger) || current.kind === 'cancel';
  const okLabel =
    current.kind === 'confirm'
      ? current.okLabel || '확인'
      : current.kind === 'cancel'
        ? '예약 취소'
        : '확인';
  const okDisabled = current.kind === 'cancel' && !pickedBy;

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-end justify-center bg-black/60 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:items-center"
      onClick={() => close(false)}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#1C1C1E] p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="whitespace-pre-line text-[16px] font-semibold leading-relaxed text-white">
          {current.message}
        </p>
        {current.kind === 'cancel' ? (
          <div className="mt-4 space-y-2" role="radiogroup" aria-label="누가 취소했나요">
            {STAFF_CANCEL_CHOICES.map((c) => {
              const on = pickedBy === c.by;
              return (
                <button
                  key={c.by}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => setPickedBy(c.by)}
                  className={`w-full rounded-xl border px-3.5 py-2.5 text-left transition-colors ${
                    on
                      ? 'border-amber-500 bg-amber-500/15'
                      : 'border-white/10 bg-black/30 hover:border-white/25'
                  }`}
                >
                  <span className={`block text-[15px] font-bold ${on ? 'text-amber-300' : 'text-white'}`}>
                    {c.label}
                  </span>
                  <span className="block text-[13px] text-zinc-400">{c.hint}</span>
                </button>
              );
            })}
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') close(true);
              }}
              placeholder="메모 (선택)"
              aria-label="취소 메모"
              className="w-full rounded-xl border border-white/15 bg-black/40 px-3.5 py-3 text-[16px] text-white outline-none placeholder:text-zinc-500 focus:border-amber-500"
            />
          </div>
        ) : null}
        {current.kind === 'prompt' ? (
          <input
            ref={inputRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') close(true);
            }}
            className="mt-4 w-full rounded-xl border border-white/15 bg-black/40 px-3.5 py-3 text-[16px] text-white outline-none focus:border-amber-500"
          />
        ) : null}
        <div className="mt-5 flex gap-2">
          {current.kind !== 'alert' ? (
            <button
              type="button"
              onClick={() => close(false)}
              className="flex-1 rounded-xl bg-white/10 py-3 text-[15px] font-bold text-zinc-200"
            >
              {current.kind === 'cancel' ? '닫기' : '취소'}
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => close(true)}
            disabled={okDisabled}
            className={`flex-1 rounded-xl py-3 text-[15px] font-bold disabled:opacity-40 ${
              danger ? 'bg-rose-500 text-white' : 'bg-amber-500 text-neutral-950'
            }`}
          >
            {okLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
