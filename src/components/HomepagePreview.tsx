import { Car, Phone } from 'lucide-react';
import type { PartnerHomepageConfig } from '../utils/partnerHomepageDefaults';

/**
 * 손님용 마케팅 홈(airpick-partner-homepage)을 축소 재현한 초안 미리보기.
 * 실제 배포 템플릿과 완전히 픽셀 일치하진 않지만, 입력 → 결과를 즉시 확인하는 용도.
 */
export default function HomepagePreview({
  config,
  bookingUrl,
}: {
  config: PartnerHomepageConfig;
  bookingUrl: string;
}) {
  const nameParts = config.name.split(/\s+/);
  const brandMain = nameParts[0] ?? config.name;
  const brandRest = nameParts.slice(1).join(' ');
  const hero = config.photos[0]?.src;

  return (
    <div className="h-full overflow-y-auto bg-white text-slate-900">
      {/* fake browser chrome */}
      <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-slate-200 bg-slate-100 px-3 py-2">
        <span className="size-2 rounded-full bg-rose-400" />
        <span className="size-2 rounded-full bg-amber-400" />
        <span className="size-2 rounded-full bg-emerald-400" />
        <span className="ml-2 truncate rounded-md bg-white px-2 py-0.5 text-[10px] font-mono text-slate-500">
          {bookingUrl.replace('/h/', ' 홈 · /h/')}
        </span>
      </div>

      {/* header */}
      <header className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="grid size-7 place-items-center rounded-lg bg-slate-900 text-amber-300">
            <Car size={15} />
          </span>
          <span className="text-sm font-bold tracking-tight">
            {brandMain}
            {brandRest ? <span className="font-medium opacity-60"> {brandRest}</span> : null}
          </span>
        </div>
        <span className="inline-flex items-center gap-1 rounded-full bg-slate-900 px-2.5 py-1 text-[11px] font-bold text-white">
          <Phone size={11} /> {config.phones.booking || '전화번호'}
        </span>
      </header>

      {/* hero */}
      <section
        className="relative px-4 py-8"
        style={
          hero
            ? {
                backgroundImage: `linear-gradient(rgba(255,255,255,.82),rgba(255,255,255,.92)), url(${hero})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
              }
            : { background: 'linear-gradient(135deg,#fff7ed,#fef3c7)' }
        }
      >
        <p className="text-[11px] font-semibold text-amber-600">{config.tagline}</p>
        <h1 className="mt-1 text-lg font-black leading-snug tracking-tight">
          {config.headline}
        </h1>
        <div className="mt-3 flex gap-2">
          <span className="rounded-lg bg-amber-400 px-3 py-1.5 text-[11px] font-bold text-amber-950">
            온라인 예약 →
          </span>
          <span className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-[11px] font-bold">
            {config.phones.booking || '전화'}
          </span>
        </div>
      </section>

      {/* trust bar */}
      <section className="grid grid-cols-2 gap-px bg-slate-100 sm:grid-cols-4">
        {config.trustItems.slice(0, 4).map((t, i) => (
          <div key={i} className="bg-white px-3 py-3 text-center">
            <p className="text-sm font-black text-slate-900">{t.value}</p>
            <p className="mt-0.5 text-[10px] text-slate-500">{t.label}</p>
          </div>
        ))}
      </section>

      {/* why us */}
      <section className="px-4 py-6">
        <h2 className="text-sm font-black leading-snug">{config.whyUs.title}</h2>
        <p className="mt-1 text-[11px] text-slate-500">{config.whyUs.sub}</p>
        <ul className="mt-3 space-y-2">
          {config.whyUs.items.map((item, i) => (
            <li key={i} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              <p className="flex items-center gap-1.5 text-[12px] font-bold">
                <span className="grid size-4 place-items-center rounded-full bg-slate-900 text-[9px] font-black text-white">
                  {i + 1}
                </span>
                {item.title}
              </p>
              <p className="mt-1 pl-6 text-[11px] leading-relaxed text-slate-500">{item.body}</p>
            </li>
          ))}
        </ul>
      </section>

      {/* fee preview */}
      <section className="mx-4 mb-6 rounded-xl border border-slate-200 bg-slate-50 p-4">
        <p className="text-[11px] font-semibold text-slate-400">예상 요금</p>
        <p className="mt-1 text-base font-black text-slate-900">{config.pricePreview.headline}</p>
        <p className="text-[12px] font-semibold text-slate-600">{config.pricePreview.perDayAfter}</p>
        <ul className="mt-2 space-y-1">
          {config.pricePreview.notes.map((n, i) => (
            <li key={i} className="text-[11px] text-slate-500">
              · {n}
            </li>
          ))}
        </ul>
        <p className="mt-2 border-t border-slate-200 pt-2 text-[10px] text-slate-400">
          {config.pricePreview.disclaimer}
        </p>
      </section>

      {/* faq */}
      <section className="px-4 pb-8">
        <h2 className="text-sm font-black">자주하는질문</h2>
        <ul className="mt-2 divide-y divide-slate-100">
          {config.faqs.slice(0, 4).map((f, i) => (
            <li key={i} className="py-2">
              <p className="text-[12px] font-bold text-slate-800">Q. {f.question}</p>
              <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-slate-500">{f.answer}</p>
            </li>
          ))}
        </ul>
        {config.faqs.length > 4 ? (
          <p className="mt-2 text-[10px] text-slate-400">외 {config.faqs.length - 4}개 질문 자동 생성됨</p>
        ) : null}
      </section>

      {/* footer */}
      <footer className="border-t border-slate-100 bg-slate-50 px-4 py-5 text-[11px] text-slate-500">
        <p className="font-bold text-slate-700">{config.name}</p>
        {config.business.ceo ? <p className="mt-1">대표 {config.business.ceo}</p> : null}
        {config.geo.address ? <p>{config.geo.address}</p> : null}
        <p>고객센터 {config.phones.booking}</p>
        <p>{config.insuranceLabel}</p>
        <p className="mt-1 text-slate-400">에어픽 입점업체</p>
      </footer>
    </div>
  );
}
