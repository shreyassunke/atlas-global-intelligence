/**
 * GET /api/opensky-states
 * ADS-B proxy — primary: adsb.lol global + regional bbox supplements.
 * Fallback: OpenSky Network bbox fan-out.
 *
 * Query:
 *   ?strategy=global   — global adsb.lol only (legacy)
 *   ?strategy=regional — multi-region merge (default)
 */

export const config = {
  runtime: 'edge',
}

const CACHE_MS = 12_000

/** OpenSky bbox regions for supplemental coverage (lamin/lomin/lamax/lomax). */
const ADSB_REGIONS = [
  { id: 'north-america', lamin: 15, lomin: -170, lamax: 72, lomax: -50 },
  { id: 'south-america', lamin: -56, lomin: -82, lamax: 15, lomax: -30 },
  { id: 'europe', lamin: 35, lomin: -15, lamax: 72, lomax: 45 },
  { id: 'middle-east', lamin: 10, lomin: 30, lamax: 42, lomax: 65 },
  { id: 'africa', lamin: -35, lomin: -18, lamax: 38, lomax: 52 },
  { id: 'asia', lamin: -10, lomin: 60, lamax: 55, lomax: 150 },
  { id: 'oceania', lamin: -48, lomin: 110, lamax: 10, lomax: 180 },
]

/** @type {{ body: string, status: number, ts: number, provider?: string, strategy?: string } | null} */
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

/**
 * Merge OpenSky state arrays by ICAO24 hex.
 * @param {object[]} payloads
 */
function mergeStatePayloads(payloads) {
  const byHex = new Map()
  for (const payload of payloads) {
    for (const state of payload?.states || []) {
      if (!state?.[0]) continue
      byHex.set(String(state[0]).toLowerCase(), state)
    }
  }
  return {
    time: Math.floor(Date.now() / 1000),
    states: [...byHex.values()],
    regionCount: payloads.length,
  }
}

async function fetchAdsbLolGlobal() {
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
      return adsbLolToOpenSky(ac)
    } catch (err) {
      lastErr = err
    }
  }
  throw lastErr || new Error('adsb.lol unavailable')
}

async function fetchOpenSkyRegion(region) {
  const qs = `lamin=${region.lamin}&lomin=${region.lomin}&lamax=${region.lamax}&lomax=${region.lomax}`
  const upstream = await fetch(`https://opensky-network.org/api/states/all?${qs}`, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(20_000),
  })
  if (!upstream.ok) throw new Error(`OpenSky ${region.id} HTTP ${upstream.status}`)
  return upstream.json()
}

async function fetchRegionalOpenSky() {
  const results = await Promise.allSettled(ADSB_REGIONS.map((r) => fetchOpenSkyRegion(r)))
  const payloads = results
    .filter((r) => r.status === 'fulfilled' && r.value?.states?.length)
    .map((r) => r.value)
  if (!payloads.length) throw new Error('All regional OpenSky fetches failed')
  return mergeStatePayloads(payloads)
}

/**
 * @param {'global' | 'regional'} strategy
 */
async function fetchAircraftStates(strategy) {
  if (strategy === 'global') {
    const payload = await fetchAdsbLolGlobal()
    return { payload, provider: 'adsb.lol', strategy }
  }

  const regionalPromise = fetchRegionalOpenSky()
  const globalPromise = fetchAdsbLolGlobal().catch(() => null)

  const [regional, global] = await Promise.all([regionalPromise, globalPromise])
  const merged = global?.states?.length
    ? mergeStatePayloads([regional, global])
    : regional

  return {
    payload: merged,
    provider: global ? 'adsb.lol+opensky-regional' : 'opensky-regional',
    strategy: 'regional',
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

  const url = new URL(req.url)
  const strategy = url.searchParams.get('strategy') === 'global' ? 'global' : 'regional'
  const cacheKey = strategy

  if (cache && Date.now() - cache.ts < CACHE_MS && cache.strategy === cacheKey) {
    return new Response(cache.body, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=8, stale-while-revalidate=30',
        'X-Atlas-Cache': 'hit',
        'X-Atlas-Provider': cache.provider || 'unknown',
        'X-Atlas-Strategy': cache.strategy || strategy,
      },
    })
  }

  try {
    const { payload, provider, strategy: usedStrategy } = await fetchAircraftStates(strategy)
    const body = JSON.stringify(payload)
    cache = { body, status: 200, ts: Date.now(), provider, strategy: usedStrategy }
    return new Response(body, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=10, stale-while-revalidate=30',
        'X-Atlas-Provider': provider,
        'X-Atlas-Strategy': usedStrategy,
        'X-Atlas-Aircraft-Count': String(payload.states?.length || 0),
      },
    })
  } catch (err) {
    if (cache) {
      return new Response(cache.body, {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'public, max-age=4, stale-while-revalidate=60',
          'X-Atlas-Stale': 'rate-limit-fallback',
          'X-Atlas-Provider': cache.provider || 'unknown',
        },
      })
    }
    return new Response(JSON.stringify({ error: err.message || 'ADS-B proxy failed' }), {
      status: 502,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    })
  }
}
