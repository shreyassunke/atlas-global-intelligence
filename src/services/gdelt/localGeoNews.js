/**
 * GDELT GEO PointData → local article list near lat/lng.
 * Uses geographic `near:lat,lng,radius` (not DOC keyword near).
 */

import { buildGdeltUrl, fetchGdeltText } from './gdeltHttp.js'
import { GDELT_GEO_BASE, fetchGdeltGeoJson } from './geoService.js'

export const DEFAULT_LOCAL_RADIUS_KM = 30
export const WIDE_LOCAL_RADIUS_KM = 60

/**
 * @param {number} lat
 * @param {number} lng
 * @param {number} [radiusKm]
 */
export function buildNearQuery(lat, lng, radiusKm = DEFAULT_LOCAL_RADIUS_KM) {
  const r = Math.max(5, Math.min(200, Number(radiusKm) || DEFAULT_LOCAL_RADIUS_KM))
  return `near:${Number(lat).toFixed(4)},${Number(lng).toFixed(4)},${r}km`
}

/**
 * Haversine distance in km.
 */
export function haversineKm(lat1, lng1, lat2, lng2) {
  const toRad = (d) => (d * Math.PI) / 180
  const R = 6371
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

/**
 * Extract article links from GDELT PointData HTML / property bags.
 * @param {object} props
 * @returns {{ title: string, url: string, domain: string }[]}
 */
function articlesFromProps(props = {}) {
  const out = []
  const seen = new Set()

  const push = (title, url) => {
    const href = String(url || '').trim()
    if (!href || !/^https?:\/\//i.test(href)) return
    if (seen.has(href)) return
    seen.add(href)
    let domain = ''
    try {
      domain = new URL(href).hostname.replace(/^www\./, '')
    } catch {
      domain = ''
    }
    out.push({
      title: String(title || domain || href).replace(/\s+/g, ' ').trim().slice(0, 240),
      url: href,
      domain,
    })
  }

  // Structured arrays some GEO responses include
  for (const key of ['articles', 'Articles', 'urls', 'URLs']) {
    const rows = props[key]
    if (!Array.isArray(rows)) continue
    for (const row of rows) {
      if (typeof row === 'string') push(row, row)
      else if (row && typeof row === 'object') {
        push(row.title || row.name || row.Title, row.url || row.URL || row.href)
      }
    }
  }

  if (typeof props.url === 'string') push(props.name || props.title || props.url, props.url)
  if (typeof props.URL === 'string') push(props.name || props.title || props.URL, props.URL)

  // HTML block with up to 5 article anchors (PointData default)
  const html = props.html || props.HTML || props.info || props.description || ''
  if (typeof html === 'string' && html.includes('<a')) {
    const re = /<a\s+[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi
    let m
    while ((m = re.exec(html)) !== null) {
      const text = m[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
      push(text || m[1], m[1])
    }
  }

  return out
}

/**
 * @param {object} geojson
 * @param {{ lat: number, lng: number, maxArticles?: number }} opts
 */
export function parseLocalArticlesFromPointData(geojson, { lat, lng, maxArticles = 14 } = {}) {
  const feats = geojson?.features
  if (!Array.isArray(feats)) return []

  /** @type {Map<string, object>} */
  const byUrl = new Map()

  for (const f of feats) {
    const g = f.geometry
    const p = f.properties || {}
    if (!g || g.type !== 'Point' || !Array.isArray(g.coordinates)) continue
    const [plng, plat] = g.coordinates
    if (!Number.isFinite(plat) || !Number.isFinite(plng)) continue
    const dist = Number.isFinite(lat) && Number.isFinite(lng)
      ? haversineKm(lat, lng, plat, plng)
      : null
    const placeName = String(p.name || p.NAME || p.location || p.Location || '').trim()
    for (const art of articlesFromProps(p)) {
      const prev = byUrl.get(art.url)
      if (prev && (prev.distanceKm == null || (dist != null && prev.distanceKm <= dist))) continue
      byUrl.set(art.url, {
        ...art,
        sourcecountry: String(p.country || p.Country || p.sourcecountry || ''),
        placeName,
        lat: plat,
        lng: plng,
        distanceKm: dist != null ? Math.round(dist * 10) / 10 : null,
        provenance: 'gdelt-geo',
      })
    }
  }

  return [...byUrl.values()]
    .sort((a, b) => {
      const da = a.distanceKm ?? 9999
      const db = b.distanceKm ?? 9999
      if (da !== db) return da - db
      return (a.title || '').localeCompare(b.title || '')
    })
    .slice(0, maxArticles)
}

/**
 * Fetch geo-local headlines near a coordinate via GDELT GEO PointData.
 *
 * @param {number} lat
 * @param {number} lng
 * @param {{ timespan?: string, radiusKm?: number, maxArticles?: number, signal?: AbortSignal }} [opts]
 */
export async function fetchGeoLocalArticles(
  lat,
  lng,
  { timespan = '1440min', radiusKm = DEFAULT_LOCAL_RADIUS_KM, maxArticles = 14, signal } = {},
) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return []
  const query = buildNearQuery(lat, lng, radiusKm)
  const geojson = await fetchGdeltGeoJson(query, 'PointData', {
    timespan,
    maxpoints: Math.min(250, Math.max(40, maxArticles * 8)),
    signal,
  })
  return parseLocalArticlesFromPointData(geojson, { lat, lng, maxArticles })
}

/**
 * Optional raw text fetch helper when GeoJSON parse fails upstream.
 */
export async function fetchGeoLocalRaw(lat, lng, { timespan = '1440min', radiusKm = DEFAULT_LOCAL_RADIUS_KM, signal } = {}) {
  const query = buildNearQuery(lat, lng, radiusKm)
  const url = buildGdeltUrl(GDELT_GEO_BASE, {
    query,
    mode: 'PointData',
    format: 'GeoJSON',
    timespan,
    maxpoints: 120,
  })
  return fetchGdeltText(url, { signal, priority: 'interactive' })
}
