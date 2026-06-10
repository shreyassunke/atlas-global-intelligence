/**
 * globe-core/lod — level-of-detail tiers shared by every renderer.
 *
 * `zoomLevel` semantics still differ per renderer (normalized camera distance
 * for Map3D/Globe.GL where 1 = farthest, normalized MapLibre zoom for the 2D
 * map where 0 = world), so the world-zoom threshold is per-mode. Renderers
 * keep writing their native normalized zoom to the store; this is the single
 * place that interprets it.
 */

/**
 * At world zoom the globe shows the choropleth plus P1/P2 pins only;
 * zooming in reveals the full (P3-inclusive) pin set.
 * @param {'cesium'|'globegl'|'leaflet'} globeMode
 * @param {number} zoomLevel normalized 0..1 (renderer-native semantics)
 */
export function isWorldZoom(globeMode, zoomLevel) {
  if (!Number.isFinite(zoomLevel)) return true
  if (globeMode === 'leaflet') return zoomLevel < 0.25
  if (globeMode === 'globegl') return zoomLevel > 0.3
  return zoomLevel > 0.2 // cesium (Google Map3D, range-normalized)
}

/** The monitor surface is calm; aggregates carry density. */
export const MAX_GLOBE_MARKERS = 400
export const MAX_TACTICAL_AIRCRAFT = 500
export const MAX_TACTICAL_VESSELS = 400
export const MAX_TACTICAL_SATELLITES = 400
