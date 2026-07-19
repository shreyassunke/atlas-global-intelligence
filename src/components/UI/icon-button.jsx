import { cn } from '../../lib/utils'

/** Square HUD icon button. Icon-only usage requires aria-label. */
export function IconButton({ active = false, className, children, ...props }) {
  return (
    <button
      type="button"
      className={cn(
        'inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-md border transition-colors duration-150',
        'focus-visible:outline focus-visible:outline-1 focus-visible:outline-accent',
        active
          ? 'border-accent-border bg-accent-dim text-accent'
          : 'border-line bg-surface text-muted hover:border-line-strong hover:text-text',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  )
}
