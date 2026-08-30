'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { HOME_GRINDER_MODELS, ESPRESSO_MACHINE_MODELS } from '@/lib/types/coffee';
import { DEMO_USER_ID } from '@/lib/journey/store';
import { useEquipment } from '@/lib/data/useEquipment';
import { getEquipmentForUser, saveEquipment } from '@/lib/data/equipmentStore';
import { ComboSelect } from '@/components/shared/ComboSelect';
import { FavoriteDevicePicker } from '@/components/coffee/FavoriteDevicePicker';

const fieldClasses =
  'w-full rounded-md border border-ink-200 bg-parchment-100 px-4 py-3 text-sm ' +
  'text-ink-900 placeholder:text-ink-300 focus:border-gold-400';

const CURRENT_USER_NAME = 'Вы';

export default function EquipmentGaragePage() {
  useEquipment(); // subscribes to store changes so a fresh save re-seeds the form below
  const saved = getEquipmentForUser(DEMO_USER_ID);

  const [espressoGrinder, setEspressoGrinder] = useState(saved?.espressoGrinder ?? '');
  const [espressoMachine, setEspressoMachine] = useState(saved?.espressoMachine ?? '');
  const [espressoWater, setEspressoWater] = useState(saved?.espressoWater ?? '');
  const [filterGrinder, setFilterGrinder] = useState(saved?.filterGrinder ?? '');
  const [filterWater, setFilterWater] = useState(saved?.filterWater ?? '');
  const [favoriteDeviceIds, setFavoriteDeviceIds] = useState<string[]>(saved?.favoriteDeviceIds ?? []);
  const [justSaved, setJustSaved] = useState(false);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    saveEquipment({
      userId: DEMO_USER_ID,
      espressoGrinder: espressoGrinder.trim(),
      espressoMachine: espressoMachine.trim(),
      espressoWater: espressoWater.trim(),
      filterGrinder: filterGrinder.trim(),
      filterWater: filterWater.trim(),
      favoriteDeviceIds,
    });
    setJustSaved(true);
    setTimeout(() => setJustSaved(false), 2000);
  }

  return (
    <main className="min-h-dvh px-6 py-16">
      <div className="max-w-md mx-auto w-full">
        <p className="text-xs uppercase tracking-widest2 text-ink-400 font-body mb-2">{CURRENT_USER_NAME}</p>
        <h1 className="font-display text-2xl text-ink-900 mb-2">Моё оборудование</h1>
        <p className="text-sm text-ink-500 mb-8">
          Сохранённый сетап подставляется автоматически при записи нового рецепта — выберите способ приготовления,
          и поля кофемолки/машины/воды заполнятся сами.
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-10">
          <div>
            <p className="section-label mb-4">Espresso Setup</p>
            <div className="flex flex-col gap-3">
              <ComboSelect label="Кофемолка под эспрессо" options={HOME_GRINDER_MODELS} value={espressoGrinder} onChange={setEspressoGrinder} />
              <ComboSelect label="Эспрессо-машина" options={ESPRESSO_MACHINE_MODELS} value={espressoMachine} onChange={setEspressoMachine} />
              <div>
                <label htmlFor="eq-espresso-water" className="block text-xs text-ink-400 mb-1.5">Вода</label>
                <input id="eq-espresso-water" value={espressoWater} onChange={(e) => setEspressoWater(e.target.value)}
                  placeholder="Third Wave Water Classic" className={fieldClasses} />
              </div>
            </div>
          </div>

          <div>
            <p className="section-label mb-4">Filter Setup</p>
            <div className="flex flex-col gap-3">
              <ComboSelect label="Кофемолка под фильтр" options={HOME_GRINDER_MODELS} value={filterGrinder} onChange={setFilterGrinder} />
              <div>
                <label htmlFor="eq-filter-water" className="block text-xs text-ink-400 mb-1.5">Вода</label>
                <input id="eq-filter-water" value={filterWater} onChange={(e) => setFilterWater(e.target.value)}
                  placeholder="Бутилированная, TDS ~120 ppm" className={fieldClasses} />
              </div>
            </div>
          </div>

          <div>
            <p className="section-label mb-4">Любимые девайсы для фильтра</p>
            <FavoriteDevicePicker
              selectedIds={favoriteDeviceIds}
              onChange={setFavoriteDeviceIds}
              currentUserId={DEMO_USER_ID}
              currentUserName={CURRENT_USER_NAME}
            />
          </div>

          <div className="flex items-center gap-4">
            <button type="submit"
              className="inline-flex items-center justify-center rounded-md bg-ink-900
                         text-parchment-100 font-body font-medium text-sm px-6 py-4
                         hover:bg-ink-800 transition-colors">
              Сохранить оборудование
            </button>
            {justSaved && <p className="text-xs text-ink-700">✓ Сохранено</p>}
          </div>
        </form>

        <Link href="/journey" className="text-sm text-ink-700 underline underline-offset-2 hover:text-ink-900 mt-8 inline-block">
          ← Моё кофейное путешествие
        </Link>
      </div>
    </main>
  );
}
