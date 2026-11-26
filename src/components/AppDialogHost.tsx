import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * 브라우저 기본 흰 창(window.confirm/prompt/alert) 대신 앱 디자인 확인 창.
 * 사용: `if (!(await appConfirm('…'))) return;` · `const v = await appPrompt('…', '기본값')`
 */

type DialogRequest =
  | { kind: 'confirm'; message: string; okLabel?: string; danger?: boolean; resolve: (v: boolean) => void }
  | { kind: 'prompt'; message: string; defaultValue: string; resolve: (v: string | null) => void }
  | { kind: 'alert'; message: string; resolve: () => void };

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

export default function AppDialogHost() {
  const [queue, setQueue] = useState<DialogRequest[]>([]);
  const [text, setText] = useState('');
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
  }, [current]);

  if (!current) return null;

  const close = (ok: boolean) => {
    if (current.kind === 'confirm') current.resolve(ok);
    else if (current.kind === 'prompt') current.resolve(ok ? text : null);
    else current.resolve();
    setQueue((q) => q.slice(1));
  };

  const danger = current.kind === 'confirm' && current.danger;
  const okLabel = current.kind === 'confirm' ? current.okLabel || '확인' : '확인';

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
              취소
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => close(true)}
            className={`flex-1 rounded-xl py-3 text-[15px] font-bold ${
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
