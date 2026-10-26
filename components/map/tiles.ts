// Stock OpenStreetMap raster tiles, served from our own domain: nginx proxies
// and caches /tiles/{z}/{x}/{y}.png from tile.openstreetmap.org
// (deploy/timeweb/nginx-tiles.conf), so the visitor's browser never contacts
// a foreign host (CLAUDE.md, «Данные только в России»). The OSM tile usage
// policy requires the visible attribution.
export const TILE_URL = '/tiles/{z}/{x}/{y}.png';
export const TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a>';
