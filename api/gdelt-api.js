/**
 * GET /api/gdelt-api?path=doc/doc&query=...&mode=...
 *
 * Proxies GDELT 2.0 REST API (api.gdeltproject.org) — no CORS from browser/worker.
 * ArtList gets longer SWR + stale-if-error from last-good edge body.
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

const GDELT_BASE = 'https://api.gdeltproject.org/api/v2'
const ALLOWED_PATH = /^[a-z0-9/_-]+$/i
const cache = createEdgeCache()

const DEFAULT_CACHE_SEC = 120
const DEFAULT_SWR_SEC = 600
const ARTLIST_CACHE_SEC = 300
const ARTLIST_SWR_SEC = 1800

function isArtlist(url) {
  try {
    const u = new URL(url)
    return (u.searchParams.get('mode') || '').toLowerCase() === 'artlist'
  } catch {
    return false
  }
}

function cachePolicy(upstreamUrl) {
  if (isArtlist(upstreamUrl)) {
    return {
      cacheSec: ARTLIST_CACHE_SEC,
      swrSec: ARTLIST_SWR_SEC,
      header: `public, max-age=${ARTLIST_CACHE_SEC}, stale-while-revalidate=${ARTLIST_SWR_SEC}`,
    }
  }
  return {
    cacheSec: DEFAULT_CACHE_SEC,
    swrSec: DEFAULT_SWR_SEC,
    header: `public, max-age=${DEFAULT_CACHE_SEC}, stale-while-revalidate=${DEFAULT_SWR_SEC}`,
  }
}

export default async function handler(req) {
  if (req.method === 'OPTIONS') return optionsResponse()
  if (req.method !== 'GET') return jsonResponse(405, { error: 'method not allowed' })

  const url = new URL(req.url)
  const path = url.searchParams.get('path') || ''
  if (!path || !ALLOWED_PATH.test(path) || path.includes('..')) {
    return jsonResponse(400, { error: 'invalid path' })
  }

  const upstreamParams = new URLSearchParams(url.searchParams)
  upstreamParams.delete('path')
  const qs = upstreamParams.toString()
  const upstreamUrl = `${GDELT_BASE}/${path}${qs ? `?${qs}` : ''}`
  const policy = cachePolicy(upstreamUrl)

  const cacheKey = `gdelt:${upstreamUrl}`
  const hit = cache.get(cacheKey)
  if (hit) {
    return new Response(hit.body, {
      status: hit.status,
      headers: {
        'Content-Type': hit.contentType,
        ...CORS_HEADERS,
        'Cache-Control': policy.header,
        'X-Atlas-Cache': 'hit',
      },
    })
  }

  const stale = typeof cache.getStale === 'function' ? cache.getStale(cacheKey) : null
  const swrLimitMs = stale
    ? (stale.cacheSec + (stale.swrSec ?? policy.swrSec)) * 1000
    : 0
  const withinSwr = Boolean(stale?.body && Date.now() - stale.ts < swrLimitMs)

  // Stale-while-revalidate: serve immediately; refresh cache for subsequent requests.
  if (withinSwr) {
    void (async () => {
      try {
        const upstream = await upstreamFetch(upstreamUrl, { timeoutMs: 25_000 })
        if (!upstream.ok) return
        const text = await upstream.text()
        const contentType = upstream.headers.get('content-type') || 'text/plain; charset=utf-8'
        const body = new TextEncoder().encode(text)
        cache.set(cacheKey, {
          body,
          contentType,
          status: 200,
          ts: Date.now(),
          cacheSec: policy.cacheSec,
          swrSec: policy.swrSec,
        })
      } catch {
        /* keep stale */
      }
    })()
    return new Response(stale.body, {
      status: stale.status || 200,
      headers: {
        'Content-Type': stale.contentType,
        ...CORS_HEADERS,
        'Cache-Control': policy.header,
        'X-Atlas-Cache': 'swr',
      },
    })
  }

  try {
    const upstream = await upstreamFetch(upstreamUrl, { timeoutMs: 25_000 })
    const text = await upstream.text()
    const contentType = upstream.headers.get('content-type') || 'text/plain; charset=utf-8'

    if (!upstream.ok) {
      if (stale?.body) {
        return new Response(stale.body, {
          status: stale.status || 200,
          headers: {
            'Content-Type': stale.contentType,
            ...CORS_HEADERS,
            'Cache-Control': policy.header,
            'X-Atlas-Cache': 'stale-if-error',
          },
        })
      }
      return textResponse(upstream.status, text.slice(0, 4000), contentType)
    }

    const body = new TextEncoder().encode(text)
    cache.set(cacheKey, {
      body,
      contentType,
      status: 200,
      ts: Date.now(),
      cacheSec: policy.cacheSec,
      swrSec: policy.swrSec,
    })

    return new Response(body, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        ...CORS_HEADERS,
        'Cache-Control': policy.header,
      },
    })
  } catch (err) {
    if (stale?.body) {
      return new Response(stale.body, {
        status: stale.status || 200,
        headers: {
          'Content-Type': stale.contentType,
          ...CORS_HEADERS,
          'Cache-Control': policy.header,
          'X-Atlas-Cache': 'stale-if-error',
        },
      })
    }
    return jsonResponse(502, { error: err?.message || 'gdelt proxy failed' })
  }
}
