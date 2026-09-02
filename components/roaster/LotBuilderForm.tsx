'use client';

import { useMemo, useState, type FormEvent } from 'react';
import type { Lot, RoastType, Roaster } from '@/lib/types/coffee';
import { ROAST_TYPE_LABELS } from '@/lib/types/coffee';
import { generateLotId } from '@/lib/data/lotsStore';
import { FlavorSlider } from '@/components/coffee/FlavorSlider';

const ROAST_TYPES: RoastType[] = ['filter', 'espresso', 'omni', 'alternative'];

const fieldClasses =
  'w-full rounded-md border border-ink-200 bg-parchment-100 px-4 py-3 text-sm ' +
  'text-ink-900 placeholder:text-ink-300 focus:border-gold-400';

interface LotFormState {
  name: string;
  country: string;
  region: string;
  variety: string;
  process: string;
  roastType: RoastType;
  qGrade: string;
  cropYear: string;
  descriptors: string;
  acidity: number;
  sweetness: number;
  body: number;
  bitterness: number;
  farmerName: string;
  farmName: string;
  altitude: string;
  story: string;
  inRoasterCatalog: boolean;
}

function toFormState(lot?: Lot): LotFormState {
  if (!lot) {
    return {
      name: '',
      country: '',
      region: '',
      variety: '',
      process: '',
      roastType: 'filter',
      qGrade: '',
      cropYear: '',
      descriptors: '',
      acidity: 3,
      sweetness: 3,
      body: 3,
      bitterness: 3,
      farmerName: '',
      farmName: '',
      altitude: '',
      story: '',
      inRoasterCatalog: true,
    };
  }
  return {
    name: lot.name,
    country: lot.country,
    region: lot.region,
    variety: lot.variety,
    process: lot.process,
    roastType: lot.roastType,
    qGrade: String(lot.qGrade),
    cropYear: lot.cropYear,
    descriptors: lot.descriptors.join(', '),
    acidity: lot.roasterFlavorProfile.acidity,
    sweetness: lot.roasterFlavorProfile.sweetness,
    body: lot.roasterFlavorProfile.body,
    bitterness: lot.roasterFlavorProfile.bitterness,
    farmerName: lot.producer.farmerName,
    farmName: lot.producer.farmName,
    altitude: lot.producer.altitude,
    story: lot.producer.story,
    inRoasterCatalog: lot.inRoasterCatalog,
  };
}

// Creating a brand-new lot walks through 4 steps, origin first — a Q-grader
// can't meaningfully price or grade a lot without already knowing whose
// cherry it is, so Country + Farmer/Station are gated as required before
// the rest of the form unlocks. Editing an existing lot skips the wizard
// entirely and shows every field on one screen: by then the origin data
// already exists and re-walking steps to fix a typo in, say, the Q-Score
// would just be friction.
const STEPS = ['Происхождение', 'О лоте', 'Метрики и вкус', 'История'] as const;

export function LotBuilderForm({
  roaster,
  initialLot,
  onSave,
  onCancel,
  // The "доступен для заказа кофейнями" flag is the roaster's own catalog
  // switch (see Lot.inRoasterCatalog) — this form is also reused by the
  // coffee shop's own "Редактировать карточку лота" screen
  // (app/dashboard/cafe/[lotId]/edit), which must not be able to touch it,
  // per the task's roaster/cafe separation-of-responsibility rule.
  canEditCatalogFlag = true,
}: {
  roaster: Roaster;
  initialLot?: Lot;
  onSave: (lot: Lot) => void;
  onCancel?: () => void;
  canEditCatalogFlag?: boolean;
}) {
  const isCreating = !initialLot;
  const [form, setForm] = useState<LotFormState>(() => toFormState(initialLot));
  const [step, setStep] = useState(0);

  // New lots get a live-generated id as soon as a country is entered;
  // editing an existing lot always keeps its original id.
  const lotId = useMemo(() => {
    if (initialLot) return initialLot.id;
    return form.country.trim() ? generateLotId(roaster, form.country) : null;
  }, [initialLot, roaster, form.country]);

  function update<K extends keyof LotFormState>(key: K, value: LotFormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  const canSave = Boolean(lotId && form.name.trim() && form.country.trim());

  const canLeaveOriginStep = Boolean(
    form.country.trim() && form.farmerName.trim() && form.farmName.trim()
  );
  const canLeaveLotStep = Boolean(form.name.trim());
  const canLeaveMetricsStep = form.qGrade.trim() !== '';

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!lotId) return;

    const lot: Lot = {
      id: lotId,
      roasterId: roaster.id,
      name: form.name.trim(),
      country: form.country.trim(),
      region: form.region.trim(),
      variety: form.variety.trim(),
      process: form.process.trim(),
      cropYear: form.cropYear.trim(),
      qGrade: Number(form.qGrade) || 0,
      roastProfile: initialLot?.roastProfile ?? 'Pure Roast®',
      roastType: form.roastType,
      descriptors: form.descriptors
        .split(',')
        .map((descriptor) => descriptor.trim())
        .filter(Boolean),
      roasterFlavorProfile: {
        acidity: form.acidity,
        sweetness: form.sweetness,
        body: form.body,
        bitterness: form.bitterness,
      },
      producer: {
        farmerName: form.farmerName.trim(),
        farmName: form.farmName.trim(),
        altitude: form.altitude.trim(),
        story: form.story.trim(),
      },
      inRoasterCatalog: form.inRoasterCatalog,
    };

    onSave(lot);
  }

  const showOrigin = !isCreating || step === 0;
  const showLotBasics = !isCreating || step === 1;
  const showMetrics = !isCreating || step === 2;
  const showStory = !isCreating || step === 3;

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-10">
      {isCreating && (
        <div className="flex items-center gap-2" role="tablist" aria-label="Шаги создания лота">
          {STEPS.map((label, i) => (
            <div key={label} className="flex-1 flex flex-col items-center gap-1.5">
              <div
                className={`h-1.5 w-full rounded-full transition-colors ${
                  i <= step ? 'bg-gold-400' : 'bg-ink-200'
                }`}
              />
              <span
                className={`text-[10px] text-center ${i === step ? 'text-ink-900 font-medium' : 'text-ink-400'}`}
              >
                {label}
              </span>
            </div>
          ))}
        </div>
      )}

      {showOrigin && (
        <div>
          <p className="section-label mb-4">Происхождение</p>
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="lot-country" className="block text-xs text-ink-400 mb-1.5">
                  Страна происхождения *
                </label>
                <input
                  id="lot-country"
                  value={form.country}
                  onChange={(e) => update('country', e.target.value)}
                  placeholder="Ethiopia"
                  required
                  className={fieldClasses}
                />
              </div>
              <div>
                <label htmlFor="lot-region" className="block text-xs text-ink-400 mb-1.5">
                  Регион
                </label>
                <input
                  id="lot-region"
                  value={form.region}
                  onChange={(e) => update('region', e.target.value)}
                  placeholder="Guji"
                  className={fieldClasses}
                />
              </div>
            </div>
            <div>
              <label htmlFor="lot-farmer" className="block text-xs text-ink-400 mb-1.5">
                Имя фермера / Кооператив *
              </label>
              <input
                id="lot-farmer"
                value={form.farmerName}
                onChange={(e) => update('farmerName', e.target.value)}
                placeholder="Kochere Cooperative"
                required={isCreating}
                className={fieldClasses}
              />
            </div>
            <div>
              <label htmlFor="lot-farm" className="block text-xs text-ink-400 mb-1.5">
                Ферма / Станция мойки *
              </label>
              <input
                id="lot-farm"
                value={form.farmName}
                onChange={(e) => update('farmName', e.target.value)}
                placeholder="Guji Hambela Washing Station"
                required={isCreating}
                className={fieldClasses}
              />
            </div>
            <div>
              <label htmlFor="lot-altitude" className="block text-xs text-ink-400 mb-1.5">
                Высота произрастания
              </label>
              <input
                id="lot-altitude"
                value={form.altitude}
                onChange={(e) => update('altitude', e.target.value)}
                placeholder="1900–2100 м"
                className={fieldClasses}
              />
            </div>
          </div>
        </div>
      )}

      {showLotBasics && (
        <div>
          <p className="section-label mb-4">О лоте</p>
          <div className="flex flex-col gap-3">
            <div>
              <label htmlFor="lot-name" className="block text-xs text-ink-400 mb-1.5">
                Название лота
              </label>
              <input
                id="lot-name"
                value={form.name}
                onChange={(e) => update('name', e.target.value)}
                placeholder="Ethiopia Guji"
                required
                className={fieldClasses}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="lot-variety" className="block text-xs text-ink-400 mb-1.5">
                  Разновидность
                </label>
                <input
                  id="lot-variety"
                  value={form.variety}
                  onChange={(e) => update('variety', e.target.value)}
                  placeholder="Heirloom"
                  className={fieldClasses}
                />
              </div>
              <div>
                <label htmlFor="lot-process" className="block text-xs text-ink-400 mb-1.5">
                  Способ обработки
                </label>
                <input
                  id="lot-process"
                  value={form.process}
                  onChange={(e) => update('process', e.target.value)}
                  placeholder="Washed"
                  className={fieldClasses}
                />
              </div>
            </div>
            <div>
              <label htmlFor="lot-cropyear" className="block text-xs text-ink-400 mb-1.5">
                Год урожая
              </label>
              <input
                id="lot-cropyear"
                value={form.cropYear}
                onChange={(e) => update('cropYear', e.target.value)}
                placeholder="2025/2026"
                className={fieldClasses}
              />
            </div>
            <div>
              <label htmlFor="lot-descriptors" className="block text-xs text-ink-400 mb-1.5">
                Дескрипторы вкуса (через запятую)
              </label>
              <input
                id="lot-descriptors"
                value={form.descriptors}
                onChange={(e) => update('descriptors', e.target.value)}
                placeholder="Peach, Jasmine, Citrus, Honey"
                className={fieldClasses}
              />
            </div>
            <div>
              <span className="block text-xs text-ink-400 mb-2">Назначение обжарки</span>
              <div className="grid grid-cols-4 gap-2">
                {ROAST_TYPES.map((type) => {
                  const checked = form.roastType === type;
                  return (
                    <label
                      key={type}
                      className={`flex items-center justify-center text-center rounded-md border
                                  px-2 py-3 text-xs cursor-pointer transition-colors
                                  ${checked
                                    ? 'border-gold-400 bg-gold-400/10 text-ink-900 font-medium'
                                    : 'border-ink-200 bg-parchment-100 text-ink-700'}`}
                    >
                      <input
                        type="radio"
                        name="roastType"
                        value={type}
                        checked={checked}
                        onChange={() => update('roastType', type)}
                        className="sr-only"
                      />
                      {ROAST_TYPE_LABELS[type]}
                    </label>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {showMetrics && (
        <div>
          <p className="section-label mb-4">Экспертные метрики</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="lot-qgrade" className="block text-xs text-ink-400 mb-1.5">
                Q-Score
              </label>
              <input
                id="lot-qgrade"
                type="number"
                step="0.1"
                min="0"
                max="100"
                value={form.qGrade}
                onChange={(e) => update('qGrade', e.target.value)}
                placeholder="87.0"
                required
                className={fieldClasses}
              />
            </div>
            {lotId && (
              <div className="flex items-end">
                <p className="text-xs text-ink-400">
                  ID лота: <span className="data-value text-ink-700">{lotId}</span>
                </p>
              </div>
            )}
          </div>

          <p className="section-label mt-8 mb-4">Профиль вкуса от обжарщика</p>
          <div className="flex flex-col gap-5">
            <FlavorSlider label="Кислотность" value={form.acidity} onChange={(v) => update('acidity', v)} />
            <FlavorSlider label="Сладость" value={form.sweetness} onChange={(v) => update('sweetness', v)} />
            <FlavorSlider label="Плотность" value={form.body} onChange={(v) => update('body', v)} />
            <FlavorSlider label="Горечь" value={form.bitterness} onChange={(v) => update('bitterness', v)} />
          </div>
        </div>
      )}

      {showStory && (
        <div>
          <label htmlFor="lot-story" className="section-label mb-4 block">
            История происхождения
          </label>
          <textarea
            id="lot-story"
            rows={5}
            value={form.story}
            onChange={(e) => update('story', e.target.value)}
            placeholder="Расскажите о терруаре, фермере и тонкостях обжарки…"
            className={fieldClasses}
          />
        </div>
      )}

      {showStory && canEditCatalogFlag && (
        <div>
          <p className="section-label mb-4">Каталог обжарщика</p>
          <div className="flex items-start justify-between gap-4 rounded-md border border-ink-200 bg-parchment-100 p-4">
            <div>
              <p className="text-sm text-ink-900 mb-1">Доступен для заказа кофейнями</p>
              <p className="text-xs text-ink-400">
                Отключите, если лот снят с производства. Кофейни, уже добавившие его в своё меню,
                продолжат его показывать — тумблер только закрывает заказ новых партий.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={form.inRoasterCatalog}
              aria-label="Доступен для заказа кофейнями"
              onClick={() => update('inRoasterCatalog', !form.inRoasterCatalog)}
              className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full
                          transition-colors ${form.inRoasterCatalog ? 'bg-ink-900' : 'bg-ink-200'}`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-parchment-100
                            transition-transform ${form.inRoasterCatalog ? 'translate-x-6' : 'translate-x-1'}`}
              />
            </button>
          </div>
        </div>
      )}

      <div className="flex gap-3">
        {isCreating && step > 0 && (
          <button
            type="button"
            onClick={() => setStep((prev) => prev - 1)}
            className="inline-flex items-center justify-center rounded-md border border-ink-200
                       text-ink-700 font-body font-medium text-sm px-6 py-4
                       hover:bg-parchment-300 transition-colors"
          >
            ← Назад
          </button>
        )}
        {isCreating && step === 0 && onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex items-center justify-center rounded-md border border-ink-200
                       text-ink-700 font-body font-medium text-sm px-6 py-4
                       hover:bg-parchment-300 transition-colors"
          >
            Отмена
          </button>
        )}
        {!isCreating && onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex items-center justify-center rounded-md border border-ink-200
                       text-ink-700 font-body font-medium text-sm px-6 py-4
                       hover:bg-parchment-300 transition-colors"
          >
            Отмена
          </button>
        )}

        {isCreating && step < STEPS.length - 1 ? (
          <button
            type="button"
            onClick={() => setStep((prev) => prev + 1)}
            disabled={
              (step === 0 && !canLeaveOriginStep) ||
              (step === 1 && !canLeaveLotStep) ||
              (step === 2 && !canLeaveMetricsStep)
            }
            className="flex-1 inline-flex items-center justify-center rounded-md bg-ink-900
                       text-parchment-100 font-body font-medium text-sm px-6 py-4
                       hover:bg-ink-800 transition-colors disabled:opacity-40 disabled:pointer-events-none"
          >
            Далее →
          </button>
        ) : (
          <button
            type="submit"
            disabled={!canSave}
            className="flex-1 inline-flex items-center justify-center rounded-md bg-ink-900
                       text-parchment-100 font-body font-medium text-sm px-6 py-4
                       hover:bg-ink-800 transition-colors disabled:opacity-40 disabled:pointer-events-none"
          >
            {initialLot ? 'Сохранить изменения' : 'Создать паспорт лота'}
          </button>
        )}
      </div>
    </form>
  );
}
