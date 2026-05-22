import {
  twoline2satrec,
  propagate,
  gstime,
  eciToGeodetic,
  degreesLong,
  degreesLat,
} from 'satellite.js'

/**
 * Parse CelesTrak 3-line TLE text into records.
 * @param {string} text
 * @returns {Array<{ name: string, line1: string, line2: string, noradId: number }>}
 */
export function parseTleCatalog(text) {
  if (!text || typeof text !== 'string') return []
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  const out = []
  let i = 0
  while (i < lines.length) {
    const name = lines[i]
    const line1 = lines[i + 1]
    const line2 = lines[i + 2]
    if (!line1?.startsWith('1 ') || !line2?.startsWith('2 ')) {
      i += 1
      continue
    }
    const noradMatch = line1.match(/^1\s+(\d+)/)
    const noradId = noradMatch ? parseInt(noradMatch[1], 10) : 0
    out.push({ name, line1, line2, noradId })
    i += 3
  }
  return out
}

/**
 * Propagate a TLE pair to lat/lng/alt at `date`.
 * @param {string} line1
 * @param {string} line2
 * @param {Date} [date]
 * @returns {{ lat: number, lng: number, altKm: number } | null}
 */
export function propagateTle(line1, line2, date = new Date()) {
  if (!line1 || !line2) return null
  try {
    const satrec = twoline2satrec(line1, line2)
    const pv = propagate(satrec, date)
    if (!pv?.position) return null
    const gmst = gstime(date)
    const gd = eciToGeodetic(pv.position, gmst)
    const lat = degreesLat(gd.latitude)
    const lng = degreesLong(gd.longitude)
    const altKm = gd.height
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
    return { lat, lng, altKm }
  } catch {
    return null
  }
}

/**
 * Sample one orbital ground track as Map3D-ready coordinates.
 * @param {string} line1
 * @param {string} line2
 * @param {Date} [startDate]
 * @param {number} [steps=90]
 * @returns {Array<{ lat: number, lng: number, altitude: number }>}
 */
export function computeGroundTrack(line1, line2, startDate = new Date(), steps = 90) {
  if (!line1 || !line2) return []
  let periodMin = 90
  try {
    const satrec = twoline2satrec(line1, line2)
    const mm = satrec.no * (1440 / (2 * Math.PI))
    if (Number.isFinite(mm) && mm > 0) periodMin = 1440 / mm
  } catch { /* default */ }

  const coords = []
  const stepMs = (periodMin * 60_000) / steps
  for (let i = 0; i <= steps; i++) {
    const t = new Date(startDate.getTime() + i * stepMs)
    const pos = propagateTle(line1, line2, t)
    if (!pos) continue
    coords.push({
      lat: pos.lat,
      lng: pos.lng,
      altitude: Math.max(80, pos.altKm * 1000),
    })
  }
  return coords
}

/**
 * Short target ID for detection HUD labels.
 * @param {object} evt
 * @returns {string}
 */
export function targetIdLabel(evt) {
  if (evt.callsign?.trim()) return evt.callsign.trim().slice(0, 8)
  if (evt.icao24) return evt.icao24.toUpperCase().slice(0, 6)
  if (evt.noradId) return `N${evt.noradId}`
  if (evt.id) return evt.id.slice(0, 6).toUpperCase()
  return 'TGT'
}

/** Earth mean radius (m) — used for orbit visualization scaling on Map3D. */
export const EARTH_RADIUS_M = 6_371_000

/**
 * Bucket camera range so orbit/marker scaling does not recompute on every frame
 * while the user rotates or zooms (range jitters slightly during gestures).
 * @param {number} rangeM
 */
export function bucketCameraRangeM(rangeM) {
  const r = Math.max(500, rangeM || 24_000_000)
  if (r >= 22_000_000) return 24_000_000
  if (r >= 14_000_000) return 16_000_000
  if (r >= 8_000_000) return 10_000_000
  if (r >= 3_000_000) return 4_000_000
  if (r >= 1_200_000) return 1_800_000
  if (r >= 400_000) return 600_000
  return Math.round(r / 25_000) * 25_000
}

/** Orbit polyline budget — fewer segments at global zoom keeps drag responsive. */
export function orbitArcRenderParams(cameraRangeM) {
  const range = bucketCameraRangeM(cameraRangeM)
  if (range >= 16_000_000) return { maxArcs: 16, steps: 20 }
  if (range >= 8_000_000) return { maxArcs: 24, steps: 28 }
  return { maxArcs: 24, steps: 40 }
}

/**
 * Scale satellite altitude for Map3D so LEO tracks read as "in orbit" at global zoom.
 * Returns true altitude when the camera is close; lifts to ~2.2 Earth radii at full disk.
 * @param {number} altM — true altitude above ellipsoid (m)
 * @param {number} [cameraRangeM=24_000_000]
 */
export function satelliteDisplayAltitudeM(altM, cameraRangeM = 24_000_000) {
  const alt = Math.max(80_000, altM || 400_000)
  const range = Math.max(500, cameraRangeM)
  if (range <= 1_500_000) return alt
  const target = EARTH_RADIUS_M * 2.2
  if (range >= 18_000_000) return target
  const t = (range - 1_500_000) / (18_000_000 - 1_500_000)
  return alt + (target - alt) * Math.min(1, Math.max(0, t))
}

/** Sample a partial orbit arc for Map3D polylines (ABSOLUTE altitude, meters). */
export function computeOrbitArc(line1, line2, startDate = new Date(), steps = 36, cameraRangeM = 24_000_000) {
  const raw = computeGroundTrack(line1, line2, startDate, steps)
  return raw.map((p) => ({
    ...p,
    altitude: satelliteDisplayAltitudeM(p.altitude, cameraRangeM),
  }))
}
