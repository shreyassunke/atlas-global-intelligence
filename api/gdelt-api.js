/**
 * GET /api/gdelt-api?path=doc/doc&query=...&mode=...
 *
 * Proxies GDELT 2.0 REST API (api.gdeltproject.org) — no CORS from browser/worker.
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

  const cacheKey = `gdelt:${upstreamUrl}`
  const hit = cache.get(cacheKey)
  if (hit) {
    return new Response(hit.body, {
      status: hit.status,
      headers: {
        'Content-Type': hit.contentType,
        ...CORS_HEADERS,
        'Cache-Control': 'public, max-age=120, stale-while-revalidate=600',
        'X-Atlas-Cache': 'hit',
      },
    })
  }

  try {
    const upstream = await upstreamFetch(upstreamUrl, { timeoutMs: 25_000 })
    const text = await upstream.text()
    const contentType = upstream.headers.get('content-type') || 'text/plain; charset=utf-8'

    if (!upstream.ok) {
      return textResponse(upstream.status, text.slice(0, 4000), contentType)
    }

    const body = new TextEncoder().encode(text)
    cache.set(cacheKey, {
      body,
      contentType,
      status: 200,
      ts: Date.now(),
      cacheSec: 120,
    })

    return new Response(body, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        ...CORS_HEADERS,
        'Cache-Control': 'public, max-age=120, stale-while-revalidate=600',
      },
    })
  } catch (err) {
    return jsonResponse(502, { error: err?.message || 'gdelt proxy failed' })
  }
}
