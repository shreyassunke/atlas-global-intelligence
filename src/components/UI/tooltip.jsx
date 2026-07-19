import { cn } from '../../lib/utils'

/**
 * Lightweight CSS tooltip — hover/focus reveal, no portal.
 * For dense HUD chrome where a Radix portal is overkill.
 */
export function Tooltip({ label, side = 'bottom', className, children }) {
  if (!label) return children
  return (
    <span className={cn('group/tip relative inline-flex', className)}>
      {children}
      <span
        role="tooltip"
        className={cn(
          'pointer-events-none absolute z-50 hidden whitespace-nowrap rounded border border-line bg-bg/95 px-2 py-1 font-data text-[10px] leading-normal text-muted backdrop-blur-md group-hover/tip:block group-focus-within/tip:block',
          side === 'bottom' && 'top-full left-1/2 mt-1.5 -translate-x-1/2',
          side === 'top' && 'bottom-full left-1/2 mb-1.5 -translate-x-1/2',
          side === 'right' && 'left-full top-1/2 ml-1.5 -translate-y-1/2',
          side === 'left' && 'right-full top-1/2 mr-1.5 -translate-y-1/2',
        )}
      >
        {label}
      </span>
    </span>
  )
}
