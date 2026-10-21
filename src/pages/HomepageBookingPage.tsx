import React, { useEffect, useMemo, useState } from 'react';
import { auth } from '../firebase';
import type { Company, Reservation } from '../types';
import { fetchCompanyById } from '../lib/receiptFirestore';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { createReservationId, persistReservation } from '../lib/reservationFirestore';
import { ensureFirestoreAuth } from '../lib/firebaseAuth';
import { RESERVATION_CREATED_BY } from '../utils/bookingSource';
import { formatPartnerDisplayName } from '../utils/companyDisplay';
import { companyParkingTypeAvailability } from '../utils/companyProfile';
import AirlinePicker from '../components/AirlinePicker';
import { matchAirlineName } from '../utils/flightFields';
import HomepageDateTimeField from '../components/HomepageDateTimeField';
import { BOOKING_CLOSED_MESSAGE } from '../utils/bookingClosedMessage';
import { checkHomepageBookingPolicy } from '../utils/homepageBookingPolicy';
import {
  isHourlyCapActive,
} from '../utils/hourlyCapacity';
import { assertHourlyCapacityAvailable, checkHourlyCapacityForBooking } from '../lib/hourlyCapacityFirestore';
import type { HourlyCapacityResult } from '../utils/hourlyCapacity';
import { isParkingCapActive } from '../utils/parkingCapacity';
import {
  assertParkingCapacityAvailable,
  checkParkingCapacityForBooking,
} from '../lib/parkingCapacityFirestore';
import type { ParkingCapacityResult } from '../utils/parkingCapacity';
import { isDailyIntakeCapActive } from '../utils/dailyIntakeCapacity';
import {
  assertDailyIntakeAvailable,
  checkDailyIntakeForBooking,
} from '../lib/dailyIntakeCapacityFirestore';
import type { DailyIntakeResult } from '../utils/dailyIntakeCapacity';
import { findScheduleBlock } from '../utils/scheduleBlock';
import { getKSTDateOnlyString, getKSTDateTimeLocalString } from '../utils/kstDate';
import { getCalculatePrice, mergePartnerPricing, companyRouteNeedsTerminalSurcharge } from '../utils/pricing';
import {
  getDefaultTerminal,
  resolveCompanyAirportId,
} from '../utils/airport';
import TerminalPicker from '../components/TerminalPicker';
import { buildReceiptUrl } from '../utils/receipt';
import { createReceiptToken } from '../utils/receiptToken';
import {
  applyTimeToDateTimeLocal,
  fetchIcnArrival,
  normalizeArrivalFlightId,
  toFlightDateYmd,
} from '../lib/icnArrival';
import { parseAidFromSearch, parseAcquisitionIntentFromSearch } from '../utils/acquisition';
import {
  createAcquisitionClickClient,
  markAcquisitionConverted,
  markAcquisitionLanded,
  validateAcquisitionForBooking,
} from '../lib/acquisitionFirestore';
import { formatPhoneInput, isValidMobilePhone } from '../utils/phone';

type Terminal = string;

/** 남은 자리가 3대 이하면 그 숫자만. 더 남으면 적지 않는다. */
function scarceRemainingLabel(remaining: number): string | null {
  if (!Number.isFinite(remaining) || remaining > 3) return null;
  return `남은 ${Math.max(0, Math.floor(remaining))}대`;
}

function capacityNote(
  hints: Array<{ ok?: boolean; remaining?: number; message?: string } | null | undefined>
): { text: string; error: boolean } | null {
  const present = hints.filter((hint): hint is NonNullable<typeof hint> => Boolean(hint));
  if (!present.length) return null;
  const failed = present.find((hint) => hint.ok === false);
  if (failed) {
    const text = (failed.message || '').trim();
    return text ? { text, error: true } : null;
  }
  const remainings = present
    .filter((hint) => hint.ok === true && typeof hint.remaining === 'number')
    .map((hint) => hint.remaining as number);
  if (!remainings.length) return null;
  const text = scarceRemainingLabel(Math.min(...remainings));
  return text ? { text, error: false } : null;
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

  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [done, setDone] = useState<{ id: string; receiptUrl: string } | null>(null);
  const [hourlyHint, setHourlyHint] = useState<HourlyCapacityResult | null>(null);
  const [dailyHint, setDailyHint] = useState<DailyIntakeResult | null>(null);
  const [parkingHint, setParkingHint] = useState<ParkingCapacityResult | null>(null);
  const [arrivalFlightHint, setArrivalFlightHint] = useState<string | null>(null);
  const [arrivalFlightLooking, setArrivalFlightLooking] = useState(false);
  const [acquisitionAid, setAcquisitionAid] = useState<string | null>(() =>
    parseAidFromSearch(typeof window !== 'undefined' ? window.location.search : '')
  );

  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    (async () => {
      try {
        await ensureFirestoreAuth();
        let aid = acquisitionAid;

        if (!aid) {
          const intent = parseAcquisitionIntentFromSearch(window.location.search);
          if (!intent) return;
          const created = await createAcquisitionClickClient({
            companyId,
            source: intent.source,
            medium: intent.medium,
            campaign: intent.campaignRaw || undefined,
          });
          if (cancelled || !created) return;
          aid = created.clickId;
          setAcquisitionAid(aid);
          const next = `/h/${encodeURIComponent(companyId)}?aid=${encodeURIComponent(aid)}`;
          window.history.replaceState({}, '', next);
        }

        const validated = await validateAcquisitionForBooking(aid, companyId);
        if (cancelled || !validated) return;
        await markAcquisitionLanded(aid);
      } catch {
        // 유입 표시 실패해도 예약은 가능
      }
    })();
    return () => {
      cancelled = true;
    };
    // 최초 진입·companyId 만 — aid state 갱신으로 재실행하지 않음
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

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
        setIsIndoor(companyParkingTypeAvailability(data).indoor);
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

  const arrivalDateKey = arrLocal.slice(0, 10);

  // 입국 편명 → 공항 예정 도착 시각으로 출고일시·터미널 자동 채움 (오늘~+6일)
  useEffect(() => {
    const flightId = normalizeArrivalFlightId(arrivalFlight);
    const dateYmd = toFlightDateYmd(arrivalDateKey);
    if (flightId.length < 3 || dateYmd.length !== 8) {
      setArrivalFlightHint(null);
      setArrivalFlightLooking(false);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      setArrivalFlightLooking(true);
      void fetchIcnArrival(flightId, dateYmd).then((res) => {
        if (cancelled) return;
        setArrivalFlightLooking(false);
        if (!res.ok || !res.data?.scheduleTime) {
          const msg =
            res.data?.message ||
            (res.status === 422
              ? '출고일 6일 이내만 공항 시각 자동 조회가 됩니다.'
              : null);
          setArrivalFlightHint(msg);
          return;
        }

        const time = res.data.estimatedTime || res.data.scheduleTime;
        if (!time) {
          setArrivalFlightHint(null);
          return;
        }

        setArrLocal((prev) => applyTimeToDateTimeLocal(prev, time));
        if (res.data.terminal) setArrivalTerminal(res.data.terminal);
        if (res.data.airline) {
          const airline = matchAirlineName(res.data.airline);
          if (airline) setArrivalAirline(airline);
        }
        const origin = res.data.origin ? ` · ${res.data.origin}` : '';
        setArrivalFlightHint(
          `공항 예정 도착 ${time}${origin} 반영 · 필요하면 직접 수정하세요`
        );
      });
    }, 450);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [arrivalFlight, arrivalDateKey]);

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
    return checkHomepageBookingPolicy(company, dep.date, arr.date, dep.time);
  }, [company, dep.date, dep.time, arr.date]);

  const scheduleBlock = useMemo(() => {
    if (!company) return null;
    return findScheduleBlock({
      rules: company.scheduleBlocks,
      airport: company.airport,
      departureDate: dep.date,
      departureTime: dep.time,
      departureTerminal,
      arrivalDate: arr.date,
      arrivalTime: arr.time,
      arrivalTerminal,
    });
  }, [
    company,
    dep.date,
    dep.time,
    departureTerminal,
    arr.date,
    arr.time,
    arrivalTerminal,
  ]);

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

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!company || !isDailyIntakeCapActive(company) || !dep.date) {
        setDailyHint(null);
        return;
      }
      try {
        const result = await checkDailyIntakeForBooking(company, company.id, dep.date);
        if (!cancelled) setDailyHint(result);
      } catch {
        if (!cancelled) setDailyHint(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [company, dep.date]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!company || !isParkingCapActive(company) || !dep.date || !arr.date) {
        setParkingHint(null);
        return;
      }
      try {
        const result = await checkParkingCapacityForBooking(
          company,
          company.id,
          dep.date,
          arr.date
        );
        if (!cancelled) setParkingHint(result);
      } catch {
        if (!cancelled) setParkingHint(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [company, dep.date, arr.date]);

  const parkingTypes = companyParkingTypeAvailability(company);
  const showIndoor = parkingTypes.indoor;
  const showOutdoor = parkingTypes.outdoor;
  const departureCapacity = capacityNote([
    company && isHourlyCapActive(company) ? hourlyHint : null,
    company && isDailyIntakeCapActive(company) ? dailyHint : null,
  ]);
  const parkingCapacity = capacityNote([
    company && isParkingCapActive(company) ? parkingHint : null,
  ]);

  const validate = (): string | null => {
    if (!userName.trim()) return '예약자 이름을 입력해 주세요.';
    if (!isValidMobilePhone(phone)) {
      return '휴대폰 번호 11자리를 입력해 주세요. (예: 010-1234-5678)';
    }
    if (!carModel.trim()) return '차량 모델을 입력해 주세요.';
    if (!carNumber.trim()) return '차량번호를 입력해 주세요.';
    if (!dep.date || !arr.date || !dep.time || !arr.time) {
      return '입고·출고 일정을 선택해 주세요.';
    }
    if (arrLocal <= depLocal) return '출고 일시는 입고 일시 이후여야 합니다.';
    if (!departureAirline.trim()) return '출국 항공사를 선택해 주세요.';
    if (!departureFlight.trim()) return '출국 편명을 입력해 주세요.';
    if (!arrivalAirline.trim()) return '귀국 항공사를 선택해 주세요.';
    if (!arrivalFlight.trim()) return '귀국 편명을 입력해 주세요.';
    if (policyError) return BOOKING_CLOSED_MESSAGE;
    if (scheduleBlock) return BOOKING_CLOSED_MESSAGE;
    if (parkingHint?.ok === false) return BOOKING_CLOSED_MESSAGE;
    if (hourlyHint?.ok === false) return BOOKING_CLOSED_MESSAGE;
    if (dailyHint?.ok === false) return BOOKING_CLOSED_MESSAGE;
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
      const recheck = checkHomepageBookingPolicy(company, dep.date, arr.date, dep.time);
      if (recheck) {
        setFormError(BOOKING_CLOSED_MESSAGE);
        return;
      }
      const block = findScheduleBlock({
        rules: company.scheduleBlocks,
        airport: company.airport,
        departureDate: dep.date,
        departureTime: dep.time,
        departureTerminal,
        arrivalDate: arr.date,
        arrivalTime: arr.time,
        arrivalTerminal,
      });
      if (block) {
        setFormError(BOOKING_CLOSED_MESSAGE);
        return;
      }

      await assertParkingCapacityAvailable(company, company.id, dep.date, arr.date);
      await assertHourlyCapacityAvailable(company, company.id, dep.date, dep.time);
      await assertDailyIntakeAvailable(company, company.id, dep.date);

      const id = createReservationId();
      const receiptToken = createReceiptToken();
      const price = getCalculatePrice(
        pricedCompany,
        `${dep.date}T${dep.time}`,
        `${arr.date}T${arr.time}`,
        isIndoor,
        isT2
      );

      // createdBy 는 채널(homepage) 유지. 명함 QR 등은 acquisition* 만 추가.
      let acquisitionFields: Partial<Reservation> = {};
      if (acquisitionAid) {
        const validated = await validateAcquisitionForBooking(acquisitionAid, company.id);
        if (validated) {
          acquisitionFields = {
            acquisitionSource: validated.acquisitionSource,
            acquisitionMedium: validated.acquisitionMedium,
            acquisitionCampaign: validated.acquisitionCampaign,
            acquisitionClickId: validated.acquisitionClickId,
          };
        }
      }

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
        ...(destination.trim() ? { destination: destination.trim() } : {}),
        ...(customerNotes.trim()
          ? { customerNotes: customerNotes.trim(), userRequest: customerNotes.trim() }
          : {}),
        ...acquisitionFields,
      };

      await persistReservation(id, payload);

      // 서버가 마감·한도로 거절하면 문서를 지우므로, 잠깐 확인 후 성공 화면을 띄운다.
      let rejected = false;
      for (let i = 0; i < 8; i += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 350));
        const snap = await getDoc(doc(db, 'reservations', id));
        if (!snap.exists()) {
          rejected = true;
          break;
        }
        const status = String(snap.data()?.status || '');
        if (status === 'cancelled' || status === '취소') {
          rejected = true;
          break;
        }
        if (i >= 3) break;
      }
      if (rejected) {
        setFormError(BOOKING_CLOSED_MESSAGE);
        return;
      }

      if (acquisitionFields.acquisitionClickId) {
        try {
          await markAcquisitionConverted(acquisitionFields.acquisitionClickId, id);
        } catch {
          // 전환 마킹 실패해도 예약은 이미 저장됨
        }
      }
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
          className="rounded-[1.75rem] bg-white shadow-[0_20px_50px_-28px_rgba(28,25,23,0.35)]"
        >
          <header className="rounded-t-[1.75rem] bg-gradient-to-br from-stone-900 via-stone-800 to-stone-700 px-6 pb-7 pt-8 text-white">
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
                      야외
                    </button>
                  )}
                </div>
              </FormRow>
            )}

            {/* 2. 출국 묶음 — 편명 먼저, 연동되는 시간은 맨 아래 */}
            <SectionMark>출국</SectionMark>
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
              <HomepageDateTimeField value={depLocal} min={minDep} onChange={setDepLocal} />
              {departureCapacity ? (
                <p
                  className={`mt-1.5 text-[12px] font-semibold ${
                    departureCapacity.error ? 'text-red-600' : 'text-stone-500'
                  }`}
                >
                  {departureCapacity.text}
                </p>
              ) : null}
            </FormRow>

            {/* 3. 입국 묶음 */}
            <SectionMark>입국</SectionMark>
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
                placeholder="예) 7C1704"
                className={inputClass}
                required
              />
              {arrivalFlightLooking ? (
                <p className="mt-1.5 text-[12px] font-semibold text-stone-500">
                  공항 도착 시각 조회 중…
                </p>
              ) : arrivalFlightHint ? (
                <p className="mt-1.5 text-[12px] font-semibold text-stone-500">
                  {arrivalFlightHint}
                </p>
              ) : null}
            </FormRow>
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
              <HomepageDateTimeField
                value={arrLocal}
                min={depLocal || minDep}
                onChange={setArrLocal}
              />
              {parkingCapacity ? (
                <p
                  className={`mt-1.5 text-[12px] font-semibold ${
                    parkingCapacity.error ? 'text-red-600' : 'text-stone-500'
                  }`}
                >
                  {parkingCapacity.text}
                </p>
              ) : null}
            </FormRow>

            <FormRow label="여행지">
              <input
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
                placeholder="예: 오사카"
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
              {BOOKING_CLOSED_MESSAGE}
            </p>
          ) : null}

          <div className="sticky bottom-0 rounded-b-[1.75rem] border-t border-stone-200 bg-white/95 px-5 py-4 backdrop-blur sm:px-6">
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

function SectionMark({ children }: { children: string }) {
  return (
    <div className="flex items-center gap-3 border-y border-stone-300 bg-stone-100 px-4 py-2.5">
      <span className="text-[12px] font-black tracking-[0.14em] text-stone-600">{children}</span>
      <span className="h-px flex-1 bg-stone-300" />
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