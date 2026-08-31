'use client';

import type { Barista, BrewingRecipe, CoffeeShop, Lot } from '@/lib/types/coffee';
import { PRO_GRINDER_MODELS } from '@/lib/types/coffee';
import { ProRecipeForm } from '@/components/coffee/ProRecipeForm';

// A barista's own recommended recipe for a lot on their shop's menu —
// authored under their own name (so the Lot Card can show "Рекомендация
// бариста · Алексей"), but the Equipment Garage it auto-fills from is the
// shop's own setup (see ProRecipeForm's equipmentOwnerId) — a barista
// brews on the shop's grinder/machine, not a personal one.
export function BaristaRecipeForm({
  lot,
  barista,
  shop,
  initialRecipe,
  onSave,
  onCancel,
}: {
  lot: Lot;
  barista: Barista;
  shop: CoffeeShop;
  initialRecipe?: BrewingRecipe;
  onSave: (recipe: Omit<BrewingRecipe, 'id' | 'createdAt'>) => void;
  onCancel?: () => void;
}) {
  return (
    <ProRecipeForm
      lot={lot}
      authorType="barista"
      authorId={barista.id}
      authorName={barista.name}
      equipmentOwnerId={shop.id}
      isBenchmark={false}
      grinderOptions={PRO_GRINDER_MODELS}
      initialRecipe={initialRecipe}
      onSave={onSave}
      onCancel={onCancel}
    />
  );
}
