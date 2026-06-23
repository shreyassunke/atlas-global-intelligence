/**
 * Place indicator orchestrator — aggregates Tier C adapters for HUD strip.
 */
import { fetchWorldBankIndicators } from './worldBankAdapter.js'

const CACHE_TTL_MS = {
  worldbank: 24 * 3600_000,
  fred: 15 * 60_000,
  finnhub: 15 * 60_000,
}

/** @type {Map<string, { at: number, data: import('./types.js').PlaceIndicator[] }>} */
const clientCache = new Map()

/**
 * @param {string} key
 * @param {number} ttlMs
 * @param {() => Promise<import('./types.js').PlaceIndicator[]>} loader
 */
async function cachedFetch(key, ttlMs, loader) {
  const hit = clientCache.get(key)
  if (hit && Date.now() - hit.at < ttlMs) return hit.data
  const data = await loader()
  clientCache.set(key, { at: Date.now(), data })
  return data
}

/**
 * Fetch indicators via server proxy (keys stay server-side).
 *
 * @param {{ iso?: string, countryName?: string, lat?: number, lng?: number, signal?: AbortSignal }} ctx
 * @returns {Promise<import('./types.js').PlaceIndicator[]>}
 */
export async function fetchPlaceIndicators(ctx) {
  const iso = ctx.iso ? String(ctx.iso).toUpperCase() : ''
  const cacheKey = `place-${iso || ctx.countryName || 'global'}`

  // World Bank — client-safe (no key)
  const wb = await cachedFetch(`${cacheKey}-wb`, CACHE_TTL_MS.worldbank, () =>
    fetchWorldBankIndicators(ctx))

  // FRED + Finnhub — via API proxy when available
  let proxied = []
  try {
    const params = new URLSearchParams()
    if (iso) params.set('iso', iso)
    if (ctx.countryName) params.set('country', ctx.countryName)
    if (ctx.lat != null) params.set('lat', String(ctx.lat))
    if (ctx.lng != null) params.set('lng', String(ctx.lng))

    const res = await fetch(`/api/indicators?${params}`, { signal: ctx.signal })
    if (res.ok) {
      const json = await res.json()
      proxied = json.indicators || []
    }
  } catch {
    /* proxy optional in offline dev */
  }

  // US places get FRED prominently; others still show global FX
  const isUS = iso === 'US' || iso === 'USA'
  const fred = proxied.filter((i) => i.source === 'fred')
  const finnhub = proxied.filter((i) => i.source === 'finnhub')

  const combined = [...wb]
  if (isUS && fred.length) combined.push(...fred)
  else if (fred.length) combined.push(fred[0]) // VIX as global risk proxy
  combined.push(...finnhub.slice(0, isUS ? 2 : 3))

  return combined.slice(0, 5)
}

/**
 * Poll interval for HUD refresh (ms).
 */
export const INDICATOR_POLL_MS = 15 * 60_000
