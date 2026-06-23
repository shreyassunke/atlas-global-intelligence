/**
 * Environment hazard classification — pure logic, safe for workers.
 * Classifies events into one of 16 hazard layers before icon assignment.
 */

import { getEventSourceId } from './sourceGeolocation.js'
import { legacyCategoryToDimension } from '../utils/categoryColors.js'

export const HAZARD_TYPES = {
  EARTHQUAKE: 'earthquake',
  WILDFIRE: 'wildfire',
  HURRICANE: 'hurricane',
  DUSTSTORM: 'duststorm',
  LIGHTNING: 'lightning',
  TORNADO: 'tornado',
  FLOOD: 'flood',
  AVALANCHE: 'avalanche',
  VOLCANO: 'volcano',
  TSUNAMI: 'tsunami',
  TYPHOON: 'typhoon',
  MONSOON: 'monsoon',
  DROUGHT: 'drought',
  STORM: 'storm',
  BLIZZARD: 'blizzard',
  HEATWAVE: 'heatwave',
}

/** All hazard type string values — used to warm the icon cache. */
export const HAZARD_TYPE_VALUES = Object.values(HAZARD_TYPES)

/** Border geometry per hazard (style sheet). */
export const HAZARD_BORDER_SHAPE = {
  [HAZARD_TYPES.EARTHQUAKE]: 'diamond',
  [HAZARD_TYPES.AVALANCHE]: 'diamond',
  [HAZARD_TYPES.WILDFIRE]: 'triangle',
  [HAZARD_TYPES.VOLCANO]: 'triangle',
  [HAZARD_TYPES.HURRICANE]: 'circle',
  [HAZARD_TYPES.TORNADO]: 'circle',
  [HAZARD_TYPES.TSUNAMI]: 'circle',
  [HAZARD_TYPES.TYPHOON]: 'circle',
  [HAZARD_TYPES.STORM]: 'circle',
  [HAZARD_TYPES.FLOOD]: 'square',
  [HAZARD_TYPES.DUSTSTORM]: 'square',
  [HAZARD_TYPES.MONSOON]: 'square',
  [HAZARD_TYPES.HEATWAVE]: 'square',
  [HAZARD_TYPES.LIGHTNING]: 'hexagon',
  [HAZARD_TYPES.DROUGHT]: 'hexagon',
  [HAZARD_TYPES.BLIZZARD]: 'hexagon',
}

const SOURCE_HAZARD = {
  usgs: HAZARD_TYPES.EARTHQUAKE,
  firms: HAZARD_TYPES.WILDFIRE,
}

const EONET_CATEGORY = {
  volcanoes: HAZARD_TYPES.VOLCANO,
  severestorms: HAZARD_TYPES.STORM,
  floods: HAZARD_TYPES.FLOOD,
  landslides: HAZARD_TYPES.AVALANCHE,
  wildfires: HAZARD_TYPES.WILDFIRE,
  dusthaze: HAZARD_TYPES.DUSTSTORM,
  drought: HAZARD_TYPES.DROUGHT,
  snow: HAZARD_TYPES.BLIZZARD,
  seaLakeIce: HAZARD_TYPES.STORM,
  waterColor: HAZARD_TYPES.FLOOD,
  manmade: HAZARD_TYPES.STORM,
}

const TEXT_HAZARD_RULES = [
  [/typhoon|super typhoon/i, HAZARD_TYPES.TYPHOON],
  [/hurricane|tropical cyclone/i, HAZARD_TYPES.HURRICANE],
  [/tornado/i, HAZARD_TYPES.TORNADO],
  [/tsunami/i, HAZARD_TYPES.TSUNAMI],
  [/earthquake|seismic|aftershock|m[\d.]+ earthquake/i, HAZARD_TYPES.EARTHQUAKE],
  [/wildfire|forest fire|bushfire|active fire|\bfire\b/i, HAZARD_TYPES.WILDFIRE],
  [/volcano|eruption|lava/i, HAZARD_TYPES.VOLCANO],
  [/avalanche|landslide|mudslide|rockslide/i, HAZARD_TYPES.AVALANCHE],
  [/flood|flooding|flash flood/i, HAZARD_TYPES.FLOOD],
  [/blizzard|snowstorm|ice storm/i, HAZARD_TYPES.BLIZZARD],
  [/drought/i, HAZARD_TYPES.DROUGHT],
  [/dust\s*storm|haboob|sandstorm|dust haze/i, HAZARD_TYPES.DUSTSTORM],
  [/monsoon/i, HAZARD_TYPES.MONSOON],
  [/heat\s*wave|extreme heat|heatwave/i, HAZARD_TYPES.HEATWAVE],
  [/lightning/i, HAZARD_TYPES.LIGHTNING],
  [/extreme wind|thunderstorm|severe storm|\bstorm\b/i, HAZARD_TYPES.STORM],
]

export function eventDimension(event) {
  return event?.dimension || event?.icon || legacyCategoryToDimension(event?.category) || 'narrative'
}

/**
 * Classify an environment event into a hazard layer.
 * @param {object} event
 * @returns {string|null} hazard type key, or null when not environment
 */
export function classifyEnvironmentHazard(event) {
  if (!event) return null
  if (eventDimension(event) !== 'environment') return null

  const sourceId = getEventSourceId(event)
  const mappedSource = SOURCE_HAZARD[sourceId]
  if (mappedSource) return mappedSource

  if (sourceId === 'noaa-nhc' || event.trackKind === 'storm') {
    const text = `${event.title || ''} ${event.stormCategory || ''} ${(event.tags || []).join(' ')}`
    return /typhoon/i.test(text) ? HAZARD_TYPES.TYPHOON : HAZARD_TYPES.HURRICANE
  }

  for (const tag of event.tags || []) {
    const key = String(tag).toLowerCase().replace(/[\s_-]+/g, '')
    const eonet = EONET_CATEGORY[key]
    if (eonet) return eonet
  }

  const haystack = [
    event.title,
    event.detail,
    ...(event.tags || []),
    event.source,
  ]
    .filter(Boolean)
    .join(' ')

  for (const [re, hazard] of TEXT_HAZARD_RULES) {
    if (re.test(haystack)) return hazard
  }

  return HAZARD_TYPES.STORM
}

/** @deprecated Use classifyEnvironmentHazard */
export function resolveHazardType(event) {
  return classifyEnvironmentHazard(event)
}
