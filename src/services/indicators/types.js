/**
 * Indicator adapter types — Tier C macro/micro data for place HUD.
 */

/** @typedef {'worldbank' | 'fred' | 'finnhub' | 'openmeteo' | 'census' | 'bea'} IndicatorSourceId */

/**
 * @typedef {Object} PlaceIndicator
 * @property {string} id
 * @property {string} label
 * @property {string} value — formatted display value
 * @property {number|null} raw — numeric raw value when applicable
 * @property {string} [unit]
 * @property {string} cadence — human label e.g. "annual", "15 min"
 * @property {IndicatorSourceId} source
 * @property {string} [sourceUrl]
 * @property {string} [status] — 'ok' | 'degraded' | 'missing_key' | 'unavailable'
 * @property {number[]} [sparkline] — recent values for mini chart
 * @property {string} [hint] — setup / honesty message
 */

/**
 * @typedef {Object} IndicatorAdapter
 * @property {IndicatorSourceId} id
 * @property {string} label
 * @property {string[]} [requiredEnv]
 * @property {(ctx: { iso?: string, countryName?: string, lat?: number, lng?: number, signal?: AbortSignal }) => Promise<PlaceIndicator[]>} fetch
 */

/** ISO2 → World Bank country code (same for most). */
export const WORLD_BANK_COUNTRY_OVERRIDES = {
  UK: 'GBR',
  EL: 'GRC',
}

/**
 * @param {string} iso2
 * @returns {string}
 */
export function iso2ToWorldBankCode(iso2) {
  const upper = String(iso2 || '').trim().toUpperCase()
  if (WORLD_BANK_COUNTRY_OVERRIDES[upper]) return WORLD_BANK_COUNTRY_OVERRIDES[upper]
  if (upper.length === 2) return upper
  return upper.slice(0, 3)
}

/**
 * @param {number|null|undefined} n
 * @param {number} [digits=1]
 */
export function formatPercent(n, digits = 1) {
  if (n == null || !Number.isFinite(n)) return '—'
  return `${n.toFixed(digits)}%`
}

/**
 * @param {number|null|undefined} n
 * @param {number} [digits=2]
 */
export function formatNumber(n, digits = 2) {
  if (n == null || !Number.isFinite(n)) return '—'
  return n.toLocaleString(undefined, { maximumFractionDigits: digits })
}
