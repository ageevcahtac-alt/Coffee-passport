'use client';

import { useEffect, useState } from 'react';
import type { CoffeeShop, RoastType } from '@/lib/types/coffee';
import { useLots } from '@/lib/data/useLots';
import { useCafeMenuEntries } from '@/lib/data/useCafeMenu';
import { syncCafeMenuFromSupabase } from '@/lib/data/cafeMenuStore';

// "Активное зерно в наличии" buckets a shop's active menu into three
// roast-purpose tags plus a 4th "Архив" count for lots the shop toggled OFF
// its menu (see lib/data/cafeMenuStore.ts's is_active_in_cafe) — a coarser
// read than the full RoastType axis, matched to what a guest picking a
// coffee shop on the map actually wants to know. 'omni' lots serve both
// espresso and filter brewing, so they count toward "Фильтр" here rather
// than getting a 5th bucket nobody asked for.
const SUPPLY_LABELS = ['Эспрессо', 'Фильтр', 'Дрипы', 'Архив'] as const;
type SupplyLabel = (typeof SUPPLY_LABELS)[number];

function bucketFor(roastType: RoastType): Exclude<SupplyLabel, 'Архив'> {
  if (roastType === 'espresso') return 'Эспрессо';
  if (roastType === 'alternative') return 'Дрипы';
  return 'Фильтр'; // 'filter' and 'omni'
}

// Every field this reads is defended with `?.`/fallbacks even though
// CoffeeShop's own fields are typed non-optional — this panel renders
// whatever a coffee shop actually saved (or whatever an older, differently-
// shaped localStorage record still holds), and per the task, a shop that
// hasn't filled in photos/phone/socials/description must never crash the
// map, only show less.
function useSupplyData(shop: CoffeeShop) {
  useEffect(() => {
    void syncCafeMenuFromSupabase(shop.id);
  }, [shop.id]);

  const lots = useLots() ?? [];
  const entries = useCafeMenuEntries(shop.id) ?? {};
  const counts: Record<SupplyLabel, number> = { Эспрессо: 0, Фильтр: 0, Дрипы: 0, Архив: 0 };
  const activeLotNames: string[] = [];

  for (const lot of lots) {
    if (!lot || !(lot.id in entries)) continue;
    if (entries[lot.id].isActive) {
      counts[bucketFor(lot.roastType)] += 1;
      activeLotNames.push(lot.name ?? lot.id);
    } else {
      counts['Архив'] += 1;
    }
  }

  return { counts, activeLotNames };
}

export function CafeDetailPanel({ shop, onClose }: { shop: CoffeeShop; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const { counts, activeLotNames } = useSupplyData(shop);

  const name = shop?.name?.trim() || 'Кофейня';
  const city = shop?.city?.trim() ?? '';
  const address = shop?.address?.trim() ?? '';
  const phone = shop?.phone?.trim() ?? '';
  const website = shop?.website?.trim() ?? '';
  const instagramUrl = shop?.instagramUrl?.trim() ?? '';
  const telegramUrl = shop?.telegramUrl?.trim() ?? '';
  const vkUrl = shop?.vkUrl?.trim() ?? '';
  const description = shop?.description?.trim() ?? '';
  const workingHours = shop?.workingHours?.trim() ?? '';
  const photos = (Array.isArray(shop?.photos) ? shop.photos : []).filter(
    (url): url is string => typeof url === 'string' && url.trim().length > 0
  );
  const brandColor = shop?.brandColor || '#8a7a63';
  const lat = typeof shop?.lat === 'number' && Number.isFinite(shop.lat) ? shop.lat : null;
  const lng = typeof shop?.lng === 'number' && Number.isFinite(shop.lng) ? shop.lng : null;

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  async function handleCopyAddress() {
    if (!address) return;
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API unavailable — address is still visible to copy by hand.
    }
  }

  const directionsUrl = lat !== null && lng !== null ? `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}` : null;

  const socialLinks = [
    { label: 'Telegram', href: telegramUrl },
    { label: 'Instagram', href: instagramUrl },
    { label: 'VK', href: vkUrl },
    { label: 'Сайт', href: website },
  ].filter((link) => link.href);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-ink-900/40"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${name} — карточка кофейни`}
        onClick={(event) => event.stopPropagation()}
        className="w-full sm:max-w-md max-h-[90dvh] overflow-y-auto rounded-t-md sm:rounded-md
                   bg-parchment-100 p-6"
      >
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="flex items-center gap-3 min-w-0">
            <span
              className="w-10 h-10 rounded-full shrink-0 flex items-center justify-center
                         text-parchment-100 font-display text-lg"
              style={{ backgroundColor: brandColor }}
              aria-hidden="true"
            >
              {name.charAt(0).toUpperCase() || '?'}
            </span>
            <div className="min-w-0">
              <h2 className="font-display text-xl text-ink-900 leading-tight truncate">{name}</h2>
              {city && <p className="text-xs text-ink-400 mt-0.5">{city}</p>}
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

        {address ? (
          <div className="flex items-center justify-between gap-3 mb-2 text-sm">
            <p className="text-ink-700">{address}</p>
            <button
              type="button"
              onClick={handleCopyAddress}
              className="text-xs text-ink-500 underline underline-offset-2 hover:text-ink-900 shrink-0"
            >
              {copied ? 'Скопировано!' : 'Скопировать'}
            </button>
          </div>
        ) : (
          <p className="text-xs text-ink-400 mb-2">Адрес пока не указан</p>
        )}

        {workingHours && <p className="text-xs text-ink-400 mb-4">🕐 {workingHours}</p>}

        {phone ? (
          <p className="text-sm mb-4">
            <a href={`tel:${phone.replace(/[^+\d]/g, '')}`} className="text-ink-700 hover:text-ink-900">
              📞 {phone}
            </a>
          </p>
        ) : (
          <p className="text-xs text-ink-400 mb-4">Телефон пока не указан</p>
        )}

        {socialLinks.length > 0 && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mb-6 text-sm">
            {socialLinks.map((link) => (
              <a
                key={link.label}
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-ink-700 underline underline-offset-2 hover:text-ink-900"
              >
                {link.label}
              </a>
            ))}
          </div>
        )}

        {photos.length > 0 ? (
          <div className="flex gap-2 mb-6 overflow-x-auto">
            {photos.slice(0, 3).map((url, i) => (
              // eslint-disable-next-line @next/next/no-img-element -- partner-supplied external URLs, not a Next-optimizable local asset
              <img
                key={`${url}-${i}`}
                src={url}
                alt={`${name} — фото ${i + 1}`}
                className="w-28 h-28 object-cover rounded-md border border-ink-200 shrink-0"
                onError={(event) => {
                  // A broken/unreachable photo URL degrades to "just hide
                  // it" rather than a visible broken-image icon or, worse,
                  // an uncaught error further up the tree.
                  event.currentTarget.style.display = 'none';
                }}
              />
            ))}
          </div>
        ) : (
          <p className="text-xs text-ink-400 mb-6">Фото пока не добавлены</p>
        )}

        <p className="text-sm text-ink-700 leading-relaxed mb-6">
          {description || 'Описание кофейни пока не заполнено.'}
        </p>

        <p className="section-label mb-3">Активное зерно в наличии</p>
        <ul className="flex flex-wrap gap-1.5 mb-3">
          {SUPPLY_LABELS.map((label) => (
            <li
              key={label}
              className={`rounded-full border px-2.5 py-1 text-[11px] ${
                label === 'Архив'
                  ? 'border-dashed border-ink-300 bg-parchment-200 text-ink-500'
                  : 'border-ink-200 bg-parchment-200 text-ink-700'
              }`}
            >
              {label} · {counts[label]}
            </li>
          ))}
        </ul>
        <p className="text-xs text-ink-500 mb-6">
          {activeLotNames.length > 0 ? activeLotNames.join(' · ') : 'Меню кофейни пока не заполнено.'}
        </p>

        {directionsUrl ? (
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
        ) : (
          <p className="text-xs text-ink-400 text-center">Координаты пока не установлены</p>
        )}
      </div>
    </div>
  );
}
