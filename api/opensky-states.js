/**
 * GET /api/opensky-states
 * ADS-B proxy — primary: adsb.lol (free, no key). Fallback: OpenSky Network.
 * Returns OpenSky-compatible { time, states } so the worker normalizer is unchanged.
 */

export const config = {
  runtime: 'edge',
}

const CACHE_MS = 12_000
/** @type {{ body: string, status: number, ts: number, provider?: string } | null} */
let cache = null

function knotsToMs(knots) {
  if (knots == null || !Number.isFinite(knots)) return null
  return knots * 0.514444
}

/**
 * @param {object[]} ac
 * @returns {object}
 */
function adsbLolToOpenSky(ac) {
  const states = []
  for (const a of ac) {
    if (!a || !a.hex) continue
    const lat = a.lat
    const lng = a.lon
    if (lat == null || lng == null) continue
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue
    const onGround = a.alt_baro === 'ground' || a.gnd === true || a.ground === true
    if (onGround) continue
    const alt = a.alt_baro === 'ground' ? 0 : (a.alt_baro ?? a.alt_geom ?? null)
    states.push([
      String(a.hex).toLowerCase(),
      String(a.flight || a.r || '').trim(),
      a.country || '',
      null,
      null,
      lng,
      lat,
      alt,
      false,
      knotsToMs(a.gs),
      a.track ?? a.trk ?? null,
    ])
  }
  return { time: Math.floor(Date.now() / 1000), states }
}

async function fetchAdsbLol() {
  const urls = [
    'https://api.adsb.lol/v2/0/0',
    'https://api.airplanes.live/v2/0/0',
  ]
  let lastErr
  for (const url of urls) {
    try {
      const upstream = await fetch(url, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(18_000),
      })
      if (!upstream.ok) {
        lastErr = new Error(`adsb.lol HTTP ${upstream.status}`)
        continue
      }
      const data = await upstream.json()
      const ac = data?.ac || data?.aircraft || []
      if (!ac.length) {
        lastErr = new Error('adsb.lol empty response')
        continue
      }
      const body = JSON.stringify(adsbLolToOpenSky(ac))
      cache = { body, status: 200, ts: Date.now(), provider: 'adsb.lol' }
      return { status: 200, body, provider: 'adsb.lol' }
    } catch (err) {
      lastErr = err
    }
  }
  throw lastErr || new Error('adsb.lol unavailable')
}

async function fetchOpenSky(retries = 2) {
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
          return { status: 200, body: cache.body, stale: true, provider: cache.provider || 'opensky' }
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
        cache = { body, status: upstream.status, ts: Date.now(), provider: 'opensky' }
      }
      return { status: upstream.status, body, provider: 'opensky' }
    } catch (err) {
      lastErr = err
      if (attempt < retries) await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)))
    }
  }
  if (cache) return { status: 200, body: cache.body, stale: true, provider: cache.provider || 'opensky' }
  throw lastErr || new Error(`OpenSky proxy failed (HTTP ${lastStatus})`)
}

async function fetchAircraftStates() {
  try {
    return await fetchAdsbLol()
  } catch {
    return fetchOpenSky()
  }
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
        'Cache-Control': 'public, max-age=8, stale-while-revalidate=30',
        'X-Atlas-Cache': 'hit',
        'X-Atlas-Provider': cache.provider || 'unknown',
      },
    })
  }

  try {
    const { status, body, stale, provider } = await fetchAircraftStates()
    return new Response(body, {
      status,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': stale ? 'public, max-age=4, stale-while-revalidate=60' : 'public, max-age=10, stale-while-revalidate=30',
        'X-Atlas-Provider': provider || 'unknown',
        ...(stale ? { 'X-Atlas-Stale': 'rate-limit-fallback' } : {}),
      },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message || 'ADS-B proxy failed' }), {
      status: 502,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    })
  }
}
