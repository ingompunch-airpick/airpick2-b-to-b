import React, { useEffect, useState } from 'react';
import { Bell, Play, Save, X } from 'lucide-react';
import {
  ALERT_TITLE_AIRPICK_PRESETS,
  ALERT_TITLE_OTHER_PRESETS,
  DEFAULT_RESERVATION_ALERT_COPY,
  coerceReservationAlertCopy,
  type ReservationAlertCopy,
} from '../utils/reservationAlertCopy';
import {
  speakReservationAlertPreview,
  setRuntimeReservationAlertCopy,
} from '../utils/reservationNotifications';
import {
  fetchReservationAlertCopy,
  saveReservationAlertCopy,
} from '../lib/reservationAlertCopyFirestore';
import { isAirpickHeadquarters } from '../constants/platform';

type Props = {
  open: boolean;
  onClose: () => void;
  currentCompanyId: string;
  /** HQ만 저장 가능. 파트너는 미리듣기만 */
  canEdit: boolean;
};

function PreviewCard({
  title,
  tone,
}: {
  title: string;
  tone: 'fuchsia' | 'sky';
}) {
  const border =
    tone === 'fuchsia' ? 'border-fuchsia-500/40' : 'border-sky-500/40';
  const label = tone === 'fuchsia' ? 'text-fuchsia-300' : 'text-sky-300';
  return (
    <div className={`rounded-2xl border ${border} bg-neutral-950 px-3 py-3`}>
      <p className={`text-sm font-black ${label}`}>{title || '제목'}</p>
    </div>
  );
}

function PresetRow({
  presets,
  value,
  onPick,
  disabled,
}: {
  presets: readonly string[];
  value: string;
  onPick: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {presets.map((p) => {
        const active = value === p;
        return (
          <button
            key={p}
            type="button"
            disabled={disabled}
            onClick={() => onPick(p)}
            className={`px-2.5 py-1 rounded-lg text-[10px] font-black border transition-all disabled:opacity-40 ${
              active
                ? 'bg-amber-500 text-neutral-950 border-amber-500'
                : 'bg-neutral-900 text-zinc-400 border-neutral-800 hover:text-zinc-200'
            }`}
          >
            {p}
          </button>
        );
      })}
    </div>
  );
}

export default function ReservationAlertSettingsModal({
  open,
  onClose,
  currentCompanyId,
  canEdit,
}: Props) {
  const [copy, setCopy] = useState<ReservationAlertCopy>(DEFAULT_RESERVATION_ALERT_COPY);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);
  const [previewKind, setPreviewKind] = useState<'airpick' | 'other' | null>(null);

  const hq = isAirpickHeadquarters(currentCompanyId) || canEdit;

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const next = await fetchReservationAlertCopy({ force: true });
        if (!cancelled) {
          setCopy(next);
          setRuntimeReservationAlertCopy(next);
        }
      } catch (err) {
        if (!cancelled) {
          setCopy(DEFAULT_RESERVATION_ALERT_COPY);
          setError(err instanceof Error ? err.message : '문구를 불러오지 못했습니다.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  if (!open) return null;

  const playPreview = (kind: 'airpick' | 'other') => {
    setPreviewKind(kind);
    const title = kind === 'airpick' ? copy.titleAirpick : copy.titleOther;
    speakReservationAlertPreview({ title, kind });
    window.setTimeout(() => setPreviewKind(null), 2500);
  };

  const handleSave = async () => {
    if (!hq) return;
    setSaving(true);
    setError(null);
    try {
      const next = await saveReservationAlertCopy(coerceReservationAlertCopy(copy));
      setCopy(next);
      setRuntimeReservationAlertCopy(next);
      setSavedFlash(true);
      window.setTimeout(() => setSavedFlash(false), 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : '저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center bg-black/70 px-3 py-6">
      <div className="w-full max-w-md rounded-3xl border border-neutral-800 bg-[#1C1C1E] shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-800">
          <div className="flex items-center gap-2">
            <Bell size={16} className="text-amber-400" />
            <div>
              <p className="text-sm font-black text-white">예약 알림 문구</p>
              <p className="text-[10px] text-zinc-500 font-semibold">
                미리 듣고 · 고르고 · {hq ? '저장' : '본사만 저장 가능'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-zinc-500 hover:text-white hover:bg-neutral-800"
          >
            <X size={16} />
          </button>
        </div>

        <div className="p-4 space-y-4 max-h-[75vh] overflow-y-auto">
          {loading ? (
            <p className="text-[12px] text-zinc-500 font-semibold">불러오는 중…</p>
          ) : (
            <>
              <section className="space-y-2">
                <p className="text-[10px] font-black uppercase tracking-wide text-fuchsia-400/90">
                  에어픽.kr 예약
                </p>
                <PresetRow
                  presets={ALERT_TITLE_AIRPICK_PRESETS}
                  value={copy.titleAirpick}
                  disabled={!hq}
                  onPick={(v) => setCopy((c) => ({ ...c, titleAirpick: v }))}
                />
                <input
                  value={copy.titleAirpick}
                  disabled={!hq}
                  maxLength={24}
                  onChange={(e) =>
                    setCopy((c) => ({ ...c, titleAirpick: e.target.value }))
                  }
                  className="w-full px-3 py-2 rounded-xl bg-neutral-950 border border-neutral-800 text-sm text-zinc-100 font-bold disabled:opacity-50"
                  placeholder="에어픽 예약"
                />
                <button
                  type="button"
                  onClick={() => playPreview('airpick')}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-fuchsia-500/30 text-fuchsia-300 text-[11px] font-black"
                >
                  <Play size={12} /> 미리 듣기
                </button>
              </section>

              <section className="space-y-2">
                <p className="text-[10px] font-black uppercase tracking-wide text-sky-400/90">
                  홈페이지 · 현장 예약
                </p>
                <PresetRow
                  presets={ALERT_TITLE_OTHER_PRESETS}
                  value={copy.titleOther}
                  disabled={!hq}
                  onPick={(v) => setCopy((c) => ({ ...c, titleOther: v }))}
                />
                <input
                  value={copy.titleOther}
                  disabled={!hq}
                  maxLength={24}
                  onChange={(e) =>
                    setCopy((c) => ({ ...c, titleOther: e.target.value }))
                  }
                  className="w-full px-3 py-2 rounded-xl bg-neutral-950 border border-neutral-800 text-sm text-zinc-100 font-bold disabled:opacity-50"
                  placeholder="예약"
                />
                <button
                  type="button"
                  onClick={() => playPreview('other')}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-sky-500/30 text-sky-300 text-[11px] font-black"
                >
                  <Play size={12} /> 미리 듣기
                </button>
              </section>

              <div className="space-y-2">
                <p className="text-[10px] font-black text-zinc-500 uppercase">미리보기</p>
                <PreviewCard title={copy.titleAirpick} tone="fuchsia" />
                <PreviewCard title={copy.titleOther} tone="sky" />
              </div>

              {previewKind ? (
                <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 px-3 py-3 animate-pulse">
                  <p className="text-sm font-black text-amber-300">
                    {previewKind === 'airpick' ? copy.titleAirpick : copy.titleOther}
                  </p>
                </div>
              ) : null}

              <p className="text-[10px] text-zinc-600 font-semibold leading-relaxed">
                미리듣기는 제목만 읽어 줍니다. (옛 비프음은 섞지 않음)
              </p>
            </>
          )}

          {error ? <p className="text-[12px] text-rose-400 font-semibold">{error}</p> : null}
        </div>

        <div className="px-4 py-3 border-t border-neutral-800 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl bg-neutral-900 text-zinc-300 text-[12px] font-black"
          >
            닫기
          </button>
          {hq ? (
            <button
              type="button"
              disabled={saving || loading}
              onClick={() => void handleSave()}
              className="flex-1 py-2.5 rounded-xl bg-amber-500 text-neutral-950 text-[12px] font-black disabled:opacity-40 inline-flex items-center justify-center gap-1.5"
            >
              <Save size={13} />
              {savedFlash ? '저장됨' : saving ? '저장 중…' : '저장'}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
