/**
 * Inspector — top news coverage for a place (context-menu entry).
 * Primary: GDELT GEO near:lat,lng,radius. Fallback: tight DOC + optional APITube.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { ExternalLink } from 'lucide-react'
import { useAtlasStore } from '../../store/atlasStore'
import {
  fetchPlaceLocalNews,
  timespanFromTimeFilter,
} from '../../services/gdelt/placeLocalNews'
import { placeDisplayLabel } from '../../utils/placeHierarchy'
import { recordTopNewsSignal } from '../../services/gdelt/gdeltSignalMetrics'
import {
  InspectorWindowControls,
  useInspectorWindow,
} from './InspectorWindowContext'
import { cn } from '../../lib/utils'

function levelHint(level, name, source) {
  if (source?.includes('geo') || level === 'geo') return null
  if (!level || !name) return null
  if (level === 'city') return null
  return `Scoped to ${name} (${level}) — geo-local coverage was thin`
}

function sourceLabel(source, timespan, radiusKm, resolvedName, updating) {
  const parts = []
  if (source?.includes('geo') || source === 'apitube' || source === 'geo+apitube') {
    parts.push('GDELT GEO')
    if (radiusKm) parts.push(`${radiusKm}km`)
  } else if (source?.includes('doc')) {
    parts.push('GDELT DOC')
  } else {
    parts.push('GDELT')
  }
  if (source?.includes('apitube')) parts.push('APITube')
  parts.push(timespan)
  if (resolvedName) parts.push(resolvedName)
  if (updating) parts.push('updating')
  return parts.join(' · ')
}

export default function CountryNewsContent({ payload, onClose }) {
  const country = payload?.country
  const place = payload?.place
  const lat = Number.isFinite(payload?.lat) ? payload.lat : null
  const lng = Number.isFinite(payload?.lng) ? payload.lng : null
  const timeFilter = useAtlasStore((s) => s.timeFilter)
  const [articles, setArticles] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [resolved, setResolved] = useState({ level: null, name: null, source: null, radiusKm: null })
  const [staleNote, setStaleNote] = useState(null)
  const [updating, setUpdating] = useState(false)
  const paintedRef = useRef(false)
  const startedAtRef = useRef(0)

  const title = useMemo(
    () => placeDisplayLabel(place, country),
    [place, country?.name],
  )
  const timespan = useMemo(() => timespanFromTimeFilter(timeFilter), [timeFilter])

  useEffect(() => {
    if (!country && !place && !(Number.isFinite(lat) && Number.isFinite(lng))) return undefined
    let cancelled = false
    const controller = new AbortController()
    paintedRef.current = false
    startedAtRef.current = performance.now()
    setLoading(true)
    setError(null)
    setStaleNote(null)
    setUpdating(false)
    setResolved({ level: null, name: null, source: null, radiusKm: null })
    setArticles([])

    const onPartial = (partial) => {
      if (cancelled) return
      setArticles(partial.articles || [])
      setResolved({
        level: partial.level,
        name: partial.name,
        source: partial.source,
        radiusKm: partial.radiusKm,
      })
      setLoading(false)
      if (partial.meta?.stale) {
        setStaleNote(
          partial.meta.revalidating
            ? 'Showing cached coverage — updating…'
            : 'Showing cached coverage',
        )
        setUpdating(Boolean(partial.meta.revalidating))
      } else {
        setStaleNote(null)
        setUpdating(false)
      }
      if (!paintedRef.current) {
        paintedRef.current = true
        recordTopNewsSignal({
          ttfhMs: performance.now() - startedAtRef.current,
          cacheLayer: partial.meta?.cacheLayer || 'network',
          ladderRungsUsed: partial.rungsUsed,
        })
      }
    }

    fetchPlaceLocalNews({
      place,
      country,
      lat,
      lng,
      timespan,
      signal: controller.signal,
      onPartial,
    })
      .then((result) => {
        if (cancelled) return
        setArticles(result.articles || [])
        setResolved({
          level: result.level,
          name: result.name,
          source: result.source,
          radiusKm: result.radiusKm,
        })
        setLoading(false)
        if (result.meta?.stale) {
          setStaleNote(
            result.meta.error
              ? 'Showing cached coverage — live fetch failed'
              : result.meta.revalidating
                ? 'Showing cached coverage — updating…'
                : 'Showing cached coverage',
          )
        } else {
          setStaleNote(null)
        }
        setUpdating(false)
        recordTopNewsSignal({
          ttfhMs: paintedRef.current
            ? undefined
            : performance.now() - startedAtRef.current,
          cacheLayer: result.meta?.cacheLayer || 'network',
          ladderRungsUsed: result.rungsUsed,
        })
        paintedRef.current = true
      })
      .catch((err) => {
        if (!cancelled && err?.name !== 'AbortError') {
          setError('Could not load coverage')
          if (!paintedRef.current) setArticles([])
          setLoading(false)
          setUpdating(false)
        }
      })
    return () => {
      cancelled = true
      controller.abort()
    }
  }, [place, country?.name, lat, lng, timespan])

  const windowApi = useInspectorWindow()

  if (!country && !place) return null

  const scopeNote = levelHint(resolved.level, resolved.name, resolved.source)

  return (
    <div className="relative flex h-full flex-col">
      <header
        className={cn(
          'flex items-start justify-between gap-3 border-b border-line px-4 py-3',
          windowApi && 'inspector-panel__drag-header',
        )}
        onPointerDown={windowApi?.onDragHandlePointerDown}
      >
        <div className="min-w-0">
          <p className="font-data text-[9px] uppercase tracking-[0.14em] text-faint">
            Top news
          </p>
          <h3 className="mt-0.5 truncate font-ui text-[15px] font-semibold text-text">
            {title}
          </h3>
          <p className="mt-0.5 font-data text-[9px] text-faint">
            {sourceLabel(resolved.source, timespan, resolved.radiusKm, resolved.name, updating)}
          </p>
          {scopeNote && (
            <p className="mt-1 font-data text-[9px] leading-snug text-muted">{scopeNote}</p>
          )}
          {staleNote && (
            <p className="mt-1 font-data text-[9px] leading-snug text-muted">{staleNote}</p>
          )}
        </div>
        <InspectorWindowControls />
      </header>

      <div className="flex-1 space-y-1.5 overflow-y-auto px-3 py-3">
        {loading && articles.length === 0 && (
          <p className="px-1 font-data text-[11px] text-faint">Loading headlines…</p>
        )}
        {!loading && error && articles.length === 0 && (
          <p className="px-1 font-data text-[11px] text-p2">{error}</p>
        )}
        {!loading && !error && articles.length === 0 && (
          <p className="px-1 font-data text-[11px] text-faint">No matching articles in this window.</p>
        )}
        {articles.map((a, i) => (
          <a
            key={`${a.url}-${i}`}
            href={a.url}
            target="_blank"
            rel="noopener noreferrer"
            className="group flex items-start gap-2 rounded-lg border border-line bg-surface/70 px-3 py-2.5 transition-colors hover:border-line-strong hover:bg-surface-2"
          >
            <span className="min-w-0 flex-1">
              <span className="block text-[12px] font-medium leading-snug text-text group-hover:text-accent">
                {a.title || 'Untitled'}
              </span>
              <span className="mt-1 block font-data text-[9px] uppercase tracking-wider text-faint">
                {a.domain || 'source'}
                {a.sourcecountry ? ` · ${a.sourcecountry}` : ''}
                {a.distanceKm != null ? ` · ${a.distanceKm} km` : ''}
                {a.placeName ? ` · ${a.placeName}` : ''}
              </span>
            </span>
            <ExternalLink size={12} className="mt-0.5 shrink-0 text-faint group-hover:text-accent" aria-hidden />
          </a>
        ))}
      </div>
    </div>
  )
}
