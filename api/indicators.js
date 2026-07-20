/**
 * GET /api/indicators?iso=US&lat=47.61&lng=-122.2
 *
 * Server-side indicator proxy — FRED / Census / BEA. Finnhub FX omitted from
 * place Economy (always global; common 403 on free keys).
 *
 * Upstream calls are hard-capped so Vercel never hits FUNCTION_INVOCATION_TIMEOUT
 * (which leaves the client with World Bank country GDP only).
 */
import { fetchFredIndicators, fetchFredLocalUnemployment } from '../src/services/indicators/fredAdapter.js'
import { fetchCensusCountyIndicators } from '../src/services/indicators/censusAdapter.js'
import { fetchBeaCountyIncome } from '../src/services/indicators/beaAdapter.js'
import {
  resolveUsGeoFromCoords,
  formatCountyLabel,
  formatMsaLabel,
} from '../src/services/indicators/usGeoResolve.js'

export const config = {
  runtime: 'nodejs',
  maxDuration: 30,
}

const CACHE = new Map()
const CACHE_MS = 15 * 60_000

/** Census geocoder is often the slow leg from Vercel regions. */
const GEO_TIMEOUT_MS = 3_500
/** Per-provider budget — return partial rows instead of hanging the function. */
const UPSTREAM_TIMEOUT_MS = 4_500

function corsHeaders() {
  const allowed = process.env.ATLAS_ALLOWED_ORIGIN || '*'
  return {
    'Access-Control-Allow-Origin': allowed === '*' ? '*' : allowed,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'content-type',
    'Cache-Control': 'public, s-maxage=900, stale-while-revalidate=3600',
  }
}

function timeoutSignal(ms) {
  return AbortSignal.timeout(ms)
}

/** @param {Promise<T>} promise @returns {Promise<T|null>} */
async function settle(promise) {
  try {
    return await promise
  } catch {
    return null
  }
}

export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders() })
  }

  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'GET required' }), {
      status: 405,
      headers: { ...corsHeaders(), 'content-type': 'application/json' },
    })
  }

  const url = new URL(req.url, 'http://localhost')
  const iso = (url.searchParams.get('iso') || '').toUpperCase()
  const lat = parseFloat(url.searchParams.get('lat') || '')
  const lng = parseFloat(url.searchParams.get('lng') || '')
  const cacheKey = [
    iso || 'global',
    Number.isFinite(lat) ? lat.toFixed(3) : '',
    Number.isFinite(lng) ? lng.toFixed(3) : '',
  ].join('|')

  const cached = CACHE.get(cacheKey)
  if (cached && Date.now() - cached.at < CACHE_MS) {
    return new Response(JSON.stringify(cached.payload), {
      status: 200,
      headers: { ...corsHeaders(), 'content-type': 'application/json' },
    })
  }

  const fredKey = (process.env.FRED_KEY || process.env.VITE_FRED_KEY || '').trim()
  const censusKey = (process.env.CENSUS_API_KEY || process.env.VITE_CENSUS_API_KEY || '').trim()
  const beaKey = (process.env.BEA_KEY || process.env.VITE_BEA_KEY || '').trim()

  try {
    const isUS = iso === 'US' || iso === 'USA' || (!iso && Number.isFinite(lat) && Number.isFinite(lng))

    // FRED national does not need geo — start it immediately so markets still
    // land even when Census geocoder / county providers are slow.
    const fredNationalPromise = fetchFredIndicators({
      apiKey: fredKey,
      signal: timeoutSignal(UPSTREAM_TIMEOUT_MS),
    })

    let geo = null
    if (isUS && Number.isFinite(lat) && Number.isFinite(lng)) {
      geo = await settle(
        resolveUsGeoFromCoords(lat, lng, { signal: timeoutSignal(GEO_TIMEOUT_MS) }),
      )
    }

    const countyLabel = formatCountyLabel(geo)
    const msaLabel = formatMsaLabel(geo)

    /** @type {Promise<import('../src/services/indicators/types.js').PlaceIndicator[]|null>[]} */
    const localPromises = []

    if (geo?.stateFips && geo?.countyFips) {
      localPromises.push(
        settle(fetchCensusCountyIndicators({
          stateFips: geo.stateFips,
          countyFips: geo.countyFips,
          apiKey: censusKey,
          scopeLabel: countyLabel || geo.geoid,
          signal: timeoutSignal(UPSTREAM_TIMEOUT_MS),
        })),
      )
      localPromises.push(
        settle(fetchBeaCountyIncome({
          geoid: geo.geoid,
          apiKey: beaKey,
          scopeLabel: countyLabel || geo.geoid,
          signal: timeoutSignal(UPSTREAM_TIMEOUT_MS),
        })),
      )
      if (fredKey) {
        const searchText = [
          countyLabel || geo.countyName,
          geo.stateAbbr || geo.stateName,
          'Unemployment Rate',
        ].filter(Boolean).join(' ')
        localPromises.push(
          settle(fetchFredLocalUnemployment({
            apiKey: fredKey,
            searchText,
            scopeLabel: countyLabel || msaLabel || 'County',
            signal: timeoutSignal(UPSTREAM_TIMEOUT_MS),
          })),
        )
      }
    }

    const [fredNational, ...localChunks] = await Promise.all([
      settle(fredNationalPromise).then((rows) => rows || []),
      ...localPromises,
    ])

    const local = localChunks.flatMap((chunk) => chunk || [])
    const localOk = local.filter((i) => i && i.status !== 'missing_key')
    const dataLevel = localOk.some((i) => i.status === 'ok')
      ? (geo?.countyName ? 'county' : (geo?.cbsaName ? 'msa' : 'county'))
      : 'country'
    const dataName = localOk.some((i) => i.status === 'ok')
      ? (countyLabel || msaLabel || 'County')
      : 'United States'

    const payload = {
      iso,
      geo: geo
        ? {
            stateFips: geo.stateFips,
            countyFips: geo.countyFips,
            geoid: geo.geoid,
            countyName: countyLabel,
            placeName: geo.placeName,
            cbsaCode: geo.cbsaCode,
            cbsaName: msaLabel,
          }
        : null,
      dataLevel,
      dataName,
      indicators: [...localOk, ...fredNational],
      fetchedAt: new Date().toISOString(),
    }

    CACHE.set(cacheKey, { at: Date.now(), payload })

    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { ...corsHeaders(), 'content-type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: err?.message || 'Indicator fetch failed' }), {
      status: 500,
      headers: { ...corsHeaders(), 'content-type': 'application/json' },
    })
  }
}
