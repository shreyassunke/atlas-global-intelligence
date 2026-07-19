/**
 * FRED adapter — national US markets strip + optional MSA/county unemployment search.
 */
import { formatNumber } from './types.js'

const US_MARKETS_SERIES = [
  { id: 'VIXCLS', label: 'VIX', unit: '', cadence: 'daily', markets: true },
  { id: 'CPIAUCSL', label: 'CPI (US)', unit: 'index', cadence: 'monthly', markets: true },
]

/**
 * @param {Object} params
 * @param {string} params.apiKey
 * @param {AbortSignal} [params.signal]
 * @returns {Promise<import('./types.js').PlaceIndicator[]>}
 */
export async function fetchFredIndicators({ apiKey, signal }) {
  if (!apiKey) {
    return US_MARKETS_SERIES.map((s) => ({
      id: `fred-${s.id}`,
      label: s.label,
      value: '—',
      raw: null,
      cadence: s.cadence,
      source: 'fred',
      sourceUrl: 'https://fred.stlouisfed.org',
      status: 'missing_key',
      hint: 'Set FRED_KEY for US market indicators',
      grain: 'national',
      section: 'us-markets',
    }))
  }

  const results = await Promise.all(US_MARKETS_SERIES.map(async (series) => {
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
        grain: 'national',
        section: 'us-markets',
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
        grain: 'national',
        section: 'us-markets',
      }
    }
  }))

  return results
}

/**
 * Search FRED for a county/MSA unemployment series (LAUS via FRED).
 * @param {Object} params
 * @param {string} params.apiKey
 * @param {string} params.searchText — e.g. "King County WA Unemployment Rate"
 * @param {string} [params.scopeLabel]
 * @param {AbortSignal} [params.signal]
 */
export async function fetchFredLocalUnemployment({
  apiKey,
  searchText,
  scopeLabel = 'Local',
  signal,
}) {
  if (!apiKey || !searchText) return []

  try {
    const searchUrl = new URL('https://api.stlouisfed.org/fred/series/search')
    searchUrl.searchParams.set('search_text', searchText)
    searchUrl.searchParams.set('api_key', apiKey)
    searchUrl.searchParams.set('file_type', 'json')
    searchUrl.searchParams.set('limit', '8')

    const searchRes = await fetch(searchUrl.toString(), { signal })
    if (!searchRes.ok) throw new Error(`FRED search HTTP ${searchRes.status}`)
    const searchJson = await searchRes.json()
    const seriesList = searchJson?.seriess || []
    const pick = seriesList.find((s) =>
      /unemployment rate/i.test(s.title || '')
      && !/insured|continued claims/i.test(s.title || ''),
    ) || seriesList[0]

    if (!pick?.id) return []

    const obsUrl = `https://api.stlouisfed.org/fred/series/observations?series_id=${pick.id}&api_key=${apiKey}&sort_order=desc&limit=6&file_type=json`
    const obsRes = await fetch(obsUrl, { signal })
    if (!obsRes.ok) throw new Error(`FRED HTTP ${obsRes.status}`)
    const obsJson = await obsRes.json()
    const obs = (obsJson.observations || []).filter((o) => o.value !== '.')
    const latest = obs[0]
    const val = latest ? parseFloat(latest.value) : NaN
    if (!Number.isFinite(val)) return []

    const sparkline = obs.slice(0, 5).reverse().map((o) => parseFloat(o.value)).filter(Number.isFinite)

    return [{
      id: `fred-local-unemp-${pick.id}`,
      label: 'Local unemployment',
      value: formatNumber(val, 1),
      raw: val,
      unit: '%',
      cadence: `FRED ${latest?.date || ''} · ${scopeLabel}`,
      source: 'fred',
      sourceUrl: `https://fred.stlouisfed.org/series/${pick.id}`,
      status: 'ok',
      sparkline,
      grain: 'county',
      grainLabel: scopeLabel,
      hint: pick.title,
    }]
  } catch {
    return []
  }
}
