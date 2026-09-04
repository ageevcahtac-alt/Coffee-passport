import { BREWING_METHODS, STANDARD_BREW_METHOD_CATEGORIES, type CustomBrewMethod } from '@/lib/types/coffee';

// A BrewingRecipe.brewingMethodId can now come from three different id
// spaces (see the widened type's own comment in lib/types/coffee.ts): the
// legacy BrewingMethodId union (roaster/coffee_shop recipes, and any
// barista recipe created before this quota system landed), the new
// STANDARD_BREW_METHOD_CATEGORIES, or a CustomBrewMethod.id. Anywhere that
// needs to render a label for an arbitrary recipe (see ExtractionTab's
// method-browsing tabs) should resolve through here rather than assuming
// one specific list.
export function resolveBrewMethodLabel(id: string, customMethods: CustomBrewMethod[]): string {
  const legacy = BREWING_METHODS.find((method) => method.id === id);
  if (legacy) return legacy.label;

  const standard = STANDARD_BREW_METHOD_CATEGORIES.find((method) => method.id === id);
  if (standard) return standard.label;

  const custom = customMethods.find((method) => method.id === id);
  if (custom) return custom.label;

  return id;
}
