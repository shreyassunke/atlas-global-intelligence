import { TIERS, TIER_COLORS, TIER_SHAPES, SEVERITY_SIZES, CORROBORATION_OPACITY } from './eventSchema.js'

const SPRITE_SIZE = 64
const HALF = SPRITE_SIZE / 2

function drawCircle(ctx, color) {
  ctx.beginPath()
  ctx.arc(HALF, HALF, HALF - 4, 0, Math.PI * 2)
  ctx.fillStyle = color
  ctx.fill()
  ctx.strokeStyle = 'rgba(255,255,255,0.3)'
  ctx.lineWidth = 2
  ctx.stroke()
}

function drawDiamond(ctx, color) {
  ctx.beginPath()
  ctx.moveTo(HALF, 4)
  ctx.lineTo(SPRITE_SIZE - 4, HALF)
  ctx.lineTo(HALF, SPRITE_SIZE - 4)
  ctx.lineTo(4, HALF)
  ctx.closePath()
  ctx.fillStyle = color
  ctx.fill()
  ctx.strokeStyle = 'rgba(255,255,255,0.3)'
  ctx.lineWidth = 2
  ctx.stroke()
}

function drawBurst(ctx, color) {
  const cx = HALF, cy = HALF
  const outerR = HALF - 3
  const innerR = outerR * 0.5
  const spikes = 8
  ctx.beginPath()
  for (let i = 0; i < spikes * 2; i++) {
    const angle = (i * Math.PI) / spikes - Math.PI / 2
    const r = i % 2 === 0 ? outerR : innerR
    const x = cx + Math.cos(angle) * r
    const y = cy + Math.sin(angle) * r
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  ctx.closePath()
  ctx.fillStyle = color
  ctx.fill()
  ctx.strokeStyle = 'rgba(255,255,255,0.3)'
  ctx.lineWidth = 2
  ctx.stroke()
}

const ICON_PATHS = {
  conflict: (ctx, cx, cy, r) => {
    const s = r * 0.7
    ctx.beginPath()
    ctx.moveTo(cx - s, cy - s); ctx.lineTo(cx + s, cy + s)
    ctx.moveTo(cx + s, cy - s); ctx.lineTo(cx - s, cy + s)
    ctx.strokeStyle = '#fff'
    ctx.lineWidth = 2.5
    ctx.lineCap = 'round'
    ctx.stroke()
  },
  cyber: (ctx, cx, cy, r) => {
    const s = r * 0.8
    ctx.beginPath()
    ctx.moveTo(cx, cy - s)
    ctx.lineTo(cx - s * 0.4, cy + s * 0.3)
    ctx.lineTo(cx + s * 0.4, cy + s * 0.3)
    ctx.closePath()
    ctx.moveTo(cx, cy + s)
    ctx.lineTo(cx, cy - s * 0.2)
    ctx.strokeStyle = '#fff'
    ctx.lineWidth = 2.5
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.stroke()
  },
  natural: (ctx, cx, cy, r) => {
    const s = r * 0.85
    ctx.beginPath()
    ctx.moveTo(cx - s, cy)
    ctx.quadraticCurveTo(cx - s * 0.5, cy - s * 0.8, cx, cy)
    ctx.quadraticCurveTo(cx + s * 0.5, cy + s * 0.8, cx + s, cy)
    ctx.strokeStyle = '#fff'
    ctx.lineWidth = 2.5
    ctx.lineCap = 'round'
    ctx.stroke()
  },
  humanitarian: (ctx, cx, cy, r) => {
    const s = r * 0.4
    ctx.beginPath()
    ctx.arc(cx, cy - s * 1.2, s * 0.7, 0, Math.PI * 2)
    ctx.fillStyle = '#fff'
    ctx.fill()
    ctx.beginPath()
    ctx.arc(cx, cy + s * 0.8, s * 1.2, Math.PI, 0)
    ctx.fillStyle = '#fff'
    ctx.fill()
  },
  economic: (ctx, cx, cy, r) => {
    const s = r * 0.75
    ctx.beginPath()
    ctx.moveTo(cx - s, cy + s * 0.3)
    ctx.lineTo(cx - s * 0.3, cy - s * 0.3)
    ctx.lineTo(cx + s * 0.3, cy + s * 0.1)
    ctx.lineTo(cx + s, cy - s)
    ctx.strokeStyle = '#fff'
    ctx.lineWidth = 2.5
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.stroke()
  },
  signals: (ctx, cx, cy, r) => {
    for (let i = 1; i <= 3; i++) {
      ctx.beginPath()
      ctx.arc(cx, cy, r * 0.25 * i, 0, Math.PI * 2)
      ctx.strokeStyle = `rgba(255,255,255,${1 - i * 0.25})`
      ctx.lineWidth = 1.5
      ctx.stroke()
    }
  },
  hazard: (ctx, cx, cy, r) => {
    const s = r * 0.7
    ctx.beginPath()
    ctx.arc(cx, cy, s * 0.25, 0, Math.PI * 2)
    ctx.fillStyle = '#fff'
    ctx.fill()
    for (let i = 0; i < 3; i++) {
      const angle = (i * Math.PI * 2) / 3 - Math.PI / 2
      ctx.beginPath()
      ctx.moveTo(cx + Math.cos(angle) * s * 0.4, cy + Math.sin(angle) * s * 0.4)
      ctx.lineTo(cx + Math.cos(angle) * s, cy + Math.sin(angle) * s)
      ctx.strokeStyle = '#fff'
      ctx.lineWidth = 3
      ctx.lineCap = 'round'
      ctx.stroke()
    }
  },
}

const SHAPE_RENDERERS = {
  circle: drawCircle,
  diamond: drawDiamond,
  burst: drawBurst,
}

function drawColorblindPattern(ctx, shape, tier) {
  ctx.save()
  ctx.globalAlpha = 0.4
  if (tier === 'latent') {
    for (let y = 0; y < SPRITE_SIZE; y += 4) {
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(SPRITE_SIZE, y)
      ctx.strokeStyle = '#fff'
      ctx.lineWidth = 1
      ctx.stroke()
    }
  } else if (tier === 'active') {
    for (let i = -SPRITE_SIZE; i < SPRITE_SIZE * 2; i += 5) {
      ctx.beginPath()
      ctx.moveTo(i, 0)
      ctx.lineTo(i + SPRITE_SIZE, SPRITE_SIZE)
      ctx.strokeStyle = '#fff'
      ctx.lineWidth = 1
      ctx.stroke()
    }
  }
  ctx.restore()
}

const spriteCache = new Map()

export function generateSprite(shape, tier, domain, size = SPRITE_SIZE, colorblind = false) {
  const key = `${shape}_${tier}_${domain}_${size}_${colorblind ? 'cb' : 'n'}`
  if (spriteCache.has(key)) return spriteCache.get(key)

  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  const color = TIER_COLORS[tier]

  const scale = size / SPRITE_SIZE
  ctx.save()
  ctx.scale(scale, scale)

  const drawShape = SHAPE_RENDERERS[shape]
  if (drawShape) drawShape(ctx, color)

  if (colorblind) {
    drawColorblindPattern(ctx, shape, tier)
  }

  const drawIcon = ICON_PATHS[domain]
  if (drawIcon && size >= 16) {
    ctx.save()
    drawIcon(ctx, HALF, HALF, HALF * 0.45)
    ctx.restore()
  }

  ctx.restore()
  spriteCache.set(key, canvas)
  return canvas
}

export function generateSpriteAtlas() {
  const tiers = [TIERS.LATENT, TIERS.ACTIVE, TIERS.CRITICAL]
  const domains = ['conflict', 'cyber', 'natural', 'humanitarian', 'economic', 'signals', 'hazard']
  const atlas = {}

  for (const tier of tiers) {
    const shape = TIER_SHAPES[tier]
    for (const domain of domains) {
      const canvas = generateSprite(shape, tier, domain, SPRITE_SIZE)
      const key = `${tier}_${domain}`
      atlas[key] = canvas
    }
  }

  return atlas
}

export function getSeveritySize(severity) {
  return SEVERITY_SIZES[severity] || SEVERITY_SIZES[1]
}

export function getOpacity(corroborationCount, authoritative) {
  const count = Math.min(Math.max(corroborationCount || 1, 1), 5)
  const base = CORROBORATION_OPACITY[count] || 0.35
  return authoritative && count === 1 ? Math.max(0.75, base) : base
}

export function getAnimationState(timestamp) {
  const age = Date.now() - new Date(timestamp).getTime()
  const ONE_HOUR = 3600000
  const SIX_HOURS = ONE_HOUR * 6
  if (age < ONE_HOUR) return 'fast'
  if (age < SIX_HOURS) return 'slow'
  return 'static'
}

export function getTtlProgress(fetchedAt, ttl) {
  const elapsed = (Date.now() - new Date(fetchedAt).getTime()) / 1000
  return Math.min(1, elapsed / ttl)
}

export function getStaleOpacity(event) {
  const progress = getTtlProgress(event.fetchedAt, event.ttl)
  if (progress < 0.8) return event.opacity
  const fadeProgress = (progress - 0.8) / 0.2
  return event.opacity * (1 - fadeProgress)
}
