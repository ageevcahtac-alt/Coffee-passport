// Real [longitude, latitude] coordinates (d3/GeoJSON order) for each
// country's pin — a representative point (its capital), not a country
// centroid, since a capital reads as recognizable on the map. Keyed by the
// exact country name as it appears both in world-atlas's topology
// (lib/data/worldAtlas110m.json, properties.name) and in Lot.country
// (lib/types/coffee.ts) — same English names in both, no translation
// table needed. Countries missing here simply render no pin.
export const COFFEE_BELT_COORDINATES: Record<string, [number, number]> = {
  Colombia: [-74.07, 4.71], // Bogotá
  Ethiopia: [38.74, 9.03], // Addis Ababa
  Kenya: [36.82, -1.29], // Nairobi
};
