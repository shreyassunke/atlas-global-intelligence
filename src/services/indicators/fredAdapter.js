/**
 * FRED adapter — US-focused macro series (VIX, CPI proxy).
 * Requires FRED_KEY server-side; client calls /api/indicators proxy.
 */
import { formatNumber } from './types.js'

const US_SERIES = [
  { id: 'VIXCLS', label: 'VIX', unit: '', cadence: 'daily' },
  { id: 'CPIAUCSL', label: 'CPI (US)', unit: 'index', cadence: 'monthly' },
]

/**
 * @param {Object} params
 * @param {string} params.apiKey
 * @param {AbortSignal} [params.signal]
 * @returns {Promise<import('./types.js').PlaceIndicator[]>}
 */
export async function fetchFredIndicators({ apiKey, signal }) {
  if (!apiKey) {
    return US_SERIES.map((s) => ({
      id: `fred-${s.id}`,
      label: s.label,
      value: '—',
      raw: null,
      cadence: s.cadence,
      source: 'fred',
      sourceUrl: 'https://fred.stlouisfed.org',
      status: 'missing_key',
      hint: 'Set FRED_KEY for US macro indicators',
    }))
  }

  const results = await Promise.all(US_SERIES.map(async (series) => {
    const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${series.id}&api_key=${apiKey}&sort_order=desc&limit=6&file_type=json`
    try {
      const res = await fetch(url, { signal })
      if (!res.ok) throw new Error(`FRED HTTP ${res.status}`)
      const data = await res.json()
      const obs = (data.observations || []).filter((o) => o.value !== '.')
      const latest = obs[0]
      const val = latest ? parseFloat(latest.value) : NaN
      const sparkline = obs.slice(0, 5).reverse().map((o) => parseFloat(o.value)).filter(Number.isFinite)

      return {
        id: `fred-${series.id}`,
        label: series.label,
        value: Number.isFinite(val) ? formatNumber(val, series.id === 'VIXCLS' ? 2 : 1) : '—',
        raw: Number.isFinite(val) ? val : null,
        unit: series.unit,
        cadence: `${series.cadence} · ${latest?.date || ''}`,
        source: 'fred',
        sourceUrl: `https://fred.stlouisfed.org/series/${series.id}`,
        status: Number.isFinite(val) ? 'ok' : 'degraded',
        sparkline,
      }
    } catch (err) {
      return {
        id: `fred-${series.id}`,
        label: series.label,
        value: '—',
        cadence: series.cadence,
        source: 'fred',
        status: 'degraded',
        hint: err?.message || 'FRED fetch failed',
      }
    }
  }))

  return results
}
