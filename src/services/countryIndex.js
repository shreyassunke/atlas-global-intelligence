/**
 * Country index + fast polygon hit-testing from bundled Natural Earth admin-0.
 * Shared by choropleth, dossier entry, watchlists, and globe click recognition.
 */
import booleanPointInPolygon from '@turf/boolean-point-in-polygon'
import { point } from '@turf/helpers'
import { haversineKm } from '../core/crossSourceMerge.js'

const COUNTRY_POLYGONS_URL = '/geo/ne_110m_admin_0_countries.geojson'

/** Coordinate-based watchlist places snap to the nearest centroid within this radius. */
const NEAREST_CENTROID_MAX_KM = 1000

let indexPromise = null
let polygonsPromise = null

/** @type {Array<{ fips: string, iso: string, name: string, lat: number, lng: number, geometry: object, bbox: object, bboxArea: number }> | null} */
let polygonsCache = null

function parseCountryFeature(f) {
  const g = f?.geometry
  if (!g || (g.type !== 'Polygon' && g.type !== 'MultiPolygon')) return null
  const props = f.properties || {}
  const fips = String(props.FIPS_10 || '').trim().toUpperCase()
  if (!fips || fips === '-99') return null
  const centroid = geometryCentroid(g)
  if (!centroid) return null
  const bbox = geometryBbox(g)
  return {
    fips,
    iso: String(props.ISO_A2_EH || props.ISO_A2 || '').trim().toUpperCase(),
    name: String(props.NAME || props.ADMIN || '').trim(),
    lat: centroid.lat,
    lng: centroid.lng,
    geometry: g,
    bbox,
    bboxArea: bbox.area,
  }
}

/** Rough centroid: bbox center of the largest outer ring. Good enough for fly-to. */
function geometryCentroid(geometry) {
  let ring = null
  if (geometry.type === 'Polygon') {
    ring = geometry.coordinates?.[0]
  } else if (geometry.type === 'MultiPolygon') {
    for (const poly of geometry.coordinates || []) {
      const outer = poly?.[0]
      if (outer && (!ring || outer.length > ring.length)) ring = outer
    }
  }
  if (!ring?.length) return null
  let minLat = 90, maxLat = -90, minLng = 180, maxLng = -180
  for (const [lng, lat] of ring) {
    if (lat < minLat) minLat = lat
    if (lat > maxLat) maxLat = lat
    if (lng < minLng) minLng = lng
    if (lng > maxLng) maxLng = lng
  }
  return { lat: (minLat + maxLat) / 2, lng: (minLng + maxLng) / 2 }
}

function geometryBbox(geometry) {
  let minLat = 90, maxLat = -90, minLng = 180, maxLng = -180
  const visit = (coords) => {
    for (const [lng, lat] of coords) {
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue
      if (lat < minLat) minLat = lat
      if (lat > maxLat) maxLat = lat
      if (lng < minLng) minLng = lng
      if (lng > maxLng) maxLng = lng
    }
  }
  if (geometry.type === 'Polygon') {
    for (const ring of geometry.coordinates || []) visit(ring)
  } else if (geometry.type === 'MultiPolygon') {
    for (const poly of geometry.coordinates || []) {
      for (const ring of poly || []) visit(ring)
    }
  }
  return {
    minLat,
    maxLat,
    minLng,
    maxLng,
    area: Math.max(0, maxLat - minLat) * Math.max(0, maxLng - minLng),
  }
}

function fetchCountryGeojson() {
  return fetch(COUNTRY_POLYGONS_URL).then((res) => {
    if (!res.ok) {
      throw new Error(
        `Country polygons missing (HTTP ${res.status}). Run: npm run geo:ensure`,
      )
    }
    return res.json()
  })
}

/**
 * Full country polygons with geometry — cached module-wide for fast click hit-tests.
 * @returns {Promise<Array<{ fips, iso, name, lat, lng, geometry, bbox, bboxArea }>>}
 */
export function loadCountryPolygons() {
  if (polygonsCache) return Promise.resolve(polygonsCache)
  if (!polygonsPromise) {
    polygonsPromise = fetchCountryGeojson()
      .then((geojson) => {
        const out = []
        for (const f of geojson?.features || []) {
          const row = parseCountryFeature(f)
          if (row) out.push(row)
        }
        if (!out.length) {
          throw new Error('Country polygons file has no usable features — run: npm run geo:ensure')
        }
        polygonsCache = out
        return out
      })
      .catch((err) => {
        polygonsPromise = null
        throw err
      })
  }
  return polygonsPromise
}

/**
 * Lightweight index (centroids only) — derived from polygon cache when available.
 * @returns {Promise<Array<{ fips, iso, name, lat, lng }>>}
 */
export function loadCountryIndex() {
  if (polygonsCache) {
    return Promise.resolve(polygonsCache.map(({ fips, iso, name, lat, lng }) => ({
      fips, iso, name, lat, lng,
    })))
  }
  if (!indexPromise) {
    indexPromise = loadCountryPolygons()
      .then((rows) => rows.map(({ fips, iso, name, lat, lng }) => ({
        fips, iso, name, lat, lng,
      })))
      .catch((err) => {
        indexPromise = null
        throw err
      })
  }
  return indexPromise
}

/**
 * Fast point-in-polygon country lookup (bbox pre-filter + turf).
 * @param {number} lat
 * @param {number} lng
 * @param {Array} polygons from `loadCountryPolygons()` or `getCountryPolygonsSync()`
 * @returns {{ fips, iso, name, lat, lng } | null}
 */
export function findCountryAtPoint(lat, lng, polygons) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !polygons?.length) return null
  const pt = point([lng, lat])
  /** @type {typeof polygons} */
  const hits = []

  for (const c of polygons) {
    const b = c.bbox
    if (lat < b.minLat || lat > b.maxLat || lng < b.minLng || lng > b.maxLng) continue
    try {
      if (booleanPointInPolygon(pt, c.geometry)) hits.push(c)
    } catch {
      /* skip malformed */
    }
  }

  if (!hits.length) return null
  hits.sort((a, b) => a.bboxArea - b.bboxArea)
  const best = hits[0]
  return {
    fips: best.fips,
    iso: best.iso,
    name: best.name,
    lat: best.lat,
    lng: best.lng,
  }
}

/** @returns {typeof polygonsCache} */
export function getCountryPolygonsSync() {
  return polygonsCache
}

/**
 * @param {number} lat
 * @param {number} lng
 * @returns {Promise<{ fips, iso, name, lat, lng } | null>}
 */
export async function findCountryAtPointAsync(lat, lng) {
  const polys = await loadCountryPolygons()
  return findCountryAtPoint(lat, lng, polys)
}

function matchByText(needle, index) {
  const q = needle.trim().toLowerCase()
  if (!q) return null
  if (q.length === 2) {
    const byCode = index.find((c) => c.iso.toLowerCase() === q || c.fips.toLowerCase() === q)
    if (byCode) return byCode
  }
  const exact = index.find((c) => c.name.toLowerCase() === q)
  if (exact) return exact
  if (q.length >= 4) {
    return index.find((c) => c.name.toLowerCase().includes(q) || q.includes(c.name.toLowerCase())) || null
  }
  return null
}

function matchByLatLng(lat, lng, index) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  let best = null
  let bestKm = Infinity
  for (const c of index) {
    const km = haversineKm(lat, lng, c.lat, c.lng)
    if (km < bestKm) { bestKm = km; best = c }
  }
  return bestKm <= NEAREST_CENTROID_MAX_KM ? best : null
}

function matchByCoords(value, index) {
  const parts = value.split(',').map((s) => Number(s.trim()))
  if (parts.length < 2 || !parts.slice(0, 2).every(Number.isFinite)) return null
  return matchByLatLng(parts[0], parts[1], index)
}

/**
 * Generic country resolver for dossier entry points.
 * @param {Array} index from `loadCountryIndex()`
 * @param {{ fips?: string, text?: string, lat?: number, lng?: number }} probe
 * @returns {{ fips, iso, name, lat, lng } | null}
 */
export function findCountry(index, { fips, text, lat, lng } = {}) {
  if (!Array.isArray(index) || index.length === 0) return null
  if (fips) {
    const code = String(fips).trim().toUpperCase()
    const hit = index.find((c) => c.fips === code)
    if (hit) return hit
  }
  if (text) {
    const hit = matchByText(String(text), index)
    if (hit) return hit
  }
  return matchByLatLng(lat, lng, index)
}

/**
 * @returns {Array<{ fips, iso, name, lat, lng, watchlist: string }>}
 */
export function resolveWatchlistCountries(watchlists, index) {
  const byFips = new Map()
  for (const item of watchlists || []) {
    if (item?.enabled === false || !item?.match_value) continue
    const value = String(item.match_value)
    let hit = null
    if ((item.kind || 'topic') === 'place' && /-?\d/.test(value) && value.includes(',')) {
      hit = matchByCoords(value, index)
    }
    if (!hit) hit = matchByText(value, index)
    if (!hit && item.name) hit = matchByText(String(item.name), index)
    if (hit && !byFips.has(hit.fips)) {
      byFips.set(hit.fips, { ...hit, watchlist: item.name || value })
    }
  }
  return [...byFips.values()]
}
