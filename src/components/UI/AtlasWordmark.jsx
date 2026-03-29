import { useId, memo } from 'react'

/**
 * TATVA wordmark — monoline strokes, round caps; T / chevron A / V (inverted chevron).
 * Even anchor spacing on letter centers.
 */

const STROKE = '#f8fafc'
const STROKE_W = 3.35

const LETTER_PATHS = {
  /** Chevron A — no crossbar */
  A: 'M3 29 L13.5 5.5 L24 29',
  T: 'M2 6.5 L22 6.5 M12 6.5 L12 29.5',
  /** V — apex at bottom (inverted A) */
  V: 'M3 5.5 L13.5 29.5 L24 5.5',
}

const PATH_BY_INDEX = ['T', 'A', 'T', 'V', 'A']

const LOCAL_CX = {
  A: 13.5,
  T: 12,
  V: 13.5,
}

const ANCHOR_STEP = 27
const ANCHOR0 = LOCAL_CX.T

const LETTER_TRANSFORMS = PATH_BY_INDEX.map((key, i) => {
  const anchor = ANCHOR0 + i * ANCHOR_STEP
  const cx = LOCAL_CX[key]
  const tx = anchor - cx
  return `translate(${tx},0)`
})

const LAST_KEY = PATH_BY_INDEX[PATH_BY_INDEX.length - 1]
const LAST_ANCHOR = ANCHOR0 + (PATH_BY_INDEX.length - 1) * ANCHOR_STEP
/** Last glyph (A): max x ≈ 24 in local space */
const LAST_RIGHT_EXTENT = 24 - LOCAL_CX[LAST_KEY]
const FULL_VB_W = Math.ceil(LAST_ANCHOR + LAST_RIGHT_EXTENT + 8)
const FULL_VB_H = 36

const SLOT_CELL_W = 27

const SLOT = PATH_BY_INDEX.map((key) => {
  const cx = LOCAL_CX[key]
  const offsetX = SLOT_CELL_W / 2 - cx
  return {
    w: SLOT_CELL_W,
    d: LETTER_PATHS[key],
    offset: `translate(${offsetX},0)`,
  }
})

function GlowDefs({ filterId }) {
  return (
    <defs>
      <filter id={filterId} x="-40%" y="-40%" width="180%" height="180%">
        <feGaussianBlur stdDeviation="1.4" result="b" />
        <feMerge>
          <feMergeNode in="b" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
    </defs>
  )
}

function StrokeLetters({ paths = PATH_BY_INDEX, transforms = LETTER_TRANSFORMS }) {
  return (
    <g
      fill="none"
      stroke={STROKE}
      strokeWidth={STROKE_W}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {transforms.map((t, i) => (
        <path key={`${paths[i]}-${i}`} transform={t} d={LETTER_PATHS[paths[i]]} />
      ))}
    </g>
  )
}

export const AtlasWordmark = memo(function AtlasWordmark({
  className = '',
  height,
  withGlow = true,
  'aria-hidden': ariaHidden = true,
}) {
  const fid = useId().replace(/:/g, '')
  const filterId = `atlas-wm-glow-${fid}`

  return (
    <svg
      className={`atlas-wordmark-svg ${className}`.trim()}
      viewBox={`0 0 ${FULL_VB_W} ${FULL_VB_H}`}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden={ariaHidden}
      height={height}
      style={height != null ? { width: 'auto' } : undefined}
    >
      {withGlow && <GlowDefs filterId={filterId} />}
      <g filter={withGlow ? `url(#${filterId})` : undefined}>
        <StrokeLetters />
      </g>
    </svg>
  )
})

export const AtlasWordmarkSlot = memo(function AtlasWordmarkSlot({
  index,
  className = '',
  withGlow = false,
}) {
  const slot = SLOT[index]
  if (!slot) return null
  const fid = useId().replace(/:/g, '')
  const filterId = `atlas-slot-glow-${fid}-${index}`

  return (
    <svg
      className={`atlas-wordmark-slot-svg ${className}`.trim()}
      viewBox={`0 0 ${slot.w} ${FULL_VB_H}`}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      {withGlow && <GlowDefs filterId={filterId} />}
      <g filter={withGlow ? `url(#${filterId})` : undefined}>
        <g
          fill="none"
          stroke={STROKE}
          strokeWidth={STROKE_W}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d={slot.d} transform={slot.offset} />
        </g>
      </g>
    </svg>
  )
})
