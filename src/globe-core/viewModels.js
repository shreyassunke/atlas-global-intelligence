/**
 * globe-core/viewModels — renderer-agnostic marker view-models.
 *
 * Archetype grammar (pin / track / field / reference / derived). Pins use a
 * single signal color — dimension taxonomy is not user-facing.
 */
import {
  getAnimationState,
  getSeveritySize,
} from '../core/visualGrammar'
import { enrichEventMarkerVisuals } from '../core/markerIconCache'
import { eventSourceToGlobeDataLayerKey } from '../core/globeLayers'
import {
  MARKER_ARCHETYPES,
  getArchetypeBehavior,
  resolveAnimationClass,
  resolveArchetypeOpacity,
  trackSubtypeFromEntity,
  trackSizePx,
  truthLabel,
} from '../core/markerArchetype'

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

/** Shared pin color — unlabeled signal, not a taxonomy swatch. */
export const SIGNAL_MARKER_COLOR = '#1a90ff'

export function eventMarkerColor(_evt) {
  return SIGNAL_MARKER_COLOR
}

export function eventMarkerRadiusGl(evt) {
  return evt.severity >= 4 ? 0.55 : evt.severity >= 3 ? 0.42 : 0.3
}

export function markerRingMaxRadius(vm, detectionMode = false) {
  if (detectionMode) return 2.8
  if (vm.archetype === MARKER_ARCHETYPES.REFERENCE) return 0
  if (vm.archetype === MARKER_ARCHETYPES.DERIVED) return 2.2
  if (vm.severity >= 4) return 5
  if (vm.severity >= 3) return 4
  return RING_MAX_RADIUS
}

/** @deprecated use vm.archetype — kept for renderer migration */
export function vmRenderChannel(vm) {
  if (vm.archetype === MARKER_ARCHETYPES.TRACK) return 'track'
  if (vm.archetype === MARKER_ARCHETYPES.REFERENCE || vm.archetype === MARKER_ARCHETYPES.DERIVED) {
    return 'sprite'
  }
  if (vm.archetype === MARKER_ARCHETYPES.PIN) return 'sprite'
  return 'track'
}

function pinVM(evt) {
  const enriched = enrichEventMarkerVisuals(evt)
  const behavior = getArchetypeBehavior(MARKER_ARCHETYPES.PIN)
  const recency = getAnimationState(enriched.timestamp)
  const vm = {
    id: enriched.id,
    archetype: MARKER_ARCHETYPES.PIN,
    kind: 'event',
    lat: enriched.lat,
    lng: enriched.lng,
    color: eventMarkerColor(enriched),
    radiusGl: eventMarkerRadiusGl(enriched),
    sizePx: getSeveritySize(enriched.severity),
    opacity: resolveArchetypeOpacity(MARKER_ARCHETYPES.PIN, enriched, behavior),
    severity: enriched.severity,
    priority: enriched.priority,
    dimension: enriched.dimension,
    environmentHazard: enriched.environmentHazard || null,
    markerIconUrl: enriched.markerIconUrl || '',
    title: enriched.title,
    recency,
    animationClass: resolveAnimationClass(MARKER_ARCHETYPES.PIN, { recency }),
    inspectorMode: behavior.inspectorMode,
    truth: truthLabel(MARKER_ARCHETYPES.PIN, enriched),
    raw: enriched,
  }
  return vm
}

function trackVM(evt, trackSubtype) {
  const mil = Boolean(evt.isMilitary)
  const behavior = getArchetypeBehavior(MARKER_ARCHETYPES.TRACK)
  let color = TRACK_COLORS[trackSubtype] || TRACK_COLORS.aircraft
  if (trackSubtype === 'aircraft' && mil) color = TRACK_COLORS.aircraftMilitary
  if (trackSubtype === 'satellite' && mil) color = TRACK_COLORS.satelliteMilitary

  const radiusGl = trackSubtype === 'storm' ? 0.55
    : trackSubtype === 'aircraft' ? (mil ? 0.45 : 0.38)
      : trackSubtype === 'vessel' ? 0.4 : 0.32

  const enriched = trackSubtype === 'storm' ? enrichEventMarkerVisuals(evt) : evt

  return {
    id: evt.id,
    archetype: MARKER_ARCHETYPES.TRACK,
    trackSubtype,
    kind: trackSubtype,
    lat: evt.lat,
    lng: evt.lng,
    color,
    radiusGl,
    sizePx: trackSizePx(trackSubtype),
    opacity: 1,
    severity: evt.severity,
    priority: evt.priority,
    dimension: evt.dimension,
    environmentHazard: enriched.environmentHazard || null,
    markerIconUrl: enriched.markerIconUrl || '',
    title: evt.title,
    recency: 'static',
    animationClass: null,
    inspectorMode: behavior.inspectorMode,
    truth: truthLabel(MARKER_ARCHETYPES.TRACK, evt),
    raw: enriched,
  }
}

/**
 * Build per-kind marker view-model lists from filtered layer events.
 */
export function buildMarkerViewModels({
  globePlottedEvents = [],
  tacticalAircraft = [],
  tacticalVessels = [],
  tacticalSatellites = [],
  stormOverlays = [],
  referenceMarkers = [],
  derivedMarkers = [],
  layerRevealAt = {},
} = {}) {
  const eventMarkers = globePlottedEvents.map((evt) => {
    const vm = pinVM(evt)
    const layerKey = eventSourceToGlobeDataLayerKey(evt)
    return withRevealOpacity(vm, layerKey, layerRevealAt, evt.cacheStale)
  })
  const aircraftMarkers = tacticalAircraft.map((evt) =>
    withRevealOpacity(trackVM(evt, 'aircraft'), 'adsb', layerRevealAt, evt.cacheStale),
  )
  const vesselMarkers = tacticalVessels.map((evt) =>
    withRevealOpacity(trackVM(evt, 'vessel'), 'ais', layerRevealAt, evt.cacheStale),
  )
  const satelliteMarkers = tacticalSatellites.map((evt) =>
    withRevealOpacity(trackVM(evt, 'satellite'), 'satellites', layerRevealAt, evt.cacheStale),
  )
  const stormMarkers = stormOverlays
    .filter((s) => s.lat != null && s.lng != null)
    .map((evt) => withRevealOpacity(trackVM(evt, 'storm'), 'nhcStorms', layerRevealAt, evt.cacheStale))

  const refMarkers = referenceMarkers.map((vm) =>
    withRevealOpacity(vm, vm.refKind === 'chokepoint' ? 'referenceChokepoints' : 'referenceNuclear', layerRevealAt),
  )
  const derMarkers = derivedMarkers.map((vm) =>
    withRevealOpacity(vm, 'derivedSignals', layerRevealAt),
  )

  return {
    eventMarkers,
    aircraftMarkers,
    vesselMarkers,
    satelliteMarkers,
    stormMarkers,
    referenceMarkers: refMarkers,
    derivedMarkers: derMarkers,
    allMarkers: [
      ...refMarkers,
      ...eventMarkers,
      ...derMarkers,
      ...aircraftMarkers,
      ...vesselMarkers,
      ...satelliteMarkers,
      ...stormMarkers,
    ],
  }
}

/** Classify legacy VM kind for filters during migration. */
export function isSpriteArchetype(vm) {
  return vm.archetype === MARKER_ARCHETYPES.PIN
    || vm.archetype === MARKER_ARCHETYPES.REFERENCE
    || vm.archetype === MARKER_ARCHETYPES.DERIVED
    || vm.kind === 'event'
}

export function isTrackArchetype(vm) {
  return vm.archetype === MARKER_ARCHETYPES.TRACK
    || (vm.kind && vm.kind !== 'event' && !vm.archetype)
}

export { trackSubtypeFromEntity }
