/**
 * Inspector content — intel event detail, trust-first layout.
 * Order answers the analyst's questions top-to-bottom:
 *   what (dimension + title) → where from (provenance) → how sure (trust block)
 *   → detail → context (timeline, causal thread, stretch signals) → actions.
 */
import { X, ExternalLink, Eye, Radar, BookOpen, Plus } from 'lucide-react'
import { useAtlasStore } from '../../store/atlasStore'
import { formatToneScore } from '../../core/eventSchema'
import CausalThread from '../UI/CausalThread'
import EventTimeline from '../UI/EventTimeline'
import StretchSignalsPanel from '../UI/StretchSignalsPanel'
import { buildGdeltDocQuery } from '../../services/gdelt/analyticsService'
import { confidenceForEvent } from '../../core/triage'
import { classifySatellitePurpose } from '../../core/satellitePurpose'
import { loadCountryIndex, findCountry } from '../../services/countryIndex'
import { cleanEventText, timeAgoLabel } from '../../utils/text.js'
import { PriorityBadge } from '../UI/badge.jsx'
import { ProvenanceChip } from '../UI/provenance-chip.jsx'
import { TrustMeter } from '../UI/trust-meter.jsx'
import {
  InspectorWindowControls,
  useInspectorWindow,
} from './InspectorWindowContext'

/** Phase 5 — resolve this event to a country and open its Dossier. */
async function openEventDossier(event) {
  try {
    const index = await loadCountryIndex()
    const locationTail = String(event.locationName || event.location || '')
      .split(',')
      .pop()
      ?.trim()
    const hit = findCountry(index, {
      fips: event.countryCode,
      text: locationTail,
      lat: event.lat,
      lng: event.lng,
    })
    if (hit) useAtlasStore.getState().openDossier(hit)
    else useAtlasStore.getState().pushToast({ label: 'Dossier', message: 'Could not resolve a country for this event' })
  } catch {
    /* country index unavailable — ignore */
  }
}

function CloseButton({ onClose }) {
  const windowApi = useInspectorWindow()
  if (windowApi) {
    return <InspectorWindowControls className="event-panel-window-controls" />
  }
  return (
    <button
      className="feed-close-btn"
      onClick={onClose}
      aria-label="Close inspector"
      style={{ marginLeft: 8, flexShrink: 0 }}
    >
      <X size={13} />
    </button>
  )
}

function EventPanelHeader({ children }) {
  const windowApi = useInspectorWindow()
  return (
    <div
      className={`event-panel-header${windowApi ? ' inspector-panel__drag-header' : ''}`}
      onPointerDown={windowApi?.onDragHandlePointerDown}
    >
      {children}
    </div>
  )
}

export default function EventContent({ event, onClose }) {
  const openGdeltAnalytics = useAtlasStore((s) => s.openGdeltAnalytics)
  const activeWorkspaceId = useAtlasStore((s) => s.activeWorkspaceId)
  const addEventToCanvas = useAtlasStore((s) => s.addEventToCanvas)
  const openCanvas = useAtlasStore((s) => s.openCanvas)
  const eventMap = useAtlasStore((s) => s.eventMap)
  const selectEvent = useAtlasStore((s) => s.setSelectedEvent)

  const inspectorMode = event?.inspectorMode
    || (event?.refKind ? 'reference' : null)
    || (event?.derivedFromAnomaly ? 'derived' : null)
    || (event?.trackKind ? 'track' : 'event')

  if (inspectorMode === 'reference') {
    return (
      <>
        <EventPanelHeader>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="atlas-archetype-chip atlas-archetype-chip--reference">Reference</span>
              <span className="event-priority-indicator" style={{ opacity: 0.5 }}>STATIC</span>
            </div>
            <h3 className="event-panel-title">{event.title || event.refId}</h3>
            <div className="event-panel-attribution">
              {event.refKind === 'chokepoint' ? 'Maritime chokepoint' : 'Nuclear facility'}
              {event.country ? ` · ${event.country}` : ''}
              {event.region ? ` · ${event.region}` : ''}
            </div>
          </div>
          <CloseButton onClose={onClose} />
        </EventPanelHeader>
        <div className="event-panel-body">
          <div className="atlas-inspector-disclaimer">
            Static context — not a live event. Reference markers are never scored for corroboration.
          </div>
          {event.description && (
            <div className="event-meta-grid" style={{ marginBottom: 12 }}>
              <div className="event-meta-item" style={{ gridColumn: '1 / -1' }}>
                <span className="event-meta-label">Site purpose</span>
                <span className="event-meta-value" style={{ whiteSpace: 'normal', lineHeight: 1.45 }}>
                  {event.description}
                </span>
              </div>
            </div>
          )}
          <div className="event-meta-grid">
            <div className="event-meta-item">
              <span className="event-meta-label">Coordinates</span>
              <span className="event-meta-value">{event.lat?.toFixed(2)}°, {event.lng?.toFixed(2)}°</span>
            </div>
          </div>
        </div>
      </>
    )
  }

  if (inspectorMode === 'derived') {
    const conf = event.confidence || confidenceForEvent(event)
    const linked = (event.linkedEventIds || []).map((id) => eventMap[id]).filter(Boolean)
    return (
      <>
        <EventPanelHeader>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="atlas-archetype-chip atlas-archetype-chip--derived">Derived</span>
              <span className={`confidence-badge tone-${conf.tone}`}>{conf.label}</span>
            </div>
            <h3 className="event-panel-title">{event.title || 'Synthesized signal'}</h3>
            <div className="event-panel-attribution">{event.anomalyType || 'Cross-feed synthesis'}</div>
          </div>
          <CloseButton onClose={onClose} />
        </EventPanelHeader>
        <div className="event-panel-body">
          <div className="atlas-derived-why">
            <span className="event-meta-label">Why</span>
            <p>{event.why || 'Multiple feeds suggest a structural pattern worth analyst review.'}</p>
          </div>
          {linked.length > 0 && (
            <div className="atlas-linked-events">
              <span className="event-meta-label">Linked sources</span>
              <div className="atlas-linked-chips">
                {linked.map((evt) => (
                  <button
                    key={evt.id}
                    type="button"
                    className="atlas-linked-chip"
                    onClick={() => selectEvent(evt)}
                  >
                    {evt.title?.slice(0, 48) || evt.id}
                  </button>
                ))}
              </div>
            </div>
          )}
          {event.lat != null && (
            <div className="event-meta-item">
              <span className="event-meta-label">Location</span>
              <span className="event-meta-value">
                {event.lat?.toFixed(2)}°, {event.lng?.toFixed(2)}°
                {event.latApproximate ? ' (approximate)' : ''}
              </span>
            </div>
          )}
        </div>
      </>
    )
  }

  const confidence = confidenceForEvent(event)
  const title = cleanEventText(event.title)
  const detail = cleanEventText(event.detail)

  return (
    <>
      <EventPanelHeader>
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* What kind of object + what domain + how urgent */}
          <div className="flex flex-wrap items-center gap-1.5">
            {event.trackKind ? (
              <span className="atlas-archetype-chip atlas-archetype-chip--track">Live telemetry</span>
            ) : (
              <span className="atlas-archetype-chip atlas-archetype-chip--pin">Incident pin</span>
            )}
            <PriorityBadge priority={event.priority} />
          </div>

          {/* Headline — decoded, tags stripped */}
          <h3 className="event-panel-title">{title}</h3>

          {/* Provenance — source + freshness + precision-tier dot */}
          <div className="mt-1.5">
            <ProvenanceChip event={event} />
          </div>
        </div>
        <CloseButton onClose={onClose} />
      </EventPanelHeader>

      <div className="event-panel-body">
        {/* ── Trust block — "how sure are we?" answered first ── */}
        <div className="rounded-md border border-line bg-surface px-2.5 py-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <TrustMeter event={event} />
            <span className={`confidence-badge tone-${confidence.tone}`}>{confidence.label}</span>
          </div>
          {(event.corroborationScore ?? 0) > 0 && (
            <div
              className="mt-1.5 font-data text-[10px] leading-normal text-muted"
              title="Corroboration score — distinct feeds, module diversity, time spread"
            >
              Corroboration score {Math.round((event.corroborationScore ?? 0) * 100)}%
            </div>
          )}
          {confidence.sources.length > 0 && (
            <div
              className="mt-1 truncate font-data text-[10px] leading-normal text-faint"
              title={confidence.sources.join(', ')}
            >
              {confidence.sources.slice(0, 5).join(' · ')}
              {confidence.sources.length > 5 ? ` +${confidence.sources.length - 5} more` : ''}
            </div>
          )}
        </div>

        <div className="event-meta-grid">
          <div className="event-meta-item">
            <span className="event-meta-label">Severity</span>
            <div className="event-severity-bar">
              {[1, 2, 3, 4, 5].map((n) => (
                <div
                  key={n}
                  className={`event-severity-pip ${n <= event.severity ? 'active' : ''}`}
                  style={n <= event.severity ? { backgroundColor: event.color } : undefined}
                />
              ))}
            </div>
          </div>

          <div className="event-meta-item">
            <span className="event-meta-label">Time</span>
            <span className="event-meta-value">{timeAgoLabel(event.timestamp)}</span>
          </div>

          <div className="event-meta-item" style={{ gridColumn: '1 / -1' }}>
            <span className="event-meta-label">Coordinates</span>
            <span className="event-meta-value">
              {event.latApproximate ? '≈ ' : ''}
              {event.lat.toFixed(2)}°, {event.lng.toFixed(2)}°
              {event.locationName && (
                <span style={{ display: 'block', fontSize: '10px', color: 'var(--text-muted)', opacity: 0.7 }}>
                  {event.locationName}
                </span>
              )}
            </span>
          </div>

          {/* GDELT tone score — "Global coverage tone" */}
          {event.toneScore != null && (
            <div className="event-meta-item" style={{ gridColumn: '1 / -1' }}>
              <span className="event-meta-label">Global Coverage Tone</span>
              <span className="event-meta-value">
                {(() => {
                  const tone = formatToneScore(event.toneScore)
                  return (
                    <span className={`tone-indicator tone-${tone.sentiment}`}>
                      {tone.label} ({tone.score})
                    </span>
                  )
                })()}
              </span>
            </div>
          )}
        </div>

        {detail && (
          <p className="event-detail-text">{detail}</p>
        )}

        {(event.imageUrl || event.playerUrl || event.streamUrl) && event.tags?.includes('camera') && (
          <div className="rounded-md border border-line bg-surface overflow-hidden">
            {event.imageUrl ? (
              <a
                href={event.playerUrl || event.streamUrl || event.sourceUrl || event.imageUrl}
                target="_blank"
                rel="noopener noreferrer"
                title="Open live view"
              >
                <img
                  src={event.imageUrl}
                  alt={title || 'Live camera'}
                  loading="lazy"
                  referrerPolicy="no-referrer"
                  style={{
                    display: 'block',
                    width: '100%',
                    maxHeight: 200,
                    objectFit: 'cover',
                    background: 'rgba(0,0,0,0.35)',
                  }}
                  onError={(e) => {
                    e.currentTarget.style.display = 'none'
                  }}
                />
              </a>
            ) : null}
            <div className="event-meta-grid" style={{ padding: '8px 10px', marginTop: 0 }}>
              {event.cameraProvider && (
                <div className="event-meta-item">
                  <span className="event-meta-label">Provider</span>
                  <span className="event-meta-value">{event.cameraProvider}</span>
                </div>
              )}
              {event.streamUrl && (
                <div className="event-meta-item" style={{ gridColumn: '1 / -1' }}>
                  <a
                    href={event.streamUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="event-source-link"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}
                  >
                    <ExternalLink size={11} /> Open stream
                  </a>
                </div>
              )}
              {event.playerUrl && !event.streamUrl && (
                <div className="event-meta-item" style={{ gridColumn: '1 / -1' }}>
                  <a
                    href={event.playerUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="event-source-link"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}
                  >
                    <ExternalLink size={11} /> Open player
                  </a>
                </div>
              )}
            </div>
          </div>
        )}

        {event.trackKind === 'aircraft' && (
          <div className="event-meta-grid" style={{ marginTop: 8 }}>
            {event.callsign && (
              <div className="event-meta-item">
                <span className="event-meta-label">Callsign</span>
                <span className="event-meta-value">{event.callsign.trim()}</span>
              </div>
            )}
            {event.icao24 && (
              <div className="event-meta-item">
                <span className="event-meta-label">ICAO24</span>
                <span className="event-meta-value">{event.icao24.toUpperCase()}</span>
              </div>
            )}
            {event.altitudeM != null && (
              <div className="event-meta-item">
                <span className="event-meta-label">Altitude</span>
                <span className="event-meta-value">{Math.round(event.altitudeM * 3.281).toLocaleString()} ft</span>
              </div>
            )}
            {event.velocityMs != null && (
              <div className="event-meta-item">
                <span className="event-meta-label">Speed</span>
                <span className="event-meta-value">{Math.round(event.velocityMs * 1.944)} kts</span>
              </div>
            )}
            {event.originCountry && (
              <div className="event-meta-item">
                <span className="event-meta-label">Origin</span>
                <span className="event-meta-value">{event.originCountry}</span>
              </div>
            )}
            {event.isMilitary && (
              <div className="event-meta-item" style={{ gridColumn: '1 / -1' }}>
                <span className="event-meta-label">Classification</span>
                <span className="event-meta-value" style={{ color: '#ff6b35' }}>Military (ICAO heuristic)</span>
              </div>
            )}
          </div>
        )}

        {event.trackKind === 'satellite' && event.noradId != null && (() => {
          const purpose = event.satellitePurpose
            ? {
                purpose: event.satellitePurpose,
                label: event.satellitePurposeLabel,
                detail: event.satellitePurposeDetail,
                operator: event.satelliteOperator,
              }
            : classifySatellitePurpose({
                name: event.title,
                satelliteGroup: event.satelliteGroup,
                isMilitary: event.isMilitary,
              })
          return (
          <div className="event-meta-grid" style={{ marginTop: 8 }}>
            <div className="event-meta-item" style={{ gridColumn: '1 / -1' }}>
              <span className="event-meta-label">Mission Purpose</span>
              <span className="event-meta-value">
                {purpose.label || event.satellitePurposeLabel || 'Unknown'}
              </span>
            </div>
            {purpose.detail && (
              <div className="event-meta-item" style={{ gridColumn: '1 / -1' }}>
                <span className="event-meta-label">Why It&apos;s There</span>
                <span className="event-meta-value" style={{ fontSize: '11px', lineHeight: 1.45, opacity: 0.9 }}>
                  {purpose.detail}
                </span>
              </div>
            )}
            {(purpose.operator || event.satelliteOperator) && (
              <div className="event-meta-item">
                <span className="event-meta-label">Operator</span>
                <span className="event-meta-value">{purpose.operator || event.satelliteOperator}</span>
              </div>
            )}
            <div className="event-meta-item">
              <span className="event-meta-label">NORAD ID</span>
              <span className="event-meta-value">{event.noradId}</span>
            </div>
            {event.satelliteGroup && (
              <div className="event-meta-item">
                <span className="event-meta-label">Catalog</span>
                <span className="event-meta-value">{event.satelliteGroup}</span>
              </div>
            )}
            {event.altitudeM != null && (
              <div className="event-meta-item">
                <span className="event-meta-label">Altitude</span>
                <span className="event-meta-value">{Math.round(event.altitudeM / 1000).toLocaleString()} km</span>
              </div>
            )}
          </div>
          )
        })()}

        {event.trackKind === 'vessel' && (
          <div className="event-meta-grid" style={{ marginTop: 8 }}>
            {event.shipName && (
              <div className="event-meta-item">
                <span className="event-meta-label">Vessel</span>
                <span className="event-meta-value">{event.shipName}</span>
              </div>
            )}
            {event.mmsi && (
              <div className="event-meta-item">
                <span className="event-meta-label">MMSI</span>
                <span className="event-meta-value">{event.mmsi}</span>
              </div>
            )}
            {event.sog != null && (
              <div className="event-meta-item">
                <span className="event-meta-label">Speed</span>
                <span className="event-meta-value">{event.sog.toFixed(1)} kn</span>
              </div>
            )}
            {event.cog != null && (
              <div className="event-meta-item">
                <span className="event-meta-label">Course</span>
                <span className="event-meta-value">{event.cog}°</span>
              </div>
            )}
          </div>
        )}

        {event.trackKind === 'storm' && (
          <div className="event-meta-grid" style={{ marginTop: 8 }}>
            {event.stormId && (
              <div className="event-meta-item">
                <span className="event-meta-label">Storm ID</span>
                <span className="event-meta-value">{event.stormId}</span>
              </div>
            )}
            {event.stormCategory && (
              <div className="event-meta-item">
                <span className="event-meta-label">Category</span>
                <span className="event-meta-value">{event.stormCategory}</span>
              </div>
            )}
            {event.trackCoords?.length > 0 && (
              <div className="event-meta-item">
                <span className="event-meta-label">Forecast track</span>
                <span className="event-meta-value">{event.trackCoords.length} points</span>
              </div>
            )}
            {event.coneCoords?.length > 0 && (
              <div className="event-meta-item">
                <span className="event-meta-label">Cone of uncertainty</span>
                <span className="event-meta-value">Available</span>
              </div>
            )}
          </div>
        )}

        {event.disputed && (
          <div className="rounded-md border border-p2/25 bg-p2/10 px-2.5 py-2 font-data text-[9px] uppercase tracking-[0.12em] text-p2">
            {event.toneDisagreement
              ? `Sources disagree on coverage tone (spread ${event.toneDisagreement.spread.toFixed(1)})`
              : 'Sources disagree on severity'}
          </div>
        )}

        {Array.isArray(event.sourceReports) && event.sourceReports.length > 1 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span className="event-meta-label">Per-source tone</span>
            {event.sourceReports.slice(0, 6).map((report) => {
              const tone = report.toneScore != null ? formatToneScore(report.toneScore) : null
              return (
                <div
                  key={`${report.eventId}-${report.sourceId}`}
                  className="flex justify-between gap-2 font-data text-[10px] text-muted"
                >
                  <span className="truncate">
                    {report.source || report.sourceId}
                  </span>
                  {tone ? (
                    <span className={`tone-indicator tone-${tone.sentiment}`}>
                      {tone.label} ({tone.score})
                    </span>
                  ) : (
                    <span>—</span>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {event.tags?.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {event.tags.slice(0, 6).map((tag) => (
              <span
                key={tag}
                className="rounded-sm border border-line bg-surface px-1.5 py-0.5 font-data text-[9px] text-faint"
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Story thread — same incident across days */}
        <EventTimeline event={event} />

        {/* Causal thread — Related Signals section */}
        <CausalThread event={event} />

        {/* Phase 6 — Bluesky social reach, fact checks, Sentinel-2 on-demand */}
        <StretchSignalsPanel event={event} />

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {Array.isArray(event.corroborationSources) && !event.trackKind && (
            <button
              type="button"
              className="event-source-link"
              style={{ flex: 1, minWidth: '120px', cursor: 'pointer', border: 'none', background: 'rgba(55, 138, 221, 0.12)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}
              onClick={() => {
                openGdeltAnalytics({
                  query: buildGdeltDocQuery({
                    title: event.title,
                    dimension: event.dimension,
                  }),
                  label: event.title,
                  dimension: event.dimension,
                })
              }}
            >
              <Radar size={11} /> GDELT Analyze
            </button>
          )}
          {!event.trackKind && event.lat != null && (
            <button
              type="button"
              className="event-source-link"
              style={{ flex: 1, minWidth: '110px', cursor: 'pointer', border: 'none', background: 'rgba(61, 214, 140, 0.10)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}
              onClick={() => openEventDossier(event)}
              title="Open the country dossier for this event's location"
            >
              <BookOpen size={11} /> Open Dossier
            </button>
          )}
          {activeWorkspaceId && !event.trackKind && (
            <button
              type="button"
              className="event-source-link"
              style={{ flex: 1, minWidth: '110px', cursor: 'pointer', border: 'none', background: 'rgba(0, 207, 255, 0.10)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}
              onClick={() => {
                if (addEventToCanvas(event)) openCanvas()
              }}
              title="Pin to investigation canvas (saved; removed from live globe)"
            >
              <Plus size={11} /> Pin
            </button>
          )}
          {event.sourceUrl && (
            <a
              href={event.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="event-source-link"
              style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}
            >
              <ExternalLink size={11} /> View Source
            </a>
          )}
          {/* Street View is gated on precise geolocation — approximate events never offer it */}
          {!event.latApproximate && event.lat != null && (
            <button
              className="event-source-link"
              style={{ flex: 0, whiteSpace: 'nowrap', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5 }}
              onClick={() => {
                useAtlasStore.getState().openStreetView({
                  lat: event.lat,
                  lng: event.lng,
                  source: 'event',
                  meta: {
                    title: event.title,
                    detail: event.detail,
                    dimension: event.dimension,
                    source: event.source,
                  },
                })
              }}
            >
              <Eye size={11} /> Street View
            </button>
          )}
        </div>
      </div>
    </>
  )
}
