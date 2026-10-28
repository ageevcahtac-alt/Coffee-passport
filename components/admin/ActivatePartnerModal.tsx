'use client';

import dynamic from 'next/dynamic';
import { useState } from 'react';
import type { PartnerRoleRequested } from '@/lib/types/partnerRequest';
import { SEED_ROASTERS, refreshRoasters } from '@/lib/data/roasters';
import { SEED_COFFEE_SHOPS, refreshCoffeeShops } from '@/lib/data/coffeeShops';
import { sameCompanyName } from '@/lib/data/partnerRows';
import { generateInvitePassword } from '@/lib/utils/generateInvitePassword';

// Leaflet needs `window` at import time — same as the cafe's map profile.
const CoordinatePicker = dynamic(
  () => import('@/components/map/CoordinatePicker').then((mod) => mod.CoordinatePicker),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-full flex items-center justify-center text-ink-400 text-sm">
        Загрузка карты…
      </div>
    ),
  }
);

const SWATCHES = ['#D4AF37', '#00A896', '#E63946', '#5C6B4F', '#4A6FA5', '#B5657A'];
const NEW_CARD = '';

const fieldClasses =
  'w-full rounded-md border border-ink-200 bg-parchment-100 px-4 py-3 text-sm ' +
  'text-ink-900 placeholder:text-ink-300 focus:border-gold-400';

function builtInCards(kind: PartnerRoleRequested) {
  return kind === 'roaster' ? SEED_ROASTERS : SEED_COFFEE_SHOPS;
}

// A lead whose name matches a built-in card (e.g. "Xocoffee" → XO Coffee,
// shop-xo-vsevolozhsk) is bound to it by default, so the cafe cabinet that
// already runs on profiles.cafe_id keeps working after activation.
function matchingCard(kind: PartnerRoleRequested, name: string): string {
  return builtInCards(kind).find((card) => sameCompanyName(name, card.name))?.id ?? NEW_CARD;
}

// Writes the partner into coffee_shops / roasters via /api/admin/partners
// (0036_partner_directory.sql) — visible on /map and in the product for
// every visitor, not just this browser.
export function ActivatePartnerModal({
  requestId,
  initialCompanyName = '',
  initialCity = '',
  initialRole = 'coffee_shop',
  onClose,
  onActivated,
}: {
  requestId?: string;
  initialCompanyName?: string;
  initialCity?: string;
  initialRole?: PartnerRoleRequested;
  onClose: () => void;
  onActivated?: (result: { kind: PartnerRoleRequested; id: string; invitePassword: string }) => void;
}) {
  const [kind, setKind] = useState<PartnerRoleRequested>(initialRole);
  const [bindId, setBindId] = useState(() => matchingCard(initialRole, initialCompanyName));
  const [name, setName] = useState(initialCompanyName);
  const [city, setCity] = useState(initialCity);
  const [country, setCountry] = useState('Россия');
  const [brandColor, setBrandColor] = useState(SWATCHES[0]);
  const [philosophy, setPhilosophy] = useState('');
  const [point, setPoint] = useState<{ lat: number; lng: number } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [activatedId, setActivatedId] = useState('');
  const [invitePassword, setInvitePassword] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const canSubmit = name.trim().length > 0 && city.trim().length > 0 && !submitting;
  const boundShop = kind === 'coffee_shop' ? SEED_COFFEE_SHOPS.find((shop) => shop.id === bindId) : undefined;
  const builtInPoint = Boolean(boundShop && boundShop.lat !== null && boundShop.lng !== null);

  function changeKind(next: PartnerRoleRequested) {
    setKind(next);
    setBindId(matchingCard(next, name));
  }

  async function handleActivate() {
    if (!canSubmit) return;
    setSubmitting(true);
    setError('');
    try {
      const response = await fetch('/api/admin/partners', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind,
          requestId: requestId ?? null,
          bindId: bindId || null,
          name,
          city,
          country,
          philosophy,
          color: brandColor,
          lat: kind === 'coffee_shop' ? point?.lat ?? null : null,
          lng: kind === 'coffee_shop' ? point?.lng ?? null : null,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(body.error ?? 'Не удалось активировать партнёра.');
        return;
      }
      await (kind === 'roaster' ? refreshRoasters() : refreshCoffeeShops());
      const password = generateInvitePassword();
      setActivatedId(body.partner.id);
      setInvitePassword(password);
      onActivated?.({ kind, id: body.partner.id, invitePassword: password });
    } catch {
      setError('Нет связи с сервером — попробуйте ещё раз.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCopy() {
    if (!invitePassword) return;
    try {
      await navigator.clipboard.writeText(invitePassword);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard unavailable — the code is still visible to copy by hand.
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-ink-900/40"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Активировать партнёра"
        onClick={(event) => event.stopPropagation()}
        className="w-full sm:max-w-md max-h-[90dvh] overflow-y-auto rounded-t-md sm:rounded-md
                   bg-parchment-100 p-6"
      >
        <div className="flex items-start justify-between gap-4 mb-6">
          <h2 className="font-display text-xl text-ink-900">Активировать партнёра</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть"
            className="text-ink-400 text-2xl leading-none px-1 shrink-0"
          >
            ×
          </button>
        </div>

        {invitePassword ? (
          <div className="text-center py-4">
            <p className="text-3xl mb-3" aria-hidden="true">
              ✓
            </p>
            <p className="font-display text-lg text-ink-900 mb-2">Партнёр активирован</p>
            <p className="text-sm text-ink-500 mb-5">
              {name} сохранён(-а) в базе и виден(-а) всем посетителям
              {kind === 'coffee_shop' && !point && !builtInPoint
                ? ' (на карте — после того как кофейня поставит точку)'
                : ''}
              . Отправьте этот инвайт-код клиенту после подписания договора.
            </p>
            <p className="data-value text-xs text-ink-400 mb-5">{activatedId}</p>
            <div className="rounded-md border border-ink-200 bg-parchment-200 px-4 py-3 mb-3">
              <p className="data-value text-lg text-ink-900 tracking-wide">{invitePassword}</p>
            </div>
            <button
              type="button"
              onClick={handleCopy}
              className="inline-flex items-center justify-center rounded-md bg-ink-900
                         text-parchment-100 font-body font-medium text-sm px-5 py-3
                         hover:bg-ink-800 transition-colors mb-2"
            >
              {copied ? 'Скопировано!' : 'Скопировать код'}
            </button>
            <p className="text-[11px] text-ink-400 max-w-xs mx-auto">
              Это demo-код для передачи клиенту вручную — реальный вход по паролю появится вместе
              с полноценной авторизацией партнёров.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div>
              <span className="block text-xs text-ink-400 mb-2">Тип партнёра</span>
              <div className="grid grid-cols-2 gap-2">
                {(
                  [
                    { id: 'coffee_shop', label: 'Кофейня' },
                    { id: 'roaster', label: 'Обжарщик' },
                  ] as const
                ).map((option) => {
                  const checked = kind === option.id;
                  return (
                    <label
                      key={option.id}
                      className={`flex items-center justify-center rounded-md border px-3 py-3
                                  text-sm cursor-pointer transition-colors
                                  ${checked
                                    ? 'border-gold-400 bg-gold-400/10 text-ink-900 font-medium'
                                    : 'border-ink-200 bg-parchment-100 text-ink-700'}`}
                    >
                      <input
                        type="radio"
                        name="partner_kind"
                        checked={checked}
                        onChange={() => changeKind(option.id)}
                        className="sr-only"
                      />
                      {option.label}
                    </label>
                  );
                })}
              </div>
            </div>

            <div>
              <label htmlFor="partner-card" className="block text-xs text-ink-400 mb-1.5">
                Карточка в базе
              </label>
              <select
                id="partner-card"
                value={bindId}
                onChange={(e) => setBindId(e.target.value)}
                className={fieldClasses}
              >
                <option value={NEW_CARD}>Новая карточка</option>
                {builtInCards(kind).map((card) => (
                  <option key={card.id} value={card.id}>
                    {card.name} — {card.id}
                  </option>
                ))}
              </select>
              {bindId && (
                <p className="text-[11px] text-ink-400 mt-1">
                  Привязка к существующей карточке: кабинет с этим id продолжит работать.
                </p>
              )}
            </div>

            <div>
              <label htmlFor="partner-name" className="block text-xs text-ink-400 mb-1.5">
                Название
              </label>
              <input
                id="partner-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Sunrise Coffee"
                className={fieldClasses}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="partner-city" className="block text-xs text-ink-400 mb-1.5">
                  Город
                </label>
                <input
                  id="partner-city"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="Москва"
                  className={fieldClasses}
                />
              </div>
              {kind === 'roaster' && (
                <div>
                  <label htmlFor="partner-country" className="block text-xs text-ink-400 mb-1.5">
                    Страна
                  </label>
                  <input
                    id="partner-country"
                    value={country}
                    onChange={(e) => setCountry(e.target.value)}
                    className={fieldClasses}
                  />
                </div>
              )}
            </div>

            {kind === 'roaster' && (
              <div>
                <label htmlFor="partner-philosophy" className="block text-xs text-ink-400 mb-1.5">
                  Философия бренда (необязательно)
                </label>
                <textarea
                  id="partner-philosophy"
                  rows={2}
                  value={philosophy}
                  onChange={(e) => setPhilosophy(e.target.value)}
                  placeholder="Короткое заявление бренда для визитки обжарщика…"
                  className={fieldClasses}
                />
              </div>
            )}

            {kind === 'coffee_shop' && (
              <div>
                <span className="block text-xs text-ink-400 mb-2">Точка на карте</span>
                <div className="h-48 rounded-md border border-ink-200 overflow-hidden">
                  <CoordinatePicker
                    lat={point?.lat ?? boundShop?.lat ?? null}
                    lng={point?.lng ?? boundShop?.lng ?? null}
                    recenterSignal={0}
                    onChange={(lat, lng) => setPoint({ lat, lng })}
                  />
                </div>
                <p className="text-[11px] text-ink-400 mt-1">
                  {point
                    ? `${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}`
                    : builtInPoint
                      ? 'Точка из карточки — кликните по карте, чтобы изменить.'
                      : 'Кликните по карте. Без точки кофейня не появится на карте, пока не поставит её сама.'}
                </p>
              </div>
            )}

            <div>
              <span className="block text-xs text-ink-400 mb-2">Брендовый цвет 🎨</span>
              <div className="flex items-center gap-2 flex-wrap">
                {SWATCHES.map((swatch) => (
                  <button
                    key={swatch}
                    type="button"
                    onClick={() => setBrandColor(swatch)}
                    aria-label={swatch}
                    aria-pressed={brandColor === swatch}
                    className="w-8 h-8 rounded-full border-2 shrink-0"
                    style={{
                      backgroundColor: swatch,
                      borderColor: brandColor === swatch ? 'var(--color-ink-900)' : 'transparent',
                    }}
                  />
                ))}
                <input
                  type="color"
                  value={brandColor}
                  onChange={(e) => setBrandColor(e.target.value)}
                  aria-label="Свой цвет"
                  className="w-8 h-8 rounded-full border border-ink-200 cursor-pointer overflow-hidden p-0"
                />
                <span className="data-value text-xs text-ink-400">{brandColor}</span>
              </div>
            </div>

            <button
              type="button"
              disabled={!canSubmit}
              onClick={handleActivate}
              className="inline-flex items-center justify-center rounded-md bg-gold-500
                         text-parchment-100 font-body font-semibold text-sm px-6 py-4
                         hover:bg-gold-400 transition-colors
                         disabled:opacity-40 disabled:pointer-events-none"
            >
              {submitting ? 'Сохраняем…' : 'Активировать и создать инвайт-код'}
            </button>
            {error && (
              <p role="alert" className="text-sm text-ink-700">
                ⚠ {error}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
