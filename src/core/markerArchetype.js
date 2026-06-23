/**
 * Marker archetype taxonomy — orthogonal to dimension/hazard encoding.
 * Classifies map objects (pin, track, field, reference, derived) and
 * exposes per-archetype interaction + truth-seeking behavior flags.
 */
import { hasPreciseGeolocation } from './sourceGeolocation.js'
import { confidenceForEvent } from './triage.js'
import { getOpacity, getAnimationState } from './visualGrammar.js'
import { getSeveritySize } from './visualGrammar.js'

export const MARKER_ARCHETYPES = /** @type {const} */ ({
  PIN: 'pin',
  TRACK: 'track',
  FIELD: 'field',
  REFERENCE: 'reference',
  DERIVED: 'derived',
})

const REFERENCE_SIZE_PX = 12
const DERIVED_SIZE_PX = 24
const TRACK_SIZE = { aircraft: 22, vessel: 24, satellite: 18, storm: 28 }

/** @typedef {'pin'|'track'|'field'|'reference'|'derived'} MarkerArchetype */

/**
 * @param {object} entity
 * @returns {MarkerArchetype}
 */
export function classifyMarkerArchetype(entity) {
  if (!entity) return MARKER_ARCHETYPES.PIN
  if (entity.archetype) return entity.archetype
  if (entity.trackKind || entity.kind === 'aircraft' || entity.kind === 'vessel'
    || entity.kind === 'satellite' || entity.kind === 'storm') {
    return MARKER_ARCHETYPES.TRACK
  }
  if (entity.refKind || entity.refId) return MARKER_ARCHETYPES.REFERENCE
  if (entity.anomalyType || entity.derivedFromAnomaly) return MARKER_ARCHETYPES.DERIVED
  return MARKER_ARCHETYPES.PIN
}

/**
 * @param {MarkerArchetype} archetype
 * @returns {{
 *   allowStreetView: boolean,
 *   allowPulse: boolean,
 *   zIndex: number,
 *   collisionPriority: number,
 *   inspectorMode: 'event'|'track'|'reference'|'derived',
 *   fixedSizePx: number|null,
 *   staticOpacity: number|null,
 * }}
 */
export function getArchetypeBehavior(archetype) {
  switch (archetype) {
    case MARKER_ARCHETYPES.TRACK:
      return {
        allowStreetView: false,
        allowPulse: false,
        zIndex: 20,
        collisionPriority: 20,
        inspectorMode: 'track',
        fixedSizePx: null,
        staticOpacity: 1,
      }
    case MARKER_ARCHETYPES.REFERENCE:
      return {
        allowStreetView: false,
        allowPulse: false,
        zIndex: 0,
        collisionPriority: 0,
        inspectorMode: 'reference',
        fixedSizePx: REFERENCE_SIZE_PX,
        staticOpacity: 0.45,
      }
    case MARKER_ARCHETYPES.DERIVED:
      return {
        allowStreetView: false,
        allowPulse: false,
        zIndex: 8,
        collisionPriority: 8,
        inspectorMode: 'derived',
        fixedSizePx: DERIVED_SIZE_PX,
        staticOpacity: null,
      }
    case MARKER_ARCHETYPES.FIELD:
      return {
        allowStreetView: false,
        allowPulse: false,
        zIndex: 1,
        collisionPriority: 1,
        inspectorMode: 'event',
        fixedSizePx: null,
        staticOpacity: null,
      }
    default:
      return {
        allowStreetView: true,
        allowPulse: true,
        zIndex: 5,
        collisionPriority: 5,
        inspectorMode: 'event',
        fixedSizePx: null,
        staticOpacity: null,
      }
  }
}

/**
 * @param {MarkerArchetype} archetype
 * @param {object} entity
 * @returns {{ label: string, tone: 'high'|'medium'|'low'|'flag' }}
 */
export function truthLabel(archetype, entity) {
  switch (archetype) {
    case MARKER_ARCHETYPES.TRACK:
      return { label: 'Live telemetry', tone: 'high' }
    case MARKER_ARCHETYPES.REFERENCE:
      return { label: 'Static reference', tone: 'medium' }
    case MARKER_ARCHETYPES.DERIVED: {
      const conf = entity?.confidence || confidenceForEvent(entity?.raw || entity)
      return { label: conf.label || 'Derived signal', tone: conf.tone || 'medium' }
    }
    case MARKER_ARCHETYPES.PIN: {
      const conf = confidenceForEvent(entity)
      const approx = entity?.latApproximate ? ' · approximate location' : ''
      return { label: `${conf.label}${approx}`, tone: conf.tone }
    }
    default:
      return { label: 'Field overlay', tone: 'medium' }
  }
}

export function trackSubtypeFromEntity(entity) {
  if (!entity) return null
  if (entity.trackSubtype) return entity.trackSubtype
  const kind = entity.trackKind || entity.kind
  if (kind === 'aircraft' || kind === 'vessel' || kind === 'satellite' || kind === 'storm') {
    return kind
  }
  return null
}

export function trackSizePx(subtype) {
  return TRACK_SIZE[subtype] || 22
}

/**
 * Resolve animation class for renderer CSS.
 * @param {MarkerArchetype} archetype
 * @param {object} vm
 */
export function resolveAnimationClass(archetype, vm) {
  if (archetype === MARKER_ARCHETYPES.DERIVED) return 'atlas-marker--derived-breathe'
  if (archetype === MARKER_ARCHETYPES.PIN && vm.recency && vm.recency !== 'static') {
    return 'atlas-marker--pin-pulse'
  }
  return null
}

/**
 * Pin opacity from corroboration; reference/derived use behavior rules.
 */
export function resolveArchetypeOpacity(archetype, entity, behavior) {
  if (behavior.staticOpacity != null) return behavior.staticOpacity
  if (archetype === MARKER_ARCHETYPES.DERIVED) {
    const tone = entity?.confidence?.tone || confidenceForEvent(entity?.raw).tone
    if (tone === 'high') return 0.95
    if (tone === 'medium') return 0.78
    if (tone === 'flag') return 0.88
    return 0.62
  }
  if (archetype === MARKER_ARCHETYPES.PIN) {
    return getOpacity(entity.corroborationCount, entity.authoritative)
  }
  return entity.opacity ?? 1
}

export function resolvePinSizePx(entity) {
  return getSeveritySize(entity.severity)
}

export function resolvePinRecency(timestamp) {
  return getAnimationState(timestamp)
}

export function canOpenStreetView(archetype, entity) {
  const behavior = getArchetypeBehavior(archetype)
  if (!behavior.allowStreetView) return false
  return hasPreciseGeolocation(entity)
}

export { REFERENCE_SIZE_PX, DERIVED_SIZE_PX }
