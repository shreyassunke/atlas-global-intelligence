/**
 * Lucide glyphs for the six civilian dimensions — replaces emoji icons.
 * One glyph per dimension; keep the mapping stable, it is a data encoding.
 */
import {
  Shield,
  Scale,
  TrendingUp,
  Users,
  Mountain,
  MessageSquare,
} from 'lucide-react'
import { DIMENSION_COLORS } from '../../core/eventSchema.js'

export const DIMENSION_ICON_COMPONENTS = {
  safety: Shield,
  governance: Scale,
  economy: TrendingUp,
  people: Users,
  environment: Mountain,
  narrative: MessageSquare,
}

/** Inline dimension glyph, tinted with the dimension color by default. */
export function DimensionIcon({ dimension, size = 12, tinted = true, className, ...props }) {
  const Icon = DIMENSION_ICON_COMPONENTS[dimension] || MessageSquare
  return (
    <Icon
      size={size}
      strokeWidth={2.2}
      className={className}
      style={tinted ? { color: DIMENSION_COLORS[dimension] || DIMENSION_COLORS.narrative } : undefined}
      aria-hidden
      {...props}
    />
  )
}
