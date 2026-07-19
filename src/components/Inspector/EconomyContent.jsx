/**
 * Inspector — economy indicators for a place (context-menu entry).
 * US points resolve to county/MSA (Census ACS, BEA, FRED LAUS) with an honest
 * national US-markets strip. City GDP is not published — banner says so.
 */
import { useEffect, useMemo, useState } from 'react'
import { BookOpen } from 'lucide-react'
import { useAtlasStore } from '../../store/atlasStore'
import { fetchPlaceIndicatorsBundle } from '../../services/indicators/indicatorService.js'
import { placeDisplayLabel, placeQueryLadder } from '../../utils/placeHierarchy'
import { cn } from '../../lib/utils'
import {
  InspectorWindowControls,
  useInspectorWindow,
} from './InspectorWindowContext'

function hasLiveIndicators(rows) {
  return (rows || []).some(
    (ind) => ind?.status !== 'missing_key' && ind?.status !== 'unavailable' && ind?.value != null && ind.value !== '—',
  )
}

function scopeBanner(resolved) {
  if (!resolved) return null
  const { requested, requestedName, dataLevel, dataName } = resolved
  if (dataLevel === 'county' || dataLevel === 'msa') {
    if (requested === 'city') {
      return `${dataName} — city GDP not published; showing ${dataLevel === 'msa' ? 'metro' : 'county'} indicators`
    }
    return `Showing ${dataName} (${dataLevel})`
  }
  if (requested !== 'country' && dataLevel === 'country') {
    return `No local indicators available — showing ${dataName} (country)`
  }
  return null
}

export default function EconomyContent({ payload, onClose }) {
  const country = payload?.country
  const place = payload?.place
  const cursorLat = payload?.lat
  const cursorLng = payload?.lng
  const openDossier = useAtlasStore((s) => s.openDossier)
  const [indicators, setIndicators] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [resolvedLevel, setResolvedLevel] = useState(null)

  const title = useMemo(
    () => placeDisplayLabel(place, country),
    [place, country?.name],
  )
  const ladder = useMemo(
    () => placeQueryLadder(place, country),
    [place, country?.name],
  )

  const localRows = useMemo(
    () => indicators.filter((i) => i.section !== 'us-markets' && i.grain !== 'national'),
    [indicators],
  )
  const marketRows = useMemo(
    () => indicators.filter((i) => i.section === 'us-markets' || (i.grain === 'national' && i.source === 'fred')),
    [indicators],
  )
  const otherRows = useMemo(() => {
    const used = new Set([...localRows, ...marketRows].map((i) => i.id))
    return indicators.filter((i) => !used.has(i.id))
  }, [indicators, localRows, marketRows])

  useEffect(() => {
    if (!country && !ladder.length) return undefined
    let cancelled = false
    const controller = new AbortController()
    setLoading(true)
    setError(null)
    setResolvedLevel(null)

    const countryStep = ladder.find((s) => s.level === 'country') || {
      level: 'country',
      name: country?.name,
    }
    const finest = ladder[0]

    fetchPlaceIndicatorsBundle({
      iso: country?.iso || place?.countryCode || undefined,
      countryName: countryStep.name || country?.name,
      lat: Number.isFinite(cursorLat) ? cursorLat : country?.lat,
      lng: Number.isFinite(cursorLng) ? cursorLng : country?.lng,
      signal: controller.signal,
    })
      .then((bundle) => {
        if (cancelled) return
        const list = bundle.indicators || []
        setIndicators(list)
        if (hasLiveIndicators(list)) {
          setResolvedLevel({
            requested: finest?.level || 'country',
            requestedName: finest?.name || title,
            dataLevel: bundle.dataLevel || 'country',
            dataName: bundle.dataName || countryStep.name || country?.name || title,
          })
        } else {
          setResolvedLevel(null)
        }
        setLoading(false)
      })
      .catch((err) => {
        if (!cancelled && err?.name !== 'AbortError') {
          setError('Could not load indicators')
          setIndicators([])
          setLoading(false)
        }
      })
    return () => {
      cancelled = true
      controller.abort()
    }
  }, [
    country?.iso,
    country?.name,
    country?.lat,
    country?.lng,
    place?.countryCode,
    cursorLat,
    cursorLng,
    ladder,
    title,
  ])

  const windowApi = useInspectorWindow()

  if (!country && !place) return null

  const banner = scopeBanner(resolvedLevel)

  const renderRow = (ind) => {
    const degraded = ind.status === 'degraded'
    const dead = ind.status === 'missing_key' || ind.status === 'unavailable'
    return (
      <div
        key={ind.id}
        className="rounded-lg border border-line bg-surface/80 px-3.5 py-2"
      >
        <p className="font-data text-[9px] uppercase tracking-[0.1em] text-faint">{ind.label}</p>
        <p className={cn('mt-0.5 font-data text-[17px] font-semibold leading-none', degraded || dead ? 'text-muted' : 'text-text')}>
          {ind.value ?? '—'}
          {ind.unit ? <span className="ml-1 text-[11px] font-normal text-faint">{ind.unit}</span> : null}
        </p>
        {ind.hint && (
          <p className="mt-1 font-data text-[9px] leading-snug text-faint">{ind.hint}</p>
        )}
        {ind.cadence && !ind.hint && (
          <p className="mt-1 font-data text-[9px] leading-snug text-faint">{ind.cadence}</p>
        )}
      </div>
    )
  }

  return (
    <div className="relative flex h-full min-h-0 flex-col">
      <header
        className={cn(
          'flex items-start justify-between gap-4 border-b border-line px-4 py-3',
          windowApi && 'inspector-panel__drag-header',
        )}
        onPointerDown={windowApi?.onDragHandlePointerDown}
      >
        <div className="min-w-0 flex-1 pr-1">
          <p className="font-data text-[9px] uppercase tracking-[0.14em] text-faint">
            Economy
          </p>
          <h3 className="mt-0.5 font-ui text-[15px] font-semibold leading-snug text-text">
            {title}
            {country?.iso && (
              <span className="ml-2 font-data text-[10px] uppercase tracking-widest text-faint">
                {country.iso}
              </span>
            )}
          </h3>
          {banner && (
            <p className="mt-1.5 font-data text-[9px] leading-snug text-muted">{banner}</p>
          )}
        </div>
        <InspectorWindowControls />
      </header>

      <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto px-3.5 py-3">
        {loading && (
          <p className="px-1 font-data text-[11px] text-faint">Loading indicators…</p>
        )}
        {!loading && error && (
          <p className="px-1 font-data text-[11px] text-p2">{error}</p>
        )}
        {!loading && !error && indicators.length === 0 && (
          <p className="px-1 font-data text-[11px] text-faint">No live indicators for this place.</p>
        )}

        {localRows.length > 0 && (
          <div className="space-y-2">
            <p className="px-1 font-data text-[9px] uppercase tracking-[0.12em] text-faint">
              Local · county / metro
            </p>
            {localRows.map(renderRow)}
          </div>
        )}

        {otherRows.length > 0 && (
          <div className="space-y-2">
            {localRows.length > 0 && (
              <p className="px-1 pt-1 font-data text-[9px] uppercase tracking-[0.12em] text-faint">
                Country context
              </p>
            )}
            {otherRows.map(renderRow)}
          </div>
        )}

        {marketRows.length > 0 && (
          <div className="space-y-2">
            <p className="px-1 pt-1 font-data text-[9px] uppercase tracking-[0.12em] text-faint">
              US markets · national
            </p>
            {marketRows.map(renderRow)}
          </div>
        )}
      </div>

      <footer className="border-t border-line px-3 py-2.5">
        <button
          type="button"
          className="inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-md border border-accent-border bg-accent-dim px-3 py-2 font-data text-[10px] uppercase tracking-[0.12em] text-accent transition-colors hover:bg-accent/20"
          onClick={() => openDossier(country)}
          disabled={!country}
        >
          <BookOpen size={12} />
          Open full dossier
        </button>
      </footer>
    </div>
  )
}
