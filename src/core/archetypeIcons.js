/**
 * Canvas icon frames for reference and derived marker archetypes.
 * Composites with inner hazard/dimension art for derived pins.
 */
import { MARKER_ARCHETYPES } from './markerArchetype.js'

const ICON_SIZE = 64
const HALF = ICON_SIZE / 2
const CACHE_VERSION = 'marker-v6'

const frameCache = new Map()

function renderCanvasToDataUrl(draw, size = ICON_SIZE) {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  draw(ctx, size)
  return canvas.toDataURL('image/png')
}

/**
 * Hollow ring + category glyph for static reference markers.
 * @param {CanvasRenderingContext2D} ctx
 * @param {'nuclear'|'chokepoint'|'port'} category
 */
export function drawReferenceFrame(ctx, category = 'nuclear') {
  ctx.beginPath()
  ctx.arc(HALF, HALF, HALF - 6, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(148, 163, 184, 0.12)'
  ctx.fill()
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.55)'
  ctx.lineWidth = 2
  ctx.stroke()

  ctx.fillStyle = 'rgba(148, 163, 184, 0.85)'
  ctx.font = 'bold 22px sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const glyph = category === 'chokepoint' ? '⚓' : category === 'port' ? '⛴' : '☢'
  ctx.fillText(glyph, HALF, HALF + 1)
}

/**
 * Double diamond + amber synthesis ring for derived markers.
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} innerColor
 * @param {'high'|'medium'|'low'|'flag'} confidenceTone
 */
export function drawDerivedFrame(ctx, innerColor = '#f0b429', confidenceTone = 'medium') {
  const cx = HALF
  const cy = HALF
  const r = HALF - 8

  ctx.save()
  ctx.translate(cx, cy)
  ctx.rotate(Math.PI / 4)

  ctx.fillStyle = `${innerColor}cc`
  ctx.fillRect(-r * 0.55, -r * 0.55, r * 1.1, r * 1.1)

  ctx.strokeStyle = '#f0b429'
  ctx.lineWidth = 2.5
  ctx.strokeRect(-r * 0.55, -r * 0.55, r * 1.1, r * 1.1)

  ctx.strokeStyle = confidenceTone === 'flag' ? '#ff6b6b' : 'rgba(240, 180, 41, 0.65)'
  ctx.lineWidth = confidenceTone === 'flag' ? 2 : 1.5
  if (confidenceTone === 'flag') ctx.setLineDash([4, 3])
  ctx.strokeRect(-r * 0.72, -r * 0.72, r * 1.44, r * 1.44)
  ctx.setLineDash([])
  ctx.restore()

  ctx.fillStyle = 'rgba(255, 255, 255, 0.9)'
  ctx.font = 'bold 14px monospace'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('◆', cx, cy)
}

function buildReferenceIconUrl(category) {
  const key = `${CACHE_VERSION}:ref:${category}`
  if (frameCache.has(key)) return frameCache.get(key)
  const url = renderCanvasToDataUrl((ctx, size) => {
    const scale = size / ICON_SIZE
    ctx.save()
    ctx.scale(scale, scale)
    drawReferenceFrame(ctx, category)
    ctx.restore()
  })
  frameCache.set(key, url)
  return url
}

function buildDerivedIconUrl(innerColor, confidenceTone) {
  const key = `${CACHE_VERSION}:derived:${innerColor}:${confidenceTone}`
  if (frameCache.has(key)) return frameCache.get(key)
  const url = renderCanvasToDataUrl((ctx, size) => {
    const scale = size / ICON_SIZE
    ctx.save()
    ctx.scale(scale, scale)
    drawDerivedFrame(ctx, innerColor, confidenceTone)
    ctx.restore()
  })
  frameCache.set(key, url)
  return url
}

/**
 * @param {string} [baseUrl]
 * @param {import('./markerArchetype.js').MarkerArchetype|'reference'|'derived'} archetype
 * @param {{ category?: string, innerColor?: string, confidenceTone?: string }} [options]
 */
export function composeArchetypeIcon(baseUrl, archetype, options = {}) {
  if (archetype === MARKER_ARCHETYPES.REFERENCE || archetype === 'reference') {
    return buildReferenceIconUrl(options.category || 'nuclear')
  }
  if (archetype === MARKER_ARCHETYPES.DERIVED || archetype === 'derived') {
    return buildDerivedIconUrl(
      options.innerColor || '#f0b429',
      options.confidenceTone || 'medium',
    )
  }
  return baseUrl || ''
}

export function getReferenceIconUrl(category = 'nuclear') {
  return buildReferenceIconUrl(category)
}

export function getDerivedIconUrl(confidenceTone = 'medium', innerColor = '#f0b429') {
  return buildDerivedIconUrl(innerColor, confidenceTone)
}

/** @deprecated use getReferenceIconUrl — migrated from GoogleGlobe inline helper */
export function nuclearIconDataUrl() {
  return getReferenceIconUrl('nuclear')
}

export function warmArchetypeIconCache() {
  buildReferenceIconUrl('nuclear')
  buildReferenceIconUrl('chokepoint')
  for (const tone of ['high', 'medium', 'low', 'flag']) {
    buildDerivedIconUrl('#f0b429', tone)
  }
}

export { CACHE_VERSION as ARCHETYPE_ICON_CACHE_VERSION }
