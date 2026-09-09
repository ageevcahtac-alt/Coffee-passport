'use client';

import { useState, type FormEvent } from 'react';
import type { CanonicalCoffee } from '@/lib/data/canonicalLotStore';

const fieldClasses =
  'w-full rounded-md border border-ink-200 bg-parchment-100 px-4 py-3 text-sm ' +
  'text-ink-900 placeholder:text-ink-300 focus:border-gold-400';

const primaryButtonClasses =
  'flex-1 inline-flex items-center justify-center rounded-md bg-ink-900 text-parchment-100 ' +
  'font-body font-medium text-sm px-6 py-4 hover:bg-ink-800 transition-colors disabled:opacity-40 disabled:pointer-events-none';

const secondaryButtonClasses =
  'inline-flex items-center justify-center rounded-md border border-ink-200 text-ink-700 ' +
  'font-body font-medium text-sm px-6 py-4 hover:bg-parchment-300 transition-colors disabled:opacity-40 disabled:pointer-events-none';

export interface CoffeeFormValues {
  country: string;
  region: string;
  farm: string;
  producer: string;
  variety: string;
  altitude: string;
  processing: string;
  harvestYear: string;
}

// COFFEE_GREEN_LOT_EDIT_PATHS_IMPLEMENTATION.md — the same 8-field Coffee
// form, shared between creation (app/dashboard/roaster/new/page.tsx,
// blank/no initialCoffee) and editing (components/roaster/CanonicalLotChain.tsx,
// pre-filled from the real row). Only the submit button label and the
// starting values differ between the two modes — the fields, validation,
// and layout are identical, so this is one component, not two.
export function CoffeeForm({
  initialCoffee,
  saving,
  saveError,
  onSubmit,
  onCancel,
}: {
  initialCoffee?: CanonicalCoffee;
  saving: boolean;
  saveError: string | null;
  onSubmit: (values: CoffeeFormValues) => void;
  onCancel: () => void;
}) {
  const isEditing = Boolean(initialCoffee);
  const [country, setCountry] = useState(initialCoffee?.country ?? '');
  const [region, setRegion] = useState(initialCoffee?.region ?? '');
  const [farm, setFarm] = useState(initialCoffee?.farm ?? '');
  const [producer, setProducer] = useState(initialCoffee?.producer ?? '');
  const [variety, setVariety] = useState(initialCoffee?.variety ?? '');
  const [altitude, setAltitude] = useState(initialCoffee?.altitude ?? '');
  const [processing, setProcessing] = useState(initialCoffee?.processing ?? '');
  const [harvestYear, setHarvestYear] = useState(initialCoffee?.harvestYear ?? '');

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!country.trim()) return;
    onSubmit({
      country: country.trim(),
      region: region.trim(),
      farm: farm.trim(),
      producer: producer.trim(),
      variety: variety.trim(),
      altitude: altitude.trim(),
      processing: processing.trim(),
      harvestYear: harvestYear.trim(),
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <p className="section-label">{isEditing ? 'Редактировать кофе' : 'Новый кофе'}</p>
      {saveError && <p className="text-sm text-red-600">{saveError}</p>}

      <div>
        <label htmlFor="coffee-country" className="block text-xs text-ink-400 mb-1.5">
          Страна происхождения *
        </label>
        <input
          id="coffee-country"
          value={country}
          onChange={(e) => setCountry(e.target.value)}
          placeholder="Ethiopia"
          required
          className={fieldClasses}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="coffee-region" className="block text-xs text-ink-400 mb-1.5">
            Регион
          </label>
          <input id="coffee-region" value={region} onChange={(e) => setRegion(e.target.value)} className={fieldClasses} />
        </div>
        <div>
          <label htmlFor="coffee-farm" className="block text-xs text-ink-400 mb-1.5">
            Ферма / станция
          </label>
          <input id="coffee-farm" value={farm} onChange={(e) => setFarm(e.target.value)} className={fieldClasses} />
        </div>
      </div>
      <div>
        <label htmlFor="coffee-producer" className="block text-xs text-ink-400 mb-1.5">
          Производитель / кооператив
        </label>
        <input id="coffee-producer" value={producer} onChange={(e) => setProducer(e.target.value)} className={fieldClasses} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="coffee-variety" className="block text-xs text-ink-400 mb-1.5">
            Разновидность
          </label>
          <input id="coffee-variety" value={variety} onChange={(e) => setVariety(e.target.value)} className={fieldClasses} />
        </div>
        <div>
          <label htmlFor="coffee-processing" className="block text-xs text-ink-400 mb-1.5">
            Способ обработки
          </label>
          <input
            id="coffee-processing"
            value={processing}
            onChange={(e) => setProcessing(e.target.value)}
            className={fieldClasses}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="coffee-altitude" className="block text-xs text-ink-400 mb-1.5">
            Высота произрастания
          </label>
          <input id="coffee-altitude" value={altitude} onChange={(e) => setAltitude(e.target.value)} className={fieldClasses} />
        </div>
        <div>
          <label htmlFor="coffee-harvest" className="block text-xs text-ink-400 mb-1.5">
            Год урожая
          </label>
          <input
            id="coffee-harvest"
            value={harvestYear}
            onChange={(e) => setHarvestYear(e.target.value)}
            className={fieldClasses}
          />
        </div>
      </div>

      <div className="flex gap-3">
        <button type="button" onClick={onCancel} disabled={saving} className={secondaryButtonClasses}>
          Отмена
        </button>
        <button type="submit" disabled={saving || !country.trim()} className={primaryButtonClasses}>
          {saving ? 'Сохранение...' : isEditing ? 'Сохранить изменения' : 'Создать кофе'}
        </button>
      </div>
    </form>
  );
}
