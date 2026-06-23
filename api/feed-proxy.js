/**
 * GET /api/feed-proxy?id=<feedId>
 *
 * Same-origin proxy for public feeds that omit CORS headers (UCDP, CISA, ProMED, NOAA).
 */

import {
  CORS_HEADERS,
  createEdgeCache,
  jsonResponse,
  optionsResponse,
  textResponse,
  upstreamFetch,
} from './_lib/proxyCommon.js'

export const config = { runtime: 'edge' }

const cache = createEdgeCache()

/** @type {Record<string, { url: string, cacheSec: number, type: 'json' | 'text', accept?: string }>} */
const FEEDS = {
  ucdp: {
    url: 'https://ucdpapi.pcr.uu.se/api/gedevents/24.1?pagesize=50',
    cacheSec: 600,
    type: 'json',
  },
  'cisa-kev': {
    url: 'https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json',
    cacheSec: 3600,
    type: 'json',
  },
  promed: {
    url: 'https://promedmail.org/feed/',
    cacheSec: 900,
    type: 'text',
    accept: 'application/rss+xml, application/xml, text/xml, */*',
  },
  'noaa-solar-wind': {
    url: 'https://services.swpc.noaa.gov/json/solar_wind/plasma-7-day.json',
    cacheSec: 300,
    type: 'json',
  },
  'noaa-kp': {
    url: 'https://services.swpc.noaa.gov/json/planetary_k_index_1m.json',
    cacheSec: 300,
    type: 'json',
  },
  'noaa-xray': {
    url: 'https://services.swpc.noaa.gov/json/goes/primary/xrays-6-hour.json',
    cacheSec: 300,
    type: 'json',
  },
}

export default async function handler(req) {
  if (req.method === 'OPTIONS') return optionsResponse()
  if (req.method !== 'GET') return jsonResponse(405, { error: 'method not allowed' })

  const url = new URL(req.url)
  const id = url.searchParams.get('id') || ''
  const feed = FEEDS[id]
  if (!feed) return jsonResponse(400, { error: 'unknown feed id', allowed: Object.keys(FEEDS) })

  const cacheKey = `feed:${id}`
  const hit = cache.get(cacheKey)
  if (hit) {
    return new Response(hit.body, {
      status: hit.status,
      headers: {
        'Content-Type': hit.contentType,
        ...CORS_HEADERS,
        'Cache-Control': `public, max-age=${feed.cacheSec}, stale-while-revalidate=${feed.cacheSec * 2}`,
        'X-Atlas-Cache': 'hit',
      },
    })
  }

  try {
    const upstream = await upstreamFetch(feed.url, {
      headers: feed.accept ? { Accept: feed.accept } : {},
    })
    const body = await upstream.arrayBuffer()
    const contentType = upstream.headers.get('content-type')
      || (feed.type === 'json' ? 'application/json; charset=utf-8' : 'text/plain; charset=utf-8')

    if (!upstream.ok) {
      return jsonResponse(upstream.status, {
        error: 'upstream failed',
        feed: id,
        status: upstream.status,
      })
    }

    cache.set(cacheKey, {
      body,
      contentType,
      status: 200,
      ts: Date.now(),
      cacheSec: feed.cacheSec,
    })

    return new Response(body, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        ...CORS_HEADERS,
        'Cache-Control': `public, max-age=${feed.cacheSec}, stale-while-revalidate=${feed.cacheSec * 2}`,
      },
    })
  } catch (err) {
    if (hit) {
      return new Response(hit.body, {
        status: hit.status,
        headers: {
          'Content-Type': hit.contentType,
          ...CORS_HEADERS,
          'X-Atlas-Stale': 'feed-cache',
        },
      })
    }
    return jsonResponse(502, { error: err?.message || 'feed proxy failed', feed: id })
  }
}
