/**
 * Macro/micro indicator HUD strip — quiet one-line readout.
 * Global VIX/FX by default; place-scoped GDP/FX when a dossier, search
 * result, or event is selected. Dead cards (missing key / no data) are
 * hidden rather than rendered as broken placeholders; degraded sources
 * show a subtle amber dot with a tooltip.
 */
import { useEffect, useMemo, useState } from 'react'
import { useAtlasStore } from '../../store/atlasStore'
import { fetchPlaceIndicators, INDICATOR_POLL_MS } from '../../services/indicators/indicatorService.js'
import { Tooltip } from './tooltip.jsx'
import { cn } from '../../lib/utils'

function Sparkline({ values }) {
  if (!values?.length) return null
  const max = Math.max(...values, 0.001)
  const min = Math.min(...values, 0)
  const range = max - min || 1

  return (
    <span className="ml-1.5 inline-flex h-3 items-end gap-px" aria-hidden>
      {values.map((v, i) => (
        <span
          key={i}
          className="w-[3px] rounded-[1px] bg-accent/55"
          style={{ height: `${Math.max(15, ((v - min) / range) * 100)}%` }}
        />
      ))}
    </span>
  )
}

function isLiveIndicator(ind) {
  if (!ind) return false
  if (ind.status === 'missing_key' || ind.status === 'unavailable') return false
  const v = String(ind.value ?? '').trim()
  return v !== '' && v !== '—' && v !== '--' && v !== '-'
}

function IndicatorCard({ indicator }) {
  const degraded = indicator.status === 'degraded'
  return (
    <Tooltip label={indicator.hint || indicator.cadence}>
      <span className="inline-flex items-center gap-1.5 whitespace-nowrap px-2 py-0.5">
        <span className="font-data text-[9px] uppercase tracking-[0.08em] text-faint">
          {indicator.label}
        </span>
        <span className={cn('font-data text-[12px] font-semibold leading-none', degraded ? 'text-muted' : 'text-text')}>
          {indicator.value}
        </span>
        {degraded && <span className="h-1.5 w-1.5 rounded-full bg-p2/80" aria-label="Degraded source" />}
        {!degraded && <Sparkline values={indicator.sparkline} />}
      </span>
    </Tooltip>
  )
}

export default function PlaceIndicatorStrip({ hidden = false }) {
  const dossier = useAtlasStore((s) => s.dossier)
  const selectedPlace = useAtlasStore((s) => s.selectedPlace)
  const searchHighlight = useAtlasStore((s) => s.searchHighlight)
  const selectedEvent = useAtlasStore((s) => s.selectedEvent)
  const openDossier = useAtlasStore((s) => s.openDossier)

  const place = useMemo(() => {
    const scoped = selectedPlace || dossier
    if (scoped?.name) {
      return {
        name: scoped.name,
        iso: scoped.iso,
        lat: scoped.lat,
        lng: scoped.lng,
        scoped: true,
      }
    }
    if (searchHighlight?.label) {
      return {
        name: searchHighlight.label,
        iso: searchHighlight.iso || searchHighlight.countryCode,
        lat: searchHighlight.lat,
        lng: searchHighlight.lng,
        scoped: true,
      }
    }
    if (selectedEvent && !selectedEvent.trackKind) {
      const iso = selectedEvent.iso || selectedEvent.countryIso
        || (selectedEvent.country?.length === 2 ? selectedEvent.country : null)
      const name = selectedEvent.country || selectedEvent.location || selectedEvent.locationName
      if (name || iso) {
        return {
          name: name || iso,
          iso: iso || undefined,
          lat: selectedEvent.lat,
          lng: selectedEvent.lng,
          scoped: true,
        }
      }
    }
    return { name: 'Global macro', iso: null, scoped: false }
  }, [dossier, selectedPlace, searchHighlight, selectedEvent])

  const [indicators, setIndicators] = useState([])

  useEffect(() => {
    let cancelled = false
    const controller = new AbortController()

    async function load() {
      try {
        const data = await fetchPlaceIndicators({
          iso: place.iso || undefined,
          countryName: place.scoped ? place.name : undefined,
          lat: place.lat,
          lng: place.lng,
          signal: controller.signal,
        })
        if (!cancelled) setIndicators(data)
      } catch {
        if (!cancelled) setIndicators([])
      }
    }

    load()
    const interval = setInterval(load, INDICATOR_POLL_MS)
    return () => {
      cancelled = true
      controller.abort()
      clearInterval(interval)
    }
  }, [place.name, place.iso, place.lat, place.lng, place.scoped])

  const liveIndicators = useMemo(() => indicators.filter(isLiveIndicator), [indicators])

  if (hidden) return null
  // Nothing worth showing: unscoped view with no live data stays silent.
  if (!place.scoped && liveIndicators.length === 0) return null

  return (
    <div
      className="place-indicator-strip fixed left-1/2 z-[41] flex max-w-[min(920px,calc(100vw-32px))] -translate-x-1/2 items-center gap-1 rounded-lg border border-line bg-bg/80 px-2.5 py-1 backdrop-blur-xl print:hidden"
      style={{ top: 'var(--hud-stack-bottom, 78px)' }}
      role="region"
      aria-label="Macro indicators"
    >
      <div className="flex min-w-0 flex-col justify-center border-r border-line pr-2.5 mr-1">
        <span className="max-w-[150px] truncate font-ui text-[11px] font-semibold leading-tight text-text">
          {place.name}
        </span>
        {place.iso && (
          <span className="font-data text-[8px] uppercase tracking-[0.1em] text-faint">{place.iso}</span>
        )}
      </div>

      <div className="flex flex-1 items-center gap-0.5 overflow-x-auto [scrollbar-width:none]">
        {liveIndicators.map((ind) => <IndicatorCard key={ind.id} indicator={ind} />)}
        {liveIndicators.length === 0 && (
          <span className="px-2 font-data text-[9px] uppercase tracking-[0.08em] text-faint">
            No live indicators
          </span>
        )}
      </div>

      {place.scoped && (
        <button
          type="button"
          className="ml-1 inline-flex shrink-0 cursor-pointer items-center justify-center rounded-md border border-accent-border bg-accent-dim px-2.5 py-1 font-data text-[9px] uppercase tracking-[0.1em] text-accent transition-colors duration-150 hover:bg-accent/20"
          title="Open full dossier and export report"
          onClick={() => openDossier({
            name: place.name,
            iso: place.iso,
            lat: place.lat,
            lng: place.lng,
          })}
        >
          Dossier
        </button>
      )}
    </div>
  )
}
