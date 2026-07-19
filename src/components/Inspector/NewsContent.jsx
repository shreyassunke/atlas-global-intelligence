/**
 * Inspector content — commercial news marker detail (former NewsCard body).
 */
import { useAtlasStore } from '../../store/atlasStore'
import { extractYouTubeVideoId } from '../../utils/youtube'
import { buildGdeltDocQuery } from '../../services/gdelt/analyticsService'
import { cleanEventText } from '../../utils/text.js'
import { InspectorWindowControls, useInspectorWindow } from './InspectorWindowContext'
import { cn } from '../../lib/utils'

export default function NewsContent({ marker, onClose }) {
  const openStreetView = useAtlasStore((s) => s.openStreetView)
  const openYouTubeEmbed = useAtlasStore((s) => s.openYouTubeEmbed)
  const openGdeltAnalytics = useAtlasStore((s) => s.openGdeltAnalytics)
  const windowApi = useInspectorWindow()

  return (
    <div
      className={cn('relative p-5 space-y-4', windowApi && 'inspector-panel__drag-header')}
      onPointerDown={windowApi?.onDragHandlePointerDown}
    >
      <div className="absolute top-3 right-3 z-10">
        <InspectorWindowControls />
      </div>

      {/* Video thumbnail — click opens in-app embed (same pattern as Street View overlay) */}
      {marker.mediaType === 'video' && marker.thumbnailUrl && (
        <button
          type="button"
          className="relative -mx-5 -mt-5 mb-1 rounded-t-xl overflow-hidden w-[calc(100%+2.5rem)] text-left border-0 p-0 cursor-pointer group focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-black/50"
          onClick={() => {
            const id = extractYouTubeVideoId(marker.url)
            if (!id) return
            openYouTubeEmbed({
              videoId: id,
              title: marker.title,
              url: marker.url,
              isLive: !!marker.isLive,
            })
          }}
          title="Play video"
        >
          <img
            src={marker.thumbnailUrl}
            alt=""
            loading="lazy"
            className="w-full h-36 object-cover transition-opacity group-hover:opacity-90"
          />
          {marker.isLive && (
            <span
              className="absolute top-2 left-2 flex items-center gap-1 bg-red-600/90 text-white text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded pointer-events-none"
              title="Live YouTube broadcast"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
              LIVE
            </span>
          )}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-10 h-10 rounded-full bg-black/50 group-hover:bg-black/60 flex items-center justify-center transition-colors">
              <svg viewBox="0 0 24 24" className="w-5 h-5 text-white fill-current ml-0.5">
                <path d="M8 5v14l11-7z" />
              </svg>
            </div>
          </div>
          <span className="sr-only">Open video</span>
        </button>
      )}

      {(marker.mediaType === 'video' && !marker.thumbnailUrl) ||
      marker.corroborationCount >= 2 ||
      (marker.corroborationScore ?? 0) >= 0.25 ? (
        <div className="flex items-center gap-2">
          {marker.mediaType === 'video' && !marker.thumbnailUrl && (
            <span className="text-[10px] font-bold uppercase tracking-wider text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded px-1.5 py-0.5 leading-none">
              {marker.isLive ? 'LIVE' : 'VIDEO'}
            </span>
          )}
          {(marker.corroborationCount >= 2 || (marker.corroborationScore ?? 0) >= 0.25) && (
            <span
              className="text-[10px] font-bold uppercase tracking-wider text-emerald-300/90 bg-emerald-500/10 border border-emerald-500/25 rounded px-1.5 py-0.5 leading-none"
              title={`${marker.corroborationCount} independent feed(s) · score ${Math.round((marker.corroborationScore ?? 0) * 100)}%`}
            >
              ✓ {marker.corroborationCount} src
            </span>
          )}
        </div>
      ) : null}

      {/* Title */}
      <h3 className="text-lg font-bold leading-tight text-white pr-4">
        {cleanEventText(marker.title)}
      </h3>

      {/* Source + Time */}
      <div className="flex items-center gap-2 text-xs text-slate-400 font-mono">
        {marker.url && !marker.url.startsWith('#') ? (
          <a
            href={marker.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-cyan-400 hover:text-cyan-300 hover:underline transition-colors cursor-pointer"
          >
            {marker.source}
          </a>
        ) : (
          <span className="text-cyan-400">{marker.source}</span>
        )}
        <span className="opacity-50">•</span>
        <span>
          {new Date(marker.publishedAt || marker.timestamp || Date.now()).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </span>
      </div>

      {/* Description */}
      {marker.description && (
        <p className="text-sm text-slate-300 leading-relaxed line-clamp-3">
          {cleanEventText(marker.description)}
        </p>
      )}

      {/* Coordinates */}
      {marker.lat != null && marker.lng != null && (
        <div className="text-[11px] text-slate-500 font-mono flex items-center gap-2 flex-wrap">
          <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <span>
            {marker.latApproximate ? '≈ ' : ''}
            {Math.abs(marker.lat).toFixed(3)}° {marker.lat >= 0 ? 'N' : 'S'},{' '}
            {Math.abs(marker.lng).toFixed(3)}° {marker.lng >= 0 ? 'E' : 'W'}
          </span>
          {marker.latApproximate && (
            <span
              className="rounded border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-amber-300/90"
              title="Coordinates are a country or region centroid, not a precise geocode"
            >
              ~ centroid
            </span>
          )}
        </div>
      )}

      {/* Street View + source link row */}
      {(marker.lat != null && marker.lng != null) ||
        (marker.url && !marker.url.startsWith('#')) ? (
        <div className="mt-4 flex items-center gap-3 pt-2">
          {marker.lat != null && marker.lng != null && (
            <button
              type="button"
              onClick={() =>
                openStreetView({
                  lat: marker.lat,
                  lng: marker.lng,
                  source: 'marker',
                  meta: marker,
                })
              }
              className="flex-1 flex justify-center items-center gap-2 rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 px-4 py-2 text-xs font-bold uppercase tracking-widest text-slate-300 hover:text-white transition-colors cursor-pointer"
            >
              Street View
            </button>
          )}

          {marker.mediaType === 'video' &&
            marker.url &&
            !marker.url.startsWith('#') &&
            extractYouTubeVideoId(marker.url) && (
            <button
              type="button"
              onClick={() => {
                const id = extractYouTubeVideoId(marker.url)
                if (!id) return
                openYouTubeEmbed({
                  videoId: id,
                  title: marker.title,
                  url: marker.url,
                  isLive: !!marker.isLive,
                })
              }}
              className="flex-1 flex justify-center items-center gap-2 rounded bg-cyan-900/40 hover:bg-cyan-800/60 border border-cyan-800/50 px-4 py-2 text-xs font-bold uppercase tracking-widest text-cyan-400 transition-colors cursor-pointer"
            >
              Play Video
            </button>
          )}

          {marker.url && !marker.url.startsWith('#') && (
            <a
              href={marker.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 flex justify-center items-center gap-2 rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 px-4 py-2 text-xs font-bold uppercase tracking-widest text-slate-300 hover:text-white transition-colors cursor-pointer"
            >
              Source Link
            </a>
          )}
        </div>
      ) : null}

      {Array.isArray(marker.corroborationSources) && (
        <button
          type="button"
          onClick={() =>
            openGdeltAnalytics({
              query: buildGdeltDocQuery({
                title: marker.title,
                dimension: marker.dimension,
              }),
              label: marker.title,
              dimension: marker.dimension,
            })
          }
          className="w-full rounded-lg border border-sky-500/30 bg-sky-500/10 px-3 py-2 text-center text-[11px] font-bold uppercase tracking-widest text-sky-300/90 transition hover:bg-sky-500/20 cursor-pointer"
        >
          ◎ GDELT Analyze
        </button>
      )}

      {/* Importance indicator */}
      <div className="flex gap-1.5 pt-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="h-1 flex-1 rounded-full shadow-sm"
            style={{
              backgroundColor: i < marker.importance ? '#3b82f6' : '#1e293b',
            }}
          />
        ))}
      </div>
    </div>
  )
}
