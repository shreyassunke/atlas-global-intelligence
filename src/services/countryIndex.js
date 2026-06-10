/**
 * Phase 4 — lightweight country index from the bundled Natural Earth
 * admin-0 geojson (same asset the choropleth uses). Provides FIPS 10-4 /
 * ISO2 / name plus a rough centroid per country, and resolves watchlist
 * items to countries so the Triage surge poller knows which
 * `eventSurge` queries to run.
 */

import { haversineKm } from '../core/crossSourceMerge.js'

const COUNTRY_POLYGONS_URL = '/geo/ne_110m_admin_0_countries.geojson'

/** Coordinate-based watchlist places snap to the nearest centroid within this radius. */
const NEAREST_CENTROID_MAX_KM = 1000

let indexPromise = null

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

/**
 * @returns {Promise<Array<{ fips: string, iso: string, name: string, lat: number, lng: number }>>}
 */
export function loadCountryIndex() {
  if (!indexPromise) {
    indexPromise = fetch(COUNTRY_POLYGONS_URL)
      .then((res) => {
        if (!res.ok) throw new Error(`Country index HTTP ${res.status}`)
        return res.json()
      })
      .then((geojson) => {
        const out = []
        for (const f of geojson?.features || []) {
          const g = f?.geometry
          if (!g || (g.type !== 'Polygon' && g.type !== 'MultiPolygon')) continue
          const props = f.properties || {}
          const fips = String(props.FIPS_10 || '').trim().toUpperCase()
          if (!fips || fips === '-99') continue
          const centroid = geometryCentroid(g)
          if (!centroid) continue
          out.push({
            fips,
            iso: String(props.ISO_A2_EH || props.ISO_A2 || '').trim().toUpperCase(),
            name: String(props.NAME || props.ADMIN || '').trim(),
            lat: centroid.lat,
            lng: centroid.lng,
          })
        }
        return out
      })
      .catch((err) => {
        indexPromise = null
        throw err
      })
  }
  return indexPromise
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
 * Phase 5 — generic country resolver for dossier entry points.
 * Tries an exact FIPS match, then text (ISO2 / FIPS / name), then nearest
 * centroid to lat/lng.
 *
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
 * Resolve watchlist rows to countries to surge-poll. Deduped by FIPS;
 * place items try coordinates first ("lat,lng[,radius]"), then name text;
 * topic/entity items only match when the text names a country outright.
 *
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
