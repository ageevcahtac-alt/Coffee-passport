'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { getRoasterById } from '@/lib/data/roasters';
import { saveLot } from '@/lib/data/lotsStore';
import { LotBuilderForm, type LotOriginDefaults } from '@/components/roaster/LotBuilderForm';
import { useStaffSession } from '@/lib/auth/staffSession';
import type { Lot } from '@/lib/types/coffee';
import {
  resolveRoasterUuid,
  listCoffeesForRoaster,
  createCoffee,
  listGreenLotsForCoffee,
  createGreenLot,
  createCanonicalLot,
  activateTasteProfile,
  describeCanonicalCoffee,
  describeCanonicalGreenLot,
  type CanonicalCoffee,
  type CanonicalGreenLot,
  type CreateCoffeeInput,
  type CreateGreenLotInput,
} from '@/lib/data/canonicalLotStore';

const fieldClasses =
  'w-full rounded-md border border-ink-200 bg-parchment-100 px-4 py-3 text-sm ' +
  'text-ink-900 placeholder:text-ink-300 focus:border-gold-400';

const primaryButtonClasses =
  'flex-1 inline-flex items-center justify-center rounded-md bg-ink-900 text-parchment-100 ' +
  'font-body font-medium text-sm px-6 py-4 hover:bg-ink-800 transition-colors disabled:opacity-40 disabled:pointer-events-none';

const secondaryButtonClasses =
  'inline-flex items-center justify-center rounded-md border border-ink-200 text-ink-700 ' +
  'font-body font-medium text-sm px-6 py-4 hover:bg-parchment-300 transition-colors disabled:opacity-40 disabled:pointer-events-none';

const dashedButtonClasses =
  'inline-flex items-center justify-center rounded-md border border-dashed border-ink-300 text-ink-700 ' +
  'font-body font-medium text-sm px-6 py-4 hover:bg-parchment-300 transition-colors';

// Coffee-level identity/provenance -> LotBuilderForm's Origin-step defaults
// (Phase 4.5.9). Only the fields both models actually share; Q-grade,
// roast type/profile, descriptors, roaster flavor profile, status and
// in_roaster_catalog all remain Canonical-Lot-only and are never touched
// here — see PHASE_4.5.9_REPORT.md for the full field-ownership audit.
function buildOriginDefaults(coffee: CanonicalCoffee): LotOriginDefaults {
  return {
    country: coffee.country,
    region: coffee.region,
    variety: coffee.variety,
    process: coffee.processing,
    cropYear: coffee.harvestYear,
    farmerName: coffee.producer,
    farmName: coffee.farm,
    altitude: coffee.altitude,
  };
}

type WizardStage = 'coffee' | 'greenLot' | 'lotDetails';
type NewCoffeeValues = Omit<CreateCoffeeInput, 'roasterId'>;
type NewGreenLotValues = Omit<CreateGreenLotInput, 'coffeeId' | 'roasterId'>;

export default function NewLotPage() {
  const router = useRouter();
  const { roasterId } = useStaffSession();
  const roaster = roasterId ? getRoasterById(roasterId) : undefined;

  // undefined = still resolving, null = this roaster has no canonical row yet
  const [roasterUuid, setRoasterUuid] = useState<string | null | undefined>(undefined);
  const [stage, setStage] = useState<WizardStage>('coffee');

  const [coffees, setCoffees] = useState<CanonicalCoffee[] | null>(null);
  const [coffeesError, setCoffeesError] = useState<string | null>(null);
  const [coffee, setCoffee] = useState<CanonicalCoffee | null>(null);
  const [showNewCoffeeForm, setShowNewCoffeeForm] = useState(false);
  const [savingCoffee, setSavingCoffee] = useState(false);
  const [coffeeSaveError, setCoffeeSaveError] = useState<string | null>(null);

  const [greenLots, setGreenLots] = useState<CanonicalGreenLot[] | null>(null);
  const [greenLotsError, setGreenLotsError] = useState<string | null>(null);
  const [greenLot, setGreenLot] = useState<CanonicalGreenLot | null>(null);
  const [showNewGreenLotForm, setShowNewGreenLotForm] = useState(false);
  const [savingGreenLot, setSavingGreenLot] = useState(false);
  const [greenLotSaveError, setGreenLotSaveError] = useState<string | null>(null);

  const [savingLot, setSavingLot] = useState(false);
  const [lotSaveError, setLotSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (!roaster) return;
    let cancelled = false;
    // resolveRoasterUuid bridges via roasters.slug, which in the DB holds
    // the same text id as roaster.id ("roaster-xo") — not the cosmetic
    // catalog roaster.slug ("xo-coffee") used for public URLs/public_id
    // prefixes. Passing roaster.slug here returns null for every real
    // roaster (see resolveRoasterUuid's own doc comment).
    resolveRoasterUuid(roaster.id).then((uuid) => {
      if (cancelled) return;
      setRoasterUuid(uuid);
      if (uuid) loadCoffees(uuid);
    });
    return () => {
      cancelled = true;
    };
    // Re-run only if the resolved roaster identity actually changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roaster?.id]);

  async function loadCoffees(uuid: string) {
    setCoffees(null);
    setCoffeesError(null);
    try {
      setCoffees(await listCoffeesForRoaster(uuid));
    } catch (err) {
      setCoffeesError(err instanceof Error ? err.message : 'Не удалось загрузить список кофе.');
    }
  }

  async function loadGreenLots(coffeeId: string) {
    setGreenLots(null);
    setGreenLotsError(null);
    try {
      setGreenLots(await listGreenLotsForCoffee(coffeeId));
    } catch (err) {
      setGreenLotsError(err instanceof Error ? err.message : 'Не удалось загрузить партии зелёного кофе.');
    }
  }

  function selectCoffee(selected: CanonicalCoffee) {
    setCoffee(selected);
    setGreenLot(null);
    setShowNewCoffeeForm(false);
    setStage('greenLot');
    loadGreenLots(selected.id);
  }

  async function submitNewCoffee(values: NewCoffeeValues) {
    if (!roasterUuid) return;
    setSavingCoffee(true);
    setCoffeeSaveError(null);
    try {
      const created = await createCoffee({ ...values, roasterId: roasterUuid });
      setCoffee(created);
      setGreenLot(null);
      setShowNewCoffeeForm(false);
      setStage('greenLot');
      loadGreenLots(created.id);
    } catch (err) {
      setCoffeeSaveError(err instanceof Error ? err.message : 'Не удалось создать кофе.');
    } finally {
      setSavingCoffee(false);
    }
  }

  function selectGreenLot(selected: CanonicalGreenLot) {
    setGreenLot(selected);
    setShowNewGreenLotForm(false);
    setStage('lotDetails');
  }

  async function submitNewGreenLot(values: NewGreenLotValues) {
    if (!roasterUuid || !coffee) return;
    setSavingGreenLot(true);
    setGreenLotSaveError(null);
    try {
      const created = await createGreenLot({ ...values, coffeeId: coffee.id, roasterId: roasterUuid });
      setGreenLot(created);
      setShowNewGreenLotForm(false);
      setStage('lotDetails');
    } catch (err) {
      setGreenLotSaveError(err instanceof Error ? err.message : 'Не удалось создать партию.');
    } finally {
      setSavingGreenLot(false);
    }
  }

  async function handleLotSave(lot: Lot) {
    if (!roaster || !roasterUuid || !coffee || !greenLot) return;
    setSavingLot(true);
    setLotSaveError(null);
    try {
      const canonicalLot = await createCanonicalLot({
        roasterUuid,
        roasterSlug: roaster.slug,
        country: coffee.country,
        greenLotId: greenLot.id,
        name: lot.name,
        descriptors: lot.descriptors,
        qGrade: lot.qGrade,
        roastType: lot.roastType,
        roastProfileLabel: lot.roastProfile,
        inRoasterCatalog: lot.inRoasterCatalog,
      });
      // Activates this Lot's first Reference Taste Profile version from the
      // sliders LotBuilderForm already collected — without this, every guest
      // on a fresh browser would see an all-zero "roaster's reference" on
      // the Passport (see activateTasteProfile's own comment).
      await activateTasteProfile(canonicalLot.id, lot.roasterFlavorProfile);
      saveLot({ ...lot, id: canonicalLot.publicId });
      router.push('/dashboard/roaster');
    } catch (err) {
      setLotSaveError(err instanceof Error ? err.message : 'Не удалось создать лот.');
      setSavingLot(false);
    }
  }

  // Production readiness hardening (COFFEE_PASSPORT_PRODUCTION_READINESS_AUDIT.md):
  // getRoasterById only ever finds a roaster among the hardcoded seed list
  // merged with this browser's own localStorage overrides — it never
  // queries Supabase's real `roasters` table. A signed-in roaster_admin
  // whose profiles.roaster_id doesn't match one of the few seed roasters
  // (any roaster onboarded through the real Canonical Lot pipeline, on a
  // fresh browser) used to hit `return null` here: an indefinite blank
  // screen with no explanation, no retry. An explicit message beats that.
  if (!roaster) {
    return (
      <main className="min-h-dvh flex flex-col items-center justify-center px-6 text-center">
        <h1 className="font-display text-2xl text-ink-900 mb-2">Обжарщик не настроен</h1>
        <p className="text-ink-500 text-sm">
          Для вашего аккаунта не найден профиль обжарщика. Обратитесь к администратору.
        </p>
      </main>
    );
  }

  return (
    <main className="min-h-dvh px-6 py-16">
      <div className="max-w-md mx-auto w-full">
        <p className="text-xs uppercase tracking-widest2 text-ink-400 font-body mb-2">{roaster.name}</p>
        <h1 className="font-display text-2xl text-ink-900 mb-8">Новый лот</h1>

        {roasterUuid === undefined && <p className="text-sm text-ink-400">Загрузка...</p>}

        {roasterUuid === null && (
          <p className="text-sm text-red-600">
            Этот обжарщик ещё не подключён к каноническому каталогу лотов. Обратитесь к администратору.
          </p>
        )}

        {roasterUuid && stage === 'coffee' && (
          <CoffeeStep
            coffees={coffees}
            error={coffeesError}
            showNewForm={showNewCoffeeForm}
            saving={savingCoffee}
            saveError={coffeeSaveError}
            onSelect={selectCoffee}
            onShowNewForm={() => setShowNewCoffeeForm(true)}
            onCancelNewForm={() => setShowNewCoffeeForm(false)}
            onSubmitNew={submitNewCoffee}
            onCancel={() => router.push('/dashboard/roaster')}
          />
        )}

        {roasterUuid && coffee && stage === 'greenLot' && (
          <GreenLotStep
            coffee={coffee}
            greenLots={greenLots}
            error={greenLotsError}
            showNewForm={showNewGreenLotForm}
            saving={savingGreenLot}
            saveError={greenLotSaveError}
            onSelect={selectGreenLot}
            onShowNewForm={() => setShowNewGreenLotForm(true)}
            onCancelNewForm={() => setShowNewGreenLotForm(false)}
            onSubmitNew={submitNewGreenLot}
            onBack={() => {
              setStage('coffee');
              setShowNewGreenLotForm(false);
            }}
          />
        )}

        {roasterUuid && coffee && greenLot && stage === 'lotDetails' && (
          <div className="flex flex-col gap-6">
            <div className="rounded-md border border-ink-200 bg-parchment-100 p-4 text-xs text-ink-500">
              <p>
                <span className="text-ink-400">Кофе: </span>
                {describeCanonicalCoffee(coffee)}
              </p>
              <p className="mt-1">
                <span className="text-ink-400">Партия: </span>
                {describeCanonicalGreenLot(greenLot)}
              </p>
              <button
                type="button"
                onClick={() => setStage('greenLot')}
                className="mt-2 text-ink-700 underline underline-offset-2 hover:text-ink-900"
              >
                Изменить происхождение
              </button>
            </div>

            {lotSaveError && <p className="text-sm text-red-600">{lotSaveError}</p>}
            {savingLot && <p className="text-xs text-ink-400">Сохранение лота...</p>}

            <LotBuilderForm
              roaster={roaster}
              // Phase 4.5.9 — seeds the blank Origin step from the Coffee
              // just selected or created above, instead of the roaster
              // re-typing identity/provenance data that already exists on
              // the real canonical Coffee row. `coffee` here is always the
              // actual created/selected row (selectCoffee/submitNewCoffee
              // both set it from a real Supabase round trip) — never a
              // hardcoded guess. Still just a starting value: every field
              // stays a normal editable input below.
              initialOrigin={buildOriginDefaults(coffee)}
              onSave={handleLotSave}
              onCancel={() => setStage('greenLot')}
            />
          </div>
        )}
      </div>
    </main>
  );
}

function CoffeeStep({
  coffees,
  error,
  showNewForm,
  saving,
  saveError,
  onSelect,
  onShowNewForm,
  onCancelNewForm,
  onSubmitNew,
  onCancel,
}: {
  coffees: CanonicalCoffee[] | null;
  error: string | null;
  showNewForm: boolean;
  saving: boolean;
  saveError: string | null;
  onSelect: (coffee: CanonicalCoffee) => void;
  onShowNewForm: () => void;
  onCancelNewForm: () => void;
  onSubmitNew: (values: NewCoffeeValues) => void;
  onCancel: () => void;
}) {
  if (showNewForm) {
    return <NewCoffeeForm saving={saving} saveError={saveError} onSubmit={onSubmitNew} onCancel={onCancelNewForm} />;
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="section-label mb-2">Кофе</p>
        <p className="text-xs text-ink-400">
          Кофе описывает происхождение — страну, регион, ферму. Выберите уже существующий или добавьте новый.
        </p>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {coffees === null && !error && <p className="text-sm text-ink-400">Загрузка...</p>}
      {coffees && coffees.length === 0 && <p className="text-sm text-ink-400">У этого обжарщика пока нет ни одного кофе.</p>}

      {coffees && coffees.length > 0 && (
        <div className="flex flex-col gap-2">
          {coffees.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => onSelect(c)}
              className="text-left rounded-md border border-ink-200 bg-parchment-100 p-4 hover:border-gold-400 transition-colors"
            >
              <p className="text-sm text-ink-900 font-medium">{describeCanonicalCoffee(c)}</p>
              {(c.variety || c.processing) && (
                <p className="text-xs text-ink-400 mt-1">{[c.variety, c.processing].filter(Boolean).join(' · ')}</p>
              )}
            </button>
          ))}
        </div>
      )}

      <button type="button" onClick={onShowNewForm} className={dashedButtonClasses}>
        + Создать новый кофе
      </button>

      <button type="button" onClick={onCancel} className={secondaryButtonClasses}>
        Отмена
      </button>
    </div>
  );
}

function NewCoffeeForm({
  saving,
  saveError,
  onSubmit,
  onCancel,
}: {
  saving: boolean;
  saveError: string | null;
  onSubmit: (values: NewCoffeeValues) => void;
  onCancel: () => void;
}) {
  const [country, setCountry] = useState('');
  const [region, setRegion] = useState('');
  const [farm, setFarm] = useState('');
  const [producer, setProducer] = useState('');
  const [variety, setVariety] = useState('');
  const [altitude, setAltitude] = useState('');
  const [processing, setProcessing] = useState('');
  const [harvestYear, setHarvestYear] = useState('');

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!country.trim()) return;
    onSubmit({
      country: country.trim(),
      region: region.trim() || undefined,
      farm: farm.trim() || undefined,
      producer: producer.trim() || undefined,
      variety: variety.trim() || undefined,
      altitude: altitude.trim() || undefined,
      processing: processing.trim() || undefined,
      harvestYear: harvestYear.trim() || undefined,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <p className="section-label">Новый кофе</p>
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
          {saving ? 'Создание...' : 'Создать кофе'}
        </button>
      </div>
    </form>
  );
}

function GreenLotStep({
  coffee,
  greenLots,
  error,
  showNewForm,
  saving,
  saveError,
  onSelect,
  onShowNewForm,
  onCancelNewForm,
  onSubmitNew,
  onBack,
}: {
  coffee: CanonicalCoffee;
  greenLots: CanonicalGreenLot[] | null;
  error: string | null;
  showNewForm: boolean;
  saving: boolean;
  saveError: string | null;
  onSelect: (greenLot: CanonicalGreenLot) => void;
  onShowNewForm: () => void;
  onCancelNewForm: () => void;
  onSubmitNew: (values: NewGreenLotValues) => void;
  onBack: () => void;
}) {
  if (showNewForm) {
    return <NewGreenLotForm saving={saving} saveError={saveError} onSubmit={onSubmitNew} onCancel={onCancelNewForm} />;
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="section-label mb-2">Партия зелёного кофе</p>
        <p className="text-xs text-ink-400">
          {describeCanonicalCoffee(coffee)} — выберите уже закупленную физическую партию зерна или добавьте новую (например,
          если тот же кофе закупается повторно).
        </p>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {greenLots === null && !error && <p className="text-sm text-ink-400">Загрузка...</p>}
      {greenLots && greenLots.length === 0 && (
        <p className="text-sm text-ink-400">Для этого кофе ещё нет закупленных партий.</p>
      )}

      {greenLots && greenLots.length > 0 && (
        <div className="flex flex-col gap-2">
          {greenLots.map((g) => (
            <button
              key={g.id}
              type="button"
              onClick={() => onSelect(g)}
              className="text-left rounded-md border border-ink-200 bg-parchment-100 p-4 hover:border-gold-400 transition-colors"
            >
              <p className="text-sm text-ink-900 font-medium">{describeCanonicalGreenLot(g)}</p>
            </button>
          ))}
        </div>
      )}

      <button type="button" onClick={onShowNewForm} className={dashedButtonClasses}>
        + Создать новую партию
      </button>

      <button type="button" onClick={onBack} className={secondaryButtonClasses}>
        ← Назад к кофе
      </button>
    </div>
  );
}

function NewGreenLotForm({
  saving,
  saveError,
  onSubmit,
  onCancel,
}: {
  saving: boolean;
  saveError: string | null;
  onSubmit: (values: NewGreenLotValues) => void;
  onCancel: () => void;
}) {
  const [purchasedKg, setPurchasedKg] = useState('');
  const [purchaseDate, setPurchaseDate] = useState('');
  const [contractReference, setContractReference] = useState('');
  const [notes, setNotes] = useState('');

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    onSubmit({
      purchasedKg: purchasedKg.trim() ? Number(purchasedKg) : null,
      purchaseDate: purchaseDate.trim() || null,
      contractReference: contractReference.trim() || undefined,
      notes: notes.trim() || undefined,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <p className="section-label">Новая партия зелёного кофе</p>
      {saveError && <p className="text-sm text-red-600">{saveError}</p>}

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="gl-kg" className="block text-xs text-ink-400 mb-1.5">
            Закупленный вес, кг
          </label>
          <input
            id="gl-kg"
            type="number"
            step="0.1"
            min="0"
            value={purchasedKg}
            onChange={(e) => setPurchasedKg(e.target.value)}
            className={fieldClasses}
          />
        </div>
        <div>
          <label htmlFor="gl-date" className="block text-xs text-ink-400 mb-1.5">
            Дата закупки
          </label>
          <input
            id="gl-date"
            type="date"
            value={purchaseDate}
            onChange={(e) => setPurchaseDate(e.target.value)}
            className={fieldClasses}
          />
        </div>
      </div>
      <div>
        <label htmlFor="gl-contract" className="block text-xs text-ink-400 mb-1.5">
          Номер контракта
        </label>
        <input
          id="gl-contract"
          value={contractReference}
          onChange={(e) => setContractReference(e.target.value)}
          className={fieldClasses}
        />
      </div>
      <div>
        <label htmlFor="gl-notes" className="block text-xs text-ink-400 mb-1.5">
          Заметки
        </label>
        <textarea id="gl-notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} className={fieldClasses} />
      </div>

      <div className="flex gap-3">
        <button type="button" onClick={onCancel} disabled={saving} className={secondaryButtonClasses}>
          Отмена
        </button>
        <button type="submit" disabled={saving} className={primaryButtonClasses}>
          {saving ? 'Сохранение...' : 'Создать партию'}
        </button>
      </div>
    </form>
  );
}
