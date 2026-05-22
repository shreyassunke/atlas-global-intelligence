/**
 * Open-Meteo wind grid fetch — $0, no key, CORS-friendly.
 * Coarse global grid for animated wind particle overlay (Globe.GL).
 */

const GRID_STEP_DEG = 20
const CACHE_MS = 30 * 60_000

/** @type {{ fetchedAt: number, points: import('./windGrid.js').WindGridPoint[] } | null} */
let cache = null

/**
 * @typedef {{ lat: number, lng: number, speedMs: number, directionDeg: number, u: number, v: number }} WindGridPoint
 */

/**
 * Build lat/lng arrays for a coarse global grid.
 * @returns {{ lats: number[], lngs: number[] }}
 */
export function buildWindGridCoords() {
  const lats = []
  const lngs = []
  for (let lat = -60; lat <= 60; lat += GRID_STEP_DEG) {
    for (let lng = -180; lng < 180; lng += GRID_STEP_DEG) {
      lats.push(lat)
      lngs.push(lng)
    }
  }
  return { lats, lngs }
}

/**
 * @param {number} speedKmh
 * @param {number} directionDeg — meteorological "from" direction
 * @returns {{ u: number, v: number }}
 */
export function windToUV(speedKmh, directionDeg) {
  const speedMs = (speedKmh || 0) / 3.6
  const rad = ((directionDeg || 0) * Math.PI) / 180
  // Meteorological direction is where wind comes FROM; u/v point where it goes TO
  const u = -speedMs * Math.sin(rad)
  const v = -speedMs * Math.cos(rad)
  return { u, v }
}

/**
 * Fetch wind grid from Open-Meteo (batched if needed).
 * @returns {Promise<WindGridPoint[]>}
 */
export async function fetchWindGrid() {
  if (cache && Date.now() - cache.fetchedAt < CACHE_MS) return cache.points

  const { lats, lngs } = buildWindGridCoords()
  const batchSize = 80
  /** @type {WindGridPoint[]} */
  const points = []

  for (let i = 0; i < lats.length; i += batchSize) {
    const latBatch = lats.slice(i, i + batchSize)
    const lngBatch = lngs.slice(i, i + batchSize)
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${latBatch.join(',')}&longitude=${lngBatch.join(',')}&current=wind_speed_10m,wind_direction_10m&wind_speed_unit=kmh`
    const res = await fetch(url)
    if (!res.ok) throw new Error(`Open-Meteo wind grid HTTP ${res.status}`)
    const data = await res.json()
    const rows = Array.isArray(data) ? data : [data]
    for (let j = 0; j < rows.length; j++) {
      const row = rows[j]
      const lat = latBatch[j]
      const lng = lngBatch[j]
      const speed = row?.current?.wind_speed_10m ?? 0
      const dir = row?.current?.wind_direction_10m ?? 0
      const { u, v } = windToUV(speed, dir)
      points.push({ lat, lng, speedMs: speed / 3.6, directionDeg: dir, u, v })
    }
  }

  cache = { fetchedAt: Date.now(), points }
  return points
}

/**
 * Bilinear-ish wind lookup for particle advection.
 * @param {WindGridPoint[]} grid
 * @param {number} lat
 * @param {number} lng
 * @returns {{ u: number, v: number }}
 */
export function sampleWind(grid, lat, lng) {
  if (!grid?.length) return { u: 0, v: 0 }
  let best = grid[0]
  let bestDist = Infinity
  for (const p of grid) {
    const dlat = p.lat - lat
    const dlng = (p.lng - lng) * Math.cos((lat * Math.PI) / 180)
    const d = dlat * dlat + dlng * dlng
    if (d < bestDist) {
      bestDist = d
      best = p
    }
  }
  return { u: best.u, v: best.v }
}
