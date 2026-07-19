/**
 * Environment hazard icon drawing — canvas glyphs only.
 * Classification lives in environmentHazardClassifier.js;
 * cached URLs live in markerIconCache.js.
 */

import { HAZARD_TYPES, HAZARD_BORDER_SHAPE as BORDER_SHAPE } from './environmentHazardClassifier.js'
import wildfireSvgRaw from '../assets/wildfire-icon.svg?raw'

export { HAZARD_TYPES } from './environmentHazardClassifier.js'
export { classifyEnvironmentHazard, resolveHazardType } from './environmentHazardClassifier.js'

function extractSvgPath(svgRaw) {
  const match = svgRaw.match(/\sd="\s*([\s\S]*?)"/)
  return match ? match[1].replace(/\s+/g, ' ').trim() : ''
}

const WILDFIRE_SVG_PATH = extractSvgPath(wildfireSvgRaw)
const WILDFIRE_VIEW_W = 784
const WILDFIRE_VIEW_H = 624

function drawSvgPathGlyph(ctx, pathD, viewW, viewH, cx, cy, s, fill = 'rgba(255,255,255,0.95)') {
  if (!pathD) return
  const scale = (s * 1.85) / Math.max(viewW, viewH)
  ctx.save()
  ctx.translate(cx, cy)
  ctx.scale(scale, scale)
  ctx.translate(-viewW / 2, -viewH / 2)
  ctx.fillStyle = fill
  ctx.fill(new Path2D(pathD))
  ctx.restore()
}

function traceShape(ctx, shape, cx, cy, r) {
  ctx.beginPath()
  switch (shape) {
    case 'diamond':
      ctx.moveTo(cx, cy - r)
      ctx.lineTo(cx + r, cy)
      ctx.lineTo(cx, cy + r)
      ctx.lineTo(cx - r, cy)
      ctx.closePath()
      break
    case 'triangle':
      ctx.moveTo(cx, cy - r)
      ctx.lineTo(cx + r * 0.92, cy + r * 0.82)
      ctx.lineTo(cx - r * 0.92, cy + r * 0.82)
      ctx.closePath()
      break
    case 'square':
      ctx.rect(cx - r * 0.82, cy - r * 0.82, r * 1.64, r * 1.64)
      break
    case 'hexagon': {
      for (let i = 0; i < 6; i += 1) {
        const a = (Math.PI / 3) * i - Math.PI / 2
        const x = cx + r * Math.cos(a)
        const y = cy + r * Math.sin(a)
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }
      ctx.closePath()
      break
    }
    default:
      ctx.arc(cx, cy, r, 0, Math.PI * 2)
  }
}

function drawBorderShape(ctx, shape, cx, cy, r, fill, stroke) {
  traceShape(ctx, shape, cx, cy, r)
  ctx.fillStyle = fill
  ctx.fill()
  ctx.strokeStyle = stroke
  ctx.lineWidth = 2
  ctx.stroke()
}

function strokeGlyph(ctx, draw, lineWidth = 2) {
  ctx.save()
  ctx.strokeStyle = 'rgba(255,255,255,0.95)'
  ctx.lineWidth = lineWidth
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  draw()
  ctx.restore()
}

const GLYPHS = {
  [HAZARD_TYPES.EARTHQUAKE]: (ctx, cx, cy, s) => {
    strokeGlyph(ctx, () => {
      ctx.beginPath()
      ctx.moveTo(cx - s, cy)
      ctx.lineTo(cx - s * 0.35, cy)
      ctx.lineTo(cx - s * 0.2, cy - s * 0.45)
      ctx.lineTo(cx, cy + s * 0.35)
      ctx.lineTo(cx + s * 0.2, cy - s * 0.55)
      ctx.lineTo(cx + s * 0.35, cy)
      ctx.lineTo(cx + s, cy)
      ctx.stroke()
    })
  },
  [HAZARD_TYPES.WILDFIRE]: (ctx, cx, cy, s) => {
    drawSvgPathGlyph(ctx, WILDFIRE_SVG_PATH, WILDFIRE_VIEW_W, WILDFIRE_VIEW_H, cx, cy, s)
  },
  [HAZARD_TYPES.HURRICANE]: (ctx, cx, cy, s) => {
    strokeGlyph(ctx, () => {
      ctx.beginPath()
      ctx.arc(cx, cy, s * 0.15, 0, Math.PI * 2)
      ctx.stroke()
      for (let i = 0; i <= 24; i += 1) {
        const t = i / 24
        const a = t * Math.PI * 3.2 - Math.PI / 2
        const rad = s * (0.2 + t * 0.55)
        const x = cx + rad * Math.cos(a)
        const y = cy + rad * Math.sin(a)
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }
      ctx.stroke()
    }, 1.7)
  },
  [HAZARD_TYPES.TYPHOON]: (ctx, cx, cy, s) => GLYPHS[HAZARD_TYPES.HURRICANE](ctx, cx, cy, s),
  [HAZARD_TYPES.DUSTSTORM]: (ctx, cx, cy, s) => {
    strokeGlyph(ctx, () => {
      for (let i = -1; i <= 1; i += 1) {
        ctx.beginPath()
        ctx.moveTo(cx - s * 0.75, cy + i * s * 0.35)
        ctx.lineTo(cx + s * 0.75, cy + i * s * 0.35 - s * 0.45)
        ctx.stroke()
      }
    }, 1.8)
  },
  [HAZARD_TYPES.LIGHTNING]: (ctx, cx, cy, s) => {
    strokeGlyph(ctx, () => {
      ctx.beginPath()
      ctx.moveTo(cx + s * 0.05, cy - s * 0.75)
      ctx.lineTo(cx - s * 0.25, cy - s * 0.05)
      ctx.lineTo(cx + s * 0.05, cy - s * 0.05)
      ctx.lineTo(cx - s * 0.15, cy + s * 0.75)
      ctx.lineTo(cx + s * 0.35, cy - s * 0.15)
      ctx.lineTo(cx + s * 0.05, cy - s * 0.15)
      ctx.closePath()
      ctx.stroke()
    }, 1.8)
  },
  [HAZARD_TYPES.TORNADO]: (ctx, cx, cy, s) => {
    strokeGlyph(ctx, () => {
      ctx.beginPath()
      ctx.moveTo(cx - s * 0.15, cy - s * 0.75)
      ctx.quadraticCurveTo(cx + s * 0.55, cy - s * 0.15, cx + s * 0.35, cy + s * 0.75)
      ctx.quadraticCurveTo(cx, cy + s * 0.45, cx - s * 0.35, cy + s * 0.75)
      ctx.quadraticCurveTo(cx - s * 0.55, cy - s * 0.15, cx - s * 0.15, cy - s * 0.75)
      ctx.stroke()
    }, 1.8)
  },
  [HAZARD_TYPES.FLOOD]: (ctx, cx, cy, s) => {
    strokeGlyph(ctx, () => {
      for (let i = -1; i <= 1; i += 1) {
        ctx.beginPath()
        const y = cy + i * s * 0.35
        ctx.moveTo(cx - s * 0.75, y)
        ctx.quadraticCurveTo(cx - s * 0.25, y - s * 0.18, cx, y)
        ctx.quadraticCurveTo(cx + s * 0.25, y + s * 0.18, cx + s * 0.75, y)
        ctx.stroke()
      }
    }, 1.8)
  },
  [HAZARD_TYPES.AVALANCHE]: (ctx, cx, cy, s) => {
    strokeGlyph(ctx, () => {
      ctx.beginPath()
      ctx.moveTo(cx - s * 0.75, cy + s * 0.55)
      ctx.lineTo(cx + s * 0.75, cy - s * 0.55)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(cx - s * 0.05, cy - s * 0.45)
      ctx.lineTo(cx + s * 0.15, cy - s * 0.65)
      ctx.moveTo(cx + s * 0.2, cy - s * 0.25)
      ctx.lineTo(cx + s * 0.42, cy - s * 0.42)
      ctx.moveTo(cx + s * 0.35, cy - s * 0.05)
      ctx.lineTo(cx + s * 0.58, cy - s * 0.18)
      ctx.stroke()
    }, 1.7)
  },
  [HAZARD_TYPES.VOLCANO]: (ctx, cx, cy, s) => {
    strokeGlyph(ctx, () => {
      ctx.beginPath()
      ctx.moveTo(cx - s * 0.75, cy + s * 0.55)
      ctx.lineTo(cx, cy - s * 0.55)
      ctx.lineTo(cx + s * 0.75, cy + s * 0.55)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(cx - s * 0.12, cy - s * 0.62)
      ctx.lineTo(cx - s * 0.02, cy - s * 0.82)
      ctx.moveTo(cx + s * 0.02, cy - s * 0.58)
      ctx.lineTo(cx + s * 0.12, cy - s * 0.78)
      ctx.moveTo(cx + s * 0.14, cy - s * 0.52)
      ctx.lineTo(cx + s * 0.24, cy - s * 0.72)
      ctx.stroke()
    }, 1.7)
  },
  [HAZARD_TYPES.TSUNAMI]: (ctx, cx, cy, s) => {
    strokeGlyph(ctx, () => {
      ctx.beginPath()
      ctx.moveTo(cx - s * 0.75, cy + s * 0.35)
      ctx.quadraticCurveTo(cx - s * 0.2, cy - s * 0.15, cx + s * 0.15, cy + s * 0.05)
      ctx.quadraticCurveTo(cx + s * 0.45, cy + s * 0.25, cx + s * 0.75, cy - s * 0.35)
      ctx.stroke()
    }, 1.8)
  },
  [HAZARD_TYPES.MONSOON]: (ctx, cx, cy, s) => {
    strokeGlyph(ctx, () => {
      for (let x = -2; x <= 2; x += 1) {
        ctx.beginPath()
        ctx.moveTo(cx + x * s * 0.22, cy - s * 0.65)
        ctx.lineTo(cx + x * s * 0.22, cy + s * 0.65)
        ctx.stroke()
      }
    }, 1.6)
  },
  [HAZARD_TYPES.DROUGHT]: (ctx, cx, cy, s) => {
    strokeGlyph(ctx, () => {
      ctx.beginPath()
      ctx.moveTo(cx - s * 0.55, cy - s * 0.35)
      ctx.lineTo(cx - s * 0.15, cy - s * 0.05)
      ctx.lineTo(cx - s * 0.35, cy + s * 0.35)
      ctx.lineTo(cx + s * 0.05, cy + s * 0.05)
      ctx.lineTo(cx + s * 0.35, cy + s * 0.45)
      ctx.lineTo(cx + s * 0.55, cy - s * 0.15)
      ctx.stroke()
    }, 1.7)
  },
  [HAZARD_TYPES.STORM]: (ctx, cx, cy, s) => {
    strokeGlyph(ctx, () => {
      ctx.beginPath()
      ctx.moveTo(cx - s * 0.55, cy - s * 0.05)
      ctx.quadraticCurveTo(cx - s * 0.15, cy - s * 0.55, cx + s * 0.35, cy - s * 0.15)
      ctx.quadraticCurveTo(cx + s * 0.65, cy + s * 0.05, cx + s * 0.45, cy + s * 0.25)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(cx - s * 0.25, cy + s * 0.35)
      ctx.lineTo(cx - s * 0.25, cy + s * 0.65)
      ctx.moveTo(cx, cy + s * 0.25)
      ctx.lineTo(cx, cy + s * 0.65)
      ctx.moveTo(cx + s * 0.25, cy + s * 0.35)
      ctx.lineTo(cx + s * 0.25, cy + s * 0.65)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(cx + s * 0.42, cy + s * 0.45)
      ctx.lineTo(cx + s * 0.52, cy + s * 0.65)
      ctx.lineTo(cx + s * 0.62, cy + s * 0.45)
      ctx.stroke()
    }, 1.6)
  },
  [HAZARD_TYPES.BLIZZARD]: (ctx, cx, cy, s) => {
    strokeGlyph(ctx, () => {
      for (let i = 0; i < 6; i += 1) {
        const a = (Math.PI / 3) * i
        ctx.beginPath()
        ctx.moveTo(cx - s * 0.65 * Math.cos(a), cy - s * 0.65 * Math.sin(a))
        ctx.lineTo(cx + s * 0.65 * Math.cos(a), cy + s * 0.65 * Math.sin(a))
        ctx.stroke()
      }
      ctx.beginPath()
      ctx.moveTo(cx - s * 0.25, cy - s * 0.25)
      ctx.lineTo(cx + s * 0.25, cy + s * 0.25)
      ctx.moveTo(cx + s * 0.25, cy - s * 0.25)
      ctx.lineTo(cx - s * 0.25, cy + s * 0.25)
      ctx.stroke()
    }, 1.5)
  },
  [HAZARD_TYPES.HEATWAVE]: (ctx, cx, cy, s) => {
    strokeGlyph(ctx, () => {
      for (let x = -1; x <= 1; x += 1) {
        ctx.beginPath()
        ctx.moveTo(cx + x * s * 0.28, cy + s * 0.65)
        for (let i = 0; i < 3; i += 1) {
          const y0 = cy + s * 0.45 - i * s * 0.35
          ctx.quadraticCurveTo(cx + x * s * 0.28 + s * 0.12, y0 - s * 0.12, cx + x * s * 0.28, y0 - s * 0.25)
          ctx.quadraticCurveTo(cx + x * s * 0.28 - s * 0.12, y0 - s * 0.38, cx + x * s * 0.28, y0 - s * 0.5)
        }
        ctx.stroke()
      }
    }, 1.6)
  },
}

/**
 * Draw a hazard marker sprite onto a canvas context (64×64 logical space).
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} hazardType
 * @param {number} cx
 * @param {number} cy
 * @param {string} fillColor — dimension fill
 */
export function drawHazardMarker(ctx, hazardType, cx, cy, fillColor) {
  const shape = BORDER_SHAPE[hazardType] || 'circle'
  const r = 26
  drawBorderShape(ctx, shape, cx, cy, r, fillColor, 'rgba(255,255,255,0.55)')
  const drawGlyph = GLYPHS[hazardType] || GLYPHS[HAZARD_TYPES.STORM]
  drawGlyph(ctx, cx, cy, 14)
}
