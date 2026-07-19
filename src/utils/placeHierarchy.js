/**
 * Admin place hierarchy for map context-menu resolution.
 * Ranked specificity: city → county → state → country.
 */

export const PLACE_LEVELS = ['city', 'county', 'state', 'country']

/**
 * @typedef {{
 *   label: string,
 *   city: string|null,
 *   county: string|null,
 *   state: string|null,
 *   country: string|null,
 *   countryCode: string|null,
 *   formattedAddress: string,
 *   source: string,
 * }} PlaceHierarchy
 */

/**
 * Build a normalised hierarchy from partial address fields.
 * @param {Partial<PlaceHierarchy> & { countryName?: string }} parts
 * @returns {PlaceHierarchy|null}
 */
export function buildPlaceHierarchy(parts = {}) {
  const city = cleanLabel(parts.city)
  const county = cleanLabel(parts.county)
  const state = cleanLabel(parts.state)
  const country = cleanLabel(parts.country || parts.countryName)
  const countryCode = parts.countryCode
    ? String(parts.countryCode).trim().toUpperCase().slice(0, 3)
    : null

  if (!city && !county && !state && !country) return null

  const label = city || county || state || country || 'Location'
  return {
    label,
    city,
    county,
    state,
    country,
    countryCode,
    formattedAddress: String(parts.formattedAddress || '').trim(),
    source: parts.source || 'unknown',
  }
}

/**
 * Labels to try for economy/news queries, most specific first.
 * Dedupes case-insensitively (e.g. city === country for city-states).
 * @param {PlaceHierarchy|null|undefined} place
 * @param {{ name?: string }|null|undefined} countryFallback
 * @returns {{ level: string, name: string }[]}
 */
export function placeQueryLadder(place, countryFallback = null) {
  const ladder = []
  const seen = new Set()

  const push = (level, name) => {
    const cleaned = cleanLabel(name)
    if (!cleaned) return
    const key = cleaned.toLowerCase()
    if (seen.has(key)) return
    seen.add(key)
    ladder.push({ level, name: cleaned })
  }

  if (place) {
    push('city', place.city)
    push('county', place.county)
    push('state', place.state)
    push('country', place.country)
  }

  push('country', countryFallback?.name)

  return ladder
}

/** Quote multi-word GDELT DOC terms; leave single tokens bare. */
export function docQueryForName(name) {
  const cleaned = String(name || '').trim()
  if (!cleaned) return ''
  return cleaned.includes(' ') ? `"${cleaned}"` : cleaned
}

/**
 * Collapsed query plan for place TOP NEWS DOC fallback.
 * Prefer location: operator + city/state compounds; avoid bare country-wide OR.
 *
 * @param {PlaceHierarchy|null|undefined} place
 * @param {{ name?: string }|null|undefined} countryFallback
 * @returns {{ kind: string, level: string, name: string, query: string }[]}
 */
export function placeNewsQueryPlan(place, countryFallback = null) {
  const ladder = placeQueryLadder(place, countryFallback)
  if (!ladder.length) return []

  /** @type {{ kind: string, level: string, name: string, query: string }[]} */
  const plan = []
  const seenQueries = new Set()

  const pushStep = (kind, level, name, query) => {
    const q = String(query || '').trim()
    if (!q) return
    const key = q.toLowerCase()
    if (seenQueries.has(key)) return
    seenQueries.add(key)
    plan.push({ kind, level, name, query: q })
  }

  const city = cleanLabel(place?.city)
  const county = cleanLabel(place?.county)
  const state = cleanLabel(place?.state)
  const country = cleanLabel(place?.country) || cleanLabel(countryFallback?.name)

  // GDELT location: operator (GEO/GKG location mentions) — tighter than bare keywords.
  if (city && state) {
    pushStep(
      'location',
      'city',
      city,
      `location:"${city}" location:"${state}"`,
    )
    pushStep(
      'compound',
      'city',
      city,
      `${docQueryForName(city)} ${docQueryForName(state)}`,
    )
  } else if (city && country && country.toLowerCase() !== city.toLowerCase()) {
    pushStep('location', 'city', city, `location:"${city}"`)
    pushStep(
      'compound',
      'city',
      city,
      `${docQueryForName(city)} ${docQueryForName(country)}`,
    )
  } else if (city) {
    pushStep('location', 'city', city, `location:"${city}"`)
  }

  if (county && state) {
    pushStep(
      'location',
      'county',
      county,
      `location:"${county}" location:"${state}"`,
    )
    pushStep(
      'compound',
      'county',
      county,
      `${docQueryForName(county)} ${docQueryForName(state)}`,
    )
  }

  // State-level only as last DOC resort (still more local than country).
  if (state) {
    pushStep('location', 'state', state, `location:"${state}"`)
  }

  // Avoid bare country singles and broad OR ladders — those pull national noise.
  void ladder
  void country

  return plan
}

/**
 * First query to warm for intent prefetch (compound or first plan step).
 * @param {PlaceHierarchy|null|undefined} place
 * @param {{ name?: string }|null|undefined} countryFallback
 */
export function placeNewsPrefetchQuery(place, countryFallback = null) {
  const plan = placeNewsQueryPlan(place, countryFallback)
  return plan[0] || null
}

/**
 * Primary display label for UI (menu header, inspector titles).
 * @param {PlaceHierarchy|null|undefined} place
 * @param {{ name?: string }|null|undefined} countryFallback
 */
export function placeDisplayLabel(place, countryFallback = null) {
  return cleanLabel(place?.label) || cleanLabel(countryFallback?.name) || 'Location'
}

function cleanLabel(value) {
  const s = String(value || '').trim()
  return s || null
}
