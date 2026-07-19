/**
 * src/globe-core — renderer-agnostic globe logic (Phase 2).
 *
 * Everything the three renderers (Google Map3D, Globe.GL, MapLibre FlatMap)
 * share lives here: event filtering, marker/cluster/choropleth/heat-bin
 * view-models, LOD tiers, and interaction intents. Renderers are thin
 * adapters over these exports.
 */
export {
  buildMarkerViewModels,
  eventMarkerColor,
  eventMarkerRadiusGl,
  markerRingMaxRadius,
  rgbaFromHex,
  RING_MAX_RADIUS,
  TRACK_COLORS,
  isSpriteArchetype,
  isTrackArchetype,
} from './viewModels'
export { buildClusterViewModels, convexHull, MAX_CLUSTER_INPUTS } from './clusters'
export { buildChoroplethViewModels, geoJsonToOuterRings, CHOROPLETH_STROKE } from './choropleth'
export { buildHeatBins } from './heatBins'
export {
  applyBackgroundClick,
  applyCountryClick,
  applyCursorCoords,
  applyGlobeMapClick,
  applyGlobeMapContextMenu,
  applyMarkerClick,
  applyMarkerHover,
  clearCursorCoords,
  findChoroplethCountryAtPoint,
  markerClickIntent,
  resolveFlyToTarget,
  resolveLocationInspectContext,
} from './interactions'
export { approxLatLngUnderPointer } from './screenToLatLng'
export {
  isWorldZoom,
  MAX_GLOBE_MARKERS,
  MAX_TACTICAL_AIRCRAFT,
  MAX_TACTICAL_SATELLITES,
  MAX_TACTICAL_VESSELS,
} from './lod'
export { useGlobeLayerEvents, SAT_PROPAGATION_INTERVAL_MS } from './useGlobeLayerEvents'
export { default as useGdeltGeoOverlay } from './useGdeltGeoOverlay'
export { useGlobeViewModels } from './useGlobeViewModels'
