'use client';

import { useEffect, useState } from 'react';
import type { CoffeeShop, RoastType } from '@/lib/types/coffee';
import { useLots } from '@/lib/data/useLots';
import { useCafeMenuEntries } from '@/lib/data/useCafeMenu';

// "Что в наличии" buckets a shop's active menu into three roast-purpose
// tags plus a 4th "Архив" count for lots the shop toggled OFF its menu
// (see lib/data/cafeMenuStore.ts's is_active_in_cafe) — a coarser read than
// the full RoastType axis, matched to what a guest picking a coffee shop on
// the map actually wants to know. 'omni' lots serve both espresso and
// filter brewing, so they count toward "Фильтр" here rather than getting a
// 5th bucket nobody asked for.
const SUPPLY_LABELS = ['Эспрессо', 'Фильтр', 'Дрипы', 'Архив'] as const;
type SupplyLabel = (typeof SUPPLY_LABELS)[number];

function bucketFor(roastType: RoastType): Exclude<SupplyLabel, 'Архив'> {
  if (roastType === 'espresso') return 'Эспрессо';
  if (roastType === 'alternative') return 'Дрипы';
  return 'Фильтр'; // 'filter' and 'omni'
}

function useSupplyCounts(shopId: string): Record<SupplyLabel, number> {
  const lots = useLots();
  const entries = useCafeMenuEntries(shopId);
  const counts: Record<SupplyLabel, number> = { Эспрессо: 0, Фильтр: 0, Дрипы: 0, Архив: 0 };
  for (const lot of lots) {
    const isOnRoster = lot.id in entries;
    if (!isOnRoster) continue;
    if (entries[lot.id]) {
      counts[bucketFor(lot.roastType)] += 1;
    } else {
      counts['Архив'] += 1;
    }
  }
  return counts;
}

export function CafeDetailPanel({ shop, onClose }: { shop: CoffeeShop; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const supplyCounts = useSupplyCounts(shop.id);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  async function handleCopyAddress() {
    if (!shop.address) return;
    try {
      await navigator.clipboard.writeText(shop.address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API unavailable — address is still visible to copy by hand.
    }
  }

  const directionsUrl =
    shop.lat !== null && shop.lng !== null
      ? `https://www.google.com/maps/dir/?api=1&destination=${shop.lat},${shop.lng}`
      : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-ink-900/40"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${shop.name} — карточка кофейни`}
        onClick={(event) => event.stopPropagation()}
        className="w-full sm:max-w-md max-h-[90dvh] overflow-y-auto rounded-t-md sm:rounded-md
                   bg-parchment-100 p-6"
      >
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="flex items-center gap-3">
            <span
              className="w-10 h-10 rounded-full shrink-0 flex items-center justify-center
                         text-parchment-100 font-display text-lg"
              style={{ backgroundColor: shop.brandColor }}
              aria-hidden="true"
            >
              {shop.name.charAt(0).toUpperCase()}
            </span>
            <div>
              <h2 className="font-display text-xl text-ink-900 leading-tight">{shop.name}</h2>
              <p className="text-xs text-ink-400 mt-0.5">{shop.city}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть"
            className="text-ink-400 text-2xl leading-none px-1 shrink-0"
          >
            ×
          </button>
        </div>

        {shop.address && (
          <div className="flex items-center justify-between gap-3 mb-2 text-sm">
            <p className="text-ink-700">{shop.address}</p>
            <button
              type="button"
              onClick={handleCopyAddress}
              className="text-xs text-ink-500 underline underline-offset-2 hover:text-ink-900 shrink-0"
            >
              {copied ? 'Скопировано!' : 'Скопировать'}
            </button>
          </div>
        )}

        {shop.workingHours && <p className="text-xs text-ink-400 mb-4">🕐 {shop.workingHours}</p>}

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mb-6 text-sm">
          {shop.phone && (
            <a href={`tel:${shop.phone.replace(/[^+\d]/g, '')}`} className="text-ink-700 hover:text-ink-900">
              📞 {shop.phone}
            </a>
          )}
          {shop.website && (
            <a
              href={shop.website}
              target="_blank"
              rel="noopener noreferrer"
              className="text-ink-700 underline underline-offset-2 hover:text-ink-900"
            >
              Сайт
            </a>
          )}
          {shop.instagramUrl && (
            <a
              href={shop.instagramUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-ink-700 underline underline-offset-2 hover:text-ink-900"
            >
              Instagram
            </a>
          )}
          {shop.telegramUrl && (
            <a
              href={shop.telegramUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-ink-700 underline underline-offset-2 hover:text-ink-900"
            >
              Telegram
            </a>
          )}
        </div>

        {shop.photos.length > 0 && (
          <div className="flex gap-2 mb-6 overflow-x-auto">
            {shop.photos.slice(0, 3).map((url, i) => (
              // eslint-disable-next-line @next/next/no-img-element -- partner-supplied external URLs, not a Next-optimizable local asset
              <img
                key={url + i}
                src={url}
                alt={`${shop.name} — фото ${i + 1}`}
                className="w-28 h-28 object-cover rounded-md border border-ink-200 shrink-0"
              />
            ))}
          </div>
        )}

        {shop.description && <p className="text-sm text-ink-700 leading-relaxed mb-6">{shop.description}</p>}

        <p className="section-label mb-3">Что в наличии</p>
        <ul className="flex flex-wrap gap-1.5 mb-6">
          {SUPPLY_LABELS.map((label) => (
            <li
              key={label}
              className={`rounded-full border px-2.5 py-1 text-[11px] ${
                label === 'Архив'
                  ? 'border-dashed border-ink-300 bg-parchment-200 text-ink-500'
                  : 'border-ink-200 bg-parchment-200 text-ink-700'
              }`}
            >
              {label} · {supplyCounts[label]}
            </li>
          ))}
        </ul>

        {directionsUrl && (
          <a
            href={directionsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center w-full rounded-md bg-ink-900
                       text-parchment-100 font-body font-medium text-sm px-6 py-4
                       hover:bg-ink-800 transition-colors"
          >
            Маршрут →
          </a>
        )}
      </div>
    </div>
  );
}
