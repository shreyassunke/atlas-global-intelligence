/**
 * globe-core/viewModels — renderer-agnostic marker view-models.
 *
 * One styling pass for all three renderers (Google Map3D, Globe.GL,
 * MapLibre FlatMap). Each marker VM carries every visual attribute a
 * renderer needs; adapters translate VM fields into their native layer
 * primitives and never re-derive colors/sizes from raw events.
 *
 * VM shape:
 *   {
 *     id, kind: 'event'|'aircraft'|'vessel'|'satellite'|'storm',
 *     lat, lng,
 *     color,      // hex — dimension color for events, track color for tracks
 *     radiusGl,   // globe.gl point radius (angular degrees)
 *     sizePx,     // sprite/icon pixel size (Map3D markers)
 *     opacity,    // corroboration-derived confidence opacity
 *     severity, priority, dimension, title,
 *     recency,    // 'pulsing' | 'glowing' | 'static' (events only)
 *     raw,        // the underlying store event (click/hover payload)
 *   }
 */
import { DIMENSION_COLORS } from '../core/eventSchema'
import { getAnimationState, getSeveritySize } from '../core/visualGrammar'
import { eventSourceToGlobeDataLayerKey } from '../core/globeLayers'

const REVEAL_MS = 450

export function layerRevealMultiplier(layerRevealAt, layerKey, now = Date.now()) {
  const t0 = layerRevealAt?.[layerKey]
  if (!t0) return 1
  return Math.min(1, Math.max(0, (now - t0) / REVEAL_MS))
}

function withRevealOpacity(vm, layerKey, layerRevealAt, cacheStale = false) {
  let opacity = vm.opacity ?? 1
  if (cacheStale) opacity *= 0.55
  const reveal = layerRevealMultiplier(layerRevealAt, layerKey)
  return { ...vm, opacity: opacity * reveal }
}

export const TRACK_COLORS = {
  aircraft: '#00d4ff',
  aircraftMilitary: '#ff6b35',
  vessel: '#4dd4ff',
  satellite: '#c8ff00',
  satelliteMilitary: '#ff6b35',
  storm: '#ff7846',
}

export const RING_MAX_RADIUS = 3

export function rgbaFromHex(hex, alpha) {
  let h = (hex || '#888888').replace('#', '')
  if (h.length === 3) {
    h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2]
  }
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

export function eventMarkerColor(evt) {
  return DIMENSION_COLORS[evt.dimension] || '#1a90ff'
}

/** Globe.GL point radius from severity. */
export function eventMarkerRadiusGl(evt) {
  return evt.severity >= 4 ? 0.55 : evt.severity >= 3 ? 0.42 : 0.3
}

/** Pulse-ring max radius — larger rings for higher-severity events. */
export function markerRingMaxRadius(vm, detectionMode = false) {
  if (detectionMode) return 2.8
  if (vm.severity >= 4) return 5
  if (vm.severity >= 3) return 4
  return RING_MAX_RADIUS
}

function eventVM(evt) {
  return {
    id: evt.id,
    kind: 'event',
    lat: evt.lat,
    lng: evt.lng,
    color: eventMarkerColor(evt),
    radiusGl: eventMarkerRadiusGl(evt),
    sizePx: getSeveritySize(evt.severity),
    opacity: evt.opacity ?? 1,
    severity: evt.severity,
    priority: evt.priority,
    dimension: evt.dimension,
    title: evt.title,
    recency: getAnimationState(evt.timestamp),
    raw: evt,
  }
}

function aircraftVM(evt) {
  const mil = Boolean(evt.isMilitary)
  return {
    id: evt.id,
    kind: 'aircraft',
    lat: evt.lat,
    lng: evt.lng,
    color: mil ? TRACK_COLORS.aircraftMilitary : TRACK_COLORS.aircraft,
    radiusGl: mil ? 0.45 : 0.38,
    sizePx: mil ? 26 : 22,
    opacity: 1,
    severity: evt.severity,
    priority: evt.priority,
    dimension: evt.dimension,
    title: evt.title,
    raw: evt,
  }
}

function vesselVM(evt) {
  return {
    id: evt.id,
    kind: 'vessel',
    lat: evt.lat,
    lng: evt.lng,
    color: TRACK_COLORS.vessel,
    radiusGl: 0.4,
    sizePx: 24,
    opacity: 1,
    severity: evt.severity,
    priority: evt.priority,
    dimension: evt.dimension,
    title: evt.title,
    raw: evt,
  }
}

function satelliteVM(evt) {
  const mil = Boolean(evt.isMilitary)
  return {
    id: evt.id,
    kind: 'satellite',
    lat: evt.lat,
    lng: evt.lng,
    color: mil ? TRACK_COLORS.satelliteMilitary : TRACK_COLORS.satellite,
    radiusGl: 0.32,
    sizePx: 18,
    opacity: 1,
    severity: evt.severity,
    priority: evt.priority,
    dimension: evt.dimension,
    title: evt.title,
    raw: evt,
  }
}

function stormVM(evt) {
  return {
    id: evt.id,
    kind: 'storm',
    lat: evt.lat,
    lng: evt.lng,
    color: TRACK_COLORS.storm,
    radiusGl: 0.55,
    sizePx: 28,
    opacity: 1,
    severity: evt.severity,
    priority: evt.priority || 'p1',
    dimension: evt.dimension || 'environment',
    title: evt.title,
    raw: evt,
  }
}

/**
 * Build per-kind marker view-model lists from the filtered layer events
 * (the output of `useGlobeLayerEvents`).
 */
export function buildMarkerViewModels({
  globePlottedEvents = [],
  tacticalAircraft = [],
  tacticalVessels = [],
  tacticalSatellites = [],
  stormOverlays = [],
  layerRevealAt = {},
} = {}) {
  const eventMarkers = globePlottedEvents.map((evt) => {
    const vm = eventVM(evt)
    const layerKey = eventSourceToGlobeDataLayerKey(evt.source)
    return withRevealOpacity(vm, layerKey, layerRevealAt, evt.cacheStale)
  })
  const aircraftMarkers = tacticalAircraft.map((evt) =>
    withRevealOpacity(aircraftVM(evt), 'adsb', layerRevealAt, evt.cacheStale),
  )
  const vesselMarkers = tacticalVessels.map((evt) =>
    withRevealOpacity(vesselVM(evt), 'ais', layerRevealAt, evt.cacheStale),
  )
  const satelliteMarkers = tacticalSatellites.map((evt) =>
    withRevealOpacity(satelliteVM(evt), 'satellites', layerRevealAt, evt.cacheStale),
  )
  const stormMarkers = stormOverlays
    .filter((s) => s.lat != null && s.lng != null)
    .map((evt) => withRevealOpacity(stormVM(evt), 'nhcStorms', layerRevealAt, evt.cacheStale))
  return {
    eventMarkers,
    aircraftMarkers,
    vesselMarkers,
    satelliteMarkers,
    stormMarkers,
    allMarkers: [
      ...eventMarkers,
      ...aircraftMarkers,
      ...vesselMarkers,
      ...satelliteMarkers,
      ...stormMarkers,
    ],
  }
}
