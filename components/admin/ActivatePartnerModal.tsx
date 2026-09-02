'use client';

import { useState } from 'react';
import type { PartnerRoleRequested } from '@/lib/types/partnerRequest';
import { saveRoaster, generateRoasterId } from '@/lib/data/roasters';
import { saveCoffeeShop, generateCoffeeShopId } from '@/lib/data/coffeeShops';
import { generateInvitePassword } from '@/lib/utils/generateInvitePassword';

const SWATCHES = ['#D4AF37', '#00A896', '#E63946', '#5C6B4F', '#4A6FA5', '#B5657A'];

const fieldClasses =
  'w-full rounded-md border border-ink-200 bg-parchment-100 px-4 py-3 text-sm ' +
  'text-ink-900 placeholder:text-ink-300 focus:border-gold-400';

export function ActivatePartnerModal({
  initialCompanyName = '',
  initialCity = '',
  initialRole = 'coffee_shop',
  onClose,
  onActivated,
}: {
  initialCompanyName?: string;
  initialCity?: string;
  initialRole?: PartnerRoleRequested;
  onClose: () => void;
  onActivated?: (result: { kind: PartnerRoleRequested; id: string; invitePassword: string }) => void;
}) {
  const [kind, setKind] = useState<PartnerRoleRequested>(initialRole);
  const [name, setName] = useState(initialCompanyName);
  const [city, setCity] = useState(initialCity);
  const [country, setCountry] = useState('Россия');
  const [brandColor, setBrandColor] = useState(SWATCHES[0]);
  const [philosophy, setPhilosophy] = useState('');
  const [invitePassword, setInvitePassword] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const canSubmit = name.trim().length > 0 && city.trim().length > 0;

  function handleActivate() {
    if (!canSubmit) return;
    const password = generateInvitePassword();

    if (kind === 'roaster') {
      const id = generateRoasterId(name);
      saveRoaster({
        id,
        name: name.trim(),
        slug: id.replace(/^roaster-/, ''),
        color: brandColor,
        philosophy: philosophy.trim() || 'Партнёр платформы Coffee Passport.',
        city: city.trim(),
        country: country.trim() || 'Россия',
      });
      setInvitePassword(password);
      onActivated?.({ kind, id, invitePassword: password });
    } else {
      const id = generateCoffeeShopId(name);
      saveCoffeeShop({
        id,
        name: name.trim(),
        city: city.trim(),
        brandColor,
        lat: null,
        lng: null,
        address: '',
        phone: '',
        website: '',
        instagramUrl: '',
        telegramUrl: '',
        vkUrl: '',
        description: '',
        workingHours: '',
        photos: [],
      });
      setInvitePassword(password);
      onActivated?.({ kind, id, invitePassword: password });
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
              {name} уже виден(-а) в продукте. Отправьте этот инвайт-код клиенту после подписания
              договора.
            </p>
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
                        onChange={() => setKind(option.id)}
                        className="sr-only"
                      />
                      {option.label}
                    </label>
                  );
                })}
              </div>
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
              Активировать и создать инвайт-код
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
