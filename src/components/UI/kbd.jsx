import { cn } from '../../lib/utils'

/** Keyboard shortcut hint. */
export function Kbd({ className, ...props }) {
  return (
    <kbd
      className={cn(
        'inline-flex items-center justify-center rounded border border-line bg-surface px-1.5 py-0.5 font-data text-[10px] leading-none text-faint',
        className,
      )}
      {...props}
    />
  )
}
