/**
 * GET /api/indicators?iso=US&lat=47.61&lng=-122.2
 *
 * Server-side indicator proxy — FRED / Census / BEA. Finnhub FX omitted from
 * place Economy (always global; common 403 on free keys).
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
  maxDuration: 20,
}

const CACHE = new Map()
const CACHE_MS = 15 * 60_000

function corsHeaders() {
  const allowed = process.env.ATLAS_ALLOWED_ORIGIN || '*'
  return {
    'Access-Control-Allow-Origin': allowed === '*' ? '*' : allowed,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'content-type',
    'Cache-Control': 'public, s-maxage=900, stale-while-revalidate=3600',
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

  const fredKey = process.env.FRED_KEY || process.env.VITE_FRED_KEY || ''
  const censusKey = process.env.CENSUS_API_KEY || process.env.VITE_CENSUS_API_KEY || ''
  const beaKey = process.env.BEA_KEY || process.env.VITE_BEA_KEY || ''

  try {
    const isUS = iso === 'US' || iso === 'USA' || (!iso && Number.isFinite(lat) && Number.isFinite(lng))
    let geo = null
    if (isUS && Number.isFinite(lat) && Number.isFinite(lng)) {
      geo = await resolveUsGeoFromCoords(lat, lng)
    }

    const countyLabel = formatCountyLabel(geo)
    const msaLabel = formatMsaLabel(geo)

    const tasks = [
      fetchFredIndicators({ apiKey: fredKey }),
    ]

    if (geo?.stateFips && geo?.countyFips) {
      tasks.push(
        fetchCensusCountyIndicators({
          stateFips: geo.stateFips,
          countyFips: geo.countyFips,
          apiKey: censusKey,
          scopeLabel: countyLabel || geo.geoid,
        }),
      )
      tasks.push(
        fetchBeaCountyIncome({
          geoid: geo.geoid,
          apiKey: beaKey,
          scopeLabel: countyLabel || geo.geoid,
        }),
      )
      if (fredKey) {
        const searchText = [
          countyLabel || geo.countyName,
          geo.stateAbbr || geo.stateName,
          'Unemployment Rate',
        ].filter(Boolean).join(' ')
        tasks.push(
          fetchFredLocalUnemployment({
            apiKey: fredKey,
            searchText,
            scopeLabel: countyLabel || msaLabel || 'County',
          }),
        )
      }
    }

    const settled = await Promise.all(tasks)
    const fredNational = settled[0] || []
    const local = settled.slice(1).flat()

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
