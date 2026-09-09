'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLots } from '@/lib/data/useLots';
import { getRoasterById } from '@/lib/data/roasters';
import { getCoffeeShopById } from '@/lib/data/coffeeShops';
import { useBrewingRecipes } from '@/lib/data/useBrewingRecipes';
import { addBrewingRecipe } from '@/lib/data/brewingRecipesStore';
import { LotBuilderForm } from '@/components/roaster/LotBuilderForm';
import { SignatureRecipeForm } from '@/components/cafe/SignatureRecipeForm';
import { useStaffSession } from '@/lib/auth/staffSession';
import { BREWING_METHODS } from '@/lib/types/coffee';

// CAFE_LOT_EDIT_OWNERSHIP_IMPLEMENTATION.md — café does not own Canonical
// Lot identity, origin, or Taste Intent (CAFE_LOT_EDIT_OWNERSHIP_AUDIT.md).
// This page used to call saveLot(updated) here, writing the roaster's data
// to this café staff member's own browser localStorage — a local override
// that then silently shadowed the real canonical Lot on every other
// surface reading useLots() on that same device (including the
// guest-facing Public Passport, on a shared café/kiosk device), while
// never reaching Supabase at all. LotBuilderForm below is now rendered
// readOnly for the Canonical Lot portion: no save handler, no local
// mutation, no false "saved" affordance. The café-owned Signature Recipe
// section keeps its own, entirely separate save path (addBrewingRecipe)
// unchanged.
export default function CafeEditLotPage({ params }: { params: { lotId: string } }) {
  const router = useRouter();
  const { cafeId } = useStaffSession();
  const lots = useLots();
  // The lots list is seed data merged with localStorage, so the very first
  // client render (matching the server snapshot) may not yet include a lot
  // added moments ago — wait for hydration before deciding not found.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const lot = lots.find((candidate) => candidate.id === params.lotId);
  const roaster = lot ? getRoasterById(lot.roasterId) : undefined;
  const shop = cafeId ? getCoffeeShopById(cafeId) : undefined;

  const signatureRecipes = useBrewingRecipes().filter(
    (recipe) => lot && recipe.lotId === lot.id && recipe.authorType === 'coffee_shop' && recipe.authorId === cafeId
  );
  const [addingRecipe, setAddingRecipe] = useState(false);

  if (!lot || !roaster || !shop) {
    if (!mounted) return null;
    return (
      <main className="min-h-dvh flex flex-col items-center justify-center px-6 text-center">
        <h1 className="font-display text-2xl text-ink-900 mb-2">Лот не найден</h1>
        <p className="text-ink-500 text-sm">Возможно, он был удалён или ссылка неверна.</p>
      </main>
    );
  }

  return (
    <main className="min-h-dvh px-6 py-16">
      <div className="max-w-md mx-auto w-full">
        <p className="text-xs uppercase tracking-widest2 text-ink-400 font-body mb-2">
          {roaster.name}
        </p>
        <h1 className="font-display text-2xl text-ink-900 mb-8">Карточка лота</h1>
        <LotBuilderForm
          roaster={roaster}
          initialLot={lot}
          onCancel={() => router.push('/dashboard/cafe')}
          canEditCatalogFlag={false}
          readOnly
        />

        <div className="mt-14">
          <p className="section-label mb-4">Фирменный рецепт кофейни</p>
          {addingRecipe ? (
            <SignatureRecipeForm
              lot={lot}
              shop={shop}
              onSave={(recipe) => {
                addBrewingRecipe(recipe);
                setAddingRecipe(false);
              }}
              onCancel={() => setAddingRecipe(false)}
            />
          ) : (
            <>
              {signatureRecipes.length === 0 ? (
                <p className="text-sm text-ink-400 mb-4">Кофейня ещё не опубликовала свою адаптацию рецепта.</p>
              ) : (
                <div className="flex flex-col gap-2 mb-4">
                  {signatureRecipes.map((recipe) => {
                    const methodLabel = BREWING_METHODS.find((method) => method.id === recipe.brewingMethodId)?.label ?? recipe.brewingMethodId;
                    return (
                      <div key={recipe.id} className="rounded-md border border-ink-200 bg-parchment-100 p-4">
                        <p className="text-sm text-ink-900">{methodLabel} · {recipe.doseG}г → {recipe.yieldG}г</p>
                      </div>
                    );
                  })}
                </div>
              )}
              <button type="button" onClick={() => setAddingRecipe(true)}
                className="text-sm text-ink-700 underline underline-offset-2 hover:text-ink-900">
                + Добавить рецепт под другой метод
              </button>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
