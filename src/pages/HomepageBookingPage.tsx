import React, { useEffect, useMemo, useState } from 'react';
import { auth } from '../firebase';
import type { Company, Reservation } from '../types';
import { fetchCompanyById } from '../lib/receiptFirestore';
import { createReservationId, persistReservation } from '../lib/reservationFirestore';
import { ensureFirestoreAuth } from '../lib/firebaseAuth';
import { RESERVATION_CREATED_BY } from '../utils/bookingSource';
import { formatPartnerDisplayName } from '../utils/companyDisplay';
import AirlinePicker from '../components/AirlinePicker';
import {
  checkHomepageBookingPolicy,
  homepagePolicyMessage,
} from '../utils/homepageBookingPolicy';
import {
  formatHourLabel,
  isHourlyCapActive,
} from '../utils/hourlyCapacity';
import { assertHourlyCapacityAvailable, checkHourlyCapacityForBooking } from '../lib/hourlyCapacityFirestore';
import type { HourlyCapacityResult } from '../utils/hourlyCapacity';
import { getKSTDateOnlyString, getKSTDateTimeLocalString } from '../utils/kstDate';
import { getCalculatePrice, mergePartnerPricing, companyRouteNeedsTerminalSurcharge } from '../utils/pricing';
import {
  getDefaultTerminal,
  resolveCompanyAirportId,
} from '../utils/airport';
import TerminalPicker from '../components/TerminalPicker';
import { buildReceiptUrl } from '../utils/receipt';
import { createReceiptToken } from '../utils/receiptToken';

type Terminal = string;

function formatPhoneInput(raw: string): string {
  const d = raw.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 7) return `${d.slice(0, 3)}-${d.slice(3)}`;
  return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
}

function splitLocal(value: string): { date: string; time: string } {
  const [date = '', time = ''] = value.split('T');
  return { date, time: time.slice(0, 5) };
}

interface HomepageBookingPageProps {
  companyId: string;
}

export default function HomepageBookingPage({ companyId }: HomepageBookingPageProps) {
  const [company, setCompany] = useState<Company | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [depLocal, setDepLocal] = useState(() => getKSTDateTimeLocalString(0));
  const [arrLocal, setArrLocal] = useState(() =>
    getKSTDateTimeLocalString(3 * 24 * 60 * 60 * 1000)
  );
  const [departureTerminal, setDepartureTerminal] = useState<Terminal>('');
  const [arrivalTerminal, setArrivalTerminal] = useState<Terminal>('');
  const [isIndoor, setIsIndoor] = useState(true);

  const [userName, setUserName] = useState('');
  const [phone, setPhone] = useState('');
  const [carModel, setCarModel] = useState('');
  const [carNumber, setCarNumber] = useState('');
  const [departureAirline, setDepartureAirline] = useState('');
  const [departureFlight, setDepartureFlight] = useState('');
  const [arrivalAirline, setArrivalAirline] = useState('');
  const [arrivalFlight, setArrivalFlight] = useState('');
  const [destination, setDestination] = useState('');
  const [customerNotes, setCustomerNotes] = useState('');
  const [reservationPassword, setReservationPassword] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [done, setDone] = useState<{ id: string; receiptUrl: string } | null>(null);
  const [hourlyHint, setHourlyHint] = useState<HourlyCapacityResult | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setLoadError(null);
      try {
        await ensureFirestoreAuth();
        const data = await fetchCompanyById(companyId);
        if (cancelled) return;
        if (!data) {
          setLoadError('업체를 찾을 수 없습니다. 예약 링크를 다시 확인해 주세요.');
          setCompany(null);
          return;
        }
        setCompany(data);
        const airportId = resolveCompanyAirportId(data);
        const def = getDefaultTerminal(airportId);
        setDepartureTerminal(def);
        setArrivalTerminal(def);
        if (data.supports_indoor === false && data.supports_outdoor !== false) {
          setIsIndoor(false);
        } else {
          setIsIndoor(true);
        }
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : '업체 정보를 불러오지 못했습니다.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [companyId]);

  const displayName = formatPartnerDisplayName(company?.name, companyId) || companyId;
  const pricedCompany = useMemo(() => {
    if (!company) return null;
    return mergePartnerPricing({ ...company }, company.id) as Company;
  }, [company]);

  const dep = splitLocal(depLocal);
  const arr = splitLocal(arrLocal);
  const isT2 = companyRouteNeedsTerminalSurcharge(company, departureTerminal, arrivalTerminal);

  const totalPrice = useMemo(() => {
    if (!pricedCompany || !dep.date || !arr.date) return 0;
    return getCalculatePrice(
      pricedCompany,
      `${dep.date}T${dep.time || '00:00'}`,
      `${arr.date}T${arr.time || '00:00'}`,
      isIndoor,
      isT2
    );
  }, [pricedCompany, dep.date, dep.time, arr.date, arr.time, isIndoor, isT2]);

  const policyError = useMemo(() => {
    if (!company) return null;
    return checkHomepageBookingPolicy(company, dep.date, arr.date);
  }, [company, dep.date, arr.date]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!company || !isHourlyCapActive(company) || !dep.date || !dep.time) {
        setHourlyHint(null);
        return;
      }
      try {
        const result = await checkHourlyCapacityForBooking(
          company,
          company.id,
          dep.date,
          dep.time
        );
        if (!cancelled) setHourlyHint(result);
      } catch {
        if (!cancelled) setHourlyHint(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [company, dep.date, dep.time]);

  const showIndoor =
    company?.supports_indoor !== false || company?.facilityType === 'mixed' || company?.facilityType === 'indoor';
  const showOutdoor =
    company?.supports_outdoor !== false || company?.facilityType === 'mixed' || company?.facilityType === 'outdoor';

  const validate = (): string | null => {
    if (!userName.trim()) return '예약자 이름을 입력해 주세요.';
    if (!phone.trim() || phone.replace(/\D/g, '').length < 10) {
      return '연락처를 올바르게 입력해 주세요.';
    }
    if (!carModel.trim()) return '차량 모델을 입력해 주세요.';
    if (!carNumber.trim()) return '차량번호를 입력해 주세요.';
    if (!/^\d{4}$/.test(reservationPassword.trim())) {
      return '예약 비밀번호는 숫자 4자리입니다.';
    }
    if (!dep.date || !arr.date || !dep.time || !arr.time) {
      return '입고·출고 일정을 선택해 주세요.';
    }
    if (arrLocal <= depLocal) return '출고 일시는 입고 일시 이후여야 합니다.';
    if (!departureAirline.trim()) return '출국 항공사를 선택해 주세요.';
    if (!departureFlight.trim()) return '출국 편명을 입력해 주세요.';
    if (!arrivalAirline.trim()) return '귀국 항공사를 선택해 주세요.';
    if (!arrivalFlight.trim()) return '귀국 편명을 입력해 주세요.';
    if (policyError) return homepagePolicyMessage(policyError);
    if (hourlyHint && !hourlyHint.ok) return hourlyHint.message;
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!company || !pricedCompany) return;

    const err = validate();
    if (err) {
      setFormError(err);
      return;
    }

    setSubmitting(true);
    try {
      await ensureFirestoreAuth();
      const recheck = checkHomepageBookingPolicy(company, dep.date, arr.date);
      if (recheck) {
        setFormError(homepagePolicyMessage(recheck));
        return;
      }

      await assertHourlyCapacityAvailable(company, company.id, dep.date, dep.time);

      const id = createReservationId();
      const receiptToken = createReceiptToken();
      const price = getCalculatePrice(
        pricedCompany,
        `${dep.date}T${dep.time}`,
        `${arr.date}T${arr.time}`,
        isIndoor,
        isT2
      );

      const payload: Omit<Reservation, 'id'> = {
        userId: auth.currentUser?.uid || 'guest',
        companyId: company.id,
        companyName: displayName,
        airport: resolveCompanyAirportId(company),
        userName: userName.trim(),
        phone: phone.trim(),
        carModel: carModel.trim(),
        carNumber: carNumber.trim().replace(/\s+/g, ''),
        departureDate: dep.date,
        departureTime: dep.time,
        departureTerminal,
        arrivalDate: arr.date,
        arrivalTime: arr.time,
        arrivalTerminal,
        totalPrice: price,
        status: 'pending',
        createdAt: new Date().toISOString(),
        createdBy: RESERVATION_CREATED_BY.HOMEPAGE,
        receiptToken,
        paymentMethod: 'unpaid',
        isIndoor,
        startDate: `${dep.date} ${dep.time}`,
        endDate: `${arr.date} ${arr.time}`,
        scratchPhotos: { synced: false },
        departureAirline: departureAirline.trim(),
        departureFlight: departureFlight.trim().toUpperCase(),
        arrivalAirline: arrivalAirline.trim(),
        arrivalFlight: arrivalFlight.trim().toUpperCase(),
        reservationPassword: reservationPassword.trim(),
        ...(destination.trim() ? { destination: destination.trim() } : {}),
        ...(customerNotes.trim()
          ? { customerNotes: customerNotes.trim(), userRequest: customerNotes.trim() }
          : {}),
      };

      await persistReservation(id, payload);
      const receiptUrl = buildReceiptUrl({ id, receiptToken, receiptCode: undefined });
      setDone({ id, receiptUrl });
    } catch (submitErr) {
      setFormError(
        submitErr instanceof Error ? submitErr.message : '예약 저장에 실패했습니다. 다시 시도해 주세요.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-dvh bg-[#f4f0ea] flex items-center justify-center text-sm text-stone-500">
        예약 페이지 불러오는 중…
      </div>
    );
  }

  if (loadError || !company) {
    return (
      <div className="min-h-dvh bg-[#f4f0ea] flex flex-col items-center justify-center gap-2 px-6 text-center">
        <p className="text-lg font-bold text-stone-900">예약을 열 수 없습니다</p>
        <p className="text-sm text-stone-500">{loadError || '업체 정보가 없습니다.'}</p>
      </div>
    );
  }

  if (done) {
    return (
      <div className="min-h-dvh bg-[#f4f0ea] text-stone-900">
        <div className="mx-auto max-w-lg px-4 pb-16 pt-10 sm:px-5">
          <div className="overflow-hidden rounded-[1.75rem] bg-white shadow-[0_20px_50px_-28px_rgba(28,25,23,0.35)]">
            <div className="bg-gradient-to-br from-stone-900 via-stone-800 to-stone-700 px-6 pb-8 pt-8 text-white">
              <p className="text-[11px] font-semibold tracking-[0.2em] text-stone-300">
                예약 완료
              </p>
              <h1 className="mt-2 text-3xl font-bold tracking-tight">{displayName}</h1>
              <p className="mt-2 text-sm leading-relaxed text-stone-300">
                예약이 접수되었습니다. 접수증에서 일정을 확인하세요.
              </p>
            </div>
            <div className="space-y-5 px-6 py-6">
              <div className="flex items-end justify-between gap-4 border-b border-stone-100 pb-5">
                <div>
                  <p className="text-xs font-medium text-stone-400">예약번호</p>
                  <p className="mt-1 font-mono text-sm font-semibold text-stone-800">{done.id}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs font-medium text-stone-400">예상 요금</p>
                  <p className="mt-1 text-2xl font-bold tabular-nums tracking-tight">
                    {totalPrice.toLocaleString('ko-KR')}
                    <span className="ml-0.5 text-base font-semibold">원</span>
                  </p>
                </div>
              </div>
              {done.receiptUrl ? (
                <a
                  href={done.receiptUrl}
                  className="flex min-h-12 items-center justify-center rounded-2xl bg-stone-900 text-sm font-bold text-white transition hover:bg-stone-800"
                >
                  접수증 보기
                </a>
              ) : null}
              <p className="text-center text-xs text-stone-400">
                문의 {company.phone || '업체 고객센터'}
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const minDep = `${getKSTDateOnlyString()}T00:00`;
  const inputClass =
    'w-full min-h-12 rounded-lg border border-stone-200 bg-white px-3.5 py-3 text-base text-stone-900 outline-none transition placeholder:text-stone-400 focus:border-stone-400';

  return (
    <div className="min-h-dvh bg-[#f4f0ea] text-stone-900">
      <div className="mx-auto max-w-lg px-4 pb-8 pt-8 sm:px-5 sm:pt-10">
        <form
          onSubmit={handleSubmit}
          className="overflow-hidden rounded-[1.75rem] bg-white shadow-[0_20px_50px_-28px_rgba(28,25,23,0.35)]"
        >
          <header className="bg-gradient-to-br from-stone-900 via-stone-800 to-stone-700 px-6 pb-7 pt-8 text-white">
            <p className="text-xs font-semibold tracking-[0.18em] text-stone-300">
              주차 예약
            </p>
            <h1 className="mt-2 text-[2rem] font-bold leading-tight tracking-tight sm:text-[2.15rem]">
              {displayName}
            </h1>
            <p className="mt-2 text-base leading-relaxed text-stone-300">
              아래 순서대로 입력해 주세요.
            </p>
          </header>

          <div className="divide-y divide-stone-200 border-t border-stone-200">
            {/* 1. 예약자 · 차량 · 연락처 */}
            <FormRow label="예약자" required>
              <input
                value={userName}
                onChange={(e) => setUserName(e.target.value)}
                placeholder="예약자 이름을 입력하세요."
                className={inputClass}
                required
              />
            </FormRow>
            <FormRow label="차량기종" required>
              <input
                value={carModel}
                onChange={(e) => setCarModel(e.target.value)}
                placeholder="차량 기종을 입력하세요."
                className={inputClass}
                required
              />
            </FormRow>
            <FormRow label="차량번호" required>
              <input
                value={carNumber}
                onChange={(e) => setCarNumber(e.target.value)}
                placeholder="예) 05루 1234"
                className={inputClass}
                required
              />
            </FormRow>
            <FormRow label="휴대폰" required>
              <div className="space-y-1.5">
                <input
                  value={phone}
                  onChange={(e) => setPhone(formatPhoneInput(e.target.value))}
                  placeholder="전화번호를 입력하세요."
                  inputMode="tel"
                  className={inputClass}
                  required
                />
                <p className="text-[13px] leading-relaxed text-stone-400">
                  ※ 숫자만 입력해 주세요. · 통화 가능한 번호를 입력해 주세요.
                </p>
              </div>
            </FormRow>

            {(showIndoor || showOutdoor) && (
              <FormRow label="주차유형" required>
                <div className="flex rounded-lg bg-stone-100 p-1">
                  {showIndoor && (
                    <button
                      type="button"
                      onClick={() => setIsIndoor(true)}
                      className={`flex-1 rounded-md py-3 text-base font-bold transition ${
                        isIndoor ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-500'
                      }`}
                    >
                      실내
                    </button>
                  )}
                  {showOutdoor && (
                    <button
                      type="button"
                      onClick={() => setIsIndoor(false)}
                      className={`flex-1 rounded-md py-3 text-base font-bold transition ${
                        !isIndoor ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-500'
                      }`}
                    >
                      실외
                    </button>
                  )}
                </div>
              </FormRow>
            )}

            {/* 2. 출국 묶음 */}
            <FormRow
              label={
                <>
                  출국
                  <span className="mt-0.5 block text-xs font-medium text-stone-400">
                    공항도착예정
                  </span>
                </>
              }
              required
            >
              <input
                type="datetime-local"
                value={depLocal}
                min={minDep}
                onChange={(e) => setDepLocal(e.target.value)}
                className={inputClass}
                required
              />
              {company && isHourlyCapActive(company) && hourlyHint ? (
                <p
                  className={`mt-1.5 text-[12px] font-semibold ${
                    hourlyHint.ok ? 'text-stone-500' : 'text-red-600'
                  }`}
                >
                  {hourlyHint.ok
                    ? `${formatHourLabel(hourlyHint.hour)} · 남은 ${hourlyHint.remaining}대 (시간당 ${hourlyHint.max}대)`
                    : hourlyHint.message}
                </p>
              ) : null}
            </FormRow>
            <FormRow label="출국 터미널" required>
              <TerminalPicker
                airportId={resolveCompanyAirportId(company)}
                value={departureTerminal}
                onChange={setDepartureTerminal}
                variant="homepage"
              />
            </FormRow>
            <FormRow label="출국 항공사" required>
              <AirlinePicker
                value={departureAirline}
                onChange={setDepartureAirline}
                tone="light"
                required
                emptyLabel="::: 항공사 선택 :::"
              />
            </FormRow>
            <FormRow label="출국 항공편" required>
              <input
                value={departureFlight}
                onChange={(e) => setDepartureFlight(e.target.value.toUpperCase())}
                placeholder="예) A123"
                className={inputClass}
                required
              />
            </FormRow>

            {/* 3. 입국 묶음 */}
            <FormRow
              label={
                <>
                  입국
                  <span className="mt-0.5 block text-xs font-medium text-stone-400">
                    비행기도착
                  </span>
                </>
              }
              required
            >
              <input
                type="datetime-local"
                value={arrLocal}
                min={depLocal || minDep}
                onChange={(e) => setArrLocal(e.target.value)}
                className={inputClass}
                required
              />
            </FormRow>
            <FormRow label="입국 터미널" required>
              <TerminalPicker
                airportId={resolveCompanyAirportId(company)}
                value={arrivalTerminal}
                onChange={setArrivalTerminal}
                variant="homepage"
              />
            </FormRow>
            <FormRow label="입국 항공사" required>
              <AirlinePicker
                value={arrivalAirline}
                onChange={setArrivalAirline}
                tone="light"
                required
                emptyLabel="::: 항공사 선택 :::"
              />
            </FormRow>
            <FormRow label="입국 항공편" required>
              <input
                value={arrivalFlight}
                onChange={(e) => setArrivalFlight(e.target.value.toUpperCase())}
                placeholder="예) A123"
                className={inputClass}
                required
              />
            </FormRow>

            {/* 부가 */}
            <FormRow label="예약비번" required>
              <div className="space-y-1.5">
                <input
                  value={reservationPassword}
                  onChange={(e) =>
                    setReservationPassword(e.target.value.replace(/\D/g, '').slice(0, 4))
                  }
                  placeholder="취소용 숫자 4자리"
                  inputMode="numeric"
                  className={inputClass}
                  required
                />
              </div>
            </FormRow>
            <FormRow label="여행지">
              <input
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
                placeholder="예: 오사카 (선택)"
                className={inputClass}
              />
            </FormRow>
            <FormRow label="요청사항">
              <input
                value={customerNotes}
                onChange={(e) => setCustomerNotes(e.target.value)}
                placeholder="특이사항 (선택)"
                className={inputClass}
              />
            </FormRow>
          </div>

          {policyError ? (
            <p className="mx-5 mb-2 rounded-xl bg-red-50 px-3 py-2.5 text-xs font-semibold text-red-700 sm:mx-6">
              {homepagePolicyMessage(policyError)}
            </p>
          ) : null}

          <div className="sticky bottom-0 border-t border-stone-200 bg-white/95 px-5 py-4 backdrop-blur sm:px-6">
            {formError ? (
              <p className="mb-3 rounded-xl bg-red-50 px-3 py-2.5 text-base font-semibold text-red-700">
                {formError}
              </p>
            ) : null}
            <div className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-stone-400">결제 예정</p>
                <p className="truncate text-xl font-bold tabular-nums tracking-tight">
                  {totalPrice.toLocaleString('ko-KR')}원
                </p>
              </div>
              <button
                type="submit"
                disabled={submitting || Boolean(policyError)}
                className="min-h-13 shrink-0 rounded-2xl bg-stone-900 px-6 py-3.5 text-base font-bold text-white transition hover:bg-stone-800 disabled:opacity-45"
              >
                {submitting ? '예약 중…' : '예약하기'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

function FormRow({
  label,
  required,
  children,
}: {
  label: React.ReactNode;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[7rem_1fr] sm:grid-cols-[8rem_1fr]">
      <div className="flex items-center bg-stone-50 px-3 py-4 sm:px-4">
        <span className="text-[15px] font-semibold leading-snug text-stone-700">
          {label}
          {required ? <span className="ml-0.5 text-red-500">*</span> : null}
        </span>
      </div>
      <div className="px-3 py-3.5 sm:px-4">{children}</div>
    </div>
  );
}