import { cva } from 'class-variance-authority'
import { cn } from '../../lib/utils'
import { DIMENSION_COLORS, DIMENSION_LABELS, PRIORITY_LABELS, hexWithAlpha } from '../../core/eventSchema.js'

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5 font-data text-[10px] uppercase tracking-[0.08em] whitespace-nowrap leading-normal',
  {
    variants: {
      variant: {
        default: 'border-line bg-surface text-muted',
        accent: 'border-accent-border bg-accent-dim text-accent',
        outline: 'border-line bg-transparent text-muted',
        p1: 'border-p1/40 bg-p1/10 text-p1',
        p2: 'border-p2/40 bg-p2/10 text-p2',
        p3: 'border-p3/40 bg-p3/10 text-p3',
        derived: 'border-derived/40 bg-derived/10 text-derived',
      },
    },
    defaultVariants: { variant: 'default' },
  },
)

export function Badge({ className, variant, ...props }) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />
}

/** Badge tinted with a dimension color — data encoding, not decoration. */
export function DimensionBadge({ dimension, className, children, ...props }) {
  const color = DIMENSION_COLORS[dimension] || DIMENSION_COLORS.narrative
  return (
    <span
      className={cn(badgeVariants({ variant: 'default' }), className)}
      style={{
        color,
        borderColor: hexWithAlpha(color, 0.4),
        background: hexWithAlpha(color, 0.1),
      }}
      {...props}
    >
      {children ?? DIMENSION_LABELS[dimension] ?? dimension}
    </span>
  )
}

/** Priority badge — P1 Breaking / P2 Active / P3 Context. */
export function PriorityBadge({ priority, className, ...props }) {
  const variant = priority === 'p1' ? 'p1' : priority === 'p2' ? 'p2' : 'p3'
  return (
    <Badge variant={variant} className={className} {...props}>
      {PRIORITY_LABELS[priority] || priority}
    </Badge>
  )
}
