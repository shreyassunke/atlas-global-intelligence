/**
 * BEA Regional — county per-capita personal income.
 * Requires BEA_KEY. https://apps.bea.gov/api/
 */

import { formatNumber } from './types.js'

/**
 * @param {Object} params
 * @param {string} params.geoid — 5-digit state+county FIPS
 * @param {string} params.apiKey
 * @param {string} [params.scopeLabel]
 * @param {AbortSignal} [params.signal]
 * @returns {Promise<import('./types.js').PlaceIndicator[]>}
 */
export async function fetchBeaCountyIncome({ geoid, apiKey, scopeLabel = 'County', signal }) {
  if (!apiKey) {
    return [{
      id: 'bea-pcpi',
      label: 'Per-capita income',
      value: '—',
      raw: null,
      cadence: 'annual',
      source: 'bea',
      status: 'missing_key',
      hint: 'Set BEA_KEY for county personal income',
      grain: 'county',
    }]
  }
  if (!geoid || String(geoid).length !== 5) return []

  const url = new URL('https://apps.bea.gov/api/data')
  url.searchParams.set('UserID', apiKey)
  url.searchParams.set('method', 'GetData')
  url.searchParams.set('datasetname', 'Regional')
  url.searchParams.set('TableName', 'CAINC1')
  url.searchParams.set('LineCode', '3') // Per capita personal income (CAINC1)
  url.searchParams.set('GeoFips', String(geoid))
  url.searchParams.set('Year', 'LAST5')
  url.searchParams.set('ResultFormat', 'json')

  try {
    const res = await fetch(url.toString(), { signal })
    if (!res.ok) throw new Error(`BEA HTTP ${res.status}`)
    const json = await res.json()
    const rows = json?.BEAAPI?.Results?.Data
    if (!Array.isArray(rows) || !rows.length) {
      return [{
        id: 'bea-pcpi',
        label: 'Per-capita income',
        value: '—',
        raw: null,
        cadence: 'annual',
        source: 'bea',
        status: 'unavailable',
        hint: 'No BEA county series for this FIPS',
        grain: 'county',
      }]
    }

    const numeric = rows
      .map((r) => ({
        year: String(r.TimePeriod || r.Year || ''),
        value: parseFloat(String(r.DataValue || '').replace(/,/g, '')),
      }))
      .filter((r) => Number.isFinite(r.value))
      .sort((a, b) => String(b.year).localeCompare(String(a.year)))

    const latest = numeric[0]
    if (!latest) {
      return [{
        id: 'bea-pcpi',
        label: 'Per-capita income',
        value: '—',
        raw: null,
        source: 'bea',
        status: 'degraded',
        grain: 'county',
      }]
    }

    const sparkline = numeric.slice(0, 5).reverse().map((r) => r.value)

    return [{
      id: 'bea-pcpi',
      label: 'Per-capita income',
      value: `$${Math.round(latest.value).toLocaleString()}`,
      raw: latest.value,
      unit: '',
      cadence: `BEA ${latest.year} · ${scopeLabel}`,
      source: 'bea',
      sourceUrl: 'https://apps.bea.gov/',
      status: 'ok',
      sparkline,
      grain: 'county',
      grainLabel: scopeLabel,
    }]
  } catch (err) {
    return [{
      id: 'bea-pcpi',
      label: 'Per-capita income',
      value: '—',
      raw: null,
      cadence: 'annual',
      source: 'bea',
      status: 'degraded',
      hint: err?.message || 'BEA fetch failed',
      grain: 'county',
    }]
  }
}
