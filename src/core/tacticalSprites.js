import aircraftSvgRaw from '../../public/vecteezy_icon-of-an-airplane-taking-off_4879681.svg?raw'

const spriteCache = new Map()

/** Path from `public/vecteezy_icon-of-an-airplane-taking-off_4879681.svg` (viewBox 1024×1024, nose up). */
const AIRCRAFT_SVG_PATH_D = (() => {
  const match = aircraftSvgRaw.match(/\sd="\s*([\s\S]*?)"/)
  return match ? match[1].replace(/\s+/g, ' ').trim() : ''
})()

const AIRCRAFT_VIEW = 1024

const AIRCRAFT_COLORS = {
  civilian: { fill: '#00d4ff', stroke: 'rgba(0, 212, 255, 0.35)' },
  military: { fill: '#ff6b35', stroke: 'rgba(255, 107, 53, 0.4)' },
}

function drawAircraftIcon(ctx, size, fill, stroke) {
  if (!AIRCRAFT_SVG_PATH_D) return
  const scale = (size * 0.88) / AIRCRAFT_VIEW
  ctx.scale(scale, scale)
  ctx.translate(-AIRCRAFT_VIEW / 2, -AIRCRAFT_VIEW / 2)
  const path = new Path2D(AIRCRAFT_SVG_PATH_D)
  ctx.fillStyle = fill
  ctx.fill(path)
  if (stroke) {
    ctx.strokeStyle = stroke
    ctx.lineWidth = 18
    ctx.stroke(path)
  }
}

/**
 * Aircraft marker from Vecteezy SVG, oriented by true track (degrees).
 * @param {number} trackDeg — heading in degrees (0 = north)
 * @param {boolean} [military=false]
 * @param {number} [size=24]
 * @returns {string} data URL
 */
export function aircraftSpriteDataUrl(trackDeg = 0, military = false, size = 24) {
  const key = `ac-svg-${Math.round(trackDeg)}-${military ? 'm' : 'c'}-${size}`
  if (spriteCache.has(key)) return spriteCache.get(key)

  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  const cx = size / 2
  const cy = size / 2
  const palette = military ? AIRCRAFT_COLORS.military : AIRCRAFT_COLORS.civilian

  ctx.save()
  ctx.translate(cx, cy)
  ctx.rotate(((trackDeg || 0) * Math.PI) / 180)
  drawAircraftIcon(ctx, size, palette.fill, palette.stroke)
  ctx.restore()

  const url = canvas.toDataURL('image/png')
  spriteCache.set(key, url)
  return url
}

/**
 * Small satellite dot sprite.
 * @param {boolean} [military=false]
 * @param {number} [size=10]
 * @returns {string}
 */
export function satelliteSpriteDataUrl(military = false, size = 10) {
  const key = `sat-${military ? 'm' : 'c'}-${size}`
  if (spriteCache.has(key)) return spriteCache.get(key)

  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  const cx = size / 2
  const cy = size / 2
  const r = size * 0.35

  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.fillStyle = military ? '#ff6b35' : '#c8ff00'
  ctx.fill()
  ctx.strokeStyle = military ? 'rgba(255, 107, 53, 0.6)' : 'rgba(200, 255, 0, 0.5)'
  ctx.lineWidth = 1
  ctx.stroke()

  // Crosshair tick marks for satellite
  ctx.strokeStyle = military ? 'rgba(255, 107, 53, 0.35)' : 'rgba(200, 255, 0, 0.35)'
  ctx.beginPath()
  ctx.moveTo(cx - r - 2, cy)
  ctx.lineTo(cx - r + 1, cy)
  ctx.moveTo(cx + r - 1, cy)
  ctx.lineTo(cx + r + 2, cy)
  ctx.moveTo(cx, cy - r - 2)
  ctx.lineTo(cx, cy - r + 1)
  ctx.moveTo(cx, cy + r - 1)
  ctx.lineTo(cx, cy + r + 2)
  ctx.stroke()

  const url = canvas.toDataURL('image/png')
  spriteCache.set(key, url)
  return url
}

/**
 * Ship/vessel chevron sprite oriented by course over ground (degrees).
 * @param {number} cogDeg — course in degrees (0 = north)
 * @param {number} [size=22]
 * @returns {string} data URL
 */
export function vesselSpriteDataUrl(cogDeg = 0, size = 22) {
  const key = `vsl-${Math.round(cogDeg)}-${size}`
  if (spriteCache.has(key)) return spriteCache.get(key)

  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  const cx = size / 2
  const cy = size / 2

  ctx.save()
  ctx.translate(cx, cy)
  ctx.rotate(((cogDeg || 0) * Math.PI) / 180)

  const fill = '#4dd4ff'
  const stroke = 'rgba(77, 212, 255, 0.45)'

  // Hull shape — wider than aircraft chevron
  ctx.beginPath()
  ctx.moveTo(0, -size * 0.4)
  ctx.lineTo(size * 0.28, size * 0.35)
  ctx.lineTo(0, size * 0.22)
  ctx.lineTo(-size * 0.28, size * 0.35)
  ctx.closePath()
  ctx.fillStyle = fill
  ctx.fill()
  ctx.strokeStyle = stroke
  ctx.lineWidth = 1.2
  ctx.stroke()

  ctx.restore()

  const url = canvas.toDataURL('image/png')
  spriteCache.set(key, url)
  return url
}

/**
 * Detection reticle overlay sprite (CSS/SVG-style ring baked to canvas).
 * @param {number} [size=32]
 * @returns {string}
 */
export function reticleSpriteDataUrl(size = 32) {
  const key = `ret-${size}`
  if (spriteCache.has(key)) return spriteCache.get(key)

  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  const cx = size / 2
  const cy = size / 2
  const r = size * 0.38

  ctx.strokeStyle = 'rgba(0, 255, 170, 0.75)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.stroke()

  const tick = size * 0.08
  ctx.beginPath()
  ctx.moveTo(cx, cy - r - tick)
  ctx.lineTo(cx, cy - r + tick)
  ctx.moveTo(cx, cy + r - tick)
  ctx.lineTo(cx, cy + r + tick)
  ctx.moveTo(cx - r - tick, cy)
  ctx.lineTo(cx - r + tick, cy)
  ctx.moveTo(cx + r - tick, cy)
  ctx.lineTo(cx + r + tick, cy)
  ctx.stroke()

  const url = canvas.toDataURL('image/png')
  spriteCache.set(key, url)
  return url
}
