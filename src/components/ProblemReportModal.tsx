import React from 'react';
import { X } from 'lucide-react';
import { sendProblemReport } from '../lib/errorReport';

interface ProblemReportModalProps {
  open: boolean;
  onClose: () => void;
}

const NOTE_MAX = 500;

export default function ProblemReportModal({ open, onClose }: ProblemReportModalProps) {
  const [note, setNote] = React.useState('');
  const [state, setState] = React.useState<'idle' | 'sending' | 'sent' | 'failed'>('idle');

  React.useEffect(() => {
    if (!open) return;
    setNote('');
    setState('idle');
  }, [open]);

  if (!open) return null;

  const submit = async () => {
    if (!note.trim() || state === 'sending') return;
    setState('sending');
    try {
      await sendProblemReport(note);
      setState('sent');
    } catch {
      setState('failed');
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-2xl border border-neutral-800 bg-neutral-900 p-5 text-zinc-100"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-black">문제 보내기</h2>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-zinc-500 hover:text-white" aria-label="닫기">
            <X size={18} />
          </button>
        </div>

        {state === 'sent' ? (
          <div className="space-y-4">
            <p className="text-xs leading-relaxed text-zinc-300">
              받았습니다. 평일 아침에 본사로 전달되고, 확인 후 고칩니다.
            </p>
            <button
              type="button"
              onClick={onClose}
              className="w-full rounded-xl bg-amber-500 py-3 text-xs font-black text-neutral-950"
            >
              닫기
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-[11px] leading-relaxed text-zinc-400">
              어느 화면에서 무엇을 하다가 어떻게 이상했는지 적어 주세요. 손님 전화번호나 이름은 적지 마세요.
            </p>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value.slice(0, NOTE_MAX))}
              rows={5}
              placeholder="예: 입고 처리 누르면 사진이 안 올라가고 계속 돌아가요"
              className="w-full resize-none rounded-xl border border-neutral-800 bg-neutral-950 p-3 text-xs text-zinc-100 outline-none focus:border-amber-500/60"
            />
            {state === 'failed' && (
              <p className="text-[11px] text-red-400">보내지 못했습니다. 연결을 확인하고 다시 눌러 주세요.</p>
            )}
            <button
              type="button"
              onClick={submit}
              disabled={!note.trim() || state === 'sending'}
              className="w-full rounded-xl bg-amber-500 py-3 text-xs font-black text-neutral-950 disabled:opacity-40"
            >
              {state === 'sending' ? '보내는 중…' : '보내기'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
