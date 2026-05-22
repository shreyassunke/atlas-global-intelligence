/**
 * Client-side solar terminator geometry (day/night boundary).
 * Uses solar-calculator (same convention as GlobeGLView).
 */
import * as solar from 'solar-calculator'

/** Subsolar point [lng, lat] in degrees for a given instant. */
export function subsolarPoint(date = new Date()) {
  const dt = +date
  const day = new Date(dt).setUTCHours(0, 0, 0, 0)
  const t = solar.century(dt)
  const longitude = ((day - dt) / 864e5) * 360 - 180
  return [longitude - solar.equationOfTime(t) / 4, solar.declination(t)]
}

function latLngToUnit(lat, lng) {
  const phi = ((90 - lat) * Math.PI) / 180
  const theta = ((90 - lng) * Math.PI) / 180
  const x = Math.sin(phi) * Math.cos(theta)
  const y = Math.cos(phi)
  const z = Math.sin(phi) * Math.sin(theta)
  const len = Math.hypot(x, y, z) || 1
  return [x / len, y / len, z / len]
}

function unitToLatLng(x, y, z) {
  const r = Math.hypot(x, y, z) || 1
  const yn = y / r
  const phi = Math.acos(Math.max(-1, Math.min(1, yn)))
  const lat = 90 - (phi * 180) / Math.PI
  const theta = Math.atan2(z, x)
  let lng = 90 - (theta * 180) / Math.PI
  while (lng > 180) lng -= 360
  while (lng < -180) lng += 360
  return { lat, lng }
}

function cross(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ]
}

/**
 * Closed ring of lat/lng points along the solar terminator (great circle).
 * @param {Date} [date]
 * @param {number} [steps]
 * @returns {Array<{ lat: number, lng: number }>}
 */
export function buildTerminatorRing(date = new Date(), steps = 180) {
  const [sunLng, sunLat] = subsolarPoint(date)
  const sun = latLngToUnit(sunLat, sunLng)
  const ref = Math.abs(sun[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]
  let east = cross(ref, sun)
  const elen = Math.hypot(east[0], east[1], east[2]) || 1
  east = [east[0] / elen, east[1] / elen, east[2] / elen]
  let north = cross(sun, east)
  const nlen = Math.hypot(north[0], north[1], north[2]) || 1
  north = [north[0] / nlen, north[1] / nlen, north[2] / nlen]

  const ring = []
  const n = Math.max(72, steps)
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2
    const x = east[0] * Math.cos(a) + north[0] * Math.sin(a)
    const y = east[1] * Math.cos(a) + north[1] * Math.sin(a)
    const z = east[2] * Math.cos(a) + north[2] * Math.sin(a)
    ring.push(unitToLatLng(x, y, z))
  }
  return ring
}

/**
 * GeoJSON LineString for MapLibre (coordinates [lng, lat]).
 */
export function terminatorGeoJsonLine(date = new Date()) {
  const ring = buildTerminatorRing(date)
  return {
    type: 'Feature',
    geometry: {
      type: 'LineString',
      coordinates: ring.map((p) => [p.lng, p.lat]),
    },
    properties: {},
  }
}

/** True when a surface point is on the night side (sun below horizon). */
export function isNightAt(lat, lng, date = new Date()) {
  const [sunLng, sunLat] = subsolarPoint(date)
  const sun = latLngToUnit(sunLat, sunLng)
  const p = latLngToUnit(lat, lng)
  const dot = sun[0] * p[0] + sun[1] * p[1] + sun[2] * p[2]
  return dot < 0
}
