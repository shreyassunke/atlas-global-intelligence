/**
 * US Census ACS 5-year profile — county (and optional place) socio-economic indicators.
 * https://www.census.gov/programs-surveys/acs/data/data-via-api.html
 */

import { formatNumber, formatPercent } from './types.js'

const ACS_YEAR = '2023'
const ACS_PROFILE = `https://api.census.gov/data/${ACS_YEAR}/acs/acs5/profile`

/**
 * @param {Object} params
 * @param {string} params.stateFips
 * @param {string} params.countyFips
 * @param {string} [params.apiKey]
 * @param {AbortSignal} [params.signal]
 * @param {string} [params.scopeLabel]
 * @returns {Promise<import('./types.js').PlaceIndicator[]>}
 */
export async function fetchCensusCountyIndicators({
  stateFips,
  countyFips,
  apiKey = '',
  signal,
  scopeLabel = 'County',
}) {
  if (!stateFips || !countyFips) return []

  const params = new URLSearchParams({
    get: 'NAME,DP03_0005PE,DP03_0062E,DP03_0128PE',
    for: `county:${countyFips}`,
    in: `state:${stateFips}`,
  })
  if (apiKey) params.set('key', apiKey)

  try {
    const res = await fetch(`${ACS_PROFILE}?${params}`, { signal })
    if (!res.ok) throw new Error(`Census ACS HTTP ${res.status}`)
    const rows = await res.json()
    if (!Array.isArray(rows) || rows.length < 2) return []

    const headers = rows[0]
    const data = rows[1]
    const get = (name) => {
      const i = headers.indexOf(name)
      return i >= 0 ? data[i] : null
    }

    const name = String(get('NAME') || scopeLabel)
    const unemp = parseFloat(get('DP03_0005PE'))
    const income = parseFloat(get('DP03_0062E'))
    const poverty = parseFloat(get('DP03_0128PE'))

    /** @type {import('./types.js').PlaceIndicator[]} */
    const out = []

    if (Number.isFinite(income)) {
      out.push({
        id: 'acs-median-income',
        label: 'Median household income',
        value: `$${Math.round(income).toLocaleString()}`,
        raw: income,
        unit: '',
        cadence: `ACS ${ACS_YEAR} · ${name}`,
        source: 'census',
        sourceUrl: 'https://www.census.gov/programs-surveys/acs',
        status: 'ok',
        grain: 'county',
        grainLabel: name,
      })
    }

    if (Number.isFinite(unemp)) {
      out.push({
        id: 'acs-unemployment',
        label: 'Unemployment rate',
        value: formatPercent(unemp, 1),
        raw: unemp,
        unit: '',
        cadence: `ACS ${ACS_YEAR} · ${name}`,
        source: 'census',
        sourceUrl: 'https://www.census.gov/programs-surveys/acs',
        status: 'ok',
        grain: 'county',
        grainLabel: name,
      })
    }

    if (Number.isFinite(poverty)) {
      out.push({
        id: 'acs-poverty',
        label: 'Poverty rate',
        value: formatPercent(poverty, 1),
        raw: poverty,
        unit: '',
        cadence: `ACS ${ACS_YEAR} · ${name}`,
        source: 'census',
        sourceUrl: 'https://www.census.gov/programs-surveys/acs',
        status: 'ok',
        grain: 'county',
        grainLabel: name,
      })
    }

    return out
  } catch (err) {
    return [{
      id: 'acs-county',
      label: 'County indicators',
      value: '—',
      raw: null,
      cadence: `ACS ${ACS_YEAR}`,
      source: 'census',
      status: 'degraded',
      hint: err?.message || 'Census ACS fetch failed',
      grain: 'county',
    }]
  }
}
