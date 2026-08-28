// Approximate, stylized pin positions for CoffeeBeltMap's 640x300 viewBox —
// placed to read correctly at a glance (right hemisphere, right side of the
// correct continent blob, relative to each other) rather than to scale.
// Countries missing here simply render no pin — see CoffeeBeltMap.
export const COFFEE_BELT_POSITIONS: Record<string, { x: number; y: number }> = {
  Colombia: { x: 178, y: 118 },
  Ethiopia: { x: 404, y: 116 },
  Kenya: { x: 398, y: 152 },
};
