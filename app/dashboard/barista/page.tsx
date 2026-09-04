'use client';

import { useState } from 'react';
import Link from 'next/link';
import { getCoffeeShopById } from '@/lib/data/coffeeShops';
import { useLots } from '@/lib/data/useLots';
import { useCafeMenuLotIds } from '@/lib/data/useCafeMenu';
import { useBrewingRecipes } from '@/lib/data/useBrewingRecipes';
import { addRecipeAsDraft, publishRecipe, updateBrewingRecipe, deleteBrewingRecipe } from '@/lib/data/brewingRecipesStore';
import { useBaristaProfiles } from '@/lib/data/useBaristaProfiles';
import { BaristaRecipeForm } from '@/components/barista/BaristaRecipeForm';
import { BaristaFeedback } from '@/components/barista/BaristaFeedback';
import { BaristaProfileCard } from '@/components/barista/BaristaProfileCard';
import { BaristaProfileForm } from '@/components/barista/BaristaProfileForm';
import { BaristaLoyaltyPanel } from '@/components/loyalty/BaristaLoyaltyPanel';
import { RecipeCard } from '@/components/coffee/RecipeCard';
import { useStaffSession } from '@/lib/auth/staffSession';
import type { Barista, BrewingRecipe, Lot } from '@/lib/types/coffee';

export default function BaristaDashboardPage() {
  const { baristaId, cafeId } = useStaffSession();
  const barista = useBaristaProfiles().find((candidate) => candidate.id === baristaId);
  const shop = cafeId ? getCoffeeShopById(cafeId) : undefined;
  const lots = useLots();
  const menuLotIds = useCafeMenuLotIds(cafeId ?? '');
  const menuLots = lots.filter((lot) => menuLotIds.includes(lot.id));
  const [editingProfile, setEditingProfile] = useState(false);

  if (!barista || !shop) return null;

  return (
    <main className="min-h-dvh px-6 py-16">
      <div className="max-w-2xl mx-auto w-full">
        <p className="text-xs uppercase tracking-widest2 text-ink-400 font-body mb-2">
          {shop.name} · {shop.city}
        </p>
        <h1 className="font-display text-3xl text-ink-900 mb-10">{barista.name}</h1>

        <section className="mb-12">
          <p className="section-label mb-4">Мой профиль</p>
          <BaristaProfileCard barista={barista} />
          {editingProfile ? (
            <div className="mt-4">
              <BaristaProfileForm barista={barista} onSaved={() => setEditingProfile(false)} />
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setEditingProfile(true)}
              className="text-sm text-ink-700 underline underline-offset-2 hover:text-ink-900 mt-3"
            >
              Редактировать профиль
            </button>
          )}
        </section>

        <BaristaLoyaltyPanel shopId={cafeId ?? ''} />

        <BaristaFeedback baristaId={barista.id} />

        <p className="section-label mb-4">Мои рекомендации по лотам</p>
        {menuLots.length === 0 ? (
          <p className="text-sm text-ink-500">
            В меню кофейни пока нет лотов — рекомендации появятся, когда кофейня добавит зерно в меню.
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            {menuLots.map((lot) => (
              <LotRecipeRow key={lot.id} lot={lot} barista={barista} shopId={cafeId ?? ''} />
            ))}
          </div>
        )}

        <Link
          href="/dashboard/cafe"
          className="text-sm text-ink-700 underline underline-offset-2 hover:text-ink-900 mt-10 inline-block"
        >
          ← Меню кофейни
        </Link>
      </div>
    </main>
  );
}

function LotRecipeRow({
  lot,
  barista,
  shopId,
}: {
  lot: Lot;
  barista: Barista;
  shopId: string;
}) {
  const shop = getCoffeeShopById(shopId);
  const myRecipes = useBrewingRecipes().filter(
    (recipe) => recipe.lotId === lot.id && recipe.authorType === 'barista' && recipe.authorId === barista.id
  );
  const [adding, setAdding] = useState(false);
  const [editingRecipe, setEditingRecipe] = useState<BrewingRecipe | null>(null);
  const [publishingId, setPublishingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Creating always inserts a draft (quota-checked by RecipeQuotaPanel
  // inside BaristaRecipeForm); editing updates the existing row in place —
  // RLS already scopes both to this barista's own recipes (see 0007).
  async function handleSave(input: Omit<BrewingRecipe, 'id' | 'createdAt'>) {
    setActionError(null);
    if (editingRecipe) {
      const { error } = await updateBrewingRecipe({ ...editingRecipe, ...input });
      if (error) {
        setActionError(error);
        return;
      }
      setEditingRecipe(null);
      return;
    }

    const { isPublic: _unused, ...draftInput } = input;
    const { error } = await addRecipeAsDraft(draftInput);
    if (error) {
      setActionError(error);
      return;
    }
    setAdding(false);
  }

  async function handlePublish(recipe: BrewingRecipe) {
    setActionError(null);
    setPublishingId(recipe.id);
    const { error } = await publishRecipe(recipe.id);
    setPublishingId(null);
    if (error) setActionError(error);
  }

  async function handleDelete(recipe: BrewingRecipe) {
    setActionError(null);
    setDeletingId(recipe.id);
    const { error } = await deleteBrewingRecipe(recipe.id);
    setDeletingId(null);
    if (error) setActionError(error);
  }

  return (
    <div className="rounded-md border border-ink-200 bg-parchment-100 p-5">
      <h3 className="font-display text-lg text-ink-900 leading-tight mb-3">{lot.name}</h3>

      {actionError && <p className="text-xs text-rating mb-3">{actionError}</p>}

      {myRecipes.length === 0 ? (
        <p className="text-sm text-ink-400 mb-3">Рекомендация ещё не опубликована.</p>
      ) : (
        <div className="flex flex-col gap-3 mb-3">
          {myRecipes.map((recipe) => (
            <RecipeCard
              key={recipe.id}
              recipe={recipe}
              currentUserId={barista.id}
              isOwnBarista
              onEdit={setEditingRecipe}
              onPublish={handlePublish}
              onDelete={handleDelete}
              publishing={publishingId === recipe.id}
              deleting={deletingId === recipe.id}
            />
          ))}
        </div>
      )}

      {editingRecipe && shop ? (
        <div className="mt-4">
          <BaristaRecipeForm
            lot={lot}
            barista={barista}
            shop={shop}
            initialRecipe={editingRecipe}
            isEditing
            onSave={handleSave}
            onCancel={() => setEditingRecipe(null)}
          />
        </div>
      ) : adding && shop ? (
        <div className="mt-4">
          <BaristaRecipeForm
            lot={lot}
            barista={barista}
            shop={shop}
            onSave={handleSave}
            onCancel={() => setAdding(false)}
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="text-sm text-ink-700 underline underline-offset-2 hover:text-ink-900"
        >
          + Добавить рецепт под другой метод
        </button>
      )}
    </div>
  );
}
