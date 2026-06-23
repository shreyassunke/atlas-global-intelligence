/**
 * World Bank indicator adapter — GDP growth (annual, cached server-side).
 * Free, no key required.
 */
import { formatPercent, iso2ToWorldBankCode } from './types.js'

const GDP_INDICATOR = 'NY.GDP.MKTP.KD.ZG'

/**
 * @param {{ iso?: string, signal?: AbortSignal }} ctx
 * @returns {Promise<import('./types.js').PlaceIndicator[]>}
 */
export async function fetchWorldBankIndicators(ctx) {
  const iso = ctx.iso
  if (!iso || iso.length < 2) {
    return [{
      id: 'wb-gdp-growth',
      label: 'GDP growth',
      value: '—',
      raw: null,
      unit: '%',
      cadence: 'annual',
      source: 'worldbank',
      sourceUrl: 'https://data.worldbank.org',
      status: 'unavailable',
      hint: 'Select a country for GDP data',
    }]
  }

  const code = iso2ToWorldBankCode(iso)
  const url = `https://api.worldbank.org/v2/country/${code}/indicator/${GDP_INDICATOR}?format=json&per_page=5&mrnev=5`

  try {
    const res = await fetch(url, { signal: ctx.signal })
    if (!res.ok) throw new Error(`World Bank HTTP ${res.status}`)
    const json = await res.json()
    const rows = json?.[1] || []
    const valid = rows.filter((r) => r.value != null && Number.isFinite(Number(r.value)))
    const latest = valid[0]
    const sparkline = valid.slice(0, 5).reverse().map((r) => Number(r.value))

    if (!latest) {
      return [{
        id: 'wb-gdp-growth',
        label: 'GDP growth',
        value: '—',
        raw: null,
        unit: '%',
        cadence: 'annual',
        source: 'worldbank',
        status: 'degraded',
        hint: 'No recent World Bank GDP series for this country',
      }]
    }

    const val = Number(latest.value)
    return [{
      id: 'wb-gdp-growth',
      label: 'GDP growth',
      value: formatPercent(val),
      raw: val,
      unit: '%',
      cadence: `annual · ${latest.date || 'latest'}`,
      source: 'worldbank',
      sourceUrl: 'https://data.worldbank.org/indicator/NY.GDP.MKTP.KD.ZG',
      status: 'ok',
      sparkline,
    }]
  } catch (err) {
    return [{
      id: 'wb-gdp-growth',
      label: 'GDP growth',
      value: '—',
      raw: null,
      cadence: 'annual',
      source: 'worldbank',
      status: 'degraded',
      hint: err?.message || 'World Bank fetch failed',
    }]
  }
}
