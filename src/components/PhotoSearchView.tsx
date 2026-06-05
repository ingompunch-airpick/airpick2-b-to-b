import { useMemo, useState } from 'react';
import { Search, X, ImageIcon, Download, Loader2 } from 'lucide-react';
import type { Reservation } from '../types';
import { getReservationPhotoUrls } from '../utils/reservationPhotoDisplay';
import { statusToLabel, normalizeReservationStatus } from '../utils/reservationStatus';
import {
  downloadAllImages,
  downloadImageFromUrl,
  photoDownloadFilename,
} from '../utils/downloadImage';
import { cn } from '../lib/utils';

type DateRange = '7d' | '30d' | 'all';

function parseYmd(val: string): Date | null {
  if (!val) return null;
  let clean = val.trim();
  if (clean.includes('T')) clean = clean.split('T')[0];
  else if (clean.includes(' ')) clean = clean.split(' ')[0];
  clean = clean.replace(/[\.\/]/g, '-');
  const parts = clean.split('-').map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) return null;
  return new Date(parts[0], parts[1] - 1, parts[2]);
}

function isWithinRange(departureDate: string, range: DateRange): boolean {
  if (range === 'all') return true;
  const d = parseYmd(departureDate);
  if (!d) return true;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  const days = range === '7d' ? 7 : 30;
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - days);
  return d >= cutoff && d <= now;
}

function matchesQuery(res: Reservation, query: string): boolean {
  const q = query.trim().toLowerCase().replace(/\s+/g, '');
  if (!q) return true;

  const car = (res.carNumber || '').toLowerCase().replace(/\s+/g, '');
  const name = (res.userName || '').toLowerCase();
  const phone = (res.phone || '').replace(/\D/g, '');

  if (car.includes(q)) return true;
  if (name.includes(q)) return true;
  if (q.length >= 4 && phone.endsWith(q)) return true;
  if (q.length >= 4 && car.endsWith(q)) return true;

  return false;
}

function GalleryModal({
  res,
  urls,
  onClose,
}: {
  res: Reservation;
  urls: string[];
  onClose: () => void;
}) {
  const status = normalizeReservationStatus(res.status);
  const [downloading, setDownloading] = useState<'all' | number | null>(null);

  const carLabel = res.carNumber || '미등록';

  const handleDownloadOne = async (url: string, idx: number) => {
    setDownloading(idx);
    try {
      await downloadImageFromUrl(url, photoDownloadFilename(carLabel, idx, urls.length));
    } catch (err) {
      console.error(err);
      window.open(url, '_blank', 'noopener,noreferrer');
      alert('저장에 실패했습니다. 새 탭에서 이미지를 길게 눌러 저장해 주세요.');
    } finally {
      setDownloading(null);
    }
  };

  const handleDownloadAll = async () => {
    setDownloading('all');
    try {
      await downloadAllImages(urls, carLabel);
    } catch (err) {
      console.error(err);
      alert('일부 사진 저장에 실패했습니다. 개별 저장을 시도해 주세요.');
    } finally {
      setDownloading(null);
    }
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-end justify-center bg-black/70 p-4 sm:items-center">
      <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-3xl bg-neutral-900 p-4 ring-1 ring-neutral-800">
        <div className="mb-4 flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-lg font-black text-white tabular-nums">{carLabel}</p>
            <p className="text-xs font-semibold text-zinc-400">
              {res.userName} · 입고 {res.departureDate} · {statusToLabel(status, 'driver')}
            </p>
            <p className="text-[11px] text-zinc-500">{urls.length}장</p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              disabled={downloading !== null}
              onClick={handleDownloadAll}
              className="flex items-center gap-1 rounded-xl bg-amber-500 px-3 py-2 text-[11px] font-black text-neutral-950 disabled:opacity-50"
            >
              {downloading === 'all' ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Download size={14} />
              )}
              전체 저장
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full p-2 text-zinc-400 hover:bg-neutral-800 hover:text-white"
            >
              <X size={18} />
            </button>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {urls.map((url, idx) => (
            <div
              key={idx}
              className="relative aspect-square overflow-hidden rounded-xl border border-neutral-800 bg-neutral-950"
            >
              <img
                src={url}
                alt={`${carLabel} #${idx + 1}`}
                className="h-full w-full object-cover"
                referrerPolicy="no-referrer"
              />
              <button
                type="button"
                disabled={downloading !== null}
                onClick={() => handleDownloadOne(url, idx)}
                className="absolute bottom-1.5 right-1.5 flex items-center gap-1 rounded-lg bg-black/75 px-2 py-1 text-[10px] font-black text-white backdrop-blur-sm disabled:opacity-50"
              >
                {downloading === idx ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <Download size={12} />
                )}
                저장
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function PhotoSearchView({ reservations }: { reservations: Reservation[] }) {
  const [query, setQuery] = useState('');
  const [dateRange, setDateRange] = useState<DateRange>('30d');
  const [selected, setSelected] = useState<{ res: Reservation; urls: string[] } | null>(null);

  const results = useMemo(() => {
    return reservations
      .map((res) => ({ res, urls: getReservationPhotoUrls(res) }))
      .filter(({ res, urls }) => urls.length > 0)
      .filter(({ res }) => isWithinRange(res.departureDate, dateRange))
      .filter(({ res }) => matchesQuery(res, query))
      .sort((a, b) => {
        const da = parseYmd(a.res.departureDate)?.getTime() ?? 0;
        const db = parseYmd(b.res.departureDate)?.getTime() ?? 0;
        return db - da;
      });
  }, [reservations, query, dateRange]);

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="차량번호 · 뒤 4자리 · 고객명"
          className="w-full rounded-2xl border border-neutral-800 bg-neutral-900 py-3 pl-10 pr-4 text-sm font-semibold text-white outline-none focus:border-amber-500/50"
        />
      </div>

      <div className="flex gap-2">
        {(
          [
            { id: '7d' as const, label: '최근 7일' },
            { id: '30d' as const, label: '최근 30일' },
            { id: 'all' as const, label: '전체' },
          ] as const
        ).map(({ id, label }) => (
          <button
            key={id}
            type="button"
            onClick={() => setDateRange(id)}
            className={cn(
              'rounded-xl px-3 py-1.5 text-[11px] font-bold transition-colors',
              dateRange === id
                ? 'bg-amber-500 text-neutral-950'
                : 'bg-neutral-900 text-zinc-500 ring-1 ring-neutral-800'
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <p className="px-1 text-[11px] font-bold text-zinc-500">
        사진 등록 차량 {results.length}건
      </p>

      {results.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-neutral-800 bg-neutral-900/30 p-8 text-center">
          <ImageIcon className="mx-auto mb-3 text-zinc-600" size={28} />
          <p className="text-xs font-bold text-zinc-400">조건에 맞는 사진이 없습니다</p>
          <p className="mt-1 text-[11px] text-zinc-600">차량번호 또는 기간을 바꿔 보세요</p>
        </div>
      ) : (
        <div className="space-y-2">
          {results.map(({ res, urls }) => {
            const status = normalizeReservationStatus(res.status);
            return (
              <button
                key={res.id}
                type="button"
                onClick={() => setSelected({ res, urls })}
                className="flex w-full items-center gap-3 rounded-2xl bg-neutral-900/80 p-3 text-left ring-1 ring-neutral-800 transition hover:ring-amber-500/30"
              >
                <div className="flex h-14 w-14 shrink-0 overflow-hidden rounded-xl border border-neutral-800 bg-neutral-950">
                  <img
                    src={urls[0]}
                    alt=""
                    className="h-full w-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-black text-white tabular-nums">
                    {res.carNumber || '미등록'}
                  </p>
                  <p className="text-[11px] font-semibold text-zinc-500">
                    {res.userName} · 입고 {res.departureDate}
                  </p>
                  <p className="text-[11px] font-bold text-amber-500/90">
                    {statusToLabel(status, 'driver')} · {urls.length}장
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {selected && (
        <GalleryModal res={selected.res} urls={selected.urls} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}
