/**
 * Place indicator orchestrator — local US (Census/BEA/FRED) + World Bank country + US markets strip.
 */
import { fetchWorldBankIndicators } from './worldBankAdapter.js'

const CACHE_TTL_MS = {
  worldbank: 24 * 3600_000,
  proxy: 15 * 60_000,
}

/** @type {Map<string, { at: number, data: object }>} */
const clientCache = new Map()

/**
 * @param {string} key
 * @param {number} ttlMs
 * @param {() => Promise<object>} loader
 */
async function cachedFetch(key, ttlMs, loader) {
  const hit = clientCache.get(key)
  if (hit && Date.now() - hit.at < ttlMs) return hit.data
  const data = await loader()
  clientCache.set(key, { at: Date.now(), data })
  return data
}

/**
 * @param {{ iso?: string, countryName?: string, lat?: number, lng?: number, signal?: AbortSignal }} ctx
 * @returns {Promise<{ indicators: import('./types.js').PlaceIndicator[], dataLevel: string, dataName: string, geo: object|null }>}
 */
export async function fetchPlaceIndicatorsBundle(ctx) {
  const iso = ctx.iso ? String(ctx.iso).toUpperCase() : ''
  const cacheKey = `place-${iso || ctx.countryName || 'global'}-${ctx.lat?.toFixed?.(3) || ''}-${ctx.lng?.toFixed?.(3) || ''}`

  const wb = await cachedFetch(`${cacheKey}-wb`, CACHE_TTL_MS.worldbank, () =>
    fetchWorldBankIndicators(ctx))

  let proxyPayload = { indicators: [], dataLevel: 'country', dataName: ctx.countryName || iso || 'Country', geo: null }
  try {
    const params = new URLSearchParams()
    if (iso) params.set('iso', iso)
    if (ctx.countryName) params.set('country', ctx.countryName)
    if (ctx.lat != null) params.set('lat', String(ctx.lat))
    if (ctx.lng != null) params.set('lng', String(ctx.lng))

    proxyPayload = await cachedFetch(`${cacheKey}-proxy`, CACHE_TTL_MS.proxy, async () => {
      const res = await fetch(`/api/indicators?${params}`, { signal: ctx.signal })
      if (!res.ok) return proxyPayload
      return res.json()
    })
  } catch {
    /* proxy optional in offline dev */
  }

  const proxied = proxyPayload.indicators || []
  const markets = proxied.filter((i) => i.section === 'us-markets' || (i.source === 'fred' && i.grain === 'national'))
  const local = proxied.filter((i) =>
    i.grain === 'county'
    || i.grain === 'msa'
    || i.source === 'census'
    || i.source === 'bea'
    || (i.source === 'fred' && i.section !== 'us-markets' && i.grain !== 'national'),
  )

  const isUS = iso === 'US' || iso === 'USA'
  const combined = []

  // Prefer local micro indicators first
  for (const row of local) {
    if (row.status === 'missing_key' && row.source === 'bea') continue
    combined.push(row)
  }

  // Country GDP growth (World Bank) — keep as macro context, not as "city GDP"
  for (const row of wb) {
    combined.push({
      ...row,
      grain: 'country',
      section: row.section || 'country-macro',
      label: row.label?.includes('GDP') ? `${row.label} (country)` : row.label,
    })
  }

  // US markets strip (VIX / national CPI) — explicitly national
  if (isUS || markets.length) {
    for (const row of markets) {
      combined.push({
        ...row,
        section: 'us-markets',
        grain: 'national',
      })
    }
  }

  const dataLevel = proxyPayload.dataLevel
    || (local.some((i) => i.status === 'ok') ? 'county' : 'country')
  const dataName = proxyPayload.dataName
    || ctx.countryName
    || iso
    || 'Country'

  return {
    indicators: combined.slice(0, 10),
    dataLevel,
    dataName,
    geo: proxyPayload.geo || null,
  }
}

/**
 * Back-compat: return indicator rows only.
 * @param {{ iso?: string, countryName?: string, lat?: number, lng?: number, signal?: AbortSignal }} ctx
 */
export async function fetchPlaceIndicators(ctx) {
  const bundle = await fetchPlaceIndicatorsBundle(ctx)
  return bundle.indicators
}

export const INDICATOR_POLL_MS = 15 * 60_000
