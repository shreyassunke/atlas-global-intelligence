import { cn } from '../../lib/utils'

/**
 * Quiet glass card — the base surface for feed items, workspace cards, panels.
 * `edgeColor` paints a 2px data-encoding edge on the left (dimension color).
 */
export function Card({ className, edgeColor, interactive = false, style, children, ...props }) {
  return (
    <div
      className={cn(
        'relative rounded-lg border border-line bg-surface backdrop-blur-md',
        interactive && 'cursor-pointer transition-colors duration-150 hover:border-line-strong hover:bg-surface-2',
        className,
      )}
      style={edgeColor ? { borderLeft: `2px solid ${edgeColor}`, ...style } : style}
      {...props}
    >
      {children}
    </div>
  )
}

export function CardHeader({ className, ...props }) {
  return <div className={cn('flex items-center gap-2 px-3 pt-3', className)} {...props} />
}

export function CardBody({ className, ...props }) {
  return <div className={cn('px-3 py-2', className)} {...props} />
}

export function CardFooter({ className, ...props }) {
  return <div className={cn('flex items-center gap-2 px-3 pb-3', className)} {...props} />
}
