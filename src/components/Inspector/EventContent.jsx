/**
 * Inspector content — intel event detail (former EventPanel body).
 * Keeps EventTimeline, CausalThread, stretch signals, and corroboration display.
 */
import { useAtlasStore } from '../../store/atlasStore'
import {
  DIMENSION_COLORS, DIMENSION_LABELS,
  PRIORITY_LABELS, formatToneScore,
} from '../../core/eventSchema'
import CausalThread from '../UI/CausalThread'
import EventTimeline from '../UI/EventTimeline'
import StretchSignalsPanel from '../UI/StretchSignalsPanel'
import { buildGdeltDocQuery } from '../../services/gdelt/analyticsService'
import { confidenceForEvent } from '../../core/triage'
import { classifySatellitePurpose, SATELLITE_PURPOSE_META } from '../../core/satellitePurpose'
import { loadCountryIndex, findCountry } from '../../services/countryIndex'

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

const IconStreetView = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="5" r="3" />
    <line x1="12" y1="8" x2="12" y2="16" />
    <path d="M6 16l6 4 6-4" />
  </svg>
)

function timeAgo(dateStr) {
  if (!dateStr) return ''
  const diff = Date.now() - new Date(dateStr).getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return 'now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

export default function EventContent({ event, onClose }) {
  const openGdeltAnalytics = useAtlasStore((s) => s.openGdeltAnalytics)
  // Phase 6 — first-class trust badge ("1 source · uncorroborated" /
  // "4 independent feeds" / "sources disagree") + corroborating source list.
  const confidence = confidenceForEvent(event)

  return (
    <>
      <div className="event-panel-header">
        <div style={{ flex: 1 }}>
          {/* Dimension badge — color-coded circle + civilian label */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span
              className="event-dimension-badge"
              style={{
                '--dim-color': DIMENSION_COLORS[event.dimension] || '#378ADD',
              }}
            >
              <span
                className="event-dimension-dot"
                style={{ backgroundColor: DIMENSION_COLORS[event.dimension] }}
              />
              {DIMENSION_LABELS[event.dimension] || event.dimension}
            </span>
            <span className={`event-priority-indicator event-priority-${event.priority}`}>
              {PRIORITY_LABELS[event.priority] || event.priority?.toUpperCase()}
            </span>
          </div>
          {/* Headline — raw from source, unedited */}
          <h3 className="event-panel-title">{event.title}</h3>
          {/* Source attribution + timestamp */}
          <div className="event-panel-attribution">
            {event.source} · {timeAgo(event.timestamp)}
          </div>
        </div>
        <button
          className="feed-close-btn"
          onClick={onClose}
          style={{ marginLeft: 8, flexShrink: 0 }}
        >
          ✕
        </button>
      </div>

      <div className="event-panel-body">
        <div className="event-meta-grid">
          <div className="event-meta-item">
            <span className="event-meta-label">Severity</span>
            <div className="event-severity-bar">
              {[1, 2, 3, 4, 5].map((n) => (
                <div
                  key={n}
                  className={`event-severity-pip ${n <= event.severity ? 'active' : ''}`}
                  style={n <= event.severity ? { '--pip-color': DIMENSION_COLORS[event.dimension] } : {}}
                />
              ))}
            </div>
          </div>

          <div className="event-meta-item" style={{ gridColumn: '1 / -1' }}>
            <span className="event-meta-label">Corroboration</span>
            <span className="event-meta-value" style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
              <span className={`confidence-badge tone-${confidence.tone}`}>
                {confidence.label}
              </span>
              {(event.corroborationScore ?? 0) > 0 && (
                <span
                  className="source-badge-auth"
                  title={`Corroboration score ${Math.round((event.corroborationScore ?? 0) * 100)}% — distinct feeds, module diversity, time spread`}
                >
                  {Math.round((event.corroborationScore ?? 0) * 100)}%
                </span>
              )}
              {event.authoritative && (
                <span className="source-badge-auth">AUTH</span>
              )}
            </span>
            {confidence.sources.length > 0 && (
              <span
                style={{
                  display: 'block',
                  marginTop: 3,
                  fontFamily: 'var(--font-data)',
                  fontSize: '9.5px',
                  color: 'var(--text-muted)',
                  opacity: 0.75,
                }}
                title={confidence.sources.join(', ')}
              >
                {confidence.sources.slice(0, 5).join(' · ')}
                {confidence.sources.length > 5 ? ` +${confidence.sources.length - 5} more` : ''}
              </span>
            )}
          </div>

          <div className="event-meta-item">
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

          <div className="event-meta-item">
            <span className="event-meta-label">Time</span>
            <span className="event-meta-value">{timeAgo(event.timestamp)}</span>
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

        {event.detail && (
          <p className="event-detail-text">{event.detail}</p>
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
                icon: SATELLITE_PURPOSE_META[event.satellitePurpose]?.icon || '🛰',
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
              <span className="event-meta-value" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span aria-hidden>{purpose.icon}</span>
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
          <div style={{
            padding: '8px 10px',
            borderRadius: 6,
            background: 'rgba(255, 170, 0, 0.08)',
            border: '1px solid rgba(255, 170, 0, 0.2)',
            fontFamily: 'var(--font-hud)',
            fontSize: '9px',
            letterSpacing: '0.15em',
            color: 'var(--priority-p2)',
          }}>
            ⚠{' '}
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
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: 8,
                    fontFamily: 'var(--font-data)',
                    fontSize: '10px',
                    color: 'var(--text-muted)',
                  }}
                >
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
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
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {event.tags.slice(0, 6).map((tag) => (
              <span key={tag} style={{
                padding: '2px 6px',
                borderRadius: 3,
                background: 'rgba(255, 255, 255, 0.04)',
                border: '1px solid rgba(255, 255, 255, 0.06)',
                fontFamily: 'var(--font-data)',
                fontSize: '9px',
                color: 'var(--text-muted)',
                opacity: 0.6,
              }}>
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
              style={{ flex: 1, minWidth: '120px', cursor: 'pointer', border: 'none', background: 'rgba(55, 138, 221, 0.12)' }}
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
              ◎ GDELT Analyze
            </button>
          )}
          {!event.trackKind && event.lat != null && (
            <button
              type="button"
              className="event-source-link"
              style={{ flex: 1, minWidth: '110px', cursor: 'pointer', border: 'none', background: 'rgba(61, 214, 140, 0.10)' }}
              onClick={() => openEventDossier(event)}
              title="Open the country dossier for this event's location"
            >
              ◉ Open Dossier
            </button>
          )}
          {event.sourceUrl && (
            <a
              href={event.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="event-source-link"
              style={{ flex: 1 }}
            >
              ↗ View Source
            </a>
          )}
          {!event.latApproximate && event.lat != null && (
            <button
              className="event-source-link"
              style={{ flex: 0, whiteSpace: 'nowrap', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
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
              <IconStreetView />
              Street View
            </button>
          )}
        </div>
      </div>
    </>
  )
}
