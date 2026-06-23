/**
 * GET /api/indicators?iso=US&country=United+States
 *
 * Server-side indicator proxy — keeps FRED_KEY and FINNHUB_KEY off the client.
 */
import { fetchFredIndicators } from '../src/services/indicators/fredAdapter.js'
import { fetchFinnhubIndicators } from '../src/services/indicators/finnhubAdapter.js'

export const config = {
  runtime: 'nodejs',
  maxDuration: 15,
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
  const iso = url.searchParams.get('iso') || ''
  const cacheKey = iso || 'global'

  const cached = CACHE.get(cacheKey)
  if (cached && Date.now() - cached.at < CACHE_MS) {
    return new Response(JSON.stringify(cached.payload), {
      status: 200,
      headers: { ...corsHeaders(), 'content-type': 'application/json' },
    })
  }

  const fredKey = process.env.FRED_KEY || process.env.VITE_FRED_KEY || ''
  const finnhubKey = process.env.FINNHUB_KEY || process.env.VITE_FINNHUB_KEY || ''

  try {
    const [fred, finnhub] = await Promise.all([
      fetchFredIndicators({ apiKey: fredKey }),
      fetchFinnhubIndicators({ apiKey: finnhubKey, iso }),
    ])

    const payload = {
      iso,
      indicators: [...fred, ...finnhub],
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
