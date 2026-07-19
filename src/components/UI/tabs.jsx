import { cn } from '../../lib/utils'

/**
 * Segmented control — one active segment at a time.
 * items: [{ id, label, icon? }]
 */
export function SegmentedTabs({ items, value, onChange, className, size = 'sm' }) {
  return (
    <div
      role="tablist"
      className={cn(
        'inline-flex items-center gap-0.5 rounded-md border border-line bg-surface p-0.5',
        className,
      )}
    >
      {items.map((item) => {
        const active = item.id === value
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange?.(item.id)}
            className={cn(
              'inline-flex items-center justify-center gap-1.5 rounded whitespace-nowrap font-data uppercase tracking-[0.06em] leading-normal transition-colors duration-150',
              size === 'sm' ? 'px-2.5 py-1 text-[10px]' : 'px-3 py-1.5 text-[11px]',
              active
                ? 'bg-accent-dim text-accent'
                : 'text-muted hover:text-text',
            )}
          >
            {item.icon}
            {item.label}
          </button>
        )
      })}
    </div>
  )
}
