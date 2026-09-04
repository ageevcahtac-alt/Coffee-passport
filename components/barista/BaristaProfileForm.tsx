'use client';

import { useState, type FormEvent } from 'react';
import { BREWING_METHODS, type Barista } from '@/lib/types/coffee';
import { saveBaristaProfile } from '@/lib/data/baristaProfileStore';

const fieldClasses =
  'w-full rounded-md border border-ink-200 bg-parchment-100 px-4 py-3 text-sm ' +
  'text-ink-900 placeholder:text-ink-300 focus:border-gold-400';

// Self-service "Мой профиль" editor for a barista's own cabinet
// (/dashboard/barista) — the favoriteOrigin/favoriteBrewMethod/avatarUrl
// personal-preference layer shown on the tasting Success Screen (see
// BaristaProfileCard). id/name/coffeeShopId aren't editable here — those
// still come from lib/data/baristas.ts (see lib/data/staff.ts's own note
// on there being no "create a new barista" flow yet).
export function BaristaProfileForm({
  barista,
  onSaved,
}: {
  barista: Barista;
  onSaved?: (barista: Barista) => void;
}) {
  const [favoriteOrigin, setFavoriteOrigin] = useState(barista.favoriteOrigin);
  const [favoriteBrewMethod, setFavoriteBrewMethod] = useState(barista.favoriteBrewMethod);
  const [avatarUrl, setAvatarUrl] = useState(barista.avatarUrl);
  const [saved, setSaved] = useState(false);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const updated: Barista = {
      ...barista,
      favoriteOrigin: favoriteOrigin.trim(),
      favoriteBrewMethod,
      avatarUrl: avatarUrl.trim(),
    };
    saveBaristaProfile(updated);
    setSaved(true);
    onSaved?.(updated);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div>
        <label htmlFor="barista-origin" className="block text-xs text-ink-400 mb-1.5">
          Любимый регион / страна
        </label>
        <input
          id="barista-origin"
          value={favoriteOrigin}
          onChange={(e) => {
            setFavoriteOrigin(e.target.value);
            setSaved(false);
          }}
          placeholder="Эфиопия"
          className={fieldClasses}
        />
      </div>

      <div>
        <label htmlFor="barista-method" className="block text-xs text-ink-400 mb-1.5">
          Любимый способ заваривания
        </label>
        <select
          id="barista-method"
          value={favoriteBrewMethod}
          onChange={(e) => {
            setFavoriteBrewMethod(e.target.value as Barista['favoriteBrewMethod']);
            setSaved(false);
          }}
          className={fieldClasses}
        >
          <option value="">Не выбрано</option>
          {BREWING_METHODS.map((method) => (
            <option key={method.id} value={method.id}>
              {method.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="barista-avatar" className="block text-xs text-ink-400 mb-1.5">
          Ссылка на фото (необязательно)
        </label>
        <input
          id="barista-avatar"
          type="url"
          value={avatarUrl}
          onChange={(e) => {
            setAvatarUrl(e.target.value);
            setSaved(false);
          }}
          placeholder="https://…"
          className={fieldClasses}
        />
      </div>

      <button
        type="submit"
        className="inline-flex items-center justify-center rounded-md bg-ink-900
                   text-parchment-100 font-body font-medium text-sm px-6 py-4
                   hover:bg-ink-800 transition-colors self-start"
      >
        {saved ? 'Сохранено ✓' : 'Сохранить профиль'}
      </button>
    </form>
  );
}
