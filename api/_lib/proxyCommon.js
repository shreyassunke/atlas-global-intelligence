/**
 * Shared helpers for Atlas edge API proxies.
 */

export const CORS_HEADERS = {
  'Access-Control-Allow-Origin': process.env.ATLAS_ALLOWED_ORIGIN || '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type, authorization, x-client-info, apikey',
  Vary: 'Origin',
}

export function jsonResponse(status, payload, extraHeaders = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...CORS_HEADERS,
      ...extraHeaders,
    },
  })
}

export function textResponse(status, body, contentType, extraHeaders = {}) {
  return new Response(body, {
    status,
    headers: {
      'Content-Type': contentType,
      ...CORS_HEADERS,
      ...extraHeaders,
    },
  })
}

export function optionsResponse() {
  return new Response(null, { status: 204, headers: CORS_HEADERS })
}

/** Read first configured env var from a list (server-only, then VITE_ fallback). */
export function envFirst(...names) {
  for (const name of names) {
    const val = process.env[name]
    if (val && String(val).trim()) return String(val).trim()
  }
  return ''
}

/** Parse comma-separated API keys from env. */
export function envKeys(...names) {
  const raw = envFirst(...names)
  if (!raw) return []
  return raw.split(',').map((k) => k.trim()).filter(Boolean)
}

/** In-memory TTL cache for edge handlers (resets on cold start). */
export function createEdgeCache() {
  /** @type {Map<string, { body: ArrayBuffer, contentType: string, status: number, ts: number, cacheSec: number }>} */
  const store = new Map()

  return {
    get(key) {
      const hit = store.get(key)
      if (!hit) return null
      if (Date.now() - hit.ts > hit.cacheSec * 1000) {
        store.delete(key)
        return null
      }
      return hit
    },
    set(key, entry) {
      store.set(key, entry)
      if (store.size > 200) {
        const first = store.keys().next().value
        if (first) store.delete(first)
      }
    },
  }
}

export async function upstreamFetch(url, { headers = {}, timeoutMs = 20_000 } = {}) {
  return fetch(url, {
    headers,
    signal: AbortSignal.timeout(timeoutMs),
    redirect: 'follow',
  })
}
