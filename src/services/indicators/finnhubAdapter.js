/**
 * Finnhub adapter — forex rates for place HUD.
 * Requires FINNHUB_KEY server-side.
 */
import { formatNumber } from './types.js'

const FX_PAIRS = [
  { base: 'USD', quote: 'EUR', label: 'USD/EUR' },
  { base: 'USD', quote: 'GBP', label: 'USD/GBP' },
  { base: 'USD', quote: 'JPY', label: 'USD/JPY' },
]

/**
 * @param {Object} params
 * @param {string} params.apiKey
 * @param {string} [params.iso] — reserved for future local-currency pairs
 * @param {AbortSignal} [params.signal]
 * @returns {Promise<import('./types.js').PlaceIndicator[]>}
 */
export async function fetchFinnhubIndicators({ apiKey, iso, signal }) {
  void iso

  if (!apiKey) {
    return [{
      id: 'finnhub-fx',
      label: 'USD/EUR',
      value: '—',
      cadence: '15 min',
      source: 'finnhub',
      sourceUrl: 'https://finnhub.io',
      status: 'missing_key',
      hint: 'Set FINNHUB_KEY for live FX',
    }]
  }

  try {
    const url = `https://finnhub.io/api/v1/forex/rates?base=USD&token=${apiKey}`
    const res = await fetch(url, { signal })
    if (!res.ok) throw new Error(`Finnhub HTTP ${res.status}`)
    const data = await res.json()
    const quote = data.quote || {}

    return FX_PAIRS.map(({ quote: q, label }) => {
      const val = quote[q]
      return {
        id: `finnhub-${label.replace('/', '-')}`,
        label,
        value: val != null ? formatNumber(val, 4) : '—',
        raw: val ?? null,
        cadence: '15 min',
        source: 'finnhub',
        sourceUrl: 'https://finnhub.io',
        status: val != null ? 'ok' : 'degraded',
      }
    })
  } catch (err) {
    return [{
      id: 'finnhub-fx',
      label: 'FX rates',
      value: '—',
      cadence: '15 min',
      source: 'finnhub',
      status: 'degraded',
      hint: err?.message || 'Finnhub fetch failed',
    }]
  }
}
