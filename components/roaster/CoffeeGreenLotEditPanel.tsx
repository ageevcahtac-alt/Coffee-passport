'use client';

import { useEffect, useState } from 'react';
import {
  findCanonicalLotByPublicId,
  getGreenLotById,
  getCoffeeById,
  updateCoffee,
  updateGreenLot,
  describeCanonicalCoffee,
  describeCanonicalGreenLot,
  type CanonicalCoffee,
  type CanonicalGreenLot,
} from '@/lib/data/canonicalLotStore';
import { CoffeeForm, type CoffeeFormValues } from './CoffeeForm';
import { GreenLotForm, type GreenLotFormValues } from './GreenLotForm';

// COFFEE_GREEN_LOT_EDIT_PATHS_IMPLEMENTATION.md — closes the "no edit path
// exists for Coffee/Green Lot, for anyone" gap
// (COFFEE_GREEN_LOT_OWNERSHIP_AUDIT.md / COFFEE_PASSPORT_END_TO_END_ARCHITECTURE_AUDIT.md
// findings #2/#3). Deliberately its own component, separate from the
// existing read-only components/roaster/CanonicalLotChain.tsx — it does its
// own small Coffee/Green Lot fetch (the same lot -> green lot -> coffee
// chain, one extra round trip) rather than being folded into that
// component, so this addition stays a clean, independently reviewable
// unit. Rendered only on the roaster's own Lot-edit page
// (app/dashboard/roaster/[lotId]/edit/page.tsx, gated by requireStaffRole
// for roaster_admin) — never on café's read-only Lot-edit screen.
//
// Editing Coffee only ever patches `coffees`; editing Green Lot only ever
// patches `green_lots` (updateCoffee/updateGreenLot, RLS-gated by the same
// "roaster staff manage own coffees/green lots" policies createCoffee/
// createGreenLot already run under — no RLS change was made). Neither can
// touch the other, and neither can touch this Canonical Lot or any sibling
// Lot built on the same Green Lot — success is reflected immediately by
// updating this component's own state with the real Supabase-returned
// values, not a full page reload.
export function CoffeeGreenLotEditPanel({ publicId }: { publicId: string }) {
  const [greenLot, setGreenLot] = useState<CanonicalGreenLot | null | undefined>(undefined);
  const [coffee, setCoffee] = useState<CanonicalCoffee | null | undefined>(undefined);

  const [editingCoffee, setEditingCoffee] = useState(false);
  const [savingCoffee, setSavingCoffee] = useState(false);
  const [coffeeSaveError, setCoffeeSaveError] = useState<string | null>(null);

  const [editingGreenLot, setEditingGreenLot] = useState(false);
  const [savingGreenLot, setSavingGreenLot] = useState(false);
  const [greenLotSaveError, setGreenLotSaveError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setGreenLot(undefined);
    setCoffee(undefined);

    findCanonicalLotByPublicId(publicId).then(async (lot) => {
      if (cancelled) return;
      if (!lot) {
        setGreenLot(null);
        setCoffee(null);
        return;
      }
      const foundGreenLot = await getGreenLotById(lot.greenLotId);
      if (cancelled) return;
      setGreenLot(foundGreenLot);
      if (!foundGreenLot) {
        setCoffee(null);
        return;
      }
      const foundCoffee = await getCoffeeById(foundGreenLot.coffeeId);
      if (!cancelled) setCoffee(foundCoffee);
    });

    return () => {
      cancelled = true;
    };
  }, [publicId]);

  async function handleCoffeeSave(values: CoffeeFormValues) {
    if (!coffee) return;
    setSavingCoffee(true);
    setCoffeeSaveError(null);
    try {
      await updateCoffee(coffee.id, values);
      setCoffee({ ...coffee, ...values });
      setEditingCoffee(false);
    } catch (err) {
      setCoffeeSaveError(err instanceof Error ? err.message : 'Не удалось сохранить изменения кофе.');
    } finally {
      setSavingCoffee(false);
    }
  }

  async function handleGreenLotSave(values: GreenLotFormValues) {
    if (!greenLot) return;
    setSavingGreenLot(true);
    setGreenLotSaveError(null);
    try {
      await updateGreenLot(greenLot.id, values);
      setGreenLot({ ...greenLot, ...values });
      setEditingGreenLot(false);
    } catch (err) {
      setGreenLotSaveError(err instanceof Error ? err.message : 'Не удалось сохранить изменения партии.');
    } finally {
      setSavingGreenLot(false);
    }
  }

  // Nothing to edit yet (no canonical row, or its chain didn't resolve) —
  // CanonicalLotChain above already shows the relevant "not connected"/
  // loading state, so this panel simply stays silent rather than repeating it.
  if (!greenLot && !coffee) return null;

  return (
    <div className="flex flex-col gap-4">
      {greenLot && (
        <div className="rounded-md border border-ink-200 bg-parchment-100 p-4">
          <div className="flex items-center justify-between gap-2 mb-2">
            <p className="section-label text-ink-400">Партия зелёного кофе</p>
            {!editingGreenLot && (
              <button
                type="button"
                onClick={() => setEditingGreenLot(true)}
                className="text-ink-700 underline underline-offset-2 hover:text-ink-900 text-xs"
              >
                Редактировать
              </button>
            )}
          </div>
          {editingGreenLot ? (
            <GreenLotForm
              initialGreenLot={greenLot}
              saving={savingGreenLot}
              saveError={greenLotSaveError}
              onSubmit={handleGreenLotSave}
              onCancel={() => {
                setEditingGreenLot(false);
                setGreenLotSaveError(null);
              }}
            />
          ) : (
            <p className="text-xs text-ink-500">{describeCanonicalGreenLot(greenLot)}</p>
          )}
        </div>
      )}

      {coffee && (
        <div className="rounded-md border border-ink-200 bg-parchment-100 p-4">
          <div className="flex items-center justify-between gap-2 mb-2">
            <p className="section-label text-ink-400">Кофе</p>
            {!editingCoffee && (
              <button
                type="button"
                onClick={() => setEditingCoffee(true)}
                className="text-ink-700 underline underline-offset-2 hover:text-ink-900 text-xs"
              >
                Редактировать
              </button>
            )}
          </div>
          {editingCoffee ? (
            <CoffeeForm
              initialCoffee={coffee}
              saving={savingCoffee}
              saveError={coffeeSaveError}
              onSubmit={handleCoffeeSave}
              onCancel={() => {
                setEditingCoffee(false);
                setCoffeeSaveError(null);
              }}
            />
          ) : (
            <p className="text-xs text-ink-500">{describeCanonicalCoffee(coffee)}</p>
          )}
        </div>
      )}
    </div>
  );
}
