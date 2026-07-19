/**
 * GET /api/news-proxy?provider=newsapi|gnews|thenewsapi|youtube|apitube&...
 *
 * Server-side news/YouTube proxy — keeps API keys off the client and avoids CORS.
 * APITube `/v1/news/local` supports lat/lng/radius for micro-local enrichment.
 */

import {
  CORS_HEADERS,
  createEdgeCache,
  envFirst,
  jsonResponse,
  optionsResponse,
  upstreamFetch,
} from './_lib/proxyCommon.js'

export const config = { runtime: 'edge' }

const cache = createEdgeCache()

const PROVIDER_BASE = {
  newsapi: 'https://newsapi.org/v2',
  gnews: 'https://gnews.io/api/v4',
  thenewsapi: 'https://api.thenewsapi.com/v1',
  youtube: 'https://www.googleapis.com/youtube/v3',
  apitube: 'https://api.apitube.io/v1',
}

const CACHE_SEC = {
  newsapi: 300,
  gnews: 300,
  thenewsapi: 300,
  youtube: 600,
  apitube: 300,
}

function providerKey(provider, params) {
  const sp = new URLSearchParams(params)
  sp.delete('provider')
  sp.sort()
  return `${provider}:${sp.toString()}`
}

function resolveApiKey(provider) {
  switch (provider) {
    case 'newsapi':
      return envFirst('NEWSAPI_KEY', 'NEWS_API_KEY', 'VITE_NEWS_API_KEY', 'VITE_NEWS_API_KEYS')?.split(',')[0]?.trim() || ''
    case 'gnews':
      return envFirst('GNEWS_API_KEY', 'GNEWS_KEY', 'VITE_GNEWS_KEY', 'VITE_GNEWS_KEYS')?.split(',')[0]?.trim() || ''
    case 'thenewsapi':
      return envFirst('THENEWSAPI_KEY', 'THENEWS_API_KEY', 'VITE_THENEWS_API_KEY', 'VITE_THENEWS_API_KEYS')?.split(',')[0]?.trim() || ''
    case 'youtube':
      return envFirst('YOUTUBE_API_KEY', 'GOOGLE_YOUTUBE_API_KEY', 'VITE_YOUTUBE_API_KEY', 'VITE_GOOGLE_MAPS_API_KEY') || ''
    case 'apitube':
      return envFirst('APITUBE_KEY', 'APITUBE_API_KEY', 'VITE_APITUBE_KEY') || ''
    default:
      return ''
  }
}

function buildUpstreamUrl(provider, searchParams) {
  const params = new URLSearchParams(searchParams)
  params.delete('provider')

  const apiKey = resolveApiKey(provider)
  if (!apiKey) return { error: 'provider not configured on server', status: 503 }

  if (provider === 'newsapi') {
    const endpoint = params.get('endpoint') || 'top-headlines'
    params.delete('endpoint')
    params.set('apiKey', apiKey)
    return { url: `${PROVIDER_BASE.newsapi}/${endpoint}?${params}` }
  }

  if (provider === 'gnews') {
    params.set('apikey', apiKey)
    return { url: `${PROVIDER_BASE.gnews}/top-headlines?${params}` }
  }

  if (provider === 'thenewsapi') {
    params.set('api_token', apiKey)
    return { url: `${PROVIDER_BASE.thenewsapi}/news/headlines?${params}` }
  }

  if (provider === 'youtube') {
    params.set('key', apiKey)
    return { url: `${PROVIDER_BASE.youtube}/search?${params}` }
  }

  if (provider === 'apitube') {
    params.set('api_key', apiKey)
    // Local endpoint: lat/lng/radius (or place). Strip unrelated params.
    const local = new URLSearchParams()
    for (const key of ['lat', 'lng', 'radius', 'place', 'country', 'sort', 'ranking']) {
      if (params.has(key)) local.set(key, params.get(key))
    }
    local.set('api_key', apiKey)
    return { url: `${PROVIDER_BASE.apitube}/news/local?${local}` }
  }

  return { error: 'unknown provider', status: 400 }
}

export default async function handler(req) {
  if (req.method === 'OPTIONS') return optionsResponse()
  if (req.method !== 'GET') return jsonResponse(405, { error: 'method not allowed' })

  const url = new URL(req.url)
  const provider = url.searchParams.get('provider') || ''
  if (!PROVIDER_BASE[provider]) {
    return jsonResponse(400, { error: 'unknown provider', allowed: Object.keys(PROVIDER_BASE) })
  }

  const built = buildUpstreamUrl(provider, url.searchParams)
  if (built.error) return jsonResponse(built.status || 503, { error: built.error, provider })

  const cacheKey = providerKey(provider, url.searchParams)
  const hit = cache.get(cacheKey)
  if (hit) {
    return new Response(hit.body, {
      status: hit.status,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        ...CORS_HEADERS,
        'Cache-Control': `public, max-age=${CACHE_SEC[provider]}, stale-while-revalidate=${CACHE_SEC[provider] * 2}`,
        'X-Atlas-Cache': 'hit',
      },
    })
  }

  try {
    const upstream = await upstreamFetch(built.url, { timeoutMs: 15_000 })
    const text = await upstream.text()
    const body = new TextEncoder().encode(text)

    if (upstream.ok) {
      cache.set(cacheKey, {
        body,
        contentType: 'application/json; charset=utf-8',
        status: 200,
        ts: Date.now(),
        cacheSec: CACHE_SEC[provider],
      })
    }

    return new Response(body, {
      status: upstream.status,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        ...CORS_HEADERS,
        'Cache-Control': upstream.ok
          ? `public, max-age=${CACHE_SEC[provider]}, stale-while-revalidate=${CACHE_SEC[provider] * 2}`
          : 'no-store',
        'X-Atlas-Provider': provider,
      },
    })
  } catch (err) {
    return jsonResponse(502, { error: err?.message || 'news proxy failed', provider })
  }
}
