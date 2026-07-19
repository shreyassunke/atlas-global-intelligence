/**
 * On-globe visual grammar legend — collapsible pill, bottom-left above ticker.
 * Marker archetypes only (what kind of map object). Dimension taxonomy removed —
 * interests + layers define relevance; pins are unlabeled signals.
 */
import { useState } from 'react'
import { Map as MapIcon, X } from 'lucide-react'
import { cn } from '../../lib/utils'

const ARCHETYPES = [
  { key: 'pin', label: 'Pin', behavior: 'Live event — size = severity, pulse = recency', swatch: <span className="h-2.5 w-2.5 rounded-full bg-accent" /> },
  { key: 'track', label: 'Track', behavior: 'Moving entity — aircraft, vessel, satellite, storm', swatch: <span className="h-0 w-0 border-x-[5px] border-b-[9px] border-x-transparent border-b-accent" /> },
  { key: 'field', label: 'Field', behavior: 'Surface overlay — wind, tone, imagery', swatch: <span className="h-2.5 w-2.5 rounded-sm bg-accent/30" /> },
  { key: 'reference', label: 'Reference', behavior: 'Static context — not a live event', swatch: <span className="h-2.5 w-2.5 rounded-full border border-muted" /> },
  { key: 'derived', label: 'Derived', behavior: 'Synthesized signal — confidence-toned', swatch: <span className="h-2 w-2 rotate-45 border border-derived bg-derived/30" /> },
]

export default function GlobeLegend() {
  const [open, setOpen] = useState(false)

  return (
    <div
      className="fixed left-4 bottom-14 z-40 flex flex-col items-start"
      data-testid="globe-legend"
    >
      {open ? (
        <div className="w-60 rounded-lg border border-line bg-bg/85 p-3 backdrop-blur-xl shadow-lg">
          <div className="mb-2 flex items-center justify-between">
            <span className="font-data text-[10px] uppercase tracking-[0.12em] text-muted">Legend</span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close legend"
              className="inline-flex h-5 w-5 cursor-pointer items-center justify-center rounded text-faint hover:text-text"
            >
              <X size={12} />
            </button>
          </div>

          <div className="mb-1 font-data text-[9px] uppercase tracking-[0.1em] text-faint">Markers</div>
          <div className="flex flex-col gap-1">
            {ARCHETYPES.map((a) => (
              <div key={a.key} className="flex items-center gap-2">
                <span className="flex w-4 shrink-0 items-center justify-center">{a.swatch}</span>
                <span className="font-data text-[10px] leading-normal text-text">{a.label}</span>
                <span className="truncate font-data text-[9px] leading-normal text-faint">{a.behavior}</span>
              </div>
            ))}
          </div>

          <div className="mt-2.5 border-t border-line pt-2 font-data text-[9px] leading-normal text-faint">
            ≈ prefix — approximate location, never pinned
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open marker legend"
          className={cn(
            'inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-line bg-bg/75 px-2.5 py-1.5',
            'font-data text-[10px] uppercase tracking-[0.1em] text-muted backdrop-blur-xl transition-colors duration-150',
            'hover:border-line-strong hover:text-text',
          )}
        >
          <MapIcon size={11} />
          Legend
        </button>
      )}
    </div>
  )
}
