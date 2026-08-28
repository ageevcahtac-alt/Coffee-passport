export type BeltContinent = 'africa' | 'south-america';

// Approximate, stylized pin positions for CoffeeBeltMap's 640x300 viewBox —
// placed to read correctly at a glance (right hemisphere, right side of the
// correct continent blob, relative to each other) rather than to scale.
// `continent` picks which continent silhouette the "fog of war" reveal glow
// clips against for that country. Countries missing here simply render no
// pin — see CoffeeBeltMap.
export const COFFEE_BELT_POSITIONS: Record<
  string,
  { x: number; y: number; continent: BeltContinent }
> = {
  Colombia: { x: 178, y: 118, continent: 'south-america' },
  Ethiopia: { x: 404, y: 116, continent: 'africa' },
  Kenya: { x: 398, y: 152, continent: 'africa' },
};
