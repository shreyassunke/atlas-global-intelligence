/**
 * GET /api/opensky-states
 * Browser-safe proxy for OpenSky Network ADS-B (avoids CORS in the fetch worker).
 * Caches responses so dev hot-reload / parallel tabs don't hammer the anon rate limit.
 */

export const config = {
  runtime: 'edge',
}

const CACHE_MS = 12_000
/** @type {{ body: string, status: number, ts: number } | null} */
let cache = null

async function fetchOpenSky(retries = 3) {
  let lastStatus = 502
  let lastErr
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const upstream = await fetch('https://opensky-network.org/api/states/all', {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(20_000),
      })
      lastStatus = upstream.status
      if (upstream.status === 429) {
        if (cache && Date.now() - cache.ts < CACHE_MS * 3) {
          return { status: 200, body: cache.body, stale: true }
        }
        if (attempt < retries) {
          await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)))
          continue
        }
        const body = await upstream.text()
        return { status: 429, body }
      }
      const body = await upstream.text()
      if (upstream.ok) {
        cache = { body, status: upstream.status, ts: Date.now() }
      }
      return { status: upstream.status, body }
    } catch (err) {
      lastErr = err
      if (attempt < retries) await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)))
    }
  }
  if (cache) return { status: 200, body: cache.body, stale: true }
  throw lastErr || new Error(`OpenSky proxy failed (HTTP ${lastStatus})`)
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

  if (cache && Date.now() - cache.ts < CACHE_MS) {
    return new Response(cache.body, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=8',
        'X-Atlas-Cache': 'hit',
      },
    })
  }

  try {
    const { status, body, stale } = await fetchOpenSky()
    return new Response(body, {
      status,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': stale ? 'public, max-age=4' : 'public, max-age=10',
        ...(stale ? { 'X-Atlas-Stale': 'opensky-rate-limit' } : {}),
      },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message || 'OpenSky proxy failed' }), {
      status: 502,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    })
  }
}
