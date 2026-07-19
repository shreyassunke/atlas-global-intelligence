/**
 * Place TOP NEWS orchestrator — GEO near (primary) + tight DOC + optional APITube.
 */

import {
  fetchDocArticles,
  timespanFromTimeFilter,
} from './analyticsService.js'
import {
  DEFAULT_LOCAL_RADIUS_KM,
  WIDE_LOCAL_RADIUS_KM,
  fetchGeoLocalArticles,
} from './localGeoNews.js'
import { placeNewsQueryPlan } from '../../utils/placeHierarchy.js'

const MIN_REASONABLE = 3
const MAX_DOC_RUNGS = 3

/** Domains that rarely carry place-local civic coverage. */
const NOISE_DOMAINS = new Set([
  'screenrant.com',
  'cbr.com',
  'comicbook.com',
  'hollywoodreporter.com',
  'variety.com',
  'tmz.com',
  'buzzfeed.com',
  'people.com',
  'espn.com',
  'bleacherreport.com',
])

/**
 * Soft filter for DOC keyword results — drop obvious national entertainment
 * when the title does not mention any local place token.
 */
export function filterDocArticlesForPlace(articles, place, country) {
  const tokens = [
    place?.city,
    place?.county,
    place?.state,
    place?.label,
    country?.name,
  ]
    .filter(Boolean)
    .map((t) => String(t).toLowerCase())
    .filter((t) => t.length >= 3)

  return (articles || []).filter((a) => {
    const domain = String(a.domain || '').toLowerCase().replace(/^www\./, '')
    const title = String(a.title || '').toLowerCase()
    if (NOISE_DOMAINS.has(domain)) {
      if (!tokens.some((t) => title.includes(t))) return false
    }
    return true
  })
}

function dedupeArticles(rows) {
  const seen = new Set()
  const out = []
  for (const a of rows || []) {
    const key = String(a.url || '').trim()
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push(a)
  }
  return out
}

/**
 * @param {{ place?: object, country?: object, lat?: number, lng?: number, timespan?: string, signal?: AbortSignal, onPartial?: Function }} opts
 */
export async function fetchPlaceLocalNews({
  place,
  country,
  lat,
  lng,
  timespan = '1440min',
  signal,
  onPartial,
} = {}) {
  const haveCoords = Number.isFinite(lat) && Number.isFinite(lng)
  let articles = []
  let source = 'none'
  let radiusKm = null
  let meta = { cacheLayer: 'network', stale: false }
  let rungsUsed = 0
  let lastError = null

  // ── 1. GDELT GEO near (coordinate micro path) ─────────────────────
  if (haveCoords) {
    for (const radius of [DEFAULT_LOCAL_RADIUS_KM, WIDE_LOCAL_RADIUS_KM]) {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
      rungsUsed += 1
      try {
        const geoArts = await fetchGeoLocalArticles(lat, lng, {
          timespan,
          radiusKm: radius,
          maxArticles: 14,
          signal,
        })
        if (geoArts.length) {
          articles = geoArts
          source = 'gdelt-geo'
          radiusKm = radius
          meta = { cacheLayer: 'network', stale: false, provenance: 'gdelt-geo' }
          onPartial?.({
            articles,
            source,
            radiusKm,
            level: 'geo',
            name: place?.city || place?.label || `${radius}km`,
            meta,
            rungsUsed,
            complete: geoArts.length >= MIN_REASONABLE,
          })
          if (geoArts.length >= MIN_REASONABLE) {
            return {
              articles: articles.slice(0, 14),
              source,
              radiusKm,
              level: 'geo',
              name: place?.city || place?.label || 'nearby',
              meta,
              rungsUsed,
            }
          }
        }
      } catch (err) {
        if (err?.name === 'AbortError') throw err
        lastError = err
      }
    }
  }

  // ── 2. Optional APITube local (env-backed proxy) when GEO thin ────
  if (haveCoords && articles.length < MIN_REASONABLE) {
    try {
      rungsUsed += 1
      const tube = await fetchApiTubeLocal(lat, lng, { signal, radiusKm: DEFAULT_LOCAL_RADIUS_KM })
      if (tube.length) {
        articles = dedupeArticles([...articles, ...tube])
        source = articles.some((a) => a.provenance === 'gdelt-geo') ? 'geo+apitube' : 'apitube'
        radiusKm = radiusKm || DEFAULT_LOCAL_RADIUS_KM
        onPartial?.({
          articles,
          source,
          radiusKm,
          level: 'geo',
          name: place?.city || place?.label || 'nearby',
          meta: { ...meta, provenance: source },
          rungsUsed,
          complete: articles.length >= MIN_REASONABLE,
        })
        if (articles.length >= MIN_REASONABLE) {
          return {
            articles: articles.slice(0, 14),
            source,
            radiusKm,
            level: 'geo',
            name: place?.city || place?.label || 'nearby',
            meta: { ...meta, provenance: source },
            rungsUsed,
          }
        }
      }
    } catch (err) {
      if (err?.name === 'AbortError') throw err
      // APITube optional — ignore missing key / 503
      lastError = lastError || err
    }
  }

  // ── 3. Tight DOC location-style queries (no bare city OR ladder) ──
  const plan = placeNewsQueryPlan(place, country).filter(
    (s) => s.kind === 'compound' || s.kind === 'location' || (s.kind === 'single' && s.level !== 'country'),
  ).slice(0, MAX_DOC_RUNGS)

  for (const step of plan) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    if (!step.query) continue
    rungsUsed += 1
    try {
      const result = await fetchDocArticles(step.query, timespan, {
        maxrecords: 14,
        signal,
        priority: 'interactive',
        withMeta: true,
      })
      const filtered = filterDocArticlesForPlace(result?.articles || [], place, country)
        .map((a) => ({ ...a, provenance: 'gdelt-doc' }))
      if (filtered.length) {
        articles = dedupeArticles([...articles, ...filtered])
        if (source === 'none') source = 'gdelt-doc'
        else if (!String(source).includes('doc')) source = `${source}+doc`
        meta = result?.meta || meta
        onPartial?.({
          articles,
          source,
          radiusKm,
          level: step.level,
          name: step.name,
          meta,
          rungsUsed,
          complete: articles.length >= MIN_REASONABLE,
        })
        if (articles.length >= MIN_REASONABLE) {
          return {
            articles: articles.slice(0, 14),
            source,
            radiusKm,
            level: step.level,
            name: step.name,
            meta,
            rungsUsed,
          }
        }
      }
    } catch (err) {
      if (err?.name === 'AbortError') throw err
      lastError = err
    }
  }

  if (articles.length) {
    return {
      articles: articles.slice(0, 14),
      source,
      radiusKm,
      level: source.startsWith('gdelt-geo') || source.includes('geo') ? 'geo' : 'doc',
      name: place?.city || place?.label || country?.name || 'place',
      meta,
      rungsUsed,
    }
  }

  if (lastError) throw lastError
  return {
    articles: [],
    source: 'none',
    radiusKm,
    level: null,
    name: null,
    meta,
    rungsUsed,
  }
}

/**
 * APITube /v1/news/local via same-origin news-proxy when APITUBE_KEY is set.
 */
async function fetchApiTubeLocal(lat, lng, { signal, radiusKm = DEFAULT_LOCAL_RADIUS_KM } = {}) {
  const params = new URLSearchParams({
    provider: 'apitube',
    lat: String(lat),
    lng: String(lng),
    radius: String(radiusKm),
    sort: 'distance',
  })
  const res = await fetch(`/api/news-proxy?${params}`, { signal })
  if (res.status === 503 || res.status === 501) return []
  if (!res.ok) return []
  const json = await res.json()
  const rows = json?.results || json?.articles || json?.data || []
  if (!Array.isArray(rows)) return []
  return rows
    .map((row) => {
      const url = row.url || row.link || row.article_url
      if (!url) return null
      let domain = row.domain || row.source || ''
      try {
        if (!domain) domain = new URL(url).hostname.replace(/^www\./, '')
      } catch { /* ignore */ }
      return {
        title: String(row.title || row.headline || url),
        url: String(url),
        domain: String(domain),
        sourcecountry: String(row.country || row.source_country || ''),
        distanceKm: row.distance_km != null ? Number(row.distance_km) : null,
        provenance: 'apitube',
      }
    })
    .filter(Boolean)
    .slice(0, 14)
}

export { timespanFromTimeFilter }
