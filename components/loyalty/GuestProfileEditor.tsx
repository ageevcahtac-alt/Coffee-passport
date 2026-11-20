'use client';

import { useEffect, useState } from 'react';
import { updateOwnProfile, type OwnProfile, type OwnProfilePatch } from '@/lib/data/loyalty';
import { formatPhoneMask } from '@/lib/utils/phone';

// Типовые напитки выпадающего списка + «другое» со свободным текстом
// (бриф этапа 1.5). В базу уходит просто строка: выбранный пункт или текст
// «другого» — баристе показывается как есть.
export const FAVORITE_DRINK_PRESETS = [
  'Эспрессо',
  'Американо',
  'Капучино',
  'Латте',
  'Флэт уайт',
  'Фильтр',
  'Раф',
  'Какао',
  'Чай',
  'Матча',
] as const;

const OTHER = '__other';

function drinkToForm(favoriteDrink: string | null): { select: string; other: string } {
  if (!favoriteDrink) return { select: '', other: '' };
  const preset = FAVORITE_DRINK_PRESETS.find((option) => option.toLowerCase() === favoriteDrink.toLowerCase());
  return preset ? { select: preset, other: '' } : { select: OTHER, other: favoriteDrink };
}

function formToDrink(select: string, other: string): string {
  return select === OTHER ? other.trim() : select;
}

const inputClasses =
  'w-full rounded-md border border-ink-200 bg-parchment-100 px-3 py-2.5 text-sm ' +
  'text-ink-900 placeholder:text-ink-300 focus:border-gold-400';

// Мини-профиль гостя (ЛК Лояльности, этап 1.5; пакеты №3–4). Имя — то же
// display_name, что видит бариста при сканировании QR. Компактный вид
// (пакет №4): свёрнуто видно имя и любимый напиток + чипса «Изменить
// профиль»; полная форма (имя, телефон +7 без SMS-верификации, город,
// любимый напиток — почта в профиль не входит, это логин) раскрывается по
// чипсе и после сохранения сворачивается обратно.
//
// Блок рендерится ВСЕГДА для вошедшего гостя: profile=null — пустой
// свёрнутый блок с плейсхолдером «Как к вам обращаться?», loadError —
// понятное сообщение в блоке вместо молча исчезнувшей секции (баг пакета
// №3). Сохранение идёт в БД (updateOwnProfile возвращает ok только когда
// запись реально легла — молчаливый RLS-no-op неотличим от успеха иначе,
// баг пакета №4), после чего ЛК перечитывает профиль с сервера.
export function GuestProfileEditor({
  profile,
  loadError = null,
  onSaved,
}: {
  profile: OwnProfile | null;
  loadError?: string | null;
  onSaved: (patch: OwnProfilePatch) => void;
}) {
  const initialDrink = drinkToForm(profile?.favoriteDrink ?? null);
  const [editing, setEditing] = useState(false);
  const [displayName, setDisplayName] = useState(profile?.displayName ?? '');
  const [phone, setPhone] = useState(profile?.phone ?? '');
  const [city, setCity] = useState(profile?.city ?? '');
  const [drinkSelect, setDrinkSelect] = useState(initialDrink.select);
  const [drinkOther, setDrinkOther] = useState(initialDrink.other);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  useEffect(() => {
    setDisplayName(profile?.displayName ?? '');
    setPhone(profile?.phone ?? '');
    setCity(profile?.city ?? '');
    const drink = drinkToForm(profile?.favoriteDrink ?? null);
    setDrinkSelect(drink.select);
    setDrinkOther(drink.other);
  }, [profile]);

  async function handleSave() {
    if (saving) return;
    setSaving(true);
    setNotice(null);
    const result = await updateOwnProfile({
      displayName,
      phone: formatPhoneMask(phone),
      city,
      favoriteDrink: formToDrink(drinkSelect, drinkOther),
    });
    setSaving(false);
    if (!result.ok) {
      setNotice({ kind: 'error', text: result.error ?? 'Не удалось сохранить профиль.' });
      return;
    }
    setNotice({ kind: 'ok', text: 'Профиль сохранён.' });
    onSaved({
      displayName: displayName.trim(),
      phone: formatPhoneMask(phone),
      city: city.trim(),
      favoriteDrink: formToDrink(drinkSelect, drinkOther),
    });
    // Компактный вид: после успешного сохранения форма сворачивается
    // обратно в строку имя + напиток.
    setEditing(false);
  }

  const nameLine = profile?.displayName?.trim() || '';

  return (
    <div className="rounded-md border border-ink-200 bg-parchment-100 p-4 mb-6">
      {loadError && (
        <p role="alert" className="mb-3 text-sm text-rating">
          ⚠ Профиль не загрузился: {loadError}. Заполните поля и сохраните — данные запишутся в ваш аккаунт.
        </p>
      )}

      {!editing ? (
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-widest2 text-ink-400 font-body mb-1">Профиль</p>
            <p className="text-sm text-ink-900 truncate">
              {nameLine || <span className="text-ink-300">Как к вам обращаться?</span>}
              {profile?.favoriteDrink?.trim() && (
                <span className="text-ink-500"> · {profile.favoriteDrink.trim()}</span>
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setEditing(true);
              setNotice(null);
            }}
            aria-expanded={false}
            className="inline-flex shrink-0 items-center rounded-full border border-ink-200 px-3 py-1.5
                       text-xs font-body font-medium text-ink-700 whitespace-nowrap
                       hover:bg-parchment-300 transition-colors"
          >
            Изменить профиль
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-3.5">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-ink-900">Профиль</p>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="text-xs text-ink-400 underline underline-offset-2 hover:text-ink-700 shrink-0"
            >
              Свернуть
            </button>
          </div>

          <label className="block">
            <span className="block text-xs text-ink-400 mb-1.5">Имя</span>
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Как к вам обращаться?"
              className={inputClasses}
            />
          </label>

          <label className="block">
            <span className="block text-xs text-ink-400 mb-1.5">Телефон</span>
            <input
              value={phone}
              onChange={(e) => setPhone(formatPhoneMask(e.target.value))}
              placeholder="+7 900 000-00-00"
              inputMode="tel"
              className={inputClasses}
            />
          </label>

          <label className="block">
            <span className="block text-xs text-ink-400 mb-1.5">Город</span>
            <input
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="Санкт-Петербург"
              className={inputClasses}
            />
          </label>

          <div>
            <span className="block text-xs text-ink-400 mb-1.5">Любимый напиток</span>
            <select
              value={drinkSelect}
              onChange={(e) => setDrinkSelect(e.target.value)}
              aria-label="Любимый напиток"
              className={inputClasses}
            >
              <option value="">Не выбран</option>
              {FAVORITE_DRINK_PRESETS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
              <option value={OTHER}>Другое…</option>
            </select>
            {drinkSelect === OTHER && (
              <input
                value={drinkOther}
                onChange={(e) => setDrinkOther(e.target.value)}
                placeholder="Ваш вариант"
                className={`${inputClasses} mt-2`}
              />
            )}
            <p className="text-[11px] text-ink-400 mt-1">Имя и любимый напиток увидит бариста в вашей карточке при сканировании QR</p>
          </div>

          {notice && (
            <p role="status" className={`text-sm ${notice.kind === 'ok' ? 'text-moss-700' : 'text-ink-500'}`}>
              {notice.kind === 'ok' ? '✓ ' : '⚠ '}
              {notice.text}
            </p>
          )}

          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center justify-center rounded-md bg-ink-900 text-parchment-100
                       font-body font-medium text-sm px-6 py-3 hover:bg-ink-800 transition-colors disabled:opacity-40"
          >
            {saving ? 'Сохраняем…' : 'Сохранить профиль'}
          </button>
        </div>
      )}
    </div>
  );
}
