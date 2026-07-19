/**
 * Approximate ground lat/lng under a screen pointer from Map3D camera params.
 * Map3D has no public pick/unproject API for right-click, so we raycast a
 * spherical Earth (with a close-range tangent-plane fallback).
 */
const EARTH_RADIUS_M = 6_371_000
/** Vertical FOV used for the synthetic camera (Map3D does not expose FOV). */
const APPROX_FOV_DEG = 35
/** Below this range, tangent-plane pick is more stable than a bare sphere. */
const TANGENT_RANGE_M = 2_500_000

/**
 * @param {number} lat
 * @param {number} lng
 * @param {number} [altM]
 */
function latLngToEcef(lat, lng, altM = 0) {
  const φ = (lat * Math.PI) / 180
  const λ = (lng * Math.PI) / 180
  const r = EARTH_RADIUS_M + altM
  const cosφ = Math.cos(φ)
  return {
    x: r * cosφ * Math.cos(λ),
    y: r * cosφ * Math.sin(λ),
    z: r * Math.sin(φ),
  }
}

/** @param {{ x: number, y: number, z: number }} p */
function ecefToLatLng(p) {
  const r = Math.hypot(p.x, p.y, p.z)
  if (!(r > 0)) return null
  return {
    lat: (Math.asin(p.z / r) * 180) / Math.PI,
    lng: (Math.atan2(p.y, p.x) * 180) / Math.PI,
  }
}

/**
 * Rotate an ENU vector at (lat0, lng0) into ECEF.
 * @param {number} east
 * @param {number} north
 * @param {number} up
 * @param {number} lat0
 * @param {number} lng0
 */
function enuToEcef(east, north, up, lat0, lng0) {
  const φ = (lat0 * Math.PI) / 180
  const λ = (lng0 * Math.PI) / 180
  const sφ = Math.sin(φ)
  const cφ = Math.cos(φ)
  const sλ = Math.sin(λ)
  const cλ = Math.cos(λ)
  return {
    x: -sλ * east - sφ * cλ * north + cφ * cλ * up,
    y: cλ * east - sφ * sλ * north + cφ * sλ * up,
    z: cφ * north + sφ * up,
  }
}

/**
 * Nearest forward intersection of ray (origin + t*dir) with Earth sphere.
 * @returns {{ x: number, y: number, z: number } | null}
 */
function raySphereHit(origin, dir) {
  const R = EARTH_RADIUS_M
  const b = 2 * (origin.x * dir.x + origin.y * dir.y + origin.z * dir.z)
  const c = origin.x * origin.x + origin.y * origin.y + origin.z * origin.z - R * R
  const disc = b * b - 4 * c
  if (disc < 0) return null
  const sqrt = Math.sqrt(disc)
  const t0 = (-b - sqrt) / 2
  const t1 = (-b + sqrt) / 2
  const t = t0 > 1e-3 ? t0 : t1 > 1e-3 ? t1 : null
  if (t == null) return null
  return {
    x: origin.x + dir.x * t,
    y: origin.y + dir.y * t,
    z: origin.z + dir.z * t,
  }
}

/**
 * Spherical ray pick — accurate at globe / continental ranges.
 * Returns null when the pointer misses the Earth disk (space / limb).
 */
function raySphereLatLng(p) {
  const {
    centerLat,
    centerLng,
    rangeM,
    headingDeg = 0,
    tiltDeg = 0,
    clientX,
    clientY,
    viewportWidth,
    viewportHeight,
  } = p

  const range = Math.max(200, rangeM)
  const tilt = ((Number(tiltDeg) || 0) * Math.PI) / 180
  const heading = ((Number(headingDeg) || 0) * Math.PI) / 180
  const sinT = Math.sin(tilt)
  const cosT = Math.cos(tilt)
  const sinH = Math.sin(heading)
  const cosH = Math.cos(heading)

  // Camera in local ENU at look-at (Google Earth: tilt swings camera "back").
  const camE = -range * sinT * sinH
  const camN = -range * sinT * cosH
  const camU = range * cosT

  const centerEcef = latLngToEcef(centerLat, centerLng, 0)
  const camOff = enuToEcef(camE, camN, camU, centerLat, centerLng)
  const eye = {
    x: centerEcef.x + camOff.x,
    y: centerEcef.y + camOff.y,
    z: centerEcef.z + camOff.z,
  }

  // Camera basis in ENU (forward toward look-at, up ≈ heading on screen).
  const fE = sinT * sinH
  const fN = sinT * cosH
  const fU = -cosT

  let uE = sinH
  let uN = cosH
  let uU = 0
  const fDotU = fE * uE + fN * uN + fU * uU
  uE -= fDotU * fE
  uN -= fDotU * fN
  uU -= fDotU * fU
  const uLen = Math.hypot(uE, uN, uU)
  if (uLen < 1e-9) {
    // Degenerate near tilt=90° — fall back to local east as up seed.
    uE = cosH
    uN = -sinH
    uU = 0
  } else {
    uE /= uLen
    uN /= uLen
    uU /= uLen
  }

  // right = forward × up
  let rE = fN * uU - fU * uN
  let rN = fU * uE - fE * uU
  let rU = fE * uN - fN * uE
  const rLen = Math.hypot(rE, rN, rU) || 1
  rE /= rLen
  rN /= rLen
  rU /= rLen

  const nx = (clientX / viewportWidth - 0.5) * 2
  const ny = (0.5 - clientY / viewportHeight) * 2
  const fovY = (APPROX_FOV_DEG * Math.PI) / 180
  const tanHalf = Math.tan(fovY / 2)
  const aspect = viewportWidth / viewportHeight
  let dx = nx * aspect * tanHalf
  let dy = ny * tanHalf
  let dz = 1
  const dLen = Math.hypot(dx, dy, dz) || 1
  dx /= dLen
  dy /= dLen
  dz /= dLen

  const dEnuE = rE * dx + uE * dy + fE * dz
  const dEnuN = rN * dx + uN * dy + fN * dz
  const dEnuU = rU * dx + uU * dy + fU * dz
  const dir = enuToEcef(dEnuE, dEnuN, dEnuU, centerLat, centerLng)
  const dirLen = Math.hypot(dir.x, dir.y, dir.z) || 1
  dir.x /= dirLen
  dir.y /= dirLen
  dir.z /= dirLen

  const hit = raySphereHit(eye, dir)
  if (!hit) return null
  const ll = ecefToLatLng(hit)
  if (!ll || !Number.isFinite(ll.lat) || !Number.isFinite(ll.lng)) return null
  return {
    lat: Math.max(-85, Math.min(85, ll.lat)),
    lng: ((((ll.lng + 180) % 360) + 360) % 360) - 180,
  }
}

/**
 * Close-range tangent-plane estimate (regional / city zooms).
 */
function tangentPlaneLatLng(p) {
  const {
    centerLat,
    centerLng,
    rangeM,
    headingDeg = 0,
    tiltDeg = 0,
    clientX,
    clientY,
    viewportWidth,
    viewportHeight,
  } = p

  const nx = clientX / viewportWidth - 0.5
  const ny = clientY / viewportHeight - 0.5
  const fovRad = (APPROX_FOV_DEG * Math.PI) / 180
  const halfH = Math.tan(fovRad / 2) * Math.max(200, rangeM)
  const aspect = viewportWidth / viewportHeight
  const metersX = nx * 2 * halfH * aspect
  const metersY = -ny * 2 * halfH

  const tilt = (Number(tiltDeg) || 0) * (Math.PI / 180)
  const heading = (Number(headingDeg) || 0) * (Math.PI / 180)
  const forward = metersY / Math.max(0.25, Math.cos(tilt))
  const right = metersX

  const east = right * Math.cos(heading) + forward * Math.sin(heading)
  const north = -right * Math.sin(heading) + forward * Math.cos(heading)

  const mPerDegLat = 111_320
  const mPerDegLng = 111_320 * Math.cos((centerLat * Math.PI) / 180)

  let lat = centerLat + north / mPerDegLat
  let lng = centerLng + east / Math.max(1e-6, mPerDegLng)
  lat = Math.max(-85, Math.min(85, lat))
  lng = ((((lng + 180) % 360) + 360) % 360) - 180

  return { lat, lng }
}

/**
 * @param {{
 *   centerLat: number,
 *   centerLng: number,
 *   rangeM: number,
 *   headingDeg?: number,
 *   tiltDeg?: number,
 *   clientX: number,
 *   clientY: number,
 *   viewportWidth: number,
 *   viewportHeight: number,
 * }} p
 * @returns {{ lat: number, lng: number } | null}
 */
export function approxLatLngUnderPointer(p) {
  const {
    centerLat,
    centerLng,
    rangeM,
    clientX,
    clientY,
    viewportWidth,
    viewportHeight,
  } = p

  if (
    !Number.isFinite(centerLat) ||
    !Number.isFinite(centerLng) ||
    !Number.isFinite(rangeM) ||
    !Number.isFinite(clientX) ||
    !Number.isFinite(clientY) ||
    !(viewportWidth > 0) ||
    !(viewportHeight > 0)
  ) {
    return null
  }

  // Globe / continental: ray–sphere (also returns null for space around the disk).
  if (rangeM >= TANGENT_RANGE_M) {
    return raySphereLatLng(p)
  }

  // Close-in: prefer tangent plane; if it somehow fails, try the sphere.
  return tangentPlaneLatLng(p) || raySphereLatLng(p)
}
