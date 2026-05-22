/**
 * Approximate geocoding for Bluesky posts — matches place/country keywords in text.
 * All results are approximate (country/region centroids). $0, client-safe.
 */

/** @type {Record<string, { lat: number, lng: number, name: string }>} */
export const BLUESKY_PLACE_KEYWORDS = {
  ukraine: { lat: 49, lng: 32, name: 'Ukraine' },
  kyiv: { lat: 50.45, lng: 30.52, name: 'Kyiv' },
  kiev: { lat: 50.45, lng: 30.52, name: 'Kyiv' },
  russia: { lat: 60, lng: 100, name: 'Russia' },
  moscow: { lat: 55.75, lng: 37.62, name: 'Moscow' },
  gaza: { lat: 31.5, lng: 34.47, name: 'Gaza' },
  israel: { lat: 31.5, lng: 34.8, name: 'Israel' },
  palestine: { lat: 31.9, lng: 35.2, name: 'Palestine' },
  iran: { lat: 32, lng: 53, name: 'Iran' },
  tehran: { lat: 35.69, lng: 51.39, name: 'Tehran' },
  china: { lat: 35, lng: 105, name: 'China' },
  beijing: { lat: 39.9, lng: 116.4, name: 'Beijing' },
  taiwan: { lat: 23.5, lng: 121, name: 'Taiwan' },
  'united states': { lat: 38, lng: -97, name: 'United States' },
  america: { lat: 38, lng: -97, name: 'United States' },
  washington: { lat: 38.9, lng: -77.04, name: 'Washington DC' },
  'new york': { lat: 40.71, lng: -74.01, name: 'New York' },
  london: { lat: 51.51, lng: -0.13, name: 'London' },
  uk: { lat: 54, lng: -2, name: 'United Kingdom' },
  britain: { lat: 54, lng: -2, name: 'United Kingdom' },
  france: { lat: 46, lng: 2, name: 'France' },
  paris: { lat: 48.86, lng: 2.35, name: 'Paris' },
  germany: { lat: 51, lng: 9, name: 'Germany' },
  berlin: { lat: 52.52, lng: 13.41, name: 'Berlin' },
  india: { lat: 20, lng: 77, name: 'India' },
  delhi: { lat: 28.61, lng: 77.21, name: 'Delhi' },
  pakistan: { lat: 30, lng: 70, name: 'Pakistan' },
  syria: { lat: 35, lng: 38, name: 'Syria' },
  lebanon: { lat: 33.8, lng: 35.8, name: 'Lebanon' },
  yemen: { lat: 15, lng: 48, name: 'Yemen' },
  sudan: { lat: 15, lng: 30, name: 'Sudan' },
  haiti: { lat: 19, lng: -72.3, name: 'Haiti' },
  mexico: { lat: 23, lng: -102, name: 'Mexico' },
  brazil: { lat: -10, lng: -55, name: 'Brazil' },
  venezuela: { lat: 8, lng: -66, name: 'Venezuela' },
  japan: { lat: 36, lng: 138, name: 'Japan' },
  tokyo: { lat: 35.68, lng: 139.69, name: 'Tokyo' },
  korea: { lat: 37, lng: 127.5, name: 'Korea' },
  'north korea': { lat: 40, lng: 127, name: 'North Korea' },
  'south korea': { lat: 37, lng: 127.5, name: 'South Korea' },
  australia: { lat: -27, lng: 133, name: 'Australia' },
  canada: { lat: 60, lng: -95, name: 'Canada' },
  turkey: { lat: 39, lng: 35, name: 'Turkey' },
  istanbul: { lat: 41.01, lng: 28.98, name: 'Istanbul' },
  saudi: { lat: 25, lng: 45, name: 'Saudi Arabia' },
  egypt: { lat: 27, lng: 30, name: 'Egypt' },
  cairo: { lat: 30.04, lng: 31.24, name: 'Cairo' },
  nigeria: { lat: 10, lng: 8, name: 'Nigeria' },
  ethiopia: { lat: 8, lng: 38, name: 'Ethiopia' },
  congo: { lat: -4, lng: 22, name: 'DR Congo' },
  myanmar: { lat: 22, lng: 98, name: 'Myanmar' },
  afghanistan: { lat: 33, lng: 65, name: 'Afghanistan' },
  kabul: { lat: 34.53, lng: 69.17, name: 'Kabul' },
  iraq: { lat: 33, lng: 44, name: 'Iraq' },
  baghdad: { lat: 33.31, lng: 44.37, name: 'Baghdad' },
  libya: { lat: 25, lng: 17, name: 'Libya' },
  taiwan strait: { lat: 24, lng: 119.5, name: 'Taiwan Strait' },
  suez: { lat: 30.0, lng: 32.5, name: 'Suez Canal' },
  hormuz: { lat: 26.5, lng: 56.5, name: 'Strait of Hormuz' },
}

/** Crisis / news signal keywords — posts must match at least one. */
export const BLUESKY_SIGNAL_RE = /\b(war|conflict|explosion|earthquake|flood|attack|protest|election|sanctions|missile|invasion|humanitarian|crisis|breaking|urgent|airstrike|ceasefire|nato|un\s|united\s+nations|refugee|wildfire|hurricane|cyclone|tsunami|pandemic|outbreak|nuclear|terror|hostage|diplomat|summit|sanction|embargo|blockade|occupation|shelling|drone|strike|evacuat|casualt|death\s+toll|killed|wounded)\b/i

/**
 * @param {string} text
 * @returns {{ lat: number, lng: number, name: string } | null}
 */
export function geocodeBlueskyText(text) {
  if (!text || typeof text !== 'string') return null
  const lower = text.toLowerCase()
  // Longer phrases first to prefer specific places over countries
  const keys = Object.keys(BLUESKY_PLACE_KEYWORDS).sort((a, b) => b.length - a.length)
  for (const key of keys) {
    if (lower.includes(key)) return BLUESKY_PLACE_KEYWORDS[key]
  }
  return null
}

/**
 * @param {string} text
 * @returns {boolean}
 */
export function isBlueskySignalPost(text) {
  return BLUESKY_SIGNAL_RE.test(text || '')
}
