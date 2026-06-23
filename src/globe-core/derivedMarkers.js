/**
 * Derived marker VMs from eventBus anomaly stream.
 */
import { getDerivedIconUrl } from '../core/archetypeIcons.js'
import {
  MARKER_ARCHETYPES,
  getArchetypeBehavior,
  resolveAnimationClass,
  truthLabel,
} from '../core/markerArchetype.js'
import { confidenceForEvent } from '../core/triage.js'
import { anomalyCellToLatLng } from '../core/triage.js'
import { CHOKEPOINTS } from '../core/chokepoints.js'

const CHOKEPOINT_COORDS = Object.fromEntries(
  CHOKEPOINTS.map((cp) => [cp.name, { lat: cp.lat, lng: cp.lng }]),
)
CHOKEPOINT_COORDS.Taiwan = CHOKEPOINT_COORDS['Taiwan Strait']
CHOKEPOINT_COORDS.SCS = CHOKEPOINT_COORDS['South China Sea']

function coordsForAnomaly(anomaly, eventMap) {
  const evt = anomaly.eventId ? eventMap?.[anomaly.eventId] : null
  if (evt?.lat != null && evt?.lng != null) return { lat: evt.lat, lng: evt.lng }
  if (anomaly.type === 'SPIKE' && anomaly.cell) {
    return anomalyCellToLatLng(anomaly.cell)
  }
  if (anomaly.type === 'CHOKEPOINT_COMPOSITE' && anomaly.chokepoint) {
    return CHOKEPOINT_COORDS[anomaly.chokepoint] || null
  }
  return null
}

function whyForAnomaly(anomaly, eventMap) {
  const evt = anomaly.eventId ? eventMap?.[anomaly.eventId] : null
  switch (anomaly.type) {
    case 'SPIKE':
      return `${anomaly.count} signals in 6h vs ~${anomaly.expected} expected — local surge`
    case 'BLACKOUT':
      return `Signal blackout in ${anomaly.region} — possible comms disruption or feed outage`
    case 'CHOKEPOINT_COMPOSITE':
      return `Conflict near ${anomaly.chokepoint} while energy markets move — shipping exposure`
    case 'COMPOUND_CRISIS':
      return `Safety, humanitarian and economic signals overlapping in ${anomaly.region}`
    case 'RAPID_ESCALATION':
      return `Priority jumped ${String(anomaly.from).toUpperCase()} → ${String(anomaly.to).toUpperCase()} in under 10 minutes`
    default:
      return evt?.title || 'Synthesized cross-feed signal'
  }
}

function titleForAnomaly(anomaly) {
  switch (anomaly.type) {
    case 'SPIKE':
      return `${anomaly.dimension || 'Signal'} activity spike`
    case 'BLACKOUT':
      return `Blackout — ${anomaly.region}`
    case 'CHOKEPOINT_COMPOSITE':
      return `Chokepoint risk — ${anomaly.chokepoint}`
    case 'COMPOUND_CRISIS':
      return `Compound crisis — ${anomaly.region}`
    case 'RAPID_ESCALATION':
      return 'Rapid escalation'
    default:
      return 'Derived signal'
  }
}

function linkedEventIds(anomaly) {
  const ids = []
  if (anomaly.eventId) ids.push(anomaly.eventId)
  if (anomaly.conflictEventId) ids.push(anomaly.conflictEventId)
  if (anomaly.economicEventId) ids.push(anomaly.economicEventId)
  return [...new Set(ids)]
}

/**
 * @param {{ anomalies?: object[], eventMap?: Record<string, object>, enabled?: boolean }} opts
 */
export function buildDerivedMarkerVMs({ anomalies = [], eventMap = {}, enabled = false } = {}) {
  if (!enabled) return []

  const behavior = getArchetypeBehavior(MARKER_ARCHETYPES.DERIVED)
  const seen = new Set()
  const vms = []

  for (const anomaly of anomalies) {
    const coords = coordsForAnomaly(anomaly, eventMap)
    if (!coords?.lat || coords.lng == null) continue

    const id = `derived-${anomaly.type}-${anomaly.timestamp}-${anomaly.eventId || anomaly.cell || anomaly.region || anomaly.chokepoint || ''}`
    if (seen.has(id)) continue
    seen.add(id)

    const evt = anomaly.eventId ? eventMap[anomaly.eventId] : null
    const confidence = evt ? confidenceForEvent(evt) : { label: 'Derived signal', tone: 'medium', sources: [] }
    const raw = {
      id,
      anomalyType: anomaly.type,
      derivedFromAnomaly: true,
      title: titleForAnomaly(anomaly),
      why: whyForAnomaly(anomaly, eventMap),
      linkedEventIds: linkedEventIds(anomaly),
      confidence,
      lat: coords.lat,
      lng: coords.lng,
      latApproximate: !evt || evt.latApproximate,
      timestamp: anomaly.timestamp,
      archetype: MARKER_ARCHETYPES.DERIVED,
      inspectorMode: 'derived',
    }

    const vm = {
      id,
      archetype: MARKER_ARCHETYPES.DERIVED,
      anomalyType: anomaly.type,
      lat: coords.lat,
      lng: coords.lng,
      color: '#f0b429',
      radiusGl: 0.38,
      sizePx: behavior.fixedSizePx,
      opacity: confidence.tone === 'high' ? 0.95 : confidence.tone === 'flag' ? 0.88 : 0.72,
      markerIconUrl: getDerivedIconUrl(confidence.tone, '#f0b429'),
      animationClass: resolveAnimationClass(MARKER_ARCHETYPES.DERIVED, {}),
      recency: 'static',
      confidence,
      why: raw.why,
      linkedEventIds: raw.linkedEventIds,
      inspectorMode: behavior.inspectorMode,
      truth: truthLabel(MARKER_ARCHETYPES.DERIVED, raw),
      title: raw.title,
      raw,
    }
    vms.push(vm)
  }

  return vms.slice(0, 30)
}
