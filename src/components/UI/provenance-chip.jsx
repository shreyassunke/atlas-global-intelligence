/**
 * ProvenanceChip — "where did this come from, how fresh, how precise".
 * The signature trust element: source name + freshness + precision-tier dot.
 */
import { cn } from '../../lib/utils'
import { getEventSourceId, getSourceGeoTier } from '../../core/sourceGeolocation.js'
import { timeAgoLabel } from '../../utils/text.js'
import { Tooltip } from './tooltip.jsx'

/** GeoTier → display letter + token color. */
export const TIER_DISPLAY = {
  pinpoint: { letter: 'A', label: 'Pinpoint — instrument/telemetry accuracy', className: 'bg-tier-a' },
  event: { letter: 'B', label: 'Event geocoded — resolution varies', className: 'bg-tier-b' },
  approximate: { letter: 'C', label: 'Approximate — centroid or placeholder', className: 'bg-tier-c' },
  none: { letter: 'D', label: 'No usable geolocation', className: 'bg-tier-c' },
}

export function getEventTierDisplay(event) {
  const tier = getSourceGeoTier(getEventSourceId(event))
  return { tier, ...TIER_DISPLAY[tier] }
}

export function TierDot({ tier, className }) {
  const display = TIER_DISPLAY[tier] || TIER_DISPLAY.approximate
  return (
    <Tooltip label={`Tier ${display.letter} · ${display.label}`}>
      <span
        className={cn('inline-block h-1.5 w-1.5 shrink-0 rounded-full', display.className, className)}
        aria-label={`Geolocation tier ${display.letter}`}
      />
    </Tooltip>
  )
}

/**
 * @param {object} props
 * @param {object} [props.event] — normalized Atlas event (preferred)
 * @param {string} [props.source] — explicit source label override
 * @param {string|number} [props.timestamp] — explicit timestamp override
 * @param {boolean} [props.showTier] — render the precision-tier dot
 */
export function ProvenanceChip({ event, source, timestamp, showTier = true, className }) {
  const label = source || event?.source || 'unknown'
  const ts = timestamp ?? event?.timestamp
  const tier = event ? getSourceGeoTier(getEventSourceId(event)) : null
  const ago = ts ? timeAgoLabel(ts) : ''

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-sm border border-line bg-surface px-1.5 py-0.5 font-data text-[10px] leading-normal text-muted whitespace-nowrap',
        className,
      )}
    >
      {showTier && tier && <TierDot tier={tier} />}
      <span className="uppercase tracking-[0.06em]">{label}</span>
      {ago && (
        <>
          <span className="text-faint">·</span>
          <span className="text-faint">{ago}</span>
        </>
      )}
    </span>
  )
}
