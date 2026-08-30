'use client';

import type { BrewingRecipe, CoffeeShop, Lot } from '@/lib/types/coffee';
import { PRO_GRINDER_MODELS } from '@/lib/types/coffee';
import { ProRecipeForm } from '@/components/coffee/ProRecipeForm';

// A coffee shop's own commercial adaptation of a lot's benchmark recipe —
// their signature setup, not the roaster's default. See
// components/coffee/ProRecipeForm.tsx for the shared field set.
export function SignatureRecipeForm({
  lot,
  shop,
  initialRecipe,
  onSave,
  onCancel,
}: {
  lot: Lot;
  shop: CoffeeShop;
  initialRecipe?: BrewingRecipe;
  onSave: (recipe: Omit<BrewingRecipe, 'id' | 'createdAt'>) => void;
  onCancel?: () => void;
}) {
  return (
    <ProRecipeForm
      lot={lot}
      authorType="coffee_shop"
      authorId={shop.id}
      authorName={shop.name}
      isBenchmark={false}
      grinderOptions={PRO_GRINDER_MODELS}
      initialRecipe={initialRecipe}
      onSave={onSave}
      onCancel={onCancel}
    />
  );
}
