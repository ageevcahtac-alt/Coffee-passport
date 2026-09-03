'use client';

import { useState } from 'react';
import type { UserCustomCoffee } from '@/lib/types/kitchen';
import { fileToCompressedDataUrl, isImageFile } from '@/lib/utils/imageFile';

export type CustomCoffeeFormValues = Omit<UserCustomCoffee, 'id' | 'userId' | 'createdAt' | 'updatedAt'>;

const fieldClasses =
  'w-full rounded-md border border-ink-200 bg-parchment-100 px-4 py-3 text-sm ' +
  'text-ink-900 placeholder:text-ink-300 focus:border-gold-400';

// Manual metadata entry for "Мой кофе" — replaces the QR/catalog lookup
// the public passport flow uses: every field here is a plain string typed
// by hand, so a rare microlot with no id anywhere in this app's catalog
// (bought abroad, from a roaster the platform has never heard of) fits
// just as well as anything from a partner shop. See lib/types/kitchen.ts —
// UserCustomCoffee — for why that matters structurally, not just as UI copy.
export function CustomCoffeeForm({
  initial,
  onSave,
  onCancel,
}: {
  initial?: UserCustomCoffee;
  onSave: (values: CustomCoffeeFormValues) => void;
  onCancel?: () => void;
}) {
  const [roasterName, setRoasterName] = useState(initial?.roasterName ?? '');
  const [lotName, setLotName] = useState(initial?.lotName ?? '');
  const [region, setRegion] = useState(initial?.region ?? '');
  const [farm, setFarm] = useState(initial?.farm ?? '');
  const [purchaseLocation, setPurchaseLocation] = useState(initial?.purchaseLocation ?? '');
  const [roastDate, setRoastDate] = useState(initial?.roastDate ?? '');
  const [variety, setVariety] = useState(initial?.variety ?? '');
  const [process, setProcess] = useState(initial?.process ?? '');
  const [altitude, setAltitude] = useState(initial?.altitude ?? '');
  const [photoUrl, setPhotoUrl] = useState(initial?.photoUrl ?? '');
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');

  const canSave = lotName.trim().length > 0;

  async function handlePhotoFile(file: File | null) {
    if (!file) return;
    if (!isImageFile(file)) {
      setUploadError('Выберите файл изображения (JPG, PNG…).');
      return;
    }
    setUploadError('');
    setUploading(true);
    try {
      const dataUrl = await fileToCompressedDataUrl(file);
      setPhotoUrl(dataUrl);
    } catch {
      setUploadError('Не удалось загрузить фото — попробуйте другой файл.');
    } finally {
      setUploading(false);
    }
  }

  function handleSubmit() {
    if (!canSave) return;
    onSave({
      roasterName: roasterName.trim(),
      lotName: lotName.trim(),
      region: region.trim(),
      farm: farm.trim(),
      purchaseLocation: purchaseLocation.trim(),
      roastDate,
      variety: variety.trim(),
      process: process.trim(),
      altitude: altitude.trim(),
      photoUrl,
      notes: notes.trim(),
    });
  }

  return (
    <div className="flex flex-col gap-8">
      <div>
        <p className="section-label mb-1">Фото пачки (необязательно)</p>
        <p className="text-xs text-ink-400 mb-4">Пригодится, чтобы узнать зерно на полке спустя месяцы.</p>
        <div className="flex items-center gap-4">
          <div className="w-24 h-24 shrink-0 rounded-md border border-ink-200 bg-parchment-200 overflow-hidden flex items-center justify-center">
            {photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- data: URL, not a Next-optimizable local asset
              <img src={photoUrl} alt="Фото пачки" className="w-full h-full object-cover" />
            ) : (
              <span className="text-xs text-ink-300">Нет фото</span>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <label
              className="text-center text-xs rounded-md border border-ink-200 px-3 py-2 cursor-pointer
                         text-ink-700 hover:bg-parchment-300 transition-colors
                         aria-disabled:opacity-40 aria-disabled:pointer-events-none"
              aria-disabled={uploading}
            >
              {uploading ? 'Загрузка…' : photoUrl ? 'Заменить' : 'Загрузить'}
              <input
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const file = e.target.files?.[0] ?? null;
                  void handlePhotoFile(file);
                  e.target.value = '';
                }}
                disabled={uploading}
                className="hidden"
              />
            </label>
            {photoUrl && (
              <button
                type="button"
                onClick={() => setPhotoUrl('')}
                className="text-[11px] text-ink-400 underline underline-offset-2 hover:text-ink-700"
              >
                Удалить фото
              </button>
            )}
          </div>
        </div>
        {uploadError && <p className="text-xs text-ink-500 mt-2">⚠ {uploadError}</p>}
      </div>

      <div>
        <p className="section-label mb-4">Происхождение</p>
        <div className="flex flex-col gap-3">
          <div>
            <label htmlFor="cc-lot" className="block text-xs text-ink-400 mb-1.5">
              Название лота
            </label>
            <input
              id="cc-lot"
              value={lotName}
              onChange={(e) => setLotName(e.target.value)}
              placeholder="Panama Geisha Lot 7"
              className={fieldClasses}
            />
          </div>
          <div>
            <label htmlFor="cc-roaster" className="block text-xs text-ink-400 mb-1.5">
              Обжарщик
            </label>
            <input
              id="cc-roaster"
              value={roasterName}
              onChange={(e) => setRoasterName(e.target.value)}
              placeholder="Название обжарочной — любой, даже вне платформы"
              className={fieldClasses}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="cc-region" className="block text-xs text-ink-400 mb-1.5">
                Регион
              </label>
              <input
                id="cc-region"
                value={region}
                onChange={(e) => setRegion(e.target.value)}
                placeholder="Boquete"
                className={fieldClasses}
              />
            </div>
            <div>
              <label htmlFor="cc-farm" className="block text-xs text-ink-400 mb-1.5">
                Ферма
              </label>
              <input
                id="cc-farm"
                value={farm}
                onChange={(e) => setFarm(e.target.value)}
                placeholder="Hacienda La Esmeralda"
                className={fieldClasses}
              />
            </div>
          </div>
          <div>
            <label htmlFor="cc-purchase" className="block text-xs text-ink-400 mb-1.5">
              Страна покупки / локация
            </label>
            <input
              id="cc-purchase"
              value={purchaseLocation}
              onChange={(e) => setPurchaseLocation(e.target.value)}
              placeholder="Токио, Япония"
              className={fieldClasses}
            />
          </div>
        </div>
      </div>

      <div>
        <p className="section-label mb-4">Дополнительно (необязательно)</p>
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="cc-roastdate" className="block text-xs text-ink-400 mb-1.5">
                Дата обжарки
              </label>
              <input
                id="cc-roastdate"
                type="date"
                value={roastDate}
                onChange={(e) => setRoastDate(e.target.value)}
                className={fieldClasses}
              />
            </div>
            <div>
              <label htmlFor="cc-variety" className="block text-xs text-ink-400 mb-1.5">
                Разновидность (сорт)
              </label>
              <input
                id="cc-variety"
                value={variety}
                onChange={(e) => setVariety(e.target.value)}
                placeholder="Geisha"
                className={fieldClasses}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="cc-process" className="block text-xs text-ink-400 mb-1.5">
                Метод обработки
              </label>
              <input
                id="cc-process"
                value={process}
                onChange={(e) => setProcess(e.target.value)}
                placeholder="Washed"
                className={fieldClasses}
              />
            </div>
            <div>
              <label htmlFor="cc-altitude" className="block text-xs text-ink-400 mb-1.5">
                Высота произрастания
              </label>
              <input
                id="cc-altitude"
                value={altitude}
                onChange={(e) => setAltitude(e.target.value)}
                placeholder="1900–2100 м"
                className={fieldClasses}
              />
            </div>
          </div>
        </div>
      </div>

      <div>
        <label htmlFor="cc-notes" className="section-label mb-4 block">
          Заметки о зерне (необязательно)
        </label>
        <textarea
          id="cc-notes"
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Куплено на фестивале, осталось 150г…"
          className={fieldClasses}
        />
      </div>

      <div className="flex gap-3">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex items-center justify-center rounded-md border border-ink-200
                       text-ink-700 font-body font-medium text-sm px-6 py-4 flex-1
                       hover:bg-parchment-300 transition-colors"
          >
            Отмена
          </button>
        )}
        <button
          type="button"
          disabled={!canSave}
          onClick={handleSubmit}
          className="inline-flex items-center justify-center rounded-md bg-ink-900
                     text-parchment-100 font-body font-medium text-sm px-6 py-4 flex-[2]
                     hover:bg-ink-800 transition-colors
                     disabled:opacity-40 disabled:pointer-events-none"
        >
          {initial ? 'Сохранить изменения' : 'Добавить на полку'}
        </button>
      </div>
      {!canSave && <p className="text-xs text-ink-400 -mt-4 text-center">Укажите название лота, чтобы сохранить</p>}
    </div>
  );
}
