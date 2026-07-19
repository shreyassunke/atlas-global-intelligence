import { cn } from '../../lib/utils'

/** Minimal toggle switch. */
export function Switch({ checked, onCheckedChange, disabled = false, className, 'aria-label': ariaLabel }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => onCheckedChange?.(!checked)}
      className={cn(
        'relative inline-flex h-4 w-8 shrink-0 items-center rounded-full border transition-colors duration-150',
        checked ? 'border-accent-border bg-accent-dim' : 'border-line bg-surface',
        disabled ? 'cursor-not-allowed opacity-40' : 'cursor-pointer',
        className,
      )}
    >
      <span
        className={cn(
          'block h-2.5 w-2.5 rounded-full transition-transform duration-150',
          checked ? 'translate-x-[18px] bg-accent' : 'translate-x-[3px] bg-muted',
        )}
      />
    </button>
  )
}
