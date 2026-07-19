/**
 * Investigation workspace event matching — client-side filter for scoped
 * globe workstations. Mirrors globe HUD rules from briefExport / useGlobeLayerEvents
 * plus region (ISO2 + focus_bbox) and keyword constraints.
 */

import bbox from '@turf/bbox'
import { featureCollection } from '@turf/helpers'
import { eventSourceToGlobeDataLayerKey, hasPreciseGeolocation } from './globeLayers'
import { isLayerToggleOn } from './layerCatalog'
import { findCountry, loadCountryIndex } from '../services/countryIndex'

const COUNTRY_POLYGONS_URL = '/geo/ne_110m_admin_0_countries.geojson'

const DEFAULT_DIMENSIONS = ['safety', 'governance', 'economy', 'people', 'environment', 'narrative']

let countryGeojsonPromise = null

function normalizeWorkspaceDimensions(activeDimensions) {
  if (!activeDimensions) return new Set(DEFAULT_DIMENSIONS)
  if (activeDimensions instanceof Set) {
    return activeDimensions.size ? activeDimensions : new Set(DEFAULT_DIMENSIONS)
  }
  if (Array.isArray(activeDimensions)) {
    const arr = activeDimensions.filter(Boolean)
    return arr.length ? new Set(arr) : new Set(DEFAULT_DIMENSIONS)
  }
  return new Set(DEFAULT_DIMENSIONS)
}

function passesDataLayers(evt, dataLayers) {
  const layerKey = eventSourceToGlobeDataLayerKey(evt)
  if (!layerKey) return false
  return isLayerToggleOn(layerKey, dataLayers || {})
}

/**
 * @param {number} lat
 * @param {number} lng
 * @param {{ south?: number, west?: number, north?: number, east?: number }} box
 */
function pointInBbox(lat, lng, box) {
  if (!box || !Number.isFinite(lat) || !Number.isFinite(lng)) return false
  const { south, west, north, east } = box
  if (![south, west, north, east].every(Number.isFinite)) return false
  if (lat < south || lat > north) return false
  if (west <= east) return lng >= west && lng <= east
  return lng >= west || lng <= east
}

/**
 * @param {Object} event
 * @param {Array|null} countryIndex from `loadCountryIndex()`
 * @returns {string|null} ISO2
 */
function resolveEventIso2(event, countryIndex) {
  const direct = String(event.iso || event.countryIso || '').trim().toUpperCase()
  if (direct.length === 2) return direct

  const country = String(event.country || '').trim()
  if (country.length === 2 && /^[A-Z]{2}$/i.test(country)) return country.toUpperCase()

  if (!countryIndex?.length) return null

  const hit = findCountry(countryIndex, {
    fips: event.countryCode,
    text: event.country || event.locationName || event.location,
    lat: event.lat,
    lng: event.lng,
  })
  return hit?.iso ? hit.iso.toUpperCase() : null
}

/**
 * @param {Object} event
 * @param {Object} workspace
 * @param {Array|null} countryIndex
 */
function passesRegion(event, workspace, countryIndex) {
  const regions = workspace.focus_regions || workspace.focusRegions || []
  const box = workspace.focus_bbox || workspace.focusBbox

  if (!regions.length && !box) return true

  const normalizedRegions = regions
    .map((r) => String(r).trim().toUpperCase())
    .filter(Boolean)

  const iso2 = resolveEventIso2(event, countryIndex)
  if (iso2 && normalizedRegions.includes(iso2)) return true

  if (box && pointInBbox(event.lat, event.lng, box)) return true

  return false
}

/**
 * @param {Object} event
 * @param {string[]} keywords
 */
function passesKeywords(event, keywords) {
  const list = keywords || []
  if (!list.length) return true

  const text = [
    event.title,
    event.summary,
    event.detail,
    event.description,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()

  return list.some((k) => {
    const needle = String(k).trim().toLowerCase()
    return needle && text.includes(needle)
  })
}

/**
 * Whether an incoming event belongs in a workspace investigation timeline.
 *
 * @param {Object} workspace — Supabase row or store slice (snake_case or camelCase)
 * @param {Object} event — atlas event object
 * @param {{ countryIndex?: Array|null }} [options] — preloaded country index for ISO2 resolution
 * @returns {boolean}
 */
export function eventMatchesWorkspace(workspace, event, options = {}) {
  if (!workspace || !event) return false
  if (event.trackKind) return false

  if (!hasPreciseGeolocation(event)) return false

  const dims = normalizeWorkspaceDimensions(
    workspace.active_dimensions || workspace.activeDimensions,
  )
  if (!dims.has(event.dimension)) return false

  if (!passesDataLayers(event, workspace.data_layers || workspace.dataLayers)) return false

  const countryIndex = options.countryIndex ?? null
  if (!passesRegion(event, workspace, countryIndex)) return false

  if (!passesKeywords(event, workspace.keywords)) return false

  return true
}

/**
 * Map an atlas event to a `workspace_events` insert/upsert row.
 *
 * @param {string} workspaceId
 * @param {Object} event
 * @returns {Object}
 */
export function eventToWorkspaceEventRow(workspaceId, event) {
  return {
    workspace_id: workspaceId,
    event_id: event.id,
    event_data: event,
    captured_at: new Date().toISOString(),
    dimension: event.dimension || null,
    severity: event.severity ?? null,
    priority: event.priority || null,
    title: event.title || null,
    source: event.source || null,
    lat: event.lat ?? null,
    lng: event.lng ?? null,
  }
}

/**
 * Convert a Turf bbox `[west, south, east, north]` to the app's fly-to shape.
 * @param {number[]} turfBbox
 * @returns {{ south: number, west: number, north: number, east: number, lat: number, lng: number }}
 */
export function turfBboxToFocusBbox(turfBbox) {
  const [west, south, east, north] = turfBbox
  return {
    south,
    west,
    north,
    east,
    lat: (south + north) / 2,
    lng: (west + east) / 2,
  }
}

/**
 * Union bbox for a set of GeoJSON features (Natural Earth country polygons).
 *
 * @param {import('geojson').Feature[]} features
 * @returns {{ south: number, west: number, north: number, east: number, lat: number, lng: number } | null}
 */
export function computeFocusBboxFromCountryFeatures(features) {
  if (!features?.length) return null
  const fc = featureCollection(
    features.map((f) =>
      f?.type === 'Feature'
        ? f
        : { type: 'Feature', geometry: f.geometry, properties: f.properties || {} },
    ),
  )
  return turfBboxToFocusBbox(bbox(fc))
}

function loadCountryGeojson() {
  if (!countryGeojsonPromise) {
    countryGeojsonPromise = fetch(COUNTRY_POLYGONS_URL)
      .then((res) => {
        if (!res.ok) throw new Error(`Country polygons HTTP ${res.status}`)
        return res.json()
      })
      .catch((err) => {
        countryGeojsonPromise = null
        throw err
      })
  }
  return countryGeojsonPromise
}

/**
 * Centroid fallback when polygon geometry is unavailable for an ISO code.
 * @param {Array} countryIndex
 * @param {string[]} isoCodes
 */
function focusBboxFromCentroids(countryIndex, isoCodes) {
  const codes = new Set(isoCodes.map((c) => String(c).trim().toUpperCase()).filter(Boolean))
  const hits = countryIndex.filter((c) => codes.has(c.iso))
  if (!hits.length) return null

  let south = 90
  let north = -90
  let west = 180
  let east = -180
  const pad = 2.5

  for (const c of hits) {
    south = Math.min(south, c.lat - pad)
    north = Math.max(north, c.lat + pad)
    west = Math.min(west, c.lng - pad)
    east = Math.max(east, c.lng + pad)
  }

  return {
    south,
    west,
    north,
    east,
    lat: (south + north) / 2,
    lng: (west + east) / 2,
  }
}

/**
 * Resolve ISO2 focus regions to a union bbox for `focus_bbox` storage and fly-to.
 * Called on workspace create/update.
 *
 * @param {string[]} isoCodes — ISO2 country codes
 * @returns {Promise<{ south: number, west: number, north: number, east: number, lat: number, lng: number } | null>}
 */
export async function resolveFocusBboxForIsoCodes(isoCodes) {
  const codes = [...new Set(
    (isoCodes || []).map((c) => String(c).trim().toUpperCase()).filter(Boolean),
  )]
  if (!codes.length) return null

  const codeSet = new Set(codes)

  try {
    const geojson = await loadCountryGeojson()
    const features = (geojson?.features || []).filter((f) => {
      const iso = String(f.properties?.ISO_A2_EH || f.properties?.ISO_A2 || '')
        .trim()
        .toUpperCase()
      return codeSet.has(iso)
    })
    const fromPolygons = computeFocusBboxFromCountryFeatures(features)
    if (fromPolygons) return fromPolygons
  } catch {
    /* fall through to centroid index */
  }

  const index = await loadCountryIndex()
  return focusBboxFromCentroids(index, codes)
}
