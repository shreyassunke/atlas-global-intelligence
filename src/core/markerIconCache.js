/**
 * Pre-warmed marker icon cache.
 *
 * Pipeline: classify → lookup cached PNG data URL → attach to event before globe.
 * Globe renderers read `event.markerIconUrl` only — no runtime sprite generation.
 */

import { DIMENSION_COLORS, DIMENSION_KEYS, DIMENSIONS } from './eventSchema.js'
import {
  classifyEnvironmentHazard,
  eventDimension,
  HAZARD_TYPES,
  HAZARD_TYPE_VALUES,
} from './environmentHazardClassifier.js'
import { drawHazardMarker } from './environmentHazardIcons.js'
import { warmArchetypeIconCache } from './archetypeIcons.js'

const ICON_SIZE = 64
const HALF = ICON_SIZE / 2
const CACHE_VERSION = 'marker-v6'

const hazardIconUrls = new Map()
const dimensionIconUrls = new Map()
let cacheReady = false

function renderCanvasToDataUrl(draw, size = ICON_SIZE) {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  draw(ctx, size)
  return canvas.toDataURL('image/png')
}

function buildHazardIconUrl(hazardType) {
  const key = `${CACHE_VERSION}:hazard:${hazardType}`
  if (hazardIconUrls.has(key)) return hazardIconUrls.get(key)

  const fill = `${DIMENSION_COLORS[DIMENSIONS.ENVIRONMENT]}cc`
  const url = renderCanvasToDataUrl((ctx, size) => {
    const scale = size / ICON_SIZE
    ctx.save()
    ctx.scale(scale, scale)
    drawHazardMarker(ctx, hazardType, HALF, HALF, fill)
    ctx.restore()
  })

  hazardIconUrls.set(key, url)
  return url
}

function buildDimensionIconUrl(dimension) {
  const key = `${CACHE_VERSION}:dim:${dimension}`
  if (dimensionIconUrls.has(key)) return dimensionIconUrls.get(key)

  const color = DIMENSION_COLORS[dimension] || '#ffffff'
  const url = renderCanvasToDataUrl((ctx, size) => {
    const scale = size / ICON_SIZE
    const half = size / 2
    ctx.save()
    ctx.scale(scale, scale)
    ctx.beginPath()
    ctx.arc(HALF, HALF, HALF - 4, 0, Math.PI * 2)
    ctx.fillStyle = color
    ctx.fill()
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'
    ctx.lineWidth = 2
    ctx.stroke()
    ctx.restore()
  })

  dimensionIconUrls.set(key, url)
  return url
}

/** Pre-generate every hazard + non-environment dimension icon. Call once at startup. */
export function warmMarkerIconCache() {
  if (cacheReady) return
  for (const hazard of HAZARD_TYPE_VALUES) {
    buildHazardIconUrl(hazard)
  }
  for (const dim of DIMENSION_KEYS) {
    if (dim !== DIMENSIONS.ENVIRONMENT) {
      buildDimensionIconUrl(dim)
    }
  }
  warmArchetypeIconCache()
  cacheReady = true
}

export function isMarkerIconCacheReady() {
  return cacheReady
}

export function getHazardMarkerIconUrl(hazardType) {
  warmMarkerIconCache()
  return buildHazardIconUrl(hazardType || HAZARD_TYPES.STORM)
}

export function getDimensionMarkerIconUrl(dimension) {
  warmMarkerIconCache()
  return buildDimensionIconUrl(dimension || 'narrative')
}

/**
 * Classify (if needed) and attach cached markerIconUrl to a single event.
 * @param {object} event
 * @returns {object}
 */
export function enrichEventMarkerVisuals(event) {
  if (!event) return event

  const dimension = eventDimension(event)
  const environmentHazard = dimension === DIMENSIONS.ENVIRONMENT
    ? (event.environmentHazard || classifyEnvironmentHazard(event))
    : null

  const markerIconUrl = dimension === DIMENSIONS.ENVIRONMENT
    ? getHazardMarkerIconUrl(environmentHazard)
    : getDimensionMarkerIconUrl(dimension)

  if (event.environmentHazard === environmentHazard && event.markerIconUrl === markerIconUrl) {
    return event
  }

  return { ...event, environmentHazard, markerIconUrl }
}

/** @param {object[]} events */
export function enrichEventsMarkerVisuals(events) {
  if (!Array.isArray(events) || events.length === 0) return events
  warmMarkerIconCache()
  return events.map(enrichEventMarkerVisuals)
}

/** @param {object} diff — eventBus batch diff */
export function enrichBatchDiffMarkerVisuals(diff) {
  if (!diff) return diff
  warmMarkerIconCache()

  if (diff.snapshot) {
    return { snapshot: enrichEventsMarkerVisuals(diff.snapshot) }
  }

  const out = { ...diff }
  if (out.added?.length) out.added = enrichEventsMarkerVisuals(out.added)
  if (out.updated?.length) out.updated = enrichEventsMarkerVisuals(out.updated)
  return out
}
