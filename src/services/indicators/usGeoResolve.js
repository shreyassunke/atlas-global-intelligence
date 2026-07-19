/**
 * Resolve lat/lng → US Census geographies (state/county FIPS, place, CBSA/MSA).
 * Uses the free Census Geocoder — no API key required.
 * https://geocoding.geo.census.gov/geocoder/
 */

/**
 * @typedef {{
 *   stateFips: string,
 *   countyFips: string,
 *   countyName: string,
 *   stateName: string,
 *   stateAbbr: string,
 *   placeFips: string|null,
 *   placeName: string|null,
 *   cbsaCode: string|null,
 *   cbsaName: string|null,
 *   geoid: string,
 * }} UsGeoIds
 */

/**
 * @param {number} lat
 * @param {number} lng
 * @param {{ signal?: AbortSignal }} [opts]
 * @returns {Promise<UsGeoIds|null>}
 */
export async function resolveUsGeoFromCoords(lat, lng, { signal } = {}) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  // Rough CONUS + AK/HI + territories longitude band — skip clearly international points.
  if (lat < 17 || lat > 72 || lng < -179 || lng > -64) return null

  const url = new URL('https://geocoding.geo.census.gov/geocoder/geographies/coordinates')
  url.searchParams.set('x', String(lng))
  url.searchParams.set('y', String(lat))
  url.searchParams.set('benchmark', 'Public_AR_Current')
  url.searchParams.set('vintage', 'Current_Current')
  url.searchParams.set('format', 'json')

  try {
    const res = await fetch(url.toString(), { signal })
    if (!res.ok) return null
    const json = await res.json()
    const geographies = json?.result?.geographies || {}
    const counties = geographies.Counties || geographies['Counties'] || []
    const county = counties[0]
    if (!county) return null

    const stateFips = String(county.STATE || '').padStart(2, '0')
    const countyFips = String(county.COUNTY || '').padStart(3, '0')
    if (stateFips.length !== 2 || countyFips.length !== 3) return null

    const places = geographies['Incorporated Places']
      || geographies['Census Designated Places']
      || []
    const place = places[0] || null

    const cbsas = geographies['Metropolitan Statistical Areas']
      || geographies['Micropolitan Statistical Areas']
      || geographies['Combined Statistical Areas']
      || geographies['Urban Areas']
      || []
    const cbsa = cbsas[0] || null

    const states = geographies.States || geographies['States'] || []
    const stateRow = states[0] || null

    const countyName = String(county.NAME || county.BASENAME || 'County').trim()

    return {
      stateFips,
      countyFips,
      countyName,
      stateName: String(county.STATE_NAME || stateRow?.NAME || '').trim(),
      stateAbbr: String(county.STUSAB || stateRow?.STUSAB || '').toUpperCase(),
      placeFips: place?.PLACE ? String(place.PLACE).padStart(5, '0') : null,
      placeName: place?.NAME ? String(place.NAME).trim() : null,
      cbsaCode: cbsa?.GEOID ? String(cbsa.GEOID) : (cbsa?.CBSA ? String(cbsa.CBSA) : null),
      cbsaName: cbsa?.NAME ? String(cbsa.NAME).trim() : null,
      geoid: `${stateFips}${countyFips}`,
    }
  } catch {
    return null
  }
}

export function formatCountyLabel(geo) {
  if (!geo?.countyName) return null
  return geo.countyName
}

export function formatMsaLabel(geo) {
  if (!geo?.cbsaName) return null
  return String(geo.cbsaName)
    .replace(/ Metro Area$/i, ' MSA')
    .replace(/ CSA$/i, ' CSA')
    .replace(/ Urban Area$/i, '')
}
