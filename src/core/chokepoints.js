/**
 * Maritime chokepoints — shared bbox definitions for AISStream subscriptions.
 * $0 AISStream.io free tier; filter to high-density lanes to stay under quota.
 */

/** @typedef {{ name: string, lat: number, lng: number }} Chokepoint */

export const CHOKEPOINTS = [
  { name: 'Hormuz', lat: 26.6, lng: 56.3 },
  { name: 'Suez', lat: 30.0, lng: 32.3 },
  { name: 'Malacca', lat: 2.5, lng: 101.8 },
  { name: 'Bab-el-Mandeb', lat: 12.6, lng: 43.3 },
  { name: 'Panama', lat: 9.0, lng: -79.6 },
  { name: 'Taiwan Strait', lat: 24.5, lng: 120.5 },
  { name: 'Bosphorus', lat: 41.1, lng: 29.0 },
  { name: 'South China Sea', lat: 15.0, lng: 115.0 },
]

/** ~1.5° radius bounding boxes for AISStream `BoundingBoxes` subscription. */
export const AIS_CHOKEPOINT_BBOXES = CHOKEPOINTS.map((cp) => {
  const d = 1.5
  return [[cp.lat - d, cp.lng - d], [cp.lat + d, cp.lng + d]]
})

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
