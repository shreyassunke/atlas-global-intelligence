/**
 * GET /api/sentinel2-scene?lat=48.8&lng=2.3&days=30
 * Copernicus Data Space STAC search for Sentinel-2 L2A ($0, no key for catalog).
 * Returns best (lowest cloud cover) scene thumbnail + metadata for an AOI.
 */

export const config = {
  runtime: 'edge',
}

const STAC_URL = 'https://catalogue.dataspace.copernicus.eu/stac/search'
const CACHE_MS = 300_000
/** @type {Map<string, { body: string, ts: number }>} */
const cache = new Map()

function parseCoord(val, fallback) {
  const n = Number(val)
  return Number.isFinite(n) ? n : fallback
}

export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'content-type',
      },
    })
  }

  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const url = new URL(req.url)
  const lat = parseCoord(url.searchParams.get('lat'), NaN)
  const lng = parseCoord(url.searchParams.get('lng'), NaN)
  const days = Math.min(90, Math.max(1, parseCoord(url.searchParams.get('days'), 30)))

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return new Response(JSON.stringify({ error: 'lat and lng query params required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  }

  const delta = 0.08
  const bbox = [lng - delta, lat - delta, lng + delta, lat + delta]
  const cacheKey = `${lat.toFixed(3)},${lng.toFixed(3)},${days}`
  const hit = cache.get(cacheKey)
  if (hit && Date.now() - hit.ts < CACHE_MS) {
    return new Response(hit.body, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=120',
        'X-Atlas-Cache': 'hit',
      },
    })
  }

  const end = new Date()
  const start = new Date(end.getTime() - days * 86400_000)

  const body = {
    collections: ['sentinel-2-l2a'],
    bbox,
    datetime: `${start.toISOString()}/${end.toISOString()}`,
    limit: 5,
    sortby: [{ field: 'properties.eo:cloud_cover', direction: 'asc' }],
  }

  try {
    const res = await fetch(STAC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20_000),
    })

    if (!res.ok) {
      const errText = await res.text().catch(() => '')
      throw new Error(`Copernicus STAC HTTP ${res.status}${errText ? `: ${errText.slice(0, 120)}` : ''}`)
    }

    const data = await res.json()
    const features = data?.features || []
    if (!features.length) {
      const empty = JSON.stringify({
        scene: null,
        message: `No Sentinel-2 L2A scenes in the last ${days} days for this AOI`,
      })
      return new Response(empty, {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'public, max-age=60',
        },
      })
    }

    const best = features[0]
    const props = best.properties || {}
    const assets = best.assets || {}
    const thumb =
      assets.thumbnail?.href ||
      assets.visual?.href ||
      assets['preview']?.href ||
      null
    const sceneBbox = best.bbox || bbox

    const payload = {
      scene: {
        id: best.id,
        datetime: props.datetime || props.start_datetime || null,
        cloudCover: props['eo:cloud_cover'] ?? props.cloud_cover ?? null,
        platform: props.platform || 'Sentinel-2',
        thumbnailUrl: thumb,
        bbox: sceneBbox,
        lat,
        lng,
      },
    }

    const json = JSON.stringify(payload)
    cache.set(cacheKey, { body: json, ts: Date.now() })

    return new Response(json, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=120',
      },
    })
  } catch (err) {
    return new Response(JSON.stringify({
      scene: null,
      error: err.message || 'Sentinel-2 STAC search failed',
    }), {
      status: 502,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    })
  }
}
