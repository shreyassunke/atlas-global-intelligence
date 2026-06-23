/**
 * Static reference markers — nuclear facilities, maritime chokepoints.
 * Opt-in via dataLayers.referenceNuclear / referenceChokepoints.
 */
import { NUCLEAR_FACILITIES } from './globeLayers.js'
import { CHOKEPOINTS } from './chokepoints.js'
import { getReferenceIconUrl } from './archetypeIcons.js'
import {
  MARKER_ARCHETYPES,
  getArchetypeBehavior,
  truthLabel,
} from './markerArchetype.js'

export { NUCLEAR_FACILITIES }

/**
 * @param {{ enabledCategories?: { nuclear?: boolean, chokepoints?: boolean } }} [opts]
 */
export function buildReferenceMarkerVMs({ enabledCategories = {} } = {}) {
  const vms = []
  const behavior = getArchetypeBehavior(MARKER_ARCHETYPES.REFERENCE)

  if (enabledCategories.nuclear) {
    for (const nf of NUCLEAR_FACILITIES) {
      const raw = {
        id: `ref-nuclear-${nf.name.replace(/\s+/g, '-').toLowerCase()}`,
        refKind: 'nuclear',
        refId: nf.name,
        title: nf.name,
        lat: nf.lat,
        lng: nf.lng,
        country: nf.country,
        archetype: MARKER_ARCHETYPES.REFERENCE,
        inspectorMode: 'reference',
      }
      vms.push({
        id: raw.id,
        archetype: MARKER_ARCHETYPES.REFERENCE,
        refKind: 'nuclear',
        lat: nf.lat,
        lng: nf.lng,
        color: '#94a3b8',
        radiusGl: 0.22,
        sizePx: behavior.fixedSizePx,
        opacity: behavior.staticOpacity,
        markerIconUrl: getReferenceIconUrl('nuclear'),
        animationClass: null,
        recency: 'static',
        inspectorMode: behavior.inspectorMode,
        truth: truthLabel(MARKER_ARCHETYPES.REFERENCE, raw),
        title: nf.name,
        raw,
      })
    }
  }

  if (enabledCategories.chokepoints) {
    for (const cp of CHOKEPOINTS) {
      const raw = {
        id: `ref-choke-${cp.name.replace(/\s+/g, '-').toLowerCase()}`,
        refKind: 'chokepoint',
        refId: cp.name,
        title: cp.name,
        lat: cp.lat,
        lng: cp.lng,
        region: cp.region,
        archetype: MARKER_ARCHETYPES.REFERENCE,
        inspectorMode: 'reference',
      }
      vms.push({
        id: raw.id,
        archetype: MARKER_ARCHETYPES.REFERENCE,
        refKind: 'chokepoint',
        lat: cp.lat,
        lng: cp.lng,
        color: '#94a3b8',
        radiusGl: 0.22,
        sizePx: behavior.fixedSizePx,
        opacity: behavior.staticOpacity,
        markerIconUrl: getReferenceIconUrl('chokepoint'),
        animationClass: null,
        recency: 'static',
        inspectorMode: behavior.inspectorMode,
        truth: truthLabel(MARKER_ARCHETYPES.REFERENCE, raw),
        title: cp.name,
        raw,
      })
    }
  }

  return vms
}
