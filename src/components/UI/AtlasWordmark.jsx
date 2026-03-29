import { memo } from 'react'

/**
 * ATLAS wordmark — `public/atlas-logo.svg` (letterforms only, transparent).
 * Optional CSS drop-shadow for a light space-age glow on starfield / HUD.
 */

export const ATLAS_LOGO_SRC = '/atlas-logo.svg'

export const AtlasWordmark = memo(function AtlasWordmark({
  className = '',
  height,
  withGlow = true,
  'aria-hidden': ariaHidden = true,
}) {
  return (
    <img
      src={ATLAS_LOGO_SRC}
      alt=""
      className={`atlas-wordmark-svg ${withGlow ? 'atlas-wordmark-img--glow' : ''} ${className}`.trim()}
      height={height}
      width={undefined}
      draggable={false}
      aria-hidden={ariaHidden}
      style={
        height != null
          ? { width: 'auto', height, background: 'transparent' }
          : { width: 'auto', background: 'transparent' }
      }
    />
  )
})
