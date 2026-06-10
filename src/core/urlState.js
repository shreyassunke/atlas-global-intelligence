// ═══════════════════════════════════════════════════════════════════════════
//  ATLAS URL State — shareable view encoding (Phase 5)
//
//  Encodes filters, layers, globe mode, camera, and selected event into the
//  query string. No backend required.
// ═══════════════════════════════════════════════════════════════════════════

import { DIMENSION_KEYS } from './eventSchema'
import { serializeFilters, deserializeFilters } from './queryParams'

/** @typedef {'cesium'|'globegl'|'leaflet'} GlobeMode */

const GLOBE_MODES = ['cesium', 'globegl', 'leaflet']

/**
 * Default data-layer toggles — must stay aligned with atlasStore DEFAULT_DATA_LAYERS.
 * @type {Record<string, boolean>}
 */
export const URL_LAYER_DEFAULTS = {
  gdeltSignals: true,
  firms: true,
  usgs: true,
  gdacs: true,
  eonet: true,
  gdeltHeatmap: false,
  gdeltChoropleth: true,
  gibsTrueColor: false,
  gibsFires: false,
  gibsAerosol: false,
  gibsDust: false,
  gibsClouds: false,
  gibsBlackMarble: false,
  terminator: true,
  adsb: false,
  adsbMilitary: true,
  satellites: false,
  ais: false,
  nhcStorms: false,
  windOverlay: false,
}

const LAYER_KEYS = Object.keys(URL_LAYER_DEFAULTS)

function round(n, places = 4) {
  const f = 10 ** places
  return Math.round(n * f) / f
}

/**
 * @param {Record<string, boolean>} dataLayers
 */
function encodeLayerDeltas(dataLayers) {
  const on = []
  const off = []
  for (const key of LAYER_KEYS) {
    const current = dataLayers[key] !== false
    const def = URL_LAYER_DEFAULTS[key] !== false
    if (current && !def) on.push(key)
    if (!current && def) off.push(key)
  }
  return { on, off }
}

/**
 * @param {Record<string, boolean>} base
 * @param {string[]} on
 * @param {string[]} off
 */
function decodeLayerDeltas(base, on = [], off = []) {
  const next = { ...base }
  for (const k of on) {
    if (LAYER_KEYS.includes(k)) next[k] = true
  }
  for (const k of off) {
    if (LAYER_KEYS.includes(k)) next[k] = false
  }
  return next
}

/**
 * @param {Object} state
 * @param {Set|Array} state.activeDimensions
 * @param {string} state.priorityFilter
 * @param {string} state.timeFilter
 * @param {Record<string, boolean>} state.dataLayers
 * @param {string} state.globeMode
 * @param {boolean} state.tacticalMode
 * @param {boolean} state.detectionMode
 * @param {string} state.detectionLabelDensity
 * @param {{ lat: number, lng: number, rangeM?: number, heading?: number, tilt?: number }}|null} state.shareCamera
 * @param {number|null} state.zoomLevel
 * @param {string|null} state.selectedEventId
 * @returns {URLSearchParams}
 */
export function serializeAtlasUrlState(state) {
  const params = serializeFilters({
    activeDimensions: state.activeDimensions,
    priorityFilter: state.priorityFilter,
    timeFilter: state.timeFilter,
  })

  const { on, off } = encodeLayerDeltas(state.dataLayers || URL_LAYER_DEFAULTS)
  if (on.length) params.set('lyOn', on.join(','))
  if (off.length) params.set('lyOff', off.join(','))

  if (state.globeMode && state.globeMode !== 'cesium') {
    params.set('gm', state.globeMode)
  }

  if (state.tacticalMode) params.set('tac', '1')
  if (state.detectionMode) {
    params.set('det', '1')
    if (state.detectionLabelDensity === 'dense') params.set('detLbl', 'dense')
  }

  const cam = state.shareCamera
  if (cam && Number.isFinite(cam.lat) && Number.isFinite(cam.lng)) {
    const parts = [round(cam.lat, 4), round(cam.lng, 4)]
    if (Number.isFinite(cam.rangeM)) parts.push(String(Math.round(cam.rangeM)))
    if (Number.isFinite(cam.heading)) parts.push(String(round(cam.heading, 2)))
    if (Number.isFinite(cam.tilt)) parts.push(String(round(cam.tilt, 2)))
    params.set('cam', parts.join(','))
  }

  if (typeof state.zoomLevel === 'number' && Number.isFinite(state.zoomLevel)) {
    params.set('z', String(round(state.zoomLevel, 3)))
  }

  if (state.selectedEventId) {
    params.set('evt', state.selectedEventId)
  }

  // Phase 5 — Dossier deep link (ISO2 / FIPS / country name)
  if (state.dossierCode) {
    params.set('dossier', state.dossierCode)
  }

  return params
}

/**
 * @param {URLSearchParams|string} searchParams
 * @param {Record<string, boolean>} [baseLayers]
 * @returns {Object}
 */
export function deserializeAtlasUrlState(searchParams, baseLayers = URL_LAYER_DEFAULTS) {
  const params = typeof searchParams === 'string'
    ? new URLSearchParams(searchParams)
    : searchParams

  const out = { ...deserializeFilters(params) }

  if (params.has('lyOn') || params.has('lyOff')) {
    const on = params.has('lyOn') ? params.get('lyOn').split(',').filter(Boolean) : []
    const off = params.has('lyOff') ? params.get('lyOff').split(',').filter(Boolean) : []
    out.dataLayers = decodeLayerDeltas({ ...baseLayers }, on, off)
  }

  if (params.has('gm')) {
    const gm = params.get('gm')
    if (GLOBE_MODES.includes(gm)) out.globeMode = gm
  }

  if (params.get('tac') === '1') out.tacticalMode = true
  if (params.get('det') === '1') {
    out.detectionMode = true
    if (params.get('detLbl') === 'dense') out.detectionLabelDensity = 'dense'
  }

  if (params.has('cam')) {
    const parts = params.get('cam').split(',').map(Number)
    if (parts.length >= 2 && parts.every((n, i) => i < 2 ? !Number.isNaN(n) : true)) {
      out.shareCamera = {
        lat: parts[0],
        lng: parts[1],
        rangeM: parts[2] > 0 ? parts[2] : undefined,
        heading: parts[3] != null && !Number.isNaN(parts[3]) ? parts[3] : undefined,
        tilt: parts[4] != null && !Number.isNaN(parts[4]) ? parts[4] : undefined,
      }
    }
  }

  if (params.has('z')) {
    const z = Number(params.get('z'))
    if (Number.isFinite(z)) out.zoomLevel = Math.max(0, Math.min(1, z))
  }

  if (params.has('evt')) {
    out.selectedEventId = params.get('evt')
  }

  if (params.has('dossier')) {
    const code = params.get('dossier').trim()
    if (code) out.dossierCode = code.slice(0, 64)
  }

  // Legacy dimension-only URLs still work via deserializeFilters
  if (!out.activeDimensions && params.has('dim')) {
    const dims = params.get('dim').split(',').filter((d) => DIMENSION_KEYS.includes(d))
    if (dims.length) out.activeDimensions = new Set(dims)
  }

  return out
}

/**
 * Build a shareable URL for the current origin + path.
 * @param {Object} state — same shape as serializeAtlasUrlState
 */
export function buildShareUrl(state) {
  if (typeof window === 'undefined') return ''
  const params = serializeAtlasUrlState(state)
  const url = new URL(window.location.href)
  url.search = params.toString()
  return url.toString()
}

/**
 * Replace the browser URL without navigation.
 * @param {Object} state
 */
export function writeAtlasUrlState(state) {
  if (typeof window === 'undefined') return
  try {
    const params = serializeAtlasUrlState(state)
    const url = new URL(window.location.href)
    const next = params.toString()
    if (url.search.replace(/^\?/, '') === next) return
    url.search = next
    window.history.replaceState({}, '', url.toString())
    window.dispatchEvent(new Event('atlas-history'))
  } catch {
    /* ignore */
  }
}

export async function copyShareUrl(state) {
  const link = buildShareUrl(state)
  if (!link) return false
  try {
    await navigator.clipboard.writeText(link)
    return true
  } catch {
    try {
      const ta = document.createElement('textarea')
      ta.value = link
      ta.style.position = 'fixed'
      ta.style.left = '-9999px'
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
      return true
    } catch {
      return false
    }
  }
}
