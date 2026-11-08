import React, { useEffect, useState } from 'react';
import { Bell, BellOff, Play, Save, X } from 'lucide-react';
import {
  ALERT_TITLE_CHECKOUT_PRESETS,
  ALERT_TITLE_RESERVE_PRESETS,
  DEFAULT_RESERVATION_ALERT_COPY,
  coerceReservationAlertCopy,
  type ReservationAlertCopy,
} from '../utils/reservationAlertCopy';
import {
  requestReservationNotificationPermission,
  sendTestReservationAlert,
  setReservationAlertsEnabled,
  speakReservationAlertPreview,
  setRuntimeReservationAlertCopy,
} from '../utils/reservationNotifications';
import {
  getPartnerPushStatus,
  registerPartnerPushDevice,
  type PartnerPushStatus,
} from '../lib/partnerPush';
import {
  fetchReservationAlertCopy,
  saveReservationAlertCopy,
} from '../lib/reservationAlertCopyFirestore';
import { isAirpickHeadquarters } from '../constants/platform';

type Props = {
  open: boolean;
  onClose: () => void;
  currentCompanyId: string;
  operatorCompanyIds?: string[];
  /** HQ만 문구 저장 가능. 파트너는 미리듣기만 */
  canEdit: boolean;
  enabled: boolean;
  onEnabledChange: (enabled: boolean) => void;
};

/** 문제가 있을 때만 보인다 */
function Warning({ text }: { text: string }) {
  return (
    <p className="px-3 py-2.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-[12px] font-bold text-rose-300 leading-relaxed">
      {text}
    </p>
  );
}

/** 한 줄: 이름 · 문구 · ▶. 본사만 입력칸과 추천 문구가 보인다 */
function CopyRow({
  label,
  value,
  placeholder,
  presets,
  editable,
  onChange,
  onPlay,
}: {
  label: string;
  value: string;
  placeholder: string;
  presets: readonly string[];
  editable: boolean;
  onChange: (v: string) => void;
  onPlay: () => void;
}) {
  const others = presets.filter((p) => p !== value);
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <span className="w-14 shrink-0 text-[11px] font-bold text-zinc-500">{label}</span>
        {editable ? (
          <input
            value={value}
            maxLength={24}
            onChange={(e) => onChange(e.target.value)}
            className="flex-1 min-w-0 px-3 py-2 rounded-xl bg-neutral-950 border border-neutral-800 text-sm text-zinc-100 font-bold"
            placeholder={placeholder}
          />
        ) : (
          <span className="flex-1 min-w-0 text-sm font-black text-zinc-100">{value || placeholder}</span>
        )}
        <button
          type="button"
          onClick={onPlay}
          aria-label={`${label} 들어 보기`}
          className="shrink-0 w-9 h-9 rounded-xl border border-amber-500/30 text-amber-300 inline-flex items-center justify-center"
        >
          <Play size={14} />
        </button>
      </div>
      {editable && others.length > 0 ? (
        <div className="flex flex-wrap gap-1.5 pl-16">
          {others.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => onChange(p)}
              className="px-2 py-0.5 rounded-lg text-[10px] font-black border bg-neutral-900 text-zinc-400 border-neutral-800 hover:text-zinc-200"
            >
              {p}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export default function ReservationAlertSettingsModal({
  open,
  onClose,
  currentCompanyId,
  operatorCompanyIds = [],
  canEdit,
  enabled,
  onEnabledChange,
}: Props) {
  const [pushStatus, setPushStatus] = useState<PartnerPushStatus | null>(null);
  const [toggling, setToggling] = useState(false);
  const atHq = isAirpickHeadquarters(currentCompanyId);
  const partnerDevice = Boolean(currentCompanyId) && !atHq;

  const refreshStatus = () => {
    void getPartnerPushStatus()
      .then(setPushStatus)
      .catch(() => setPushStatus(null));
  };

  useEffect(() => {
    if (open) refreshStatus();
  }, [open]);

  const toggleEnabled = async () => {
    if (toggling) return;
    if (enabled) {
      setReservationAlertsEnabled(false);
      onEnabledChange(false);
      return;
    }
    setToggling(true);
    try {
      if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
        await requestReservationNotificationPermission();
      }
      setReservationAlertsEnabled(true);
      onEnabledChange(true);
      if (partnerDevice) {
        const scopes = operatorCompanyIds.length > 0 ? operatorCompanyIds : [currentCompanyId];
        await registerPartnerPushDevice({ companyId: currentCompanyId, scopeCompanyIds: scopes });
      }
    } finally {
      setToggling(false);
      refreshStatus();
    }
  };
  const [copy, setCopy] = useState<ReservationAlertCopy>(DEFAULT_RESERVATION_ALERT_COPY);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);
  const hq = atHq || canEdit;

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

  const playPreview = (kind: 'reserve' | 'checkout') => {
    const title = kind === 'checkout' ? copy.titleCheckout : copy.titleReserve;
    speakReservationAlertPreview({ title, kind: 'other' });
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
              <p className="text-sm font-black text-white">
                {atHq ? '알림 문구' : '알림'}
              </p>
              <p className="text-[10px] text-zinc-500 font-semibold">
                {atHq ? '파트너 기기가 읽어 주는 말' : '예약 · 출고요청'}
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
          {!atHq ? (
            <>
              <button
                type="button"
                role="switch"
                aria-checked={enabled}
                disabled={toggling}
                onClick={() => void toggleEnabled()}
                className={`w-full px-3 py-3 rounded-2xl border flex items-center justify-between gap-3 transition-all disabled:opacity-60 ${
                  enabled
                    ? 'bg-amber-500/10 border-amber-500/40'
                    : 'bg-neutral-950 border-neutral-800'
                }`}
              >
                <span className="flex items-center gap-2.5 text-left">
                  {enabled ? (
                    <Bell size={18} className="text-amber-400" />
                  ) : (
                    <BellOff size={18} className="text-zinc-500" />
                  )}
                  <span>
                    <span
                      className={`block text-[13px] font-black ${enabled ? 'text-amber-300' : 'text-zinc-300'}`}
                    >
                      이 기기 알림 {enabled ? '켜짐' : '꺼짐'}
                    </span>
                    <span className="block text-[11px] text-zinc-500 font-semibold">
                      새 예약은 소리와 알림창, 출고요청은 소리로 알려줍니다
                    </span>
                  </span>
                </span>
                <span
                  className={`relative w-11 h-6 rounded-full shrink-0 transition-colors ${enabled ? 'bg-amber-500' : 'bg-neutral-700'}`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${enabled ? 'translate-x-5' : ''}`}
                  />
                </span>
              </button>

              {enabled ? (
                <section className="space-y-2">
                  {pushStatus && pushStatus.permission !== 'granted' ? (
                    <Warning
                      text={
                        pushStatus.native
                          ? '알림창이 막혀 있습니다. 휴대폰 설정 → 애플리케이션 → 에어픽 파트너 → 알림을 켜 주세요.'
                          : '브라우저 알림이 막혀 있습니다. 주소창 왼쪽 자물쇠 → 알림 → 허용으로 바꿔 주세요. 소리는 그대로 납니다.'
                      }
                    />
                  ) : null}
                  {pushStatus?.native &&
                  partnerDevice &&
                  pushStatus.permission === 'granted' &&
                  !pushStatus.registered ? (
                    <Warning text="앱이 꺼져 있을 때 받을 준비가 안 됐습니다. 알림을 껐다 켜 주세요." />
                  ) : null}
                  <button
                    type="button"
                    onClick={() => sendTestReservationAlert()}
                    className="w-full py-2.5 rounded-xl border border-amber-500/30 text-amber-300 text-[12px] font-black inline-flex items-center justify-center gap-1.5"
                  >
                    <Play size={13} /> 테스트 알림 보내기
                  </button>
                </section>
              ) : null}
            </>
          ) : (
            <p className="text-[11px] text-zinc-500 font-semibold leading-relaxed">
              본사 단말기에는 예약 알림이 오지 않습니다. 아래에서 파트너 기기가 읽어 주는 말만
              바꿉니다.
            </p>
          )}

          {loading ? (
            <p className="text-[12px] text-zinc-500 font-semibold">불러오는 중…</p>
          ) : (
            <>
              <p
                className={`text-[10px] font-black uppercase tracking-wide text-amber-400/90 ${atHq ? '' : 'pt-2 border-t border-neutral-800'}`}
              >
                읽어 주는 말 {hq ? '' : '· 본사에서 정합니다'}
              </p>
              <CopyRow
                label="새 예약"
                value={copy.titleReserve}
                placeholder="예약"
                presets={ALERT_TITLE_RESERVE_PRESETS}
                editable={hq}
                onChange={(v) => setCopy((c) => ({ ...c, titleReserve: v }))}
                onPlay={() => playPreview('reserve')}
              />
              <CopyRow
                label="출고요청"
                value={copy.titleCheckout}
                placeholder="출고요청"
                presets={ALERT_TITLE_CHECKOUT_PRESETS}
                editable={hq}
                onChange={(v) => setCopy((c) => ({ ...c, titleCheckout: v }))}
                onPlay={() => playPreview('checkout')}
              />
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
