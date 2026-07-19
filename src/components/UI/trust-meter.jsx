/**
 * TrustMeter — compact corroboration + precision readout.
 * Answers "how sure are we?" in one glance: five corroboration segments,
 * tier letter, and an explicit approximate flag.
 */
import { cn } from '../../lib/utils'
import { getEventTierDisplay } from './provenance-chip.jsx'
import { Tooltip } from './tooltip.jsx'

export function TrustMeter({ event, className }) {
  if (!event) return null
  const count = Math.min(Math.max(event.corroborationCount || 1, 1), 5)
  const { letter, label } = getEventTierDisplay(event)
  const approximate = Boolean(event.latApproximate)
  const authoritative = Boolean(event.authoritative)

  return (
    <div className={cn('flex items-center gap-2.5 font-data text-[10px] leading-normal', className)}>
      <Tooltip label={`${count} corroborating source${count === 1 ? '' : 's'}`}>
        <span className="inline-flex items-center gap-[3px]" aria-label={`Corroboration ${count} of 5`}>
          {[1, 2, 3, 4, 5].map((i) => (
            <span
              key={i}
              className={cn(
                'inline-block h-2.5 w-[3px] rounded-[1px]',
                i <= count ? 'bg-accent' : 'bg-line',
              )}
            />
          ))}
        </span>
      </Tooltip>

      <Tooltip label={label}>
        <span
          className={cn(
            'inline-flex items-center justify-center rounded-sm border px-1 py-px uppercase',
            letter === 'A' && 'border-tier-a/40 text-tier-a',
            letter === 'B' && 'border-tier-b/40 text-tier-b',
            (letter === 'C' || letter === 'D') && 'border-line text-muted',
          )}
        >
          Tier {letter}
        </span>
      </Tooltip>

      {authoritative && <span className="uppercase tracking-[0.06em] text-accent">Auth</span>}
      {approximate && (
        <Tooltip label="Approximate location — centroid or placeholder, not the incident site">
          <span className="uppercase tracking-[0.06em] text-p2">≈ approx</span>
        </Tooltip>
      )}
    </div>
  )
}
