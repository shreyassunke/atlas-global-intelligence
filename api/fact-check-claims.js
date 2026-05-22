/**
 * GET /api/fact-check-claims?query=...&topic=war
 * Google Fact Check Tools API proxy ($0 with API key — server-only).
 *
 * Env: GOOGLE_FACT_CHECK_API_KEY (set in Vercel dashboard or .env.local for vercel dev)
 *
 * Without a key, returns empty claims[] with a warning (reactive EventPanel lookup still works
 * when key is configured server-side).
 */

export const config = {
  runtime: 'edge',
}

const CACHE_MS = 600_000
/** @type {Map<string, { body: string, ts: number }>} */
const cache = new Map()

/** Rotating topics for proactive worker polling when no query is supplied. */
const PROACTIVE_TOPICS = ['war conflict', 'election fraud', 'health vaccine', 'climate change', 'immigration']

function geocodeClaimText(text) {
  const lower = (text || '').toLowerCase()
  const places = {
    ukraine: { lat: 49, lng: 32, name: 'Ukraine' },
    russia: { lat: 60, lng: 100, name: 'Russia' },
    gaza: { lat: 31.5, lng: 34.47, name: 'Gaza' },
    israel: { lat: 31.5, lng: 34.8, name: 'Israel' },
    'united states': { lat: 38, lng: -97, name: 'United States' },
    china: { lat: 35, lng: 105, name: 'China' },
    india: { lat: 20, lng: 77, name: 'India' },
    brazil: { lat: -10, lng: -55, name: 'Brazil' },
    france: { lat: 46, lng: 2, name: 'France' },
    uk: { lat: 54, lng: -2, name: 'United Kingdom' },
  }
  const keys = Object.keys(places).sort((a, b) => b.length - a.length)
  for (const key of keys) {
    if (lower.includes(key)) return places[key]
  }
  return null
}

/**
 * @param {string} query
 * @param {string} apiKey
 */
async function searchClaims(query, apiKey) {
  const params = new URLSearchParams({
    query,
    pageSize: '15',
    key: apiKey,
    languageCode: 'en',
    maxAgeDays: '30',
  })
  const url = `https://factchecktools.googleapis.com/v1alpha1/claims:search?${params}`
  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(15_000),
  })
  if (!res.ok) {
    const errText = await res.text().catch(() => '')
    throw new Error(`Fact Check API HTTP ${res.status}${errText ? `: ${errText.slice(0, 100)}` : ''}`)
  }
  const data = await res.json()
  const claims = []
  for (const item of data?.claims || []) {
    const review = item.claimReview?.[0]
    if (!review) continue
    const claimText = item.text || review.textualRating || 'Fact-checked claim'
    const geo = geocodeClaimText(claimText)
    claims.push({
      claim: claimText.slice(0, 300),
      rating: review.textualRating || 'Reviewed',
      publisher: review.publisher?.name || review.publisher?.site || 'Unknown',
      publisherUrl: review.url || item.claimReview?.[0]?.url || '',
      reviewDate: review.reviewDate || null,
      lat: geo?.lat ?? null,
      lng: geo?.lng ?? null,
      latApproximate: geo ? true : false,
      locationName: geo?.name || null,
    })
  }
  return claims
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
  const query = url.searchParams.get('query')?.trim() || ''
  const topic = url.searchParams.get('topic')?.trim() || ''
  const proactive = url.searchParams.get('proactive') === '1'

  const apiKey = process.env.GOOGLE_FACT_CHECK_API_KEY?.trim()
  if (!apiKey) {
    return new Response(JSON.stringify({
      claims: [],
      warning: 'GOOGLE_FACT_CHECK_API_KEY not configured — register free at Google Cloud Console',
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-store',
      },
    })
  }

  const searchQuery = query || topic || (proactive
    ? PROACTIVE_TOPICS[Math.floor(Date.now() / 900_000) % PROACTIVE_TOPICS.length]
    : '')

  if (!searchQuery) {
    return new Response(JSON.stringify({ error: 'query or topic param required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  }

  const cacheKey = searchQuery.toLowerCase()
  const hit = cache.get(cacheKey)
  if (hit && Date.now() - hit.ts < CACHE_MS) {
    return new Response(hit.body, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=300',
        'X-Atlas-Cache': 'hit',
      },
    })
  }

  try {
    const claims = await searchClaims(searchQuery, apiKey)
    const json = JSON.stringify({ claims, count: claims.length, query: searchQuery })
    cache.set(cacheKey, { body: json, ts: Date.now() })
    return new Response(json, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=300',
      },
    })
  } catch (err) {
    return new Response(JSON.stringify({
      claims: [],
      error: err.message || 'Fact Check API temporarily unavailable',
    }), {
      status: 502,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    })
  }
}
