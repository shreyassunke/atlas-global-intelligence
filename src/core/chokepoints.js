/**
 * Maritime chokepoints — shared bbox definitions for AISStream subscriptions.
 * AISStream expects [[minLng, minLat], [maxLng, maxLat]] — NOT lat/lng order.
 */

/** @typedef {{ name: string, lat: number, lng: number, region?: string }} Chokepoint */

export const CHOKEPOINTS = [
  // Original 8 chokepoints
  { name: 'Hormuz', lat: 26.6, lng: 56.3, region: 'middle-east' },
  { name: 'Suez', lat: 30.0, lng: 32.3, region: 'middle-east' },
  { name: 'Malacca', lat: 2.5, lng: 101.8, region: 'asia-pacific' },
  { name: 'Bab-el-Mandeb', lat: 12.6, lng: 43.3, region: 'middle-east' },
  { name: 'Panama', lat: 9.0, lng: -79.6, region: 'americas' },
  { name: 'Taiwan Strait', lat: 24.5, lng: 120.5, region: 'asia-pacific' },
  { name: 'Bosphorus', lat: 41.1, lng: 29.0, region: 'europe' },
  { name: 'South China Sea', lat: 15.0, lng: 115.0, region: 'asia-pacific' },
  // Phase 4 — expanded regional coverage
  { name: 'Gibraltar', lat: 36.0, lng: -5.5, region: 'europe' },
  { name: 'English Channel', lat: 50.5, lng: -1.0, region: 'europe' },
  { name: 'North Sea', lat: 56.0, lng: 3.0, region: 'europe' },
  { name: 'US East Coast', lat: 36.0, lng: -75.0, region: 'americas' },
  { name: 'US Gulf', lat: 28.0, lng: -90.0, region: 'americas' },
  { name: 'Caribbean', lat: 18.0, lng: -66.0, region: 'americas' },
  { name: 'Cape of Good Hope', lat: -34.5, lng: 18.5, region: 'africa' },
  { name: 'Mozambique Channel', lat: -18.0, lng: 40.0, region: 'africa' },
  { name: 'Persian Gulf', lat: 26.0, lng: 51.0, region: 'middle-east' },
  { name: 'Red Sea North', lat: 22.0, lng: 38.5, region: 'middle-east' },
  { name: 'Korea Strait', lat: 34.5, lng: 129.0, region: 'asia-pacific' },
  { name: 'Lombok Strait', lat: -8.5, lng: 115.8, region: 'asia-pacific' },
  { name: 'Mediterranean Central', lat: 36.0, lng: 18.0, region: 'europe' },
]

const DEFAULT_RADIUS_DEG = 1.5

/**
 * Build AISStream bounding boxes from chokepoint centers.
 * @param {number} [radiusDeg]
 * @returns {[number, number][][]}
 */
export function buildAisBoundingBoxes(radiusDeg = DEFAULT_RADIUS_DEG) {
  return CHOKEPOINTS.map((cp) => [
    [cp.lng - radiusDeg, cp.lat - radiusDeg],
    [cp.lng + radiusDeg, cp.lat + radiusDeg],
  ])
}

/** Pre-built bboxes for AISStream `BoundingBoxes` subscription. */
export const AIS_CHOKEPOINT_BBOXES = buildAisBoundingBoxes()

/**
 * @param {number} lat
 * @param {number} lng
 * @returns {boolean}
 */
export function isNearChokepoint(lat, lng) {
  for (const cp of CHOKEPOINTS) {
    const dlat = Math.abs(lat - cp.lat)
    const dlng = Math.abs(lng - cp.lng) * Math.cos((lat * Math.PI) / 180)
    if (Math.sqrt(dlat * dlat + dlng * dlng) < 2.0) return true
  }
  return false
}

/**
 * @param {string} region
 * @returns {Chokepoint[]}
 */
export function chokepointsInRegion(region) {
  return CHOKEPOINTS.filter((cp) => cp.region === region)
}
