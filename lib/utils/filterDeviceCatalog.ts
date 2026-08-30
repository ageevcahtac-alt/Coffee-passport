import { FILTER_DEVICE_PRESETS, type CustomDevice } from '@/lib/types/coffee';

// Builds the "which filter device did you use" dropdown contents shared by
// EnthusiastRecipeForm and ProRecipeForm: the built-in presets plus every
// platform-approved custom device (see lib/data/customDevicesStore.ts),
// split into the user's own Equipment Garage favorites (shown first, in
// their own optgroup — see ComboSelect's priorityOptions) and the rest of
// the catalog. Pure function — options are label strings, since
// BrewingRecipe.equipmentModel is free text, not a device id.
export interface FilterDeviceCatalog {
  options: string[];
  priorityOptions: string[];
}

export function buildFilterDeviceCatalog(
  approvedCustomDevices: CustomDevice[],
  favoriteDeviceIds: string[]
): FilterDeviceCatalog {
  const entries: { id: string; label: string }[] = [
    ...FILTER_DEVICE_PRESETS.map((preset) => ({ id: preset.id as string, label: preset.label })),
    ...approvedCustomDevices.map((device) => ({ id: device.id, label: device.label })),
  ];
  const favoriteSet = new Set(favoriteDeviceIds);
  return {
    priorityOptions: entries.filter((entry) => favoriteSet.has(entry.id)).map((entry) => entry.label),
    options: entries.filter((entry) => !favoriteSet.has(entry.id)).map((entry) => entry.label),
  };
}
