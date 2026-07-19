import { cn } from '../../lib/utils'

/**
 * Interactive pill chip — filters, toggles, tags.
 * Renders a <button> when onClick is given, else a <span>.
 */
export function Chip({ active = false, className, onClick, children, ...props }) {
  const Comp = onClick ? 'button' : 'span'
  return (
    <Comp
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={cn(
        'inline-flex items-center justify-center gap-1.5 rounded-full border px-3 py-1 font-data text-[11px] uppercase tracking-[0.06em] whitespace-nowrap leading-normal transition-colors duration-150',
        onClick && 'cursor-pointer hover:border-line-strong hover:text-text focus-visible:outline focus-visible:outline-1 focus-visible:outline-accent',
        active
          ? 'border-accent-border bg-accent-dim text-accent'
          : 'border-line bg-surface text-muted',
        className,
      )}
      {...props}
    >
      {children}
    </Comp>
  )
}
