/**
 * Macro/micro indicator HUD strip — Phase 3.
 * Always visible: global VIX/FX by default; place-specific GDP when dossier/search/event scoped.
 */
import { useEffect, useMemo, useState } from 'react'
import { useAtlasStore } from '../../store/atlasStore'
import { fetchPlaceIndicators, INDICATOR_POLL_MS } from '../../services/indicators/indicatorService.js'

function Sparkline({ values }) {
  if (!values?.length) return null
  const max = Math.max(...values, 0.001)
  const min = Math.min(...values, 0)
  const range = max - min || 1

  return (
    <div className="place-indicator-card__sparkline" aria-hidden>
      {values.map((v, i) => (
        <span
          key={i}
          className="place-indicator-card__spark-bar"
          style={{ height: `${Math.max(15, ((v - min) / range) * 100)}%` }}
        />
      ))}
    </div>
  )
}

function IndicatorCard({ indicator }) {
  const degraded = indicator.status === 'degraded' || indicator.status === 'missing_key'
  return (
    <div
      className={`place-indicator-card${degraded ? ' place-indicator-card--degraded' : ''}`}
      title={indicator.hint || indicator.cadence}
    >
      <span className="place-indicator-card__label">{indicator.label}</span>
      <span className="place-indicator-card__value">{indicator.value}</span>
      <span className="place-indicator-card__cadence">{indicator.cadence}</span>
      <Sparkline values={indicator.sparkline} />
    </div>
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
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let cancelled = false
    const controller = new AbortController()

    async function load() {
      setLoading(true)
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
      } finally {
        if (!cancelled) setLoading(false)
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

  if (hidden) return null

  return (
    <div
      className={`place-indicator-strip${place.scoped ? '' : ' place-indicator-strip--global'}`}
      role="region"
      aria-label="Macro indicators"
    >
      <div className="place-indicator-strip__place">
        <span className="place-indicator-strip__place-name">{place.name}</span>
        {place.iso ? (
          <span className="place-indicator-strip__place-iso">{place.iso}</span>
        ) : (
          <span className="place-indicator-strip__place-iso">click country for GDP</span>
        )}
      </div>
      <div className="place-indicator-strip__items">
        {loading && indicators.length === 0 ? (
          <span className="atlas-provenance-chip">Loading indicators…</span>
        ) : indicators.length === 0 ? (
          <span className="atlas-provenance-chip atlas-provenance-chip--missing">
            No indicators — check API keys
          </span>
        ) : (
          indicators.map((ind) => <IndicatorCard key={ind.id} indicator={ind} />)
        )}
      </div>
      {place.scoped && (
        <button
          type="button"
          className="place-indicator-strip__dossier-btn"
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
